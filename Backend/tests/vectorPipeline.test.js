import assert from "assert";
import mongoose from "mongoose";
import "dotenv/config";
import Scheme from "../models/Scheme.js";
import SchemeChunk from "../models/SchemeChunk.js";
import { chunkScheme } from "../pipeline/chunker.js";
import { EmbeddingService, cosineSimilarity } from "../utils/embeddings.js";
import { indexSchemes } from "../pipeline/vectorIndexer.js";
import { searchSchemeChunks } from "../utils/vectorSearch.js";
import { ingestSchemes } from "../pipeline/ingest.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(__dirname, "../pipeline/fixtures/sample-schemes.json");

async function runVectorTests() {
    console.log("\n==============================================");
    console.log("RUNNING PHASE 3 VECTOR & RAG RETRIEVAL TESTS");
    console.log("==============================================\n");

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`PASS: ${name}`);
            passed++;
        } catch (err) {
            console.error(`FAIL: ${name}`);
            console.error(err.message);
            failed++;
        }
    }

    async function asyncTest(name, fn) {
        try {
            await fn();
            console.log(`PASS: ${name}`);
            passed++;
        } catch (err) {
            console.error(`FAIL: ${name}`);
            console.error(err.message);
            failed++;
        }
    }

    // --- UNIT TESTS: Chunking & Section Breakdown ---
    console.log("--- Unit Tests: Semantic Chunking & Metadata ---");

    test("chunkScheme creates distinct granular sections", () => {
        const mockScheme = {
            schemeId: "test-scheme-pmay",
            title: "Pradhan Mantri Awas Yojana",
            version: 1,
            stateOrMinistry: "Ministry of Housing and Urban Affairs",
            level: "Central",
            tags: ["Housing", "Urban"],
            sourceUrl: "https://pmaymis.gov.in",
            contentHash: "hash123",
            description: "Pucca house for urban poor.",
            eligibility: "Families without a pucca house.",
            exclusions: "Families already owning concrete dwelling.",
            benefits: "Subsidy of ₹2.67 Lakh on home loan interest.",
            applicationProcess: "Apply online at pmaymis.gov.in.",
            documentsRequired: "Aadhaar Card, Income Certificate.",
            faqs: [{ question: "Is income limit applicable?", answer: "Yes, up to ₹6 Lakh for LIG." }]
        };

        const chunks = chunkScheme(mockScheme);

        // Verify sections
        const sections = chunks.map(c => c.section);
        assert.ok(sections.includes("overview"));
        assert.ok(sections.includes("eligibility"));
        assert.ok(sections.includes("exclusions"));
        assert.ok(sections.includes("benefits"));
        assert.ok(sections.includes("application_steps"));
        assert.ok(sections.includes("documents"));
        assert.ok(sections.includes("faq"));

        // Verify metadata on every chunk
        for (const chunk of chunks) {
            assert.strictEqual(chunk.schemeId, "test-scheme-pmay");
            assert.strictEqual(chunk.schemeVersion, 1);
            assert.ok(chunk.chunkHash.length === 64);
            assert.ok(chunk.chunkId.startsWith("test-scheme-pmay:"));
            assert.strictEqual(chunk.metadata.title, "Pradhan Mantri Awas Yojana");
            assert.strictEqual(chunk.metadata.sourceUrl, "https://pmaymis.gov.in");
            assert.strictEqual(chunk.metadata.sourceVersion, 1);
            assert.ok(chunk.metadata.section.length > 0);
        }
    });

    test("EmbeddingService provides configurable dimensions & cosine similarity", () => {
        const customService = new EmbeddingService({ dimensions: 512 });
        assert.strictEqual(customService.getDimensions(), 512);

        const v1 = [1, 0, 0];
        const v2 = [1, 0, 0];
        const v3 = [0, 1, 0];
        assert.strictEqual(Math.round(cosineSimilarity(v1, v2) * 100) / 100, 1.0);
        assert.strictEqual(Math.round(cosineSimilarity(v1, v3) * 100) / 100, 0.0);
    });

    // --- INTEGRATION TESTS: Vector Indexing & Semantic Search ---
    console.log("\n--- Integration Tests: Vector Indexing & Retrieval ---");

    if (!process.env.MONGODB_URL) {
        console.error("MONGODB_URL missing. Skipping database integration tests.");
        return;
    }

    await mongoose.connect(process.env.MONGODB_URL);
    console.log("Connected to MongoDB for vector integration tests.");

    const testSchemeIds = ["pm-kisan-samman-nidhi", "ayushman-bharat-pmjay", "sukanya-samriddhi-yojana"];

    // Freshly import test fixture so all test schemes have complete sections
    await ingestSchemes(fixturePath, { sourceName: "test-fixture" });
    await SchemeChunk.deleteMany({ schemeId: { $in: testSchemeIds } });

    await asyncTest("1. Samples of imported schemes are successfully indexed into vectors", async () => {
        const stats = await indexSchemes({
            schemeIds: testSchemeIds,
            forceReindex: true
        });

        assert.ok(stats.processedSchemes >= 3);
        assert.ok(stats.newChunks >= 10, "Should generate multiple section chunks");

        // Verify SchemeChunk documents in MongoDB
        const indexedChunks = await SchemeChunk.find({
            schemeId: "pm-kisan-samman-nidhi",
            isActive: true
        });

        assert.ok(indexedChunks.length >= 3, "PM-KISAN should have at least 3 section chunks");
        for (const c of indexedChunks) {
            assert.strictEqual(c.embedding.length, 768, "Vectors must match 768 dimensions");
            assert.strictEqual(c.dimensions, 768);
            assert.ok(c.metadata.title.includes("Kisan"));
            assert.ok(c.metadata.sourceUrl.length > 5);
        }
    });

    await asyncTest("2. Re-running indexing skips unchanged content (idempotent / zero redundant embeddings)", async () => {
        const stats = await indexSchemes({
            schemeIds: testSchemeIds,
            forceReindex: false
        });

        assert.strictEqual(stats.newChunks, 0, "No new vectors should be generated for unchanged content");
        assert.ok(stats.reusedChunks >= 10, "Existing vector embeddings should be reused");
    });

    await asyncTest("3. Natural-language query retrieves relevant scheme sections with traceable metadata", async () => {
        const results = await searchSchemeChunks("What are the eligibility criteria and exclusions for PM Kisan?", {
            limit: 3
        });

        assert.ok(results.length > 0, "Should return matching results");

        const topMatch = results[0];
        assert.ok(topMatch.schemeTitle.includes("Kisan") || topMatch.schemeId.includes("kisan"));
        assert.ok(["eligibility", "exclusions", "overview"].includes(topMatch.section));
        assert.ok(topMatch.text.length > 20);
        assert.ok(topMatch.sourceUrl.startsWith("http"));
        assert.strictEqual(typeof topMatch.sourceVersion, "number");
        assert.strictEqual(typeof topMatch.relevanceScore, "number");
        assert.ok(topMatch.relevanceScore > 0.4);
    });

    await asyncTest("4. Updating a section refreshes its vectors and cleans up old version chunks", async () => {
        // Update PM-KISAN description and bump version
        const currentKisan = await Scheme.findOne({ schemeId: "pm-kisan-samman-nidhi" });
        const newVersion = (currentKisan.version || 1) + 1;

        await Scheme.updateOne(
            { schemeId: "pm-kisan-samman-nidhi" },
            {
                version: newVersion,
                description: "Brand new updated 2026 economic overview and budget for landholding farmers."
            }
        );

        const stats = await indexSchemes({
            schemeIds: ["pm-kisan-samman-nidhi"],
            forceReindex: false
        });

        assert.ok(stats.newChunks >= 1, "Should generate vector for the modified section");
        assert.ok(stats.deactivatedOldChunks >= 1, "Should clean up old version chunks");

        // Verify only newVersion chunks remain active for PM-KISAN
        const activeChunks = await SchemeChunk.find({
            schemeId: "pm-kisan-samman-nidhi",
            isActive: true
        });

        const versions = new Set(activeChunks.map(c => c.schemeVersion));
        assert.strictEqual(versions.size, 1, "Only a single version should be active");
        assert.ok(versions.has(newVersion), `Active version must be v${newVersion}`);
    });

    await asyncTest("5. Version isolation prevents mixing vectors from different versions in search results", async () => {
        const results = await searchSchemeChunks("PM Kisan eligibility", { limit: 5 });
        const kisanResults = results.filter(r => r.schemeId === "pm-kisan-samman-nidhi");

        if (kisanResults.length > 1) {
            const versions = new Set(kisanResults.map(r => r.sourceVersion));
            assert.strictEqual(versions.size, 1, "Search result must not mix chunks from different scheme versions");
        }
    });

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");

    console.log("\n==============================================");
    console.log(`PHASE 3 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log("==============================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runVectorTests();
