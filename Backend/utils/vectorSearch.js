import SchemeChunk from "../models/SchemeChunk.js";
import { defaultEmbeddingService, cosineSimilarity } from "./embeddings.js";

/**
 * Semantic Vector Search Service.
 * Retrieves top-K scheme chunks ranked by cosine similarity and keyword relevance,
 * guaranteeing strict version isolation (no mixing of old and new scheme versions).
 */
export async function searchSchemeChunks(query, options = {}) {
    const {
        limit = 5,
        minScore = 0.12,
        stateFilter = null,
        levelFilter = null,
        sectionFilter = null
    } = options;

    if (!query || typeof query !== "string" || !query.trim()) {
        return [];
    }

    const trimmedQuery = query.trim();
    const useAtlasVector = process.env.USE_ATLAS_VECTOR_SEARCH === "true";

    // 1. Generate Query Vector using the dedicated EmbeddingService
    const queryVector = await defaultEmbeddingService.embedText(trimmedQuery, true);

    // 2. Atlas Vector Search Pipeline (if enabled in M10+ environment)
    if (useAtlasVector) {
        try {
            const indexName = process.env.ATLAS_VECTOR_INDEX_NAME || "scheme_vector_index";
            const pipeline = [
                {
                    $vectorSearch: {
                        index: indexName,
                        path: "embedding",
                        queryVector: queryVector,
                        numCandidates: limit * 15,
                        limit: limit * 2,
                        filter: { isActive: true }
                    }
                },
                {
                    $project: {
                        chunkId: 1,
                        schemeId: 1,
                        schemeVersion: 1,
                        section: 1,
                        text: 1,
                        metadata: 1,
                        score: { $meta: "vectorSearchScore" }
                    }
                }
            ];

            const atlasResults = await SchemeChunk.aggregate(pipeline);
            if (atlasResults && atlasResults.length > 0) {
                return formatAndIsolateVersions(atlasResults, limit);
            }
        } catch (atlasErr) {
            console.warn("[VectorSearch] Atlas Vector Search failed, using hybrid fallback:", atlasErr.message);
        }
    }

    // 3. Smart Hybrid Retrieval for MongoDB Atlas (M0 Free Tier)
    try {
        const STOPWORDS = new Set([
            "what", "which", "how", "for", "the", "and", "can", "get", "scheme", "schemes",
            "government", "india", "are", "is", "in", "of", "to", "a", "an", "on", "with",
            "from", "at", "by", "this", "that", "it", "as", "or", "who", "whom", "whose",
            "why", "when", "where", "tell", "me", "about", "give", "details", "info", "information",
            "please", "under", "have", "has", "had", "do", "does", "did", "any", "all", "some"
        ]);

        const rawTokens = trimmedQuery
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(w => w.length >= 2 && !STOPWORDS.has(w));

        // Detect section intent in query
        const sectionKeywords = {
            eligibility: ["eligibility", "eligible", "criteria", "qualify", "age", "income", "rules"],
            exclusions: ["exclusion", "exclusions", "ineligible", "cannot"],
            benefits: ["benefit", "benefits", "subsidy", "amount", "money", "aid", "assistance", "cash"],
            documents: ["document", "documents", "proof", "papers", "card", "aadhaar", "pan"],
            application_steps: ["apply", "application", "procedure", "process", "steps", "portal", "website", "form"],
            faq: ["faq", "question", "questions", "deposit", "rate", "interest", "limit", "period"]
        };

        let targetIntentSection = null;
        for (const [sec, terms] of Object.entries(sectionKeywords)) {
            if (terms.some(t => rawTokens.includes(t))) {
                targetIntentSection = sec;
                break;
            }
        }

        // Entity / Name tokens (excluding section keywords)
        const allSectionTerms = new Set(Object.values(sectionKeywords).flat());
        const entityTokens = rawTokens.filter(t => !allSectionTerms.has(t));
        const effectiveTokens = entityTokens.length > 0 ? entityTokens : rawTokens;

        const baseQuery = { isActive: true };
        if (stateFilter) {
            baseQuery["metadata.stateOrMinistry"] = new RegExp(stateFilter, "i");
        }
        if (levelFilter) {
            baseQuery["metadata.level"] = levelFilter;
        }
        if (sectionFilter) {
            baseQuery.section = sectionFilter;
        }

        const candidateMap = new Map();

        // Pass 1: Prioritize Title & SchemeId matches for specific named schemes
        if (effectiveTokens.length > 0) {
            const titleRegexes = effectiveTokens.map(t => (
                t.length <= 3 ? new RegExp(`\\b${t}\\b`, "i") : new RegExp(t, "i")
            ));
            const titleCandidates = await SchemeChunk.find({
                ...baseQuery,
                $or: [
                    { "metadata.title": { $in: titleRegexes } },
                    { schemeId: { $in: titleRegexes } },
                    { "metadata.tags": { $in: titleRegexes } }
                ]
            })
            .select("_id chunkId schemeId schemeVersion section text embedding metadata")
            .limit(350)
            .lean();

            for (const c of titleCandidates) {
                const key = c.chunkId || String(c._id);
                candidateMap.set(key, c);
            }
        }

        // Pass 2: Content & section matches
        if (candidateMap.size < 40 && rawTokens.length > 0) {
            const contentRegexes = rawTokens.slice(0, 3).map(t => new RegExp(t, "i"));
            const contentCandidates = await SchemeChunk.find({
                ...baseQuery,
                text: { $in: contentRegexes }
            })
            .select("_id chunkId schemeId schemeVersion section text embedding metadata")
            .limit(350)
            .lean();

            for (const c of contentCandidates) {
                const key = c.chunkId || String(c._id);
                if (!candidateMap.has(key)) {
                    candidateMap.set(key, c);
                }
            }
        }

        // Pass 3: Fallback broad sample if needed
        if (candidateMap.size < 10) {
            const broad = await SchemeChunk.find(baseQuery)
                .select("_id chunkId schemeId schemeVersion section text embedding metadata")
                .sort({ createdAt: -1 })
                .limit(350)
                .lean();

            for (const c of broad) {
                const key = c.chunkId || String(c._id);
                if (!candidateMap.has(key)) {
                    candidateMap.set(key, c);
                }
            }
        }

        const candidates = Array.from(candidateMap.values());

        const TARGET_BENEFICIARIES = [
            "farmer", "farmers", "kisan", "vendor", "vendors", "street", "student", "students",
            "youth", "women", "mother", "senior", "pension", "bpl", "housing", "pucca", "awas",
            "artisan", "vishwakarma", "loan", "subsidy", "education", "scholarship", "health", "hospital"
        ];
        const activeBeneficiaries = TARGET_BENEFICIARIES.filter(b => rawTokens.includes(b));

        // Score candidates with Cosine Similarity + Targeted Multi-factor Boosts
        const scoredCandidates = [];
        for (const chunk of candidates) {
            let simScore = 0;
            if (chunk.embedding && chunk.embedding.length > 0) {
                simScore = cosineSimilarity(queryVector, chunk.embedding);
            }

            const titleLower = (chunk.metadata?.title || "").toLowerCase();
            const textLower = (chunk.text || "").toLowerCase();
            const tagsLower = (chunk.metadata?.tags || []).map(t => String(t).toLowerCase());

            // 1. Scheme Title boost
            let titleMatchCount = 0;
            for (const tok of effectiveTokens) {
                if (titleLower.includes(tok) || chunk.schemeId.includes(tok) || tagsLower.includes(tok)) {
                    titleMatchCount++;
                }
            }
            const titleBoost = effectiveTokens.length > 0 ? (titleMatchCount / effectiveTokens.length) * 0.45 : 0;

            // 2. Section Intent match boost
            let sectionBoost = 0;
            if (targetIntentSection && chunk.section === targetIntentSection) {
                sectionBoost = 0.25;
            }

            // 3. Keyword occurrence boost in text
            let textMatchCount = 0;
            for (const tok of rawTokens) {
                if (textLower.includes(tok)) textMatchCount++;
            }
            const textBoost = rawTokens.length > 0 ? Math.min(0.2, (textMatchCount / rawTokens.length) * 0.2) : 0;

            // 4. Beneficiary alignment boost
            let beneficiaryBoost = 0;
            for (const b of activeBeneficiaries) {
                if (titleLower.includes(b) || tagsLower.some(t => t.includes(b)) || chunk.schemeId.includes(b)) {
                    beneficiaryBoost += 0.25;
                    break;
                } else if (textLower.includes(b)) {
                    beneficiaryBoost += 0.15;
                    break;
                }
            }

            const finalScore = (simScore * 0.4) + titleBoost + sectionBoost + textBoost + beneficiaryBoost;

            if (finalScore >= minScore || titleMatchCount > 0) {
                scoredCandidates.push({
                    chunkId: chunk.chunkId || String(chunk._id),
                    schemeId: chunk.schemeId,
                    schemeVersion: chunk.schemeVersion || 1,
                    section: chunk.section,
                    text: chunk.text,
                    metadata: chunk.metadata,
                    score: finalScore
                });
            }
        }

        scoredCandidates.sort((a, b) => b.score - a.score);

        return formatAndIsolateVersions(scoredCandidates, limit);

    } catch (err) {
        console.error("[VectorSearch] Error during search:", err);
        return [];
    }
}

