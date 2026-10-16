import mongoose from "mongoose";
import "dotenv/config";
import Scheme from "../models/Scheme.js";
import SchemeChunk from "../models/SchemeChunk.js";
import IngestionJob from "../models/IngestionJob.js";
import { chunkScheme } from "./chunker.js";
import { defaultEmbeddingService } from "../utils/embeddings.js";

/**
 * Indexes scheme records into SchemeChunk vector documents with incremental change detection
 * and atomic blue-green version transitions.
 */
export async function indexSchemes(options = {}) {
    const {
        schemeIds = null, // Optional array of schemeIds to index (defaults to all)
        batchSize = 25,
        forceReindex = false
    } = options;

    const query = schemeIds && schemeIds.length > 0 ? { schemeId: { $in: schemeIds } } : {};
    const totalSchemes = await Scheme.countDocuments(query);

    console.log(`[VectorIndexer] Starting indexing for ${totalSchemes} schemes (forceReindex: ${forceReindex})`);

    const stats = {
        totalSchemes,
        processedSchemes: 0,
        newChunks: 0,
        reusedChunks: 0,
        deactivatedOldChunks: 0,
        failedSchemes: 0,
        errors: []
    };

    const schemesCursor = Scheme.find(query).cursor();

    for await (const scheme of schemesCursor) {
        try {
            const rawChunks = chunkScheme(scheme);
            if (rawChunks.length === 0) continue;

            const targetVersion = scheme.version || 1;
            const newChunkDocs = [];

            for (const chunk of rawChunks) {
                // Check if an identical chunk already exists for this scheme
                const existingChunk = await SchemeChunk.findOne({
                    schemeId: scheme.schemeId,
                    chunkHash: chunk.chunkHash
                });

                if (existingChunk && !forceReindex) {
                    // Reuse existing embedding vector without calling embedding service
                    newChunkDocs.push({
                        ...chunk,
                        embedding: existingChunk.embedding,
                        dimensions: existingChunk.dimensions || defaultEmbeddingService.getDimensions(),
                        isActive: true
                    });
                    stats.reusedChunks++;
                } else {
                    // Generate new embedding vector
                    const vector = await defaultEmbeddingService.embedText(chunk.text, false);
                    newChunkDocs.push({
                        ...chunk,
                        embedding: vector,
                        dimensions: defaultEmbeddingService.getDimensions(),
                        isActive: true
                    });
                    stats.newChunks++;
                }
            }

            // ATOMIC BLUE-GREEN TRANSITION:
            // 1. Insert new version chunks first (so search is never left empty)
            for (const doc of newChunkDocs) {
                await SchemeChunk.findOneAndUpdate(
                    { chunkId: doc.chunkId },
                    doc,
                    { upsert: true, returnDocument: 'after' }
                );
            }

            // 2. Remove or deactivate chunks from older versions for this scheme
            const oldChunksResult = await SchemeChunk.deleteMany({
                schemeId: scheme.schemeId,
                schemeVersion: { $lt: targetVersion }
            });
            stats.deactivatedOldChunks += oldChunksResult.deletedCount || 0;

            stats.processedSchemes++;
            if (stats.processedSchemes % 10 === 0 || stats.processedSchemes === totalSchemes) {
                console.log(`[VectorIndexer] Processed ${stats.processedSchemes}/${totalSchemes} schemes (${stats.newChunks} new chunks, ${stats.reusedChunks} reused)...`);
            }

        } catch (err) {
            stats.failedSchemes++;
            stats.errors.push({ schemeId: scheme.schemeId, error: err.message });
            console.error(`[VectorIndexer] Failed to index scheme '${scheme.schemeId}':`, err.message);
        }
    }

    console.log(`\n[VectorIndexer] Completed:`);
    console.log(`- Total Schemes Processed: ${stats.processedSchemes}`);
    console.log(`- New Vectors Generated: ${stats.newChunks}`);
    console.log(`- Reused Unchanged Chunks: ${stats.reusedChunks}`);
    console.log(`- Old Version Chunks Cleaned: ${stats.deactivatedOldChunks}`);

    return stats;
}

// CLI runner
if (process.argv[1]?.endsWith("vectorIndexer.js")) {
    (async () => {
        if (!process.env.MONGODB_URL) {
            console.error("ERROR: MONGODB_URL is required in .env");
            process.exit(1);
        }
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("Connected to MongoDB.");

        const force = process.argv.includes("--force");
        try {
            await indexSchemes({ forceReindex: force });
        } catch (err) {
            console.error("Vector indexing failed:", err);
        } finally {
            await mongoose.disconnect();
            console.log("Disconnected from MongoDB.");
        }
    })();
}
