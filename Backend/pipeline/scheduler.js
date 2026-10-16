import cron from "node-cron";
import path from "path";
import { runRefreshCycle } from "./refreshWorker.js";
import RefreshJob from "../models/RefreshJob.js";

/**
 * Scheme Refresh Scheduler
 *
 * Runs background refresh cycles on a configurable cron schedule & timezone,
 * ensuring chat handling is never blocked.
 * Concurrency guard in runRefreshCycle prevents overlapping runs.
 */

let scheduledTask = null;
let lastTriggerTime = null;

export const SCHEDULER_CONFIG = {
    enabled: process.env.SCHEME_REFRESH_ENABLED === "true",
    cronExpression: process.env.SCHEME_REFRESH_CRON || "0 2 * * 0", // Default: Every Sunday at 2:00 AM
    timezone: process.env.SCHEME_REFRESH_TIMEZONE || "Asia/Kolkata",
    sourceFile: process.env.SCHEME_INGEST_SOURCE || "pipeline/fixtures/sample-schemes.json"
};

/**
 * Executes a refresh cycle asynchronously, handling errors cleanly without crashing.
 *
 * @param {string} triggerType - "scheduled" | "manual_admin" | "test"
 * @param {Object} options     - { sourceFile, forceReindex, dryRun }
 * @returns {Promise<Object>}
 */
export async function executeRefresh(triggerType = "scheduled", options = {}) {
    lastTriggerTime = new Date();
    const source = options.sourceFile || SCHEDULER_CONFIG.sourceFile;
    const resolvedPath = path.isAbsolute(source) ? source : path.resolve(process.cwd(), source);

    console.log(`[Scheduler] Initiating refresh cycle (trigger: ${triggerType}, source: ${resolvedPath})...`);

    try {
        const result = await runRefreshCycle(resolvedPath, {
            triggerType,
            dryRun: options.dryRun || false,
            forceReindex: options.forceReindex || false
        });
        console.log(`[Scheduler] Refresh cycle ${result.jobId} finished with status: ${result.status}`);
        return result;
    } catch (err) {
        console.error(`[Scheduler] Refresh cycle failed: ${err.message}`);
        throw err;
    }
}

/**
 * Initializes the cron scheduler if enabled in configuration.
 */
export function initScheduler() {
    if (!SCHEDULER_CONFIG.enabled) {
        console.log("[Scheduler] Automatic scheme refresh scheduler is DISABLED (SCHEME_REFRESH_ENABLED != true).");
        return null;
    }

    if (!cron.validate(SCHEDULER_CONFIG.cronExpression)) {
        console.error(`[Scheduler] Invalid cron expression '${SCHEDULER_CONFIG.cronExpression}'. Scheduler not started.`);
        return null;
    }

    if (scheduledTask) {
        scheduledTask.stop();
    }

    console.log(`[Scheduler] Starting cron job: '${SCHEDULER_CONFIG.cronExpression}' (timezone: ${SCHEDULER_CONFIG.timezone})`);

    scheduledTask = cron.schedule(
        SCHEDULER_CONFIG.cronExpression,
        async () => {
            console.log(`[Scheduler] Cron trigger fired at ${new Date().toISOString()}`);
            try {
                // Execute in background without blocking
                await executeRefresh("scheduled");
            } catch (err) {
                console.error("[Scheduler] Scheduled execution error:", err.message);
            }
        },
        {
            scheduled: true,
            timezone: SCHEDULER_CONFIG.timezone
        }
    );

    return scheduledTask;
}

/**
 * Returns current status of the scheduler and latest job details.
 */
export async function getSchedulerStatus() {
    let latestJob = null;
    let runningJob = null;

    try {
        latestJob = await RefreshJob.findOne().sort({ startedAt: -1 }).lean();
        runningJob = await RefreshJob.findOne({ status: "running" }).lean();
    } catch (err) {
        console.warn("[Scheduler] Could not fetch job records from database:", err.message);
    }

    return {
        scheduler: {
            enabled: SCHEDULER_CONFIG.enabled,
            cronExpression: SCHEDULER_CONFIG.cronExpression,
            timezone: SCHEDULER_CONFIG.timezone,
            sourceFile: SCHEDULER_CONFIG.sourceFile,
            isCronActive: scheduledTask !== null,
            lastTriggerTime
        },
        activeJob: runningJob || null,
        latestJob: latestJob || null
    };
}

/**
 * Stops the running cron schedule.
 */
export function stopScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
        console.log("[Scheduler] Stopped cron task.");
    }
}
