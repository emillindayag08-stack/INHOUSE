# CODI-IS process flow

The path of one case, from filing to a decision. Status names are the ones shown in the system.
Paste the diagram into https://mermaid.live to view or export it as an image.

```mermaid
flowchart TD
    A([Complainant files complaint<br/>Status: Submitted · No. REF-...]) --> B[Complainant uploads notarized copy<br/>within 3 days · up to 10 files, 10 MB each]
    B --> C{Secretariat reviews<br/>and confirms each respondent}
    C -- Incomplete --> R[Returned for Correction] --> A
    C -- Complete --> D[Verified<br/>No. becomes CPI-...]
    D --> E[Secretariat drafts show-cause order]
    E --> F{Chairperson approves?}
    F -- Returned --> E
    F -- Approved --> G[Show-Cause Issued<br/>one per respondent]
    G --> H[Respondent responds<br/>5 days]
    H --> I[Secretariat reviews the response]
    I --> J[Under Evaluation<br/>Committee votes on prima facie, per respondent]
    J -- No prima facie case --> X1[No Prima Facie Case]
    J -- Prima facie found --> K[Prima Facie Found<br/>No. becomes CODI-...]
    K --> L[Committee risk assessment<br/>sets the offense level, per respondent]
    L --> M[Formal charge drafted<br/>Charge Awaiting Approval]
    M --> N[Formal Charge Sent]
    N --> O[Respondent answers the charge<br/>GBSH 7 days · RACCS 10 days]
    O --> P{Pathway}
    P -- Formal investigation --> Q[Hearings scheduled<br/>Pre-trial and trial]
    P -- Position paper --> S[Each party files a notarized<br/>position paper, 14 or 10 days]
    Q --> T[Formal Investigation Ended]
    S --> U
    T --> U[In Deliberation]
    U --> V[Recommendation Filed<br/>report to the President, 30 days to decide]
    V --> W([Resolved or Escalated])

    X1 --> Z
    W --> Z[Closed case<br/>kept 5 years, then Secretariat approves disposal]
    D -.-> Y
    J -.-> Y[Secretariat may dismiss at any stage:<br/>with or without prejudice]
    Y -.-> Z
    Y -. only without prejudice .-> D
```

## Who does what

| Step | Who |
|---|---|
| File the complaint and upload the notarized copy | Complainant (any university member) |
| Check the complaint, confirm each respondent, verify | CODI Secretariat |
| Approve the show-cause order | CODI Chairperson |
| Respond to the show-cause order and the formal charge | Respondent |
| Vote on prima facie, do the risk assessment | CODI Committee |
| Draft the charge, schedule hearings, record outcomes | CODI Secretariat |
| Decide on the recommendation | Disciplining Authority (President) |
| Dismiss, reopen, approve disposal of old records | CODI Secretariat |

## Deadlines running alongside

| Stage | GBSH Code (students) | RACCS 2025 (personnel) |
|---|---|---|
| Notarized complaint | 3 days | 3 days |
| Respondent's response | 5 days | 5 days |
| Report to the President | 30 days from the response | 5 days from the prima facie finding |
| Formal charge | 15 days | no fixed period |
| Answer to the charge | 7 days | 10 days |
| Position paper | 14 days | 10 days |
| Decision | 30 days | 30 days |

Reminders go out in the system and by email before each deadline, and the Secretariat is told when one passes.

## Case numbers

`REF` when filed, `CPI` when verified, `CODI` when a prima facie case is found.
