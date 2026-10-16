import express from 'express';
import Scheme from '../models/Scheme.js';
import SchemeChunk from '../models/SchemeChunk.js';
import RefreshJob from '../models/RefreshJob.js';
import SchemeChangeEvent from '../models/SchemeChangeEvent.js';
import { getSchedulerStatus, executeRefresh } from '../pipeline/scheduler.js';
import { schemeLimiter } from '../middleware/rateLimiter.js';
import { searchSchemeChunks } from '../utils/vectorSearch.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import { isSafeGovernmentUrl } from '../utils/security.js';

const router = express.Router();

// Search schemes (Full text + Vector)
router.get("/search", schemeLimiter, async (req, res) => {
    try {
        const { q, level, state, page = 1, limit = 10 } = req.query;
        if (!q || !q.trim()) {
            return res.status(400).json({ error: "Search query 'q' parameter is required" });
        }

        const topChunks = await searchSchemeChunks(q, {
            limit: parseInt(limit, 10) || 10,
            stateFilter: state || null,
            levelFilter: level || null
        });

        // Collect distinct scheme IDs
        const schemeIds = [...new Set(topChunks.map(c => c.schemeId))];

        const fullSchemes = await Scheme.find({ schemeId: { $in: schemeIds } })
            .select("schemeId title level stateOrMinistry tags description benefits sourceUrl")
            .lean();

        const schemeMap = new Map(fullSchemes.map(s => [s.schemeId, s]));

        const results = topChunks.map(chunk => ({
            ...chunk,
            scheme: schemeMap.get(chunk.schemeId) || null
        }));

        res.json({
            query: q,
            count: results.length,
            results: results
        });
    } catch (err) {
        console.error("Error in /schemes/search:", err);
        res.status(500).json({ error: "Failed to search schemes" });
    }
});

