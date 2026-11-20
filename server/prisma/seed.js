import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { listAllPeople, ensureUserForPerson } from "../src/services/directory/index.js";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Passw0rd!";

async function upsertUser({ email, fullName, role, department }) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName, role, department, passwordHash },
  });
}

async function main() {
  const staff = [
    ["johnmarcoaguirre158@gmail.com", "Disciplining Authority", "DISCIPLINING_AUTHORITY", "Office of the University President"],
    ["emillindayag008@gmail.com", "CODI Secretariat", "SECRETARIAT", "Gender and Development Center"],
    ["emillindayag08@gmail.com", "CODI Chairperson", "CHAIRPERSON", "Office of the President"],
    ["tamayopaularon.spnhs@gmail.com", "CODI Committee Member 1", "COMMITTEE", "College of ICT"],
    ["bangbang3027@gmail.com", "CODI Committee Member 2", "COMMITTEE", "Student Council"],
    ["weasleyjohnmarco@gmail.com", "CODI Committee Member 3", "COMMITTEE", "Office of Legal Affairs"],
    // Placeholders until real members are named: these addresses receive no
    // mail, so they can't get a sign-in code. Every sitting member must vote
    // before a prima facie step completes, so change the email or deactivate
    // the account on the Committee accounts page before relying on the vote.
    ["committee4@bulsu.edu.ph", "CODI Committee Member 4", "COMMITTEE", "CODI"],
    ["committee5@bulsu.edu.ph", "CODI Committee Member 5", "COMMITTEE", "CODI"],
    ["committee6@bulsu.edu.ph", "CODI Committee Member 6", "COMMITTEE", "CODI"],
    ["committee7@bulsu.edu.ph", "CODI Committee Member 7", "COMMITTEE", "CODI"],
    ["committee8@bulsu.edu.ph", "CODI Committee Member 8", "COMMITTEE", "CODI"],
  ];
  for (const [email, fullName, role, department] of staff) {
    await upsertUser({ email, fullName, role, department });
  }
  // Everyone else is a university member from the directory. Complainant or
  // respondent is decided case by case, not by account.
  const people = listAllPeople();
  for (const person of people) {
    await ensureUserForPerson(person);
  }

  console.log("Seed complete. Accounts (password for all: %s):", DEMO_PASSWORD);
  for (const [email, fullName] of staff) console.log(`  ${fullName.padEnd(26)} ${email}`);
  for (const p of people) {
    console.log(`  ${p.type === "STUDENT" ? "Student  " : "Personnel"} ${p.fullName.padEnd(16)} ${p.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
