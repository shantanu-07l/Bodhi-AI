import fs from "fs";
import path from "path";
import os from "os";
import mongoose from "mongoose";
import "dotenv/config";
import Scheme from "../models/Scheme.js";
import SchemeChunk from "../models/SchemeChunk.js";
import RefreshJob from "../models/RefreshJob.js";
import SchemeChangeEvent from "../models/SchemeChangeEvent.js";
import { normalizeScheme } from "./normalizer.js";
import { chunkScheme } from "./chunker.js";
import { detectSectionChanges, getSectionsToReindex } from "./changeDetector.js";
import { defaultEmbeddingService } from "../utils/embeddings.js";

/**
 * Minimum fraction of existing scheme count that must appear in the incoming
 * crawl before the removal-deactivation phase runs.
 * Prevents a partial/failed crawl from wiping valid existing data.
 */
const MIN_CRAWL_COMPLETENESS_RATIO = parseFloat(
    process.env.REFRESH_MIN_COMPLETENESS_RATIO || "0.8"
);
const MAX_EMBED_RETRIES = parseInt(process.env.REFRESH_EMBED_RETRIES || "3", 10);
const EMBED_RETRY_DELAY_MS = parseInt(process.env.REFRESH_EMBED_RETRY_DELAY_MS || "2000", 10);

// ── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry(fn, retries, delayMs, label) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt < retries) {
                console.warn(`[RefreshWorker] ${label} attempt ${attempt}/${retries} failed: ${err.message}. Retrying in ${delayMs * attempt}ms...`);
                await new Promise(r => setTimeout(r, delayMs * attempt));
            }
        }
    }
    throw lastErr;
}

// ── Finalize job record ───────────────────────────────────────────────────────

async function finalizeJob(job, status, stats, errorLog, startedAt) {
    if (!job) return;
    try {
        const completedAt = new Date();
        job.status = status;
        job.stats = stats;
        job.errorLog = errorLog.map(e => ({
            schemeId: e.schemeId || "unknown",
            phase: e.phase || "unknown",
            error: e.error || "unknown error",
            timestamp: new Date()
        }));
        job.completedAt = completedAt;
        job.durationMs = completedAt - startedAt;
        job.lockedBy = null;
        await job.save();
    } catch (saveErr) {
        console.error("[RefreshWorker] Failed to finalize job record:", saveErr.message);
    }
}

// ── Main refresh function ─────────────────────────────────────────────────────

/**
 * Runs a complete refresh cycle:
 *   1. Load incoming scheme data (file path or array of objects)
 *   2. Normalize and validate each record
 *   3. Detect whole-scheme and section-level changes vs persisted data
 *   4. Persist updates to the Scheme collection
 *   5. Re-index ONLY changed sections in the vector store (retry + backoff)
 *   6. Record SchemeChangeEvent documents
 *   7. After sufficiently-complete crawl, safely soft-deactivate removed schemes
 *   8. Update the RefreshJob with final stats and duration
 *
 * The previous working index is never dropped until the replacement is written
 * (blue-green transition). A failed crawl leaves existing data intact.
 *
 * @param {string|Array} sourceInput
 * @param {Object}  options
 * @param {string}  [options.triggerType="scheduled"]  - "scheduled"|"manual_admin"|"test"
 * @param {boolean} [options.dryRun=false]              - No DB writes if true
 * @param {boolean} [options.forceReindex=false]        - Re-embed all chunks even if hash unchanged
 * @returns {Promise<{jobId, status, stats, errorLog}>}
 */
