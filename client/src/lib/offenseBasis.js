// The Committee's legal basis for classifying an offense as light, less grave
// or grave, quoted (and lightly trimmed) from the two governing issuances.
// Shown in the Risk assessment panel so a vote has a documented basis, not
// just a bare choice — this is reference text, not a scoring mechanism.

// BulSU Anti-GBSH Code, Section 7 — Classification of Acts.
const GBSH_CODE = {
  source: "BulSU Anti-GBSH Code, Section 7 (Classification of Acts)",
  LIGHT: [
    "Surreptitiously looking or stealing a look at a person's private parts or underclothing",
    "Malicious leering or ogling",
    "Sexual flirtation or persistent unwanted attention with sexual overtones",
    "Inquiries or comments about a person's sex life, sexual orientation, and gender identity",
    "Sexist or smutty remarks causing discomfort, embarrassment, offense, or insult",
    "Display of sexually offensive pictures, materials, or graffiti",
  ],
  LESS_GRAVE: [
    "Verbal abuse — taunting, cursing, wolf-whistling, catcalling, misogynistic/transphobic/homophobic/sexist slurs, persistent unwanted comments on appearance",
    "Non-verbal abuse — offensive hand or body gestures that demean, harass, threaten, or intimidate",
    "Derogatory or degrading remarks or innuendoes about sex, sexual orientation, or gender identity",
    "Unwelcome conduct of a sexual nature, whether verbal, physical, or through technology",
    "Conduct that is unwelcome and pervasive, creating a hostile or intimidating environment",
    "Touching or brushing against the victim's body (outside the areas listed under Grave)",
    "Pinching that does not fall under grave offenses",
    "Sexual advances or propositions",
  ],
  GRAVE: [
    "Touching, pinching, or brushing against the genitalia, breasts, inner thighs, buttocks, or other intimate body parts",
    "Forced kissing",
    "Exposing private parts, public masturbation, groping, or similar lewd acts",
    "Requesting a sexual favor in exchange for employment, promotion, grades, honors, scholarships, or other benefits",
    "Attempted or consummated unwanted sexual intercourse, or sexual torture",
    "Sexual threats or harassment through ICT — cyberstalking, incessant messaging, unauthorized recording or sharing of sexual content",
    "Impersonating a victim online, or filing false reports to silence a victim",
  ],
};

// RACCS 2025, Section 63 (Classification of Offenses) — the general grading
// of administrative offenses, which sexual harassment is one instance of.
// Each list below is a representative sample, not the full text.
const RACCS = {
  source: "RACCS 2025, Section 63 (Classification of Offenses)",
  LIGHT: [
    "Light sexual harassment — e.g. surreptitious looking, sexist remarks or jokes, unwelcome flirtation or comments",
    "Habitual tardiness",
    "Gambling prohibited by law",
    "Lending money at a usurious rate of interest",
    "Refusal to render overtime service",
    "Simple discourtesy in the course of official duties",
    "Violation of reasonable office rules and regulations",
  ],
  LESS_GRAVE: [
    "Less grave sexual harassment — e.g. unwanted touching outside the private parts, unwanted pinching, verbal abuse with sexual overtones",
    "Simple misconduct",
    "Simple neglect of duty",
    "Habitual drunkenness",
    "Insubordination",
    "Discourtesy in the course of official duties",
  ],
  GRAVE: [
    "Grave sexual harassment — e.g. unwanted touching of private parts, sexual assault, or requesting a sexual favor in exchange for a benefit",
    "Grave misconduct",
    "Gross neglect of duty",
    "Serious dishonesty",
    "Conviction of a crime involving moral turpitude",
    "Disgraceful and immoral conduct",
  ],
  note: "A representative sample of Section 63's grave/less grave/light offenses; consult the full RACCS 2025 text for the complete list and for the detailed rules on sexual harassment in the workplace, in streets and public places, and online.",
};

export const OFFENSE_BASIS = { GBSH_CODE, RACCS };

export function offenseBasisFor(framework) {
  return OFFENSE_BASIS[framework] || null;
}
