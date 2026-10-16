import mongoose from "mongoose";

/**
 * RefreshJob — tracks a single scheduled or manual scheme refresh cycle.
 * Each refresh cycle goes through: pending -> running -> completed/failed/partial.
 */
const RefreshJobSchema = new mongoose.Schema({
    // Unique job identifier (e.g. "refresh_1747382400000_ab3f2")
    jobId: { type: String, required: true, unique: true, index: true },

    // Trigger source
    triggerType: {
        type: String,
        enum: ["scheduled", "manual_admin", "test"],
        default: "scheduled"
    },

    // Job lifecycle status
    status: {
        type: String,
        enum: ["pending", "running", "completed", "partial", "failed"],
        default: "pending",
        index: true
    },

    // Concurrency lock: hostname + PID of the process holding this job
    lockedBy: { type: String, default: null },

    // Statistics counters
    stats: {
        totalScanned: { type: Number, default: 0 },
        newSchemes: { type: Number, default: 0 },
        updatedSchemes: { type: Number, default: 0 },
        unchangedSchemes: { type: Number, default: 0 },
        removedSchemes: { type: Number, default: 0 },
        sectionsReindexed: { type: Number, default: 0 },
        changeEventsCreated: { type: Number, default: 0 },
        skippedRecords: { type: Number, default: 0 },
        errorCount: { type: Number, default: 0 }
    },

    // Error log entries
    errorLog: [{
        schemeId: { type: String },
        phase: { type: String },   // "ingest" | "changeDetect" | "vectorIndex"
        error: { type: String },
        timestamp: { type: Date, default: Date.now }
    }],

    // Data source used in this run
    source: { type: String, default: "myscheme-scraper" },
    sourceFile: { type: String, default: null },  // file path if using fixture/file input

    // Completeness ratio: fraction of expected schemes actually crawled.
    // Only deactivate removed schemes if completeness >= MIN_CRAWL_COMPLETENESS_RATIO.
    crawlCompletenessFraction: { type: Number, default: 0 },

    // Whether the previous working index is still serving traffic (preserved until this job succeeds)
    previousIndexPreserved: { type: Boolean, default: true },

    startedAt: { type: Date, default: Date.now, index: true },
    completedAt: { type: Date, default: null },

    // Duration in milliseconds
    durationMs: { type: Number, default: null }
});

const RefreshJob = mongoose.model("RefreshJob", RefreshJobSchema);
export default RefreshJob;
