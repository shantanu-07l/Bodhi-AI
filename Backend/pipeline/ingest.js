import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import "dotenv/config";
import Scheme from "../models/Scheme.js";
import IngestionJob from "../models/IngestionJob.js";
import { normalizeScheme } from "./normalizer.js";

/**
 * Core ingestion function.
 * Processes an array of raw scheme objects or reads from a JSON file.
 * Performs validation, deduplication, change detection, and idempotent MongoDB updates.
 */
export async function ingestSchemes(sourceInput, options = {}) {
    const {
        sourceName = "myscheme-scraper",
        sourcePortal = "myscheme.gov.in",
        isAuthoritative = true,
        crawlerVersion = "1.0.0",
        format = "json",
        dryRun = false,
        jobType = "scrape_ingest"
    } = options;

    let rawRecords = [];

    // 1. Resolve input: Array or File path
    if (Array.isArray(sourceInput)) {
        rawRecords = sourceInput;
    } else if (typeof sourceInput === "string") {
        if (!fs.existsSync(sourceInput)) {
            throw new Error(`Ingestion file does not exist: ${sourceInput}`);
        }
        const rawContent = fs.readFileSync(sourceInput, "utf8");
        try {
            rawRecords = JSON.parse(rawContent);
        } catch (jsonErr) {
            throw new Error(`Malformed JSON in ${sourceInput}: ${jsonErr.message}`);
        }
        if (!Array.isArray(rawRecords)) {
            // Support single record or object wrapped with a data key
            if (rawRecords && Array.isArray(rawRecords.schemes)) {
                rawRecords = rawRecords.schemes;
            } else if (rawRecords && typeof rawRecords === "object") {
                rawRecords = [rawRecords];
            } else {
                throw new Error(`Expected JSON array of schemes in ${sourceInput}`);
            }
        }
    } else {
        throw new Error("Invalid source input: Expected array of records or file path");
    }

    const stats = {
        totalRecords: rawRecords.length,
        newCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        errors: []
    };

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let jobDoc = null;

    if (!dryRun && mongoose.connection.readyState === 1) {
        jobDoc = new IngestionJob({
            jobId,
            type: jobType,
            status: "running",
            source: sourceName,
            startedAt: new Date()
        });
        await jobDoc.save();
    }

    console.log(`[Ingest] Starting ingestion: ${rawRecords.length} records (dryRun: ${dryRun})`);

    // 2. Process records sequentially to avoid race conditions
    for (let i = 0; i < rawRecords.length; i++) {
        const raw = rawRecords[i];
        const recordIndex = i + 1;

        // Validation & Normalization
        const normResult = normalizeScheme(raw, {
            sourceName,
            sourcePortal,
            isAuthoritative,
            crawlerVersion,
            format
        });

        if (!normResult.valid) {
            stats.skippedCount++;
            stats.errors.push({
                index: recordIndex,
                title: raw?.title || raw?.name || `Record #${recordIndex}`,
                reason: normResult.error
            });
            console.warn(`[Ingest][Skip #${recordIndex}] ${normResult.error}`);
            continue;
        }

        const normalized = normResult.scheme;

        if (dryRun) {
            stats.newCount++;
            continue;
        }

        try {
            // Find existing record by stable identifier
            const existing = await Scheme.findOne({ schemeId: normalized.schemeId });

            if (!existing) {
                // New record insertion
                await Scheme.create(normalized);
                stats.newCount++;
            } else {
                // Change detection using contentHash
                if (existing.contentHash === normalized.contentHash) {
                    // Content is identical - idempotent skip
                    stats.unchangedCount++;
                } else {
                    // Safety check: ensure new record has valid content before overwriting
                    if (!normalized.description && !normalized.eligibility && !normalized.benefits) {
                        stats.skippedCount++;
                        console.warn(`[Ingest][Safety] Rejecting empty update for '${normalized.schemeId}'`);
                        continue;
                    }

                    // Content has changed - update with incremented version
                    const newVersion = (existing.version || 1) + 1;
                    await Scheme.updateOne(
                        { schemeId: normalized.schemeId },
                        {
                            ...normalized,
                            version: newVersion,
                            createdAt: existing.createdAt,
                            updatedAt: new Date()
                        }
                    );
                    stats.updatedCount++;
                }
            }
        } catch (dbErr) {
            stats.errorCount++;
            stats.errors.push({
                index: recordIndex,
                schemeId: normalized.schemeId,
                reason: dbErr.message
            });
            console.error(`[Ingest][Error #${recordIndex}] DB Error for '${normalized.schemeId}':`, dbErr.message);
        }
    }

    // 3. Finalize Job tracking
    if (jobDoc) {
        jobDoc.status = stats.errorCount > 0 && stats.newCount === 0 ? "failed" : "completed";
        jobDoc.stats = {
            totalSchemes: stats.totalRecords,
            newSchemes: stats.newCount,
            updatedSchemes: stats.updatedCount,
            unchangedSchemes: stats.unchangedCount,
            errors: stats.errorCount + stats.skippedCount
        };
        jobDoc.errorLog = stats.errors.map(e => ({
            schemeId: e.schemeId || String(e.index),
            error: e.reason,
            timestamp: new Date()
        }));
        jobDoc.completedAt = new Date();
        await jobDoc.save();
    }

    console.log(`[Ingest] Finished: ${stats.newCount} new, ${stats.updatedCount} updated, ${stats.unchangedCount} unchanged, ${stats.skippedCount} skipped`);
    return stats;
}

// CLI runner
if (process.argv[1]?.endsWith("ingest.js")) {
    (async () => {
        const filePath = process.argv[2] || process.env.SCHEME_INGEST_SOURCE || "pipeline/fixtures/sample-schemes.json";
        const isDryRun = process.argv.includes("--dry-run");

        if (!process.env.MONGODB_URL && !isDryRun) {
            console.error("ERROR: MONGODB_URL is required in .env");
            process.exit(1);
        }

        if (!isDryRun) {
            await mongoose.connect(process.env.MONGODB_URL);
            console.log("Connected to MongoDB.");
        }

        try {
            const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
            const results = await ingestSchemes(resolvedPath, { dryRun: isDryRun });
            console.log("\n--- Final Ingestion Results ---");
            console.log(JSON.stringify(results, null, 2));
        } catch (err) {
            console.error("Ingestion failed:", err.message);
            process.exit(1);
        } finally {
            if (!isDryRun) {
                await mongoose.disconnect();
                console.log("Disconnected from MongoDB.");
            }
        }
    })();
}
