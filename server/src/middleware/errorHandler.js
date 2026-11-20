// Route handlers throw/reject with explicit `err.status` (400/403/404/etc.) for
// expected, user-facing problems -- those messages are safe to return as-is.
// Anything without a status is an unexpected failure (e.g. a raw Prisma/DB
// error), which may contain connection strings or internal details, so it is
// logged server-side only and replaced with a generic message for the client.
export function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  const message = err.status ? err.message : "Something went wrong. Please try again.";
  res.status(status).json({ error: message });
}
