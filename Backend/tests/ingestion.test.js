import assert from "assert";
import mongoose from "mongoose";
import "dotenv/config";
import Scheme from "../models/Scheme.js";
import IngestionJob from "../models/IngestionJob.js";
import { normalizeScheme, generateSlug } from "../pipeline/normalizer.js";
import { ingestSchemes } from "../pipeline/ingest.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(__dirname, "../pipeline/fixtures/sample-schemes.json");

async function runTests() {
    console.log("\n==============================================");
    console.log("RUNNING PHASE 2 INGESTION TEST SUITE");
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

    // --- UNIT TESTS: Normalizer ---
    console.log("--- Unit Tests: Normalizer & Validation ---");

    test("generateSlug produces clean stable slugs", () => {
        assert.strictEqual(generateSlug("PM-KISAN", "PM Kisan"), "pm-kisan");
        assert.strictEqual(generateSlug("", "Pradhan Mantri Awas Yojana"), "pradhan-mantri-awas-yojana");
        assert.strictEqual(generateSlug("ayushman_bharat_pmjay", ""), "ayushman-bharat-pmjay");
    });

    test("normalizeScheme standardizes myscheme-scraper record with bullet points & steps", () => {
        const raw = {
            id: "test-scheme-1",
            title: "Test Scheme One",
            ministry: "Ministry of Rural Development",
            description: "Test description",
            benefits: ["Benefit line 1", "Benefit line 2"],
            applicationProcess: {
                mode: "Online",
                steps: ["Go to site", "Submit form"]
            },
            faqs: [{ question: "Is this test?", answer: "Yes." }]
        };

        const result = normalizeScheme(raw);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.scheme.schemeId, "test-scheme-1");
        assert.ok(result.scheme.benefits.includes("• Benefit line 1"));
        assert.ok(result.scheme.applicationProcess.includes("1. Go to site"));
        assert.strictEqual(result.scheme.faqs.length, 1);
        assert.ok(result.scheme.contentHash.length === 64);
    });

    test("normalizeScheme rejects records missing title", () => {
        const raw = {
            id: "no-title-id",
            description: "Some description"
        };
        const result = normalizeScheme(raw);
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes("title"));
    });

    test("normalizeScheme rejects records with zero informational content", () => {
        const raw = {
            title: "Empty Scheme Title",
            ministry: "Some Ministry"
        };
        const result = normalizeScheme(raw);
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes("no description"));
    });

    // --- INTEGRATION TESTS: MongoDB Ingestion ---
    console.log("\n--- Integration Tests: Database Ingestion & Idempotency ---");

    if (!process.env.MONGODB_URL) {
        console.error("MONGODB_URL missing. Skipping database integration tests.");
        return;
    }

    await mongoose.connect(process.env.MONGODB_URL);
    console.log("Connected to MongoDB for integration tests.");

    // Clean up test schemes if already present from previous test runs
    const testIds = ["pm-kisan-samman-nidhi", "ayushman-bharat-pmjay", "sukanya-samriddhi-yojana"];
    await Scheme.deleteMany({ schemeId: { $in: testIds } });

    await asyncTest("First import successfully inserts valid schemes and skips invalid", async () => {
        const stats = await ingestSchemes(fixturePath, {
            sourceName: "test-fixture",
            jobType: "test"
        });

        assert.strictEqual(stats.totalRecords, 5);
        assert.strictEqual(stats.newCount, 3); // 3 valid schemes
        assert.strictEqual(stats.skippedCount, 2); // 2 invalid test cases
        assert.strictEqual(stats.errorCount, 0);

        // Verify documents exist in MongoDB
        const count = await Scheme.countDocuments({ schemeId: { $in: testIds } });
        assert.strictEqual(count, 3);

        const pmKisan = await Scheme.findOne({ schemeId: "pm-kisan-samman-nidhi" });
        assert.strictEqual(pmKisan.version, 1);
        assert.ok(pmKisan.provenance.sourceName === "test-fixture");
    });

    await asyncTest("Second import is completely idempotent (no duplicates, 0 new, 3 unchanged)", async () => {
        const stats = await ingestSchemes(fixturePath, {
            sourceName: "test-fixture",
            jobType: "test"
        });

        assert.strictEqual(stats.totalRecords, 5);
        assert.strictEqual(stats.newCount, 0, "Should not insert new schemes on second run");
        assert.strictEqual(stats.unchangedCount, 3, "All 3 existing schemes should be unchanged");
        assert.strictEqual(stats.skippedCount, 2, "Invalid records still skipped");

        const count = await Scheme.countDocuments({ schemeId: { $in: testIds } });
        assert.strictEqual(count, 3, "Document count in DB must remain 3");
    });

    await asyncTest("Detects modified record, updates content, and increments version to 2", async () => {
        // Create a single modified record
        const modifiedRecord = [{
            id: "pm-kisan-samman-nidhi",
            title: "Pradhan Mantri Kisan Samman Nidhi",
            ministry: "Ministry of Agriculture and Farmers Welfare",
            description: "Updated description with new budget allocation 2026.",
            benefits: ["Enhanced benefit of ₹8,000 per annum."]
        }];

        const stats = await ingestSchemes(modifiedRecord, {
            sourceName: "test-update",
            jobType: "test"
        });

        assert.strictEqual(stats.updatedCount, 1, "Should detect 1 updated scheme");
        assert.strictEqual(stats.newCount, 0);

        const updated = await Scheme.findOne({ schemeId: "pm-kisan-samman-nidhi" });
        assert.strictEqual(updated.version, 2, "Version must be incremented to 2");
        assert.ok(updated.description.includes("2026"));
    });

    await asyncTest("Safety check prevents overwriting existing record with corrupt/empty content", async () => {
        const corruptRecord = [{
            id: "pm-kisan-samman-nidhi",
            title: "Pradhan Mantri Kisan Samman Nidhi"
            // completely missing description, benefits, eligibility
        }];

        const stats = await ingestSchemes(corruptRecord, {
            sourceName: "test-corrupt",
            jobType: "test"
        });

        assert.strictEqual(stats.skippedCount, 1, "Should reject empty update");
        assert.strictEqual(stats.updatedCount, 0);

        // Verify existing record was NOT corrupted
        const intact = await Scheme.findOne({ schemeId: "pm-kisan-samman-nidhi" });
        assert.ok(intact.description.length > 5, "Existing description preserved intact");
    });

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");

    console.log("\n==============================================");
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log("==============================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