// List schemes with pagination and filters
router.get("/", schemeLimiter, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.level) filter.level = req.query.level;
        if (req.query.state) filter.stateOrMinistry = new RegExp(req.query.state, "i");
        if (req.query.tag) filter.tags = req.query.tag;

        const total = await Scheme.countDocuments(filter);
        const schemes = await Scheme.find(filter)
            .select("schemeId title level stateOrMinistry applicationMode tags description benefits sourceUrl")
            .sort({ title: 1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.json({
            schemes,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error("Error fetching schemes:", err);
        res.status(500).json({ error: "Failed to fetch schemes" });
    }
});

// Get scheme stats (counts, ministries, tags)
router.get("/stats", schemeLimiter, async (req, res) => {
    try {
        const totalSchemes = await Scheme.countDocuments();
        const totalChunks = await SchemeChunk.countDocuments();
        const centralCount = await Scheme.countDocuments({ level: "Central" });
        const stateCount = await Scheme.countDocuments({ level: "State/UT" });

        const popularTags = await Scheme.aggregate([
            { $unwind: "$tags" },
            { $group: { _id: "$tags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 15 }
        ]);

        res.json({
            totalSchemes,
            totalChunks,
            centralCount,
            stateCount,
            popularTags: popularTags.map(t => ({ tag: t._id, count: t.count }))
        });
    } catch (err) {
        console.error("Error fetching stats:", err);
        res.status(500).json({ error: "Failed to fetch statistics" });
    }
});

// --- Refresh & Change Tracking (Admin endpoints with Server-side Authorization) ---

// Get Refresh Status & Scheduler details (Admin Only)
router.get("/refresh/status", schemeLimiter, adminMiddleware, async (req, res) => {
    try {
        const status = await getSchedulerStatus();
        res.json(status);
    } catch (err) {
        console.error("Error fetching refresh status:", err);
        res.status(500).json({ error: "Failed to fetch refresh status" });
    }
});

// List Refresh Jobs History (Admin Only)
router.get("/refresh/jobs", schemeLimiter, adminMiddleware, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.status) filter.status = req.query.status;

        const total = await RefreshJob.countDocuments(filter);
        const jobs = await RefreshJob.find(filter)
            .sort({ startedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.json({
            jobs,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error("Error fetching refresh jobs:", err);
        res.status(500).json({ error: "Failed to fetch refresh jobs" });
    }
});

// Trigger Refresh Cycle (Manual Admin Trigger - Admin Only)
router.post("/refresh", schemeLimiter, adminMiddleware, async (req, res) => {
    try {
        const { dryRun = false, forceReindex = false, sourceFile, asyncRun = false } = req.body || {};

        // Security: SSRF Prevention on remote source URLs
        if (sourceFile && typeof sourceFile === "string" && (sourceFile.startsWith("http://") || sourceFile.startsWith("https://"))) {
            if (!isSafeGovernmentUrl(sourceFile)) {
                return res.status(400).json({
                    error: "Untrusted or unsafe source URL",
                    message: "Only verified official government domains (*.gov.in, *.nic.in, myscheme.gov.in) are permitted to prevent SSRF vulnerabilities."
                });
            }
        }

        if (asyncRun) {
            executeRefresh("manual_admin", { dryRun, forceReindex, sourceFile })
                .catch(err => console.error("[RefreshRoute] Background refresh failed:", err.message));
            return res.status(202).json({
                message: "Refresh cycle started in background",
                triggerType: "manual_admin",
                dryRun,
                forceReindex
            });
        }

        const result = await executeRefresh("manual_admin", { dryRun, forceReindex, sourceFile });
        res.json({
            message: "Refresh cycle completed",
            jobId: result.jobId,
            status: result.status,
            stats: result.stats,
            errorCount: result.errorLog?.length || 0
        });
    } catch (err) {
        if (err.message && err.message.includes("Concurrency conflict")) {
            return res.status(409).json({ error: err.message });
        }
        console.error("Error running refresh cycle:", err);
        res.status(500).json({ error: err.message || "Failed to execute refresh cycle" });
    }
});

// List Scheme Change Events (Granular section-level change history - Admin Only)
router.get("/refresh/changes", schemeLimiter, adminMiddleware, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.schemeId) filter.schemeId = req.query.schemeId;
        if (req.query.changeType) filter.changeType = req.query.changeType;
        if (req.query.section) filter.section = req.query.section;
        if (req.query.verificationStatus) filter.verificationStatus = req.query.verificationStatus;

        const total = await SchemeChangeEvent.countDocuments(filter);
        const changes = await SchemeChangeEvent.find(filter)
            .sort({ detectedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.json({
            changes,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error("Error fetching change events:", err);
        res.status(500).json({ error: "Failed to fetch scheme change events" });
    }
});

// Get change history for a specific scheme (Admin Only)
router.get("/refresh/changes/:schemeId", schemeLimiter, adminMiddleware, async (req, res) => {
    try {
        const { schemeId } = req.params;
        const changes = await SchemeChangeEvent.find({ schemeId })
            .sort({ detectedAt: -1 })
            .lean();
        res.json({
            schemeId,
            count: changes.length,
            changes
        });
    } catch (err) {
        console.error("Error fetching scheme changes:", err);
        res.status(500).json({ error: "Failed to fetch scheme change history" });
    }
});

// Deep Scheme & Source Inspector (Admin Only)
router.get("/inspect/:schemeId", schemeLimiter, adminMiddleware, async (req, res) => {
    try {
        const { schemeId } = req.params;
        const scheme = await Scheme.findOne({ schemeId }).lean();
        if (!scheme) {
            return res.status(404).json({ error: "Scheme not found" });
        }

        const chunks = await SchemeChunk.find({ schemeId })
            .select("chunkId section chunkIndex chunkHash tokenEstimate isActive schemeVersion")
            .sort({ chunkIndex: 1 })
            .lean();

        const changes = await SchemeChangeEvent.find({ schemeId })
            .sort({ detectedAt: -1 })
            .lean();

        res.json({
            scheme,
            chunks,
            chunkCount: chunks.length,
            changes,
            changeCount: changes.length
        });
    } catch (err) {
        console.error("Error inspecting scheme:", err);
        res.status(500).json({ error: "Failed to inspect scheme" });
    }
});

// Optional Citizen Eligibility Form & Scheme Matcher (Public)
router.post("/match", schemeLimiter, async (req, res) => {
    try {
        const { state, occupation, category, age, incomeRange } = req.body || {};

        const filter = { isActive: { $ne: false } };

        if (state && state.toLowerCase() !== "all" && state.toLowerCase() !== "any") {
            filter.$or = [
                { level: "Central" },
                { stateOrMinistry: new RegExp(state, "i") }
            ];
        }

        const queryTerms = [occupation, category].filter(Boolean).join(" ");
        let schemes = [];

        if (queryTerms.trim()) {
            schemes = await Scheme.find({
                ...filter,
                $text: { $search: queryTerms }
            })
            .select("schemeId title stateOrMinistry level tags description benefits eligibility documentsRequired applicationProcess sourceUrl")
            .limit(12)
            .lean();
        }

        if (schemes.length === 0) {
            schemes = await Scheme.find(filter)
                .select("schemeId title stateOrMinistry level tags description benefits eligibility documentsRequired applicationProcess sourceUrl")
                .limit(12)
                .lean();
        }

        res.json({
            disclaimer: "Matching results are informational guidance only. Official approval is determined exclusively by the respective government department.",
            count: schemes.length,
            schemes: schemes.map(s => ({
                ...s,
                matchReason: state && s.stateOrMinistry?.toLowerCase().includes(state.toLowerCase())
                    ? `Specific to ${state} residents`
                    : (occupation && s.tags?.some(t => t.toLowerCase().includes(occupation.toLowerCase()))
                        ? `Matches ${occupation} profile`
                        : (s.level === "Central" ? "Applicable nationwide (Central Scheme)" : "General welfare program"))
            }))
        });
    } catch (err) {
        console.error("Scheme match error:", err);
        res.status(500).json({ error: "Failed to match schemes" });
    }
});

// Get a specific scheme by ID
router.get("/:schemeId", schemeLimiter, async (req, res) => {
    try {
        const { schemeId } = req.params;
        const scheme = await Scheme.findOne({ schemeId }).lean();
        if (!scheme) {
            return res.status(404).json({ error: "Scheme not found" });
        }
        res.json(scheme);
    } catch (err) {
        console.error("Error fetching scheme details:", err);
        res.status(500).json({ error: "Failed to fetch scheme details" });
    }
});

export default router;
