import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A backup of the database alone would restore to something broken: every case
// would point at files that are no longer there. So this takes both — a
// pg_dump of the database and a copy of the uploads directory — into one
// timestamped folder, with a manifest that says what it holds so a backup can
// be checked without restoring it.
//
//   npm run backup
//
// There is deliberately no restore script yet. Restoring is:
//   psql -U postgres -d codi_is -f backups/<stamp>/database.sql
//   copy backups/<stamp>/uploads/* into server/uploads/

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, "..");
const UPLOADS_DIR = path.join(SERVER_DIR, "uploads");
const BACKUPS_DIR = path.join(SERVER_DIR, "backups");

// pg_dump ships with PostgreSQL but is not on PATH by default on Windows —
// the installer does not add it. Look where it actually is before giving up,
// and name everywhere that was tried if it still cannot be found.
function findPgDump() {
  const candidates = [];
  if (process.env.PG_DUMP) candidates.push(process.env.PG_DUMP);
  candidates.push("pg_dump");

  const programFiles = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean);
  for (const base of programFiles) {
    const root = path.join(base, "PostgreSQL");
    if (!fs.existsSync(root)) continue;
    // Newest major version first — 17 before 16.
    const versions = fs
      .readdirSync(root)
      .filter((name) => /^\d+$/.test(name))
      .sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      candidates.push(path.join(root, version, "bin", "pg_dump.exe"));
    }
  }

  return candidates;
}

// An absolute path can be checked on disk; a bare name can only be checked by
// trying to run it, since it depends on PATH.
function canRun(candidate) {
  if (candidate.includes(path.sep)) return Promise.resolve(fs.existsSync(candidate));
  return new Promise((resolve) => {
    const probe = spawn(candidate, ["--version"], { stdio: "ignore" });
    probe.on("error", () => resolve(false));
    probe.on("close", (code) => resolve(code === 0));
  });
}

async function resolvePgDump() {
  const candidates = findPgDump();
  for (const candidate of candidates) {
    if (await canRun(candidate)) return { command: candidate, candidates };
  }
  return { command: null, candidates };
}

function dumpDatabase(command, url, outFile) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outFile);
    // --no-owner keeps the dump loadable by a differently-named role, which is
    // what a restore onto another machine will be.
    const child = spawn(command, ["--no-owner", "--format=plain", url], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdout.pipe(out);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      out.end();
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

function copyUploads(destination) {
  if (!fs.existsSync(UPLOADS_DIR)) return 0;
  fs.mkdirSync(destination, { recursive: true });
  const files = fs.readdirSync(UPLOADS_DIR).filter((name) => {
    return fs.statSync(path.join(UPLOADS_DIR, name)).isFile();
  });
  for (const name of files) {
    fs.copyFileSync(path.join(UPLOADS_DIR, name), path.join(destination, name));
  }
  return files.length;
}

async function rowCounts() {
  const [cases, documents, users, auditLogs, notifications] = await Promise.all([
    prisma.case.count(),
    prisma.document.count(),
    prisma.user.count(),
    prisma.auditLog.count(),
    prisma.notification.count(),
  ]);
  return { cases, documents, users, auditLogs, notifications };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — check server/.env");

  const { command, candidates } = await resolvePgDump();
  if (!command) {
    throw new Error(
      `pg_dump could not be found. Set PG_DUMP to its full path in server/.env, ` +
        `or add PostgreSQL's bin directory to PATH. Tried:\n  ${candidates.join("\n  ")}`
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const folder = path.join(BACKUPS_DIR, stamp);
  fs.mkdirSync(folder, { recursive: true });

  const sqlFile = path.join(folder, "database.sql");
  await dumpDatabase(command, url, sqlFile);
  const sqlBytes = fs.statSync(sqlFile).size;
  if (sqlBytes === 0) throw new Error("pg_dump produced an empty file");

  const fileCount = copyUploads(path.join(folder, "uploads"));
  const counts = await rowCounts();

  const manifest = {
    takenAt: new Date().toISOString(),
    database: { file: "database.sql", bytes: sqlBytes, rows: counts },
    uploads: { directory: "uploads", files: fileCount },
    // A document row whose file is missing restores to a broken link, so the
    // two numbers are worth seeing side by side.
    note: `${counts.documents} document row(s), ${fileCount} file(s) on disk (link-only evidence has no file)`,
  };
  fs.writeFileSync(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`Backup written to backups/${stamp}`);
  console.log(`  database.sql  ${(sqlBytes / 1024).toFixed(0)} KB`);
  console.log(`  uploads/      ${fileCount} file(s)`);
  console.log(
    `  rows          ${counts.cases} cases, ${counts.documents} documents, ${counts.users} users, ${counts.auditLogs} audit entries`
  );
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
