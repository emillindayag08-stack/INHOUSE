// Length limits enforced on the way in, kept together so the figure a form
// counts down to is the same one the route refuses past. The client mirrors
// these in client/src/lib/constants.js.

export const DESCRIPTION_MAX = 4000;
export const RESPONDENT_NAME_MAX = 100;

// The message sent back with a returned filing — a show-cause order, a formal
// charge, a notarized document, or a respondent's answer. Enough for the
// corrections that are needed, not for the corrected document itself.
export const RETURN_NOTE_MAX = 1000;
