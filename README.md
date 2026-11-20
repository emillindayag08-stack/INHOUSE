# CODI-IS — Gender Case Information Governance & Decision Support System

A working draft of the full-stack system proposed in the capstone paper
(`Group4_SmartSecurityandSurveillance_Domain_Paper.pdf`) for Bulacan State
University's Committee on Decorum and Investigation (CODI). It digitizes the
complaint-to-decision workflow governed by the **BulSU Anti-GBSH Code**
(student respondents) and **RACCS 2025** (personnel respondents), with
compliance-deadline tracking and role-based dashboards.

> **Status: golden-path draft.** Covers the full complaint → verification →
> show-cause → answer → prima facie evaluation → formal charge → hearing →
> deliberation → decision pipeline for all five roles. Risk-scoring DSS cues,
> referral coordination, file uploads, and analytics dashboards are stubbed
> for a later pass — see [What's not built yet](#whats-not-built-yet).

## Stack

- **Frontend:** React 18 + Vite + Tailwind CSS (BulSU maroon/charcoal palette, Inter font)
- **Backend:** Node.js + Express, JWT auth
- **Database:** PostgreSQL via Prisma ORM
- **Architecture:** three-tier (per the paper) — React SPA → Express API → PostgreSQL

## 1. Get a free PostgreSQL database (Neon)

The app needs a real Postgres connection string before it can run end-to-end.

1. Go to [neon.tech](https://neon.tech) and sign up (free, no credit card).
2. Create a new project (any name/region).
3. Copy the **connection string** it gives you (starts with `postgresql://`,
   ends with `?sslmode=require`).

(Supabase's free Postgres works the same way if you'd rather use that.)

## 2. Backend setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:
- `DATABASE_URL` → paste your Neon connection string
- `JWT_SECRET` → any long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

Then create the tables and seed demo data:

```bash
npx prisma migrate dev --name init
npm run seed
```

Start the API:

```bash
npm run dev
```

It listens on `http://localhost:4000`. `GET /api/health` should return `{"ok":true}`.

## 3. Frontend setup

```bash
cd client
npm install
cp .env.example .env   # defaults already point at localhost:4000
npm run dev
```

Open `http://localhost:5173`.

## 4. Demo accounts

The seed script creates one account per role (password for all: `Passw0rd!`),
plus one demo case already in the SUBMITTED stage so you have something to
click through immediately:

| Role | Email |
|---|---|
| CODI Secretariat | secretariat@bulsu.edu.ph |
| CODI Chairperson | chair@bulsu.edu.ph |
| CODI Committee | committee1@bulsu.edu.ph / committee2@bulsu.edu.ph |
| Complainant | complainant@bulsu.edu.ph |
| Respondent | respondent@bulsu.edu.ph |

Complainants and Respondents can also self-register from the app (`/register`).
CODI roles are provisioned only via the seed script / an admin, since case
access is sensitive — there's no public sign-up for those roles.

**Suggested walkthrough:** log in as the demo Complainant to see the seeded
case, then log in as Secretariat → verify it → issue a show-cause order → log
in as Respondent → submit an answer → Committee → prima facie evaluation →
Chairperson → formal charge → Committee → schedule hearing → record
deliberation → Chairperson → record final decision. Each stage's compliance
deadline (per the GBSH Code / RACCS timelines) appears on the case detail page.

## Repository layout

```
server/
  prisma/schema.prisma   # 14-model schema: User, Respondent, Case, Document,
                          # ShowCauseOrder, RespondentAnswer, PrimaFacieEvaluation,
                          # FormalCharge, Hearing, Deliberation, Decision,
                          # Deadline, Notification, AuditLog
  prisma/seed.js          # demo accounts + one demo case
  src/routes/             # auth, cases (the workflow engine), dashboard
  src/services/           # deadlineService (GBSH/RACCS timelines), auditService
client/
  src/pages/               # Login, Register, Dashboard, SubmitComplaint, CaseDetail
  src/components/          # Layout, StatusBadge, DeadlineBadge, CaseTimeline
  src/context/AuthContext.jsx
Media/                     # BulSU logo, palette, font references used for theming
```

## What's not built yet

Scoped out of this first draft on purpose (see the "core golden path" framing
in the paper's system requirements) — flagging so nothing here is mistaken
for a bug:

- **Risk-scoring DSS cues** (Table 2's Risk Assessment / DSS Module) — the
  `Case` model has an `offenseClassification` field ready for it, but no
  scoring logic yet.
- **Referral coordination** (legal/medical/counseling referrals).
- **Analytics dashboards** (trend charts, incident distribution per college) —
  stats endpoint returns raw counts only; no charts yet.
- **Email notifications** — `Notification` records are created in-app but
  nothing sends an actual email.
- **Document uploads are local-disk only** — the complainant can upload a
  scanned/photographed notarized document (JPG/PNG/WebP/PDF, ≤10 MB) and the
  Secretariat sets its notarization status; files are stored in `server/uploads/`.
  A cloud deployment would need to swap this for object storage (e.g. S3), since
  the local folder isn't shared across servers and Neon doesn't store blobs.
- Deadline day-offsets in `deadlineService.js` cover the main stages (show-cause
  response, formal charge, president's decision) but not every timeline in the
  GBSH Code/RACCS (e.g. preliminary meeting, position papers) — worth a review
  pass against Sections 15-19 of the GBSH Code before this goes further.

## Known dev-environment notes

- `npm audit` flags 2 vulnerabilities in `client/` — both are in Vite's dev
  dependency chain (esbuild), not runtime code; safe for local development,
  worth revisiting before any public deployment.
- Git was initialized but nothing has been committed yet — review
  `git status` and make your first commit when ready.
