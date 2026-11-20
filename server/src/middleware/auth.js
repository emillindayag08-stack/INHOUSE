import jwt from "jsonwebtoken";
import { prisma } from "../prismaClient.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }
  const token = header.slice("Bearer ".length);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  // A token outlives the account's standing, so it is checked each time: a
  // deactivated (or deleted) account stops working at once, not when the token
  // expires.
  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { deactivatedAt: true } });
    if (!user || user.deactivatedAt) {
      return res.status(401).json({ error: "This account has been deactivated." });
    }
  } catch (err) {
    return next(err);
  }
  req.user = payload;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have access to this resource" });
    }
    next();
  };
}
