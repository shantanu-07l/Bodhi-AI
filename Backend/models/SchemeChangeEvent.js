import mongoose from "mongoose";

/**
 * SchemeChangeEvent — records section-level content changes detected during a refresh cycle.
 *
 * IMPORTANT: A change event records that webpage content changed.
 * It does NOT assert that an official legal rule has taken effect.
 * Verified legal notifications must be confirmed through official gazette sources.
 */
const SchemeChangeEventSchema = new mongoose.Schema({
    // Reference to the refresh job that detected this change
    jobId: { type: String, required: true, index: true },

    // Stable scheme identifier
    schemeId: { type: String, required: true, index: true },
    schemeTitle: { type: String, required: true },

    // URL of the official scheme page
    sourceUrl: { type: String, required: true },

    // What kind of change was observed
    changeType: {
        type: String,
        enum: ["added", "modified", "removed", "section_modified"],
        required: true,
        index: true
    },

    // Which section changed (null for whole-scheme add/remove)
    section: {
        type: String,
        enum: ["description", "eligibility", "benefits", "exclusions",
               "documents", "application_steps", "faq", "overview", null],
        default: null,
        index: true
    },

    // Content hash before and after the change
    previousHash: { type: String, default: null },
    currentHash: { type: String, default: null },

    // Version numbers for traceability
    previousVersion: { type: Number, default: null },
    currentVersion: { type: Number, default: null },

    // Source publication/effective date if supplied by the official portal.
    // A scrape timestamp is not proof of an official update date.
    sourceDateReported: { type: Date, default: null },

    // Whether the change has been cross-verified against an official notification
    // Starts as false; must be explicitly set true through manual or automated verification
    verificationStatus: {
        type: String,
        enum: ["unverified", "verified_official", "disputed"],
        default: "unverified",
        index: true
    },

    // When the change was detected by the crawler
    detectedAt: { type: Date, default: Date.now, index: true },

    // Human-readable summary of what changed
    summary: { type: String, default: "" }
});

SchemeChangeEventSchema.index({ schemeId: 1, section: 1, detectedAt: -1 });
SchemeChangeEventSchema.index({ changeType: 1, detectedAt: -1 });

const SchemeChangeEvent = mongoose.model("SchemeChangeEvent", SchemeChangeEventSchema);
export default SchemeChangeEvent;
