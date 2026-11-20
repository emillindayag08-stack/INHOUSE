import "dotenv/config";
import { createApp } from "./app.js";
import { sweepOverdueDeadlines, sweepApproachingDeadlines } from "./services/deadlineService.js";

const port = process.env.PORT || 4000;
const app = createApp();

// Deadlines are checked in the background so a reminder goes out even when
// nobody has the app open: once at startup, then hourly.
async function checkDeadlines() {
  try {
    await sweepApproachingDeadlines();
    await sweepOverdueDeadlines();
  } catch (err) {
    console.error(`Deadline check failed: ${err.message}`);
  }
}

app.listen(port, () => {
  console.log(`CODI-IS API listening on http://localhost:${port}`);
  checkDeadlines();
  setInterval(checkDeadlines, 60 * 60 * 1000).unref();
});