/**
 * Enforces version isolation:
 * Guarantees that vectors from different versions of the same scheme are NEVER mixed.
 * For each scheme, only chunks matching its highest version present in the results are retained.
 */
function formatAndIsolateVersions(rawResults, limit) {
    const latestVersionByScheme = new Map();

    // Pass 1: Find the latest version for each scheme in the result set
    for (const r of rawResults) {
        const currentMax = latestVersionByScheme.get(r.schemeId) || 0;
        if (r.schemeVersion > currentMax) {
            latestVersionByScheme.set(r.schemeId, r.schemeVersion);
        }
    }

    const filtered = [];
    const schemeChunkCounts = new Map();

    // Pass 2: Filter out any chunks that don't match the latest version for that scheme
    for (const r of rawResults) {
        const maxVersion = latestVersionByScheme.get(r.schemeId);
        if (r.schemeVersion === maxVersion) {
            const count = schemeChunkCounts.get(r.schemeId) || 0;
            if (count < 2) { // Limit to 2 most relevant chunks per scheme
                schemeChunkCounts.set(r.schemeId, count + 1);
                filtered.push({
                    chunkId: r.chunkId,
                    schemeId: r.schemeId,
                    schemeTitle: r.metadata?.title || "Government Scheme",
                    section: r.section,
                    chunkType: r.section, // Backwards compatibility with frontend
                    text: r.text,
                    sourceUrl: r.metadata?.sourceUrl || `https://www.myscheme.gov.in/schemes/${r.schemeId}`,
                    sourceVersion: r.schemeVersion,
                    sourceHash: r.metadata?.sourceHash || "",
                    sourceDate: r.metadata?.sourceDate || null,
                    stateOrMinistry: r.metadata?.stateOrMinistry || "Government of India",
                    relevanceScore: Math.min(1, Math.round(r.score * 100) / 100)
                });
            }
        }
        if (filtered.length >= limit) break;
    }

    return filtered;
}
