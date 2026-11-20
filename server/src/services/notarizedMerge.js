import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

// A notarized document is often several scanned pages. Up to NOTARIZED_MAX_FILES
// files are accepted and joined, in the order given, into one PDF — so the rest
// of the system still sees, reviews and approves a single document.
export const NOTARIZED_MAX_FILES = 10;
export const NOTARIZED_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file

const MAX_PAGE_SIDE = 842; // points; keeps scanned photos at a sensible page size

export async function mergeToPdf(files, uploadsDir) {
  const out = await PDFDocument.create();

  for (const file of files) {
    // A copy, not the Buffer itself: pdf-lib reads the underlying ArrayBuffer from offset 0.
    const bytes = new Uint8Array(fs.readFileSync(file.path));
    if (file.mimetype === "application/pdf") {
      const src = await PDFDocument.load(bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
      continue;
    }
    let image;
    if (file.mimetype === "image/jpeg") image = await out.embedJpg(bytes);
    else if (file.mimetype === "image/png") image = await out.embedPng(bytes);
    else image = await out.embedPng(await sharp(Buffer.from(bytes)).png().toBuffer()); // WebP
    const scale = Math.min(1, MAX_PAGE_SIDE / Math.max(image.width, image.height));
    const page = out.addPage([image.width * scale, image.height * scale]);
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }

  const filename = `${crypto.randomUUID()}.pdf`;
  const merged = await out.save();
  fs.writeFileSync(path.join(uploadsDir, filename), merged);
  return { filename, size: merged.length, pageCount: out.getPageCount() };
}

// Pages in one uploaded PDF or image; null when it cannot be read.
export async function countPages(file) {
  try {
    if (file.mimetype === "application/pdf") {
      const src = await PDFDocument.load(new Uint8Array(fs.readFileSync(file.path)), { ignoreEncryption: true });
      return src.getPageCount();
    }
    return file.mimetype?.startsWith("image/") ? 1 : null;
  } catch {
    return null;
  }
}
