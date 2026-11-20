import { Router } from "express";
import { prisma } from "../prismaClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { searchPeople } from "../services/directory/index.js";

// Lookup against the BulSU accounts directory, so a complainant names the
// respondent by picking the actual person rather than typing a name. Read
// only: nothing here creates or changes an account.
export const directoryRouter = Router();
directoryRouter.use(requireAuth);

const VALID_TYPES = new Set(["STUDENT", "PERSONNEL"]);

directoryRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "");
    const type = VALID_TYPES.has(req.query.type) ? req.query.type : null;
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 25);

    // You can't be both sides of the same case, so you never appear in your
    // own search results.
    const me = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { directoryId: true },
    });
    const people = await searchPeople({
      q,
      type,
      limit,
      excludeDirectoryIds: me?.directoryId ? [me.directoryId] : [],
    });
    res.json(people);
  })
);
