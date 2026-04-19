// cron-jobs/index.ts

import { startFollowUpJob } from "./followUpWorker";

export const startAllJobs = () => {
  console.log("🚀 Starting all cron jobs...");

  startFollowUpJob();
};