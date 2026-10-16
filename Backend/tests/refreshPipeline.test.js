import assert from "assert";
import mongoose from "mongoose";
import "dotenv/config";
import Scheme from "../models/Scheme.js";
import SchemeChunk from "../models/SchemeChunk.js";
import RefreshJob from "../models/RefreshJob.js";
import SchemeChangeEvent from "../models/SchemeChangeEvent.js";
import {
    sectionHash,
    computeSectionHashes,
    detectSectionChanges,
    getSectionsToReindex,
    TRACKED_SECTIONS
} from "../pipeline/changeDetector.js";
import { runRefreshCycle } from "../pipeline/refreshWorker.js";

let passedCount = 0;
let failedCount = 0;

function runTest(testName, testFn) {
    try {
        testFn();
        console.log(`PASS: ${testName}`);
        passedCount++;
    } catch (err) {
        console.error(`FAIL: ${testName}`);
        console.error(`      Error: ${err.message}`);
        failedCount++;
    }
}

async function runAsyncTest(testName, testFn) {
    try {
        await testFn();
        console.log(`PASS: ${testName}`);
        passedCount++;
    } catch (err) {
        console.error(`FAIL: ${testName}`);
        console.error(`      Error: ${err.message}`);
        failedCount++;
    }
}

console.log("\n==============================================");
console.log("RUNNING PHASE 5 REFRESH & CHANGE TRACKING TESTS");
console.log("==============================================\n");

// -------------------------------------------------------------
// 1. UNIT TESTS: Section Hashing & Change Detection
// -------------------------------------------------------------
console.log("--- Unit Tests: Section Hashing & Change Detection ---");

runTest("1. sectionHash handles empty and populated strings reliably", () => {
    assert.strictEqual(sectionHash(""), "");
    assert.strictEqual(sectionHash("   "), "");
    assert.strictEqual(sectionHash(null), "");
    const h1 = sectionHash("Eligible: Small farmers");
    const h2 = sectionHash("Eligible: Small farmers");
    const h3 = sectionHash("Eligible: Medium farmers");
    assert.strictEqual(h1.length, 64);
    assert.strictEqual(h1, h2);
    assert.notStrictEqual(h1, h3);
});

runTest("2. computeSectionHashes produces distinct hashes for tracked sections", () => {
    const sampleScheme = {
        title: "Test Scheme",
        description: "A test scheme for agricultural development.",
        eligibility: "Farmers with less than 2 hectares land.",
        benefits: "Rs 6,000 per year in 3 installments.",
        documentsRequired: "Aadhaar Card, Land Records"
    };

    const hashes = computeSectionHashes(sampleScheme);
    assert.ok(hashes.description);
    assert.ok(hashes.eligibility);
    assert.ok(hashes.benefits);
    assert.ok(hashes.documentsRequired);
    assert.strictEqual(hashes.exclusions, "");
});

runTest("3. detectSectionChanges accurately identifies modified sections", () => {
    const existing = {
        schemeId: "pm-kisan",
        title: "PM Kisan",
        sourceUrl: "https://myscheme.gov.in/schemes/pm-kisan",
        version: 1,
        description: "Support for farmers.",
        eligibility: "Farmers with land.",
        benefits: "Rs 6,000 per year."
    };

    const incoming = {
        schemeId: "pm-kisan",
        title: "PM Kisan",
        sourceUrl: "https://myscheme.gov.in/schemes/pm-kisan",
        version: 1,
        description: "Support for farmers.",
        eligibility: "Farmers with land who have completed e-KYC.", // CHANGED!
        benefits: "Rs 6,000 per year." // UNCHANGED
    };

    const changes = detectSectionChanges(incoming, existing);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].sectionKey, "eligibility");
    assert.strictEqual(changes[0].section, "eligibility");
    assert.strictEqual(changes[0].changeType, "section_modified");
    assert.strictEqual(changes[0].verificationStatus, "unverified");
    assert.ok(changes[0].summary.includes("Eligibility Criteria"));
});

runTest("4. getSectionsToReindex extracts only affected vector chunk sections", () => {
    const mockChanges = [
        { section: "eligibility" },
        { section: "documents" }
    ];
    const sections = getSectionsToReindex(mockChanges);
    assert.strictEqual(sections.size, 2);
    assert.ok(sections.has("eligibility"));
    assert.ok(sections.has("documents"));
    assert.strictEqual(sections.has("benefits"), false);
});

// -------------------------------------------------------------
// 2. INTEGRATION TESTS: Refresh Worker Pipeline
// -------------------------------------------------------------
async function runIntegrationTests() {
    console.log("\n--- Integration Tests: Database Refresh & Idempotency ---");

    const mongoUrl = process.env.MONGODB_URL;
    if (!mongoUrl) {
        console.warn("MONGODB_URL not found in environment. Skipping database tests.");
        return;
    }

    await mongoose.connect(mongoUrl);
    console.log("Connected to MongoDB for Phase 5 tests.");

    const testPrefix = `test-p5-${Date.now()}`;
    const schemeId1 = `${testPrefix}-scheme-1`;
    const schemeId2 = `${testPrefix}-scheme-2`;

    try {
        // Clean up any test records
        await Scheme.deleteMany({ schemeId: new RegExp(`^${testPrefix}`) });
        await SchemeChunk.deleteMany({ schemeId: new RegExp(`^${testPrefix}`) });
        await RefreshJob.deleteMany({ jobId: new RegExp(`^test_`) });
        await SchemeChangeEvent.deleteMany({ schemeId: new RegExp(`^${testPrefix}`) });

        const initialDataset = [
            {
                name: "JanSahayak Farmer Support Scheme",
                slug: schemeId1,
                description: "Financial assistance program for small and marginal landholders.",
                eligibility: "Farmers holding up to 2 hectares of cultivable land.",
                benefits: "Direct bank transfer of Rs 6,000 annually in three tranches.",
                applicationProcess: "Apply online at the official state agriculture portal.",
                documents: "Aadhaar, Land Ownership Record (7/12 extract), Bank Passbook",
                url: `https://www.myscheme.gov.in/schemes/${schemeId1}`,
                ministry: "Ministry of Agriculture and Farmers Welfare",
                level: "Central",
                tags: ["Agriculture", "Direct Benefit Transfer"]
            },
            {
                name: "JanSahayak Solar Rooftop Subsidy",
                slug: schemeId2,
                description: "Subsidy for residential solar panel rooftop installation.",
                eligibility: "Residential homeowners with adequate rooftop space.",
                benefits: "Financial subsidy up to 40% on solar panels up to 3kW capacity.",
                applicationProcess: "Register on national portal for rooftop solar.",
                documents: "Electricity bill, Property ownership certificate, Aadhaar card",
                url: `https://www.myscheme.gov.in/schemes/${schemeId2}`,
                ministry: "Ministry of New and Renewable Energy",
                level: "Central",
                tags: ["Energy", "Solar", "Subsidy"]
            }
        ];

        // ---------------------------------------------------------
        // Test A: Initial Refresh Run — Adds schemes & vectors
        // ---------------------------------------------------------
        await runAsyncTest("5. Initial refresh inserts schemes, generates vectors, and logs added events", async () => {
            const result = await runRefreshCycle(initialDataset, { triggerType: "test" });
            assert.strictEqual(result.status, "completed");
            assert.strictEqual(result.stats.newSchemes, 2);
            assert.strictEqual(result.stats.updatedSchemes, 0);

            const s1 = await Scheme.findOne({ schemeId: schemeId1 });
            assert.ok(s1);
            assert.strictEqual(s1.version, 1);

            const chunks = await SchemeChunk.find({ schemeId: schemeId1 });
            assert.ok(chunks.length >= 4);

            const events = await SchemeChangeEvent.find({ schemeId: schemeId1 });
            assert.strictEqual(events.length, 1);
            assert.strictEqual(events[0].changeType, "added");
        });

        // ---------------------------------------------------------
        // Test B: Idempotent Run — Zero updates, zero re-embeddings
        // ---------------------------------------------------------
        await runAsyncTest("6. Re-running refresh with identical content is idempotent", async () => {
            const result = await runRefreshCycle(initialDataset, { triggerType: "test" });
            assert.strictEqual(result.status, "completed");
            assert.strictEqual(result.stats.newSchemes, 0);
            assert.strictEqual(result.stats.updatedSchemes, 0);
            assert.strictEqual(result.stats.unchangedSchemes, 2);
            assert.strictEqual(result.stats.sectionsReindexed, 0);
        });

        // ---------------------------------------------------------
        // Test C: Concurrency Lock — Active job prevents duplicate run
        // ---------------------------------------------------------
        await runAsyncTest("7. Concurrency lock prevents parallel/duplicate refresh jobs", async () => {
            // Create a fake active running job
            const activeJob = new RefreshJob({
                jobId: "test_running_job_123",
                triggerType: "test",
                status: "running",
                lockedBy: "test-host:1234",
                startedAt: new Date()
            });
            await activeJob.save();

            let caughtError = null;
            try {
                await runRefreshCycle(initialDataset, { triggerType: "test" });
            } catch (err) {
                caughtError = err;
            }

            // Cleanup the lock
            await RefreshJob.deleteOne({ jobId: "test_running_job_123" });

            assert.ok(caughtError !== null, "Should have thrown concurrency conflict error");
            assert.ok(caughtError.message.includes("Concurrency conflict"));
        });

        // ---------------------------------------------------------
        // Test D: Section-Level Modification & Selective Re-indexing
        // ---------------------------------------------------------
        await runAsyncTest("8. Section modification increments version and records section_modified event", async () => {
            const modifiedDataset = JSON.parse(JSON.stringify(initialDataset));
            // Modify ONLY eligibility for Scheme 1
            modifiedDataset[0].eligibility = "Farmers with less than 2 hectares who have completed mandatory biometric e-KYC by March 31.";

            const result = await runRefreshCycle(modifiedDataset, { triggerType: "test" });
            assert.strictEqual(result.stats.updatedSchemes, 1);
            assert.strictEqual(result.stats.unchangedSchemes, 1);

            const updatedDoc = await Scheme.findOne({ schemeId: schemeId1 });
            assert.strictEqual(updatedDoc.version, 2);

            const sectionEvents = await SchemeChangeEvent.find({
                schemeId: schemeId1,
                changeType: "section_modified"
            });
            assert.strictEqual(sectionEvents.length, 1);
            assert.strictEqual(sectionEvents[0].section, "eligibility");
            assert.strictEqual(sectionEvents[0].currentVersion, 2);
            assert.strictEqual(sectionEvents[0].verificationStatus, "unverified");
        });

        // ---------------------------------------------------------
        // Test E: Crawl Completeness Guard (Protects Against Wipeout)
        // ---------------------------------------------------------
        await runAsyncTest("9. Incomplete crawl (<80% schemes) does NOT deactivate missing schemes", async () => {
            // Send only 1 out of 2 schemes (50% completeness < 80% threshold)
            const partialDataset = [initialDataset[0]];

            const result = await runRefreshCycle(partialDataset, { triggerType: "test" });
            assert.strictEqual(result.stats.removedSchemes, 0);

            // Scheme 2 must STILL be active
            const s2 = await Scheme.findOne({ schemeId: schemeId2 });
            assert.strictEqual(s2.isActive, true);
        });

    } finally {
        // Cleanup test artifacts
        await Scheme.deleteMany({ schemeId: new RegExp(`^${testPrefix}`) });
        await SchemeChunk.deleteMany({ schemeId: new RegExp(`^${testPrefix}`) });
        await RefreshJob.deleteMany({ jobId: new RegExp(`^test_`) });
        await SchemeChangeEvent.deleteMany({ schemeId: new RegExp(`^${testPrefix}`) });
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

(async () => {
    await runIntegrationTests();

    console.log("\n==============================================");
    console.log(`PHASE 5 TEST SUMMARY: ${passedCount} Passed, ${failedCount} Failed`);
    console.log("==============================================\n");

    if (failedCount > 0) {
        process.exit(1);
    }
})();
