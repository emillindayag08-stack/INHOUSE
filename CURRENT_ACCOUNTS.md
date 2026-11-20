# CODI-IS demo accounts

Every account below uses the password **`Passw0rd!`** (set in `server/prisma/seed.js`
and `server/src/services/directory/index.js`; overridable with
`DIRECTORY_DEFAULT_PASSWORD` in `server/.env`).

Create them with `npm run seed` in the `server` folder.

## CODI staff

These need a second step: after the password, a 6-digit code is emailed to the
account's own address. Tick "Trust this site for 3 days" to skip it on that browser.

| Role | Name | Email |
|---|---|---|
| Disciplining Authority | Disciplining Authority | johnmarcoaguirre158@gmail.com |
| Secretariat | CODI Secretariat | emillindayag008@gmail.com |
| Chairperson | CODI Chairperson | emillindayag08@gmail.com |
| Committee | CODI Committee Member 1 | tamayopaularon.spnhs@gmail.com |
| Committee | CODI Committee Member 2 | bangbang3027@gmail.com |
| Committee | CODI Committee Member 3 | weasleyjohnmarco@gmail.com |
| Committee | CODI Committee Member 4 | committee4@bulsu.edu.ph |
| Committee | CODI Committee Member 5 | committee5@bulsu.edu.ph |
| Committee | CODI Committee Member 6 | committee6@bulsu.edu.ph |
| Committee | CODI Committee Member 7 | committee7@bulsu.edu.ph |
| Committee | CODI Committee Member 8 | committee8@bulsu.edu.ph |

Members 4 to 8 are placeholders: their addresses receive no mail, so they can't
get a sign-in code. Every sitting Committee member (and the Chairperson) must
vote before a case's prima facie step completes, so give them real emails or
deactivate them on the **Committee accounts** page first.

## University members (password only)

A member is a complainant or a respondent depending on the case, not the account.

| Type | Name | Email | ID |
|---|---|---|---|
| Student | Francine Giron | francinedeguiagiron@gmail.com | 2022-10431 |
| Student | Anne Giron | giron.francine.bsis@gmail.com | 2021-02310 |
| Personnel | Iya Reyes | iyaaa.xyz143@gmail.com | EMP-1042 |
| Personnel | Bregil Dolorain | bregildolorain14@gmail.com | EMP-1188 |

## Good to know

- Three wrong passwords lock an account for 1 hour and email it an unlock code.
  Set `ACCOUNT_LOCKOUT=off` in `server/.env` to switch that off while testing.
- Notifications and sign-in codes are emailed, so these addresses must be real inboxes.
- The Secretariat creates and deactivates Committee accounts on the **Committee
  accounts** page.