export async function runRefreshCycle(sourceInput, options = {}) {
    const { triggerType = "scheduled", dryRun = false, forceReindex = false } = options;
    const startedAt = new Date();
    const jobId = `refresh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const lockId = `${os.hostname()}:${process.pid}`;

    console.log(`\n[RefreshWorker] === Starting refresh cycle === jobId=${jobId} trigger=${triggerType} dryRun=${dryRun}`);

    let job = null;
    if (!dryRun && mongoose.connection.readyState === 1) {
        // Concurrency Guard: Check for an active running job
        const activeJob = await RefreshJob.findOne({ status: "running" });
        if (activeJob) {
            const staleThresholdMs = 30 * 60 * 1000;
            const elapsed = Date.now() - new Date(activeJob.startedAt).getTime();
            if (elapsed < staleThresholdMs) {
                const lockMsg = `Concurrency conflict: Refresh job '${activeJob.jobId}' is currently running (started ${Math.round(elapsed / 1000)}s ago by ${activeJob.lockedBy || 'unknown'}). Duplicate execution prevented.`;
                console.warn(`[RefreshWorker] ${lockMsg}`);
                throw new Error(lockMsg);
            } else {
                console.warn(`[RefreshWorker] Stale lock detected for job '${activeJob.jobId}'. Marking as failed.`);
                activeJob.status = "failed";
                activeJob.completedAt = new Date();
                activeJob.errorLog.push({ schemeId: "system", phase: "lock", error: "Lock timed out after 30 minutes", timestamp: new Date() });
                activeJob.lockedBy = null;
                await activeJob.save();
            }
        }

        job = new RefreshJob({
            jobId, triggerType, status: "running", lockedBy: lockId,
            source: "myscheme-scraper", previousIndexPreserved: true, startedAt
        });
        await job.save();
    }

    const stats = {
        totalScanned: 0, newSchemes: 0, updatedSchemes: 0, unchangedSchemes: 0,
        removedSchemes: 0, sectionsReindexed: 0, changeEventsCreated: 0,
        skippedRecords: 0, errorCount: 0
    };
    const errorLog = [];
    const changeEvents = [];

    // ── Load raw records ────────────────────────────────────────────────────
    let rawRecords = [];
    try {
        if (Array.isArray(sourceInput)) {
            rawRecords = sourceInput;
        } else if (typeof sourceInput === "string") {
            if (!fs.existsSync(sourceInput)) throw new Error(`Source file not found: ${sourceInput}`);
            const parsed = JSON.parse(fs.readFileSync(sourceInput, "utf8"));
            rawRecords = Array.isArray(parsed) ? parsed : (parsed.schemes ? parsed.schemes : [parsed]);
        } else {
            throw new Error("sourceInput must be a file path string or an array");
        }
    } catch (loadErr) {
        errorLog.push({ schemeId: "load", phase: "load", error: loadErr.message });
        await finalizeJob(job, "failed", stats, errorLog, startedAt);
        throw loadErr;
    }

    stats.totalScanned = rawRecords.length;
    console.log(`[RefreshWorker] Loaded ${rawRecords.length} raw records`);

    // ── Pre-load existing schemeIds for removal detection ───────────────────
    let existingSchemeIds = new Set();
    if (!dryRun && mongoose.connection.readyState === 1) {
        const existingDocs = await Scheme.find({}, { schemeId: 1 }).lean();
        existingSchemeIds = new Set(existingDocs.map(s => s.schemeId));
    }

    const incomingSchemeIds = new Set();
    const updatedSchemeIds = [];

    // ── Phase 1 & 2: Normalize → detect changes → persist ──────────────────
    for (let i = 0; i < rawRecords.length; i++) {
        const raw = rawRecords[i];
        const recordLabel = (raw && (raw.id || raw.title)) ? (raw.id || raw.title) : (`Record_${i + 1}`);

        const normResult = normalizeScheme(raw, {
            sourceName: "myscheme-scraper",
            sourcePortal: "myscheme.gov.in",
            isAuthoritative: true
        });

        if (!normResult.valid) {
            stats.skippedRecords++;
            errorLog.push({ schemeId: recordLabel, phase: "ingest", error: normResult.error });
            console.warn(`[RefreshWorker][Skip] ${recordLabel}: ${normResult.error}`);
            continue;
        }

        const incoming = normResult.scheme;
        incomingSchemeIds.add(incoming.schemeId);
        if (dryRun) { stats.newSchemes++; continue; }

        try {
            const persisted = await Scheme.findOne({ schemeId: incoming.schemeId }).lean();

            if (!persisted) {
                // New scheme
                await Scheme.create(incoming);
                stats.newSchemes++;
                updatedSchemeIds.push(incoming.schemeId);
                changeEvents.push({
                    jobId, schemeId: incoming.schemeId, schemeTitle: incoming.title,
                    sourceUrl: incoming.sourceUrl, changeType: "added", section: null,
                    previousHash: null, currentHash: incoming.contentHash,
                    previousVersion: null, currentVersion: 1,
                    sourceDateReported: incoming.sourceDate || null,
                    verificationStatus: "unverified",
                    summary: `New scheme '${incoming.title}' discovered and added to JanSahayak database.`
                });

            } else if (persisted.contentHash === incoming.contentHash) {
                // Unchanged: skip
                stats.unchangedSchemes++;

            } else {
                // Modified: safety guard then section-level detection
                if (!incoming.description && !incoming.eligibility && !incoming.benefits) {
                    stats.skippedRecords++;
                    const safetyMsg = `Rejected empty update for '${incoming.schemeId}' — no content in description/eligibility/benefits`;
                    errorLog.push({ schemeId: incoming.schemeId, phase: "ingest", error: safetyMsg });
                    console.warn(`[RefreshWorker][Safety] ${safetyMsg}`);
                    continue;
                }

                const sectionChanges = detectSectionChanges(incoming, persisted);
                const newVersion = (persisted.version || 1) + 1;

                await Scheme.updateOne(
                    { schemeId: incoming.schemeId },
                    { ...incoming, version: newVersion, createdAt: persisted.createdAt, updatedAt: new Date() }
                );
                stats.updatedSchemes++;
                updatedSchemeIds.push(incoming.schemeId);

                for (const change of sectionChanges) {
                    changeEvents.push({ ...change, jobId, currentVersion: newVersion, previousVersion: persisted.version || 1 });
                }

                // Emit whole-scheme event if only metadata changed (no section diffs)
                if (sectionChanges.length === 0) {
                    changeEvents.push({
                        jobId, schemeId: incoming.schemeId, schemeTitle: incoming.title,
                        sourceUrl: incoming.sourceUrl, changeType: "modified", section: null,
                        previousHash: persisted.contentHash, currentHash: incoming.contentHash,
                        previousVersion: persisted.version || 1, currentVersion: newVersion,
                        sourceDateReported: incoming.sourceDate || null,
                        verificationStatus: "unverified",
                        summary: `Scheme '${incoming.title}' metadata changed (tags, ministry, or URL) — no section content changed.`
                    });
                }
            }
        } catch (dbErr) {
            stats.errorCount++;
            errorLog.push({ schemeId: incoming.schemeId, phase: "ingest", error: dbErr.message });
            console.error(`[RefreshWorker][DBError] '${incoming.schemeId}':`, dbErr.message);
        }
    }

    // ── Phase 3: Selective vector re-indexing ──────────────────────────────
    if (!dryRun && updatedSchemeIds.length > 0) {
        console.log(`[RefreshWorker] Re-indexing vectors for ${updatedSchemeIds.length} scheme(s)...`);

        for (const schemeId of updatedSchemeIds) {
            try {
                const schemeChanges = changeEvents.filter(
                    e => e.schemeId === schemeId && e.changeType === "section_modified"
                );
                const sectionsToReindex = getSectionsToReindex(schemeChanges);
                const isNewScheme = changeEvents.some(
                    e => e.schemeId === schemeId && e.changeType === "added"
                );

                const schemeDoc = await Scheme.findOne({ schemeId }).lean();
                if (!schemeDoc) continue;

                const allChunks = chunkScheme(schemeDoc);
                if (allChunks.length === 0) continue;

                // New scheme → index all; modified → only changed sections (or all if no section diff)
                const chunksToProcess = forceReindex
                    ? allChunks
                    : (isNewScheme || sectionsToReindex.size === 0)
                        ? allChunks
                        : allChunks.filter(c => sectionsToReindex.has(c.section));

                for (const chunk of chunksToProcess) {
                    try {
                        const existingChunk = await SchemeChunk.findOne({ schemeId, chunkHash: chunk.chunkHash });
                        let embedding;
                        if (existingChunk && !forceReindex) {
                            embedding = existingChunk.embedding;
                        } else {
                            embedding = await withRetry(
                                () => defaultEmbeddingService.embedText(chunk.text, false),
                                MAX_EMBED_RETRIES, EMBED_RETRY_DELAY_MS,
                                `embed:${chunk.chunkId}`
                            );
                        }
                        await SchemeChunk.findOneAndUpdate(
                            { chunkId: chunk.chunkId },
                            { ...chunk, embedding, isActive: true },
                            { upsert: true, returnDocument: "after" }
                        );
                        stats.sectionsReindexed++;
                    } catch (embedErr) {
                        stats.errorCount++;
                        errorLog.push({ schemeId, phase: "vectorIndex", error: `Chunk '${chunk.chunkId}': ${embedErr.message}` });
                        console.error(`[RefreshWorker][VectorError] '${chunk.chunkId}':`, embedErr.message);
                    }
                }

                // Blue-green: clean up old version chunks AFTER new ones are safely written
                const targetVersion = schemeDoc.version || 1;
                const ltQuery = { schemeId, schemeVersion: { $lt: targetVersion } };
                await SchemeChunk.deleteMany(ltQuery);

            } catch (indexErr) {
                stats.errorCount++;
                errorLog.push({ schemeId, phase: "vectorIndex", error: indexErr.message });
                console.error(`[RefreshWorker][IndexError] '${schemeId}':`, indexErr.message);
            }
        }
        console.log(`[RefreshWorker] Vector indexing complete: ${stats.sectionsReindexed} chunk(s) indexed`);
    }

    // ── Phase 4: Persist change events ─────────────────────────────────────
    if (!dryRun && changeEvents.length > 0 && mongoose.connection.readyState === 1) {
        try {
            await SchemeChangeEvent.insertMany(changeEvents, { ordered: false });
            stats.changeEventsCreated = changeEvents.length;
            console.log(`[RefreshWorker] Recorded ${changeEvents.length} change event(s)`);
        } catch (evtErr) {
            console.error("[RefreshWorker] Change event save error:", evtErr.message);
            errorLog.push({ schemeId: "change_events", phase: "changeDetect", error: evtErr.message });
        }
    }

    // ── Phase 5: Safe removal of schemes absent from crawl ──────────────────
    if (!dryRun && existingSchemeIds.size > 0 && mongoose.connection.readyState === 1) {
        const completeness = incomingSchemeIds.size / existingSchemeIds.size;
        if (job) job.crawlCompletenessFraction = completeness;
        console.log(`[RefreshWorker] Crawl completeness: ${(completeness * 100).toFixed(1)}% (${incomingSchemeIds.size}/${existingSchemeIds.size})`);

        if (completeness >= MIN_CRAWL_COMPLETENESS_RATIO) {
            const removedSchemeIds = [...existingSchemeIds].filter(id => !incomingSchemeIds.has(id));
            if (removedSchemeIds.length > 0) {
                console.log(`[RefreshWorker] Deactivating ${removedSchemeIds.length} scheme(s) absent from crawl`);
                for (const schemeId of removedSchemeIds) {
                    try {
                        const removedDoc = await Scheme.findOne({ schemeId }).lean();
                        if (!removedDoc) continue;
                        await Scheme.updateOne({ schemeId }, { isActive: false, updatedAt: new Date() });
                        await SchemeChunk.updateMany({ schemeId }, { isActive: false });
                        stats.removedSchemes++;
                        await SchemeChangeEvent.create({
                            jobId, schemeId,
                            schemeTitle: removedDoc.title || schemeId,
                            sourceUrl: removedDoc.sourceUrl || `https://www.myscheme.gov.in/schemes/${schemeId}`,
                            changeType: "removed", section: null,
                            previousHash: removedDoc.contentHash,
                            currentHash: null,
                            previousVersion: removedDoc.version || 1,
                            currentVersion: null,
                            verificationStatus: "unverified",
                            summary: `Scheme '${removedDoc.title || schemeId}' absent from latest crawl. Soft-deactivated — requires manual confirmation before hard deletion.`
                        });
                    } catch (rmErr) {
                        stats.errorCount++;
                        errorLog.push({ schemeId, phase: "removal", error: rmErr.message });
                        console.error(`[RefreshWorker][RemoveError] '${schemeId}':`, rmErr.message);
                    }
                }
            } else {
                console.log("[RefreshWorker] No schemes removed — all existing schemes present in crawl");
            }
        } else {
            console.warn(
                `[RefreshWorker] Crawl completeness ${(completeness * 100).toFixed(1)}% < minimum ` +
                `${(MIN_CRAWL_COMPLETENESS_RATIO * 100).toFixed(0)}%. ` +
                "Skipping removal phase to preserve existing valid data."
            );
        }
    }

    // ── Finalize ───────────────────────────────────────────────────────────
    const finalStatus =
        (stats.errorCount > 0 && stats.newSchemes + stats.updatedSchemes === 0)
            ? "failed"
            : (stats.errorCount > 0 ? "partial" : "completed");

    await finalizeJob(job, finalStatus, stats, errorLog, startedAt);
    console.log(
        `[RefreshWorker] === Cycle complete === Status: ${finalStatus} | ` +
        `New: ${stats.newSchemes} | Updated: ${stats.updatedSchemes} | ` +
        `Unchanged: ${stats.unchangedSchemes} | Removed: ${stats.removedSchemes} | ` +
        `Indexed: ${stats.sectionsReindexed} | Errors: ${stats.errorCount}`
    );
    return { jobId, status: finalStatus, stats, errorLog };
}

// ── CLI runner ────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith("refreshWorker.js")) {
    (async () => {
        if (!process.env.MONGODB_URL) { console.error("ERROR: MONGODB_URL required"); process.exit(1); }
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("[RefreshWorker] Connected to MongoDB");
        const sourceArg = process.argv[2] || process.env.SCHEME_INGEST_SOURCE || "pipeline/fixtures/sample-schemes.json";
        const resolvedPath = path.isAbsolute(sourceArg) ? sourceArg : path.resolve(process.cwd(), sourceArg);
        try {
            const result = await runRefreshCycle(resolvedPath, {
                triggerType: "manual_admin",
                forceReindex: process.argv.includes("--force"),
                dryRun: process.argv.includes("--dry-run")
            });
            console.log(JSON.stringify(result.stats, null, 2));
        } catch (err) {
            console.error("[RefreshWorker] Fatal:", err.message);
            process.exit(1);
        } finally {
            await mongoose.disconnect();
            console.log("[RefreshWorker] Disconnected from MongoDB");
        }
    })();
}

