"use strict";
// cron-jobs/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAllJobs = void 0;
const followUpWorker_1 = require("./followUpWorker");
const startAllJobs = () => {
    console.log("🚀 Starting all cron jobs...");
    (0, followUpWorker_1.startFollowUpJob)();
};
exports.startAllJobs = startAllJobs;
//# sourceMappingURL=index.js.map