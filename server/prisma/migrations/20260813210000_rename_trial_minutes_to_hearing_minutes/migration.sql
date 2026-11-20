-- Generalize the Trial-only minutes doc type to cover Pre-Trial hearings too
-- — a hearing's minutes are the same concept regardless of hearing type, and
-- Document.hearingId already carries which hearing (and therefore which
-- type) they belong to.
ALTER TYPE "DocumentType" RENAME VALUE 'TRIAL_MINUTES' TO 'HEARING_MINUTES';
