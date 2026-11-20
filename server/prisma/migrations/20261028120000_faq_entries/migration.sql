-- CreateTable
CREATE TABLE "FaqEntry" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "roles" "RoleName"[],
    "position" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaqEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FaqEntry_position_idx" ON "FaqEntry"("position");

-- The questions KODI shipped with, until now hard-coded in client/src/lib/faq.js.
INSERT INTO "FaqEntry" ("id", "section", "question", "answer", "roles", "position", "updatedAt") VALUES
  ('faq-01', 'The process', 'Can I file a complaint anonymously?', 'Yes. On File a Complaint, choose Anonymously. The case then runs as CODI vs. the respondent, and your identity is hidden from everyone on it, including CODI staff.
It must be verifiable as public knowledge, so describe the specific event in detail and add all your evidence links before sending: nothing can be added afterwards.
No notarized copy is needed, and after you send it there is nothing more for you to do. You can follow the case from your case list and you''ll be notified of updates. It proceeds by the respondent''s position paper only.', ARRAY[]::"RoleName"[], 1, CURRENT_TIMESTAMP),
  ('faq-02', 'The process', 'What happens after I file a complaint?', 'Your complaint is Submitted and gets a REF number. Upload a notarized copy within 3 days.
The Secretariat checks it and confirms each respondent. If something is missing it is Returned for Correction, and you edit and resubmit it.
Once complete it is Verified (CPI number), a show-cause order goes to each respondent, and the Committee later decides whether there is a prima facie case.', ARRAY['PARTY']::"RoleName"[], 2, CURRENT_TIMESTAMP),
  ('faq-03', 'The process', 'What are the steps of a case?', '1. Filed (REF number) and notarized copy uploaded.
2. Verified by the Secretariat (CPI number).
3. Show-cause order approved by the Chairperson and served to each respondent, who responds within 5 days.
4. Under Evaluation: the Committee votes on a prima facie case for each respondent. If found, the case gets its CODI number and the Committee votes on the offense level.
5. Formal charge drafted, approved by the Disciplining Authority and sent. The respondent answers it.
6. Formal investigation (hearings) or position papers.
7. In Deliberation, then a recommendation to the President, who decides within 30 days. The case ends Resolved or Escalated.', ARRAY[]::"RoleName"[], 3, CURRENT_TIMESTAMP),
  ('faq-04', 'The process', 'What do REF, CPI and CODI numbers mean?', 'A case is REF-… when filed, CPI-… once the Secretariat verifies it, and CODI-… once a prima facie case is found. It is the same case throughout.', ARRAY[]::"RoleName"[], 4, CURRENT_TIMESTAMP),
  ('faq-05', 'The process', 'I received a show-cause order. What do I do?', 'Open the case from Cases and submit your response on the Overview within 5 days. You can attach supporting files on the Documents tab.
If you have questions about your rights or the process, contact the CODI Secretariat.', ARRAY['PARTY']::"RoleName"[], 5, CURRENT_TIMESTAMP),
  ('faq-06', 'The process', 'What is a prima facie case?', 'It means there is enough on the face of the complaint and the response to proceed. Each Committee member votes, per respondent, and the Secretariat confirms the majority finding.
No prima facie case closes the case for that respondent. If one is found, a formal charge follows.', ARRAY[]::"RoleName"[], 6, CURRENT_TIMESTAMP),
  ('faq-07', 'The process', 'How is the offense level decided?', 'Each Committee member who found a prima facie case votes Light, Less Grave or Grave Offense. The level with the most votes is the classification.
If the vote is tied, the Committee agrees on the level among themselves and the Secretariat records it as the final offense level before confirming the finding.', ARRAY['SECRETARIAT', 'CHAIRPERSON', 'COMMITTEE']::"RoleName"[], 7, CURRENT_TIMESTAMP),
  ('faq-08', 'The process', 'What is the difference between a formal investigation and position papers?', 'After the respondent answers the charge, each party picks a pathway. A formal investigation has pre-trial and trial hearings. With position papers, each party files a notarized paper instead (14 days under the GBSH Code, 10 under RACCS 2025).
If the parties choose differently, the Secretariat recommends one.', ARRAY[]::"RoleName"[], 8, CURRENT_TIMESTAMP),
  ('faq-09', 'The process', 'Can a case be dismissed?', 'The Secretariat may dismiss a case at any stage, with or without prejudice. A case dismissed without prejudice can be reopened.
Closed records are kept for 5 years, then the Secretariat may approve their disposal.', ARRAY[]::"RoleName"[], 9, CURRENT_TIMESTAMP),
  ('faq-10', 'Deadlines', 'What are the deadlines?', 'GBSH Code (students) / RACCS 2025 (personnel):
- Notarized complaint: 3 / 3 days
- Response to the show-cause order: 5 / 5 days
- Formal charge: 15 days / no fixed period
- Answer to the charge: 7 / 10 days
- Position paper: 14 / 10 days
- Report to the President: 30 days from the response / 5 days from the prima facie finding
- Decision: 30 / 30 days', ARRAY[]::"RoleName"[], 10, CURRENT_TIMESTAMP),
  ('faq-11', 'Deadlines', 'Where do I see my deadlines?', 'Each case''s Overview shows its deadlines and timeline. The Calendar shows them across cases, and reminders arrive in Notifications and by email before each one.', ARRAY[]::"RoleName"[], 11, CURRENT_TIMESTAMP),
  ('faq-12', 'Deadlines', 'What happens if a deadline passes?', 'The Secretariat is told when a deadline passes and decides the next step. For example, if a respondent doesn''t respond to the show-cause order in time, the Secretariat may proceed without the response.', ARRAY[]::"RoleName"[], 12, CURRENT_TIMESTAMP),
  ('faq-13', 'Using the system', 'How do I file a complaint?', 'Choose File a Complaint in the sidebar, then pick how to file: non-anonymously or anonymously.
Fill in each respondent as Last Name, First Name, MI. with their College / Department (up to 3 respondents), describe the incident, add evidence links, and submit.
If you filed under your name, upload the notarized copy within 3 days: up to 10 files, 10 MB each. Anonymous complaints need no notarized copy.', ARRAY['PARTY']::"RoleName"[], 13, CURRENT_TIMESTAMP),
  ('faq-14', 'Using the system', 'Where are a case''s files?', 'On the case page, under the Documents tab. CODI staff can also browse every file across cases on the Records page.', ARRAY[]::"RoleName"[], 14, CURRENT_TIMESTAMP),
  ('faq-15', 'Using the system', 'What can I do on a case right now?', 'Open the case. The Overview lists the actions your role can take at its current stage, with any deadline next to them.', ARRAY[]::"RoleName"[], 15, CURRENT_TIMESTAMP),
  ('faq-16', 'Using the system', 'I got locked out. What now?', 'Three wrong passwords lock an account for 1 hour, and an unlock code is emailed to you. Accounts come from the university directory, so there is no sign-up; contact the CODI Secretariat if you still can''t sign in.', ARRAY[]::"RoleName"[], 16, CURRENT_TIMESTAMP),
  ('faq-17', 'Using the system', 'Who can see my case?', 'Only the parties to the case and the CODI staff handling it. Committee votes, deliberations and internal drafts are visible to CODI staff only.', ARRAY['PARTY']::"RoleName"[], 17, CURRENT_TIMESTAMP),
  ('faq-18', 'Using the system', 'Where are reports and the audit log?', 'Reports are in the sidebar for CODI staff and the Disciplining Authority. The Audit Log and Login Attempts are for the Chairperson and the Secretariat.', ARRAY['SECRETARIAT', 'CHAIRPERSON', 'COMMITTEE', 'DISCIPLINING_AUTHORITY']::"RoleName"[], 18, CURRENT_TIMESTAMP),
  ('faq-19', 'Your role', 'What does the Secretariat do?', 'Verifies complaints and confirms respondents, drafts show-cause orders and formal charges, confirms the Committee''s findings, sets the final offense level when the Committee''s vote ties, schedules hearings, and records outcomes. It also manages Committee accounts.', ARRAY['SECRETARIAT']::"RoleName"[], 19, CURRENT_TIMESTAMP),
  ('faq-20', 'Your role', 'What needs my approval as Chairperson?', 'Show-cause orders drafted by the Secretariat: approve them or return them with a note. After a prima facie finding is confirmed, you may also change a case''s offense level.', ARRAY['CHAIRPERSON']::"RoleName"[], 20, CURRENT_TIMESTAMP),
  ('faq-21', 'Your role', 'What does a Committee member do?', 'Vote on whether there is a prima facie case for each respondent, with your rationale. If you find one, vote on the offense level on the Risk assessment tab. A “no prima facie case” vote needs no offense vote.', ARRAY['COMMITTEE']::"RoleName"[], 21, CURRENT_TIMESTAMP),
  ('faq-22', 'Your role', 'What does the Disciplining Authority decide?', 'You approve the formal charges CODI drafts, and decide on CODI''s recommendation within 30 days of receiving it.', ARRAY['DISCIPLINING_AUTHORITY']::"RoleName"[], 22, CURRENT_TIMESTAMP),
  ('faq-23', 'Your role', 'I feel unsafe. Who do I contact?', 'Please reach out to the CODI Secretariat right away. If you are in immediate danger, contact campus security or emergency services.', ARRAY['PARTY']::"RoleName"[], 23, CURRENT_TIMESTAMP);
