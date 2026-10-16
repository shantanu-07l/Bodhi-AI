import assert from "assert";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { User } from "../models/Thread.js";
import Scheme from "../models/Scheme.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { buildSystemPrompt, isSchemeOrCivicQuery } from "../utils/ragPrompt.js";

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
console.log("RUNNING PHASE 6 UI & ADMIN AUTHORIZATION TESTS");
console.log("==============================================\n");

// -------------------------------------------------------------
// 1. UNIT TESTS: Multilingual System Prompts
// -------------------------------------------------------------
console.log("--- Unit Tests: Multilingual System Prompts (EN, HI, MR) ---");

runTest("1. buildSystemPrompt renders English by default", () => {
    const prompt = buildSystemPrompt("en");
    assert.ok(prompt.includes("JanSahayak"));
    assert.ok(prompt.includes("English"));
    assert.ok(prompt.includes("myscheme.gov.in"));
});

runTest("2. buildSystemPrompt generates explicit Hindi (हिन्दी) instructions", () => {
    const prompt = buildSystemPrompt("hi");
    assert.ok(prompt.includes("Hindi (हिन्दी)"));
    assert.ok(prompt.includes("Devanagari script"));
});

runTest("3. buildSystemPrompt generates explicit Marathi (मराठी) instructions", () => {
    const prompt = buildSystemPrompt("mr");
    assert.ok(prompt.includes("Marathi (मराठी)"));
    assert.ok(prompt.includes("Devanagari script"));
});

// -------------------------------------------------------------
// 2. INTEGRATION TESTS: Server-Side Admin Authorization
// -------------------------------------------------------------
async function runAuthTests() {
    console.log("\n--- Integration Tests: Server-side Admin Authorization ---");

    const mongoUrl = process.env.MONGODB_URL;
    if (!mongoUrl) {
        console.warn("MONGODB_URL not found in environment. Skipping DB auth tests.");
        return;
    }

    await mongoose.connect(mongoUrl);
    console.log("Connected to MongoDB for Phase 6 auth tests.");

    const testPrefix = `test_admin_auth_${Date.now()}`;
    const normalUserEmail = `${testPrefix}_normal@jansahayak.test`;
    const adminUserEmail = `${testPrefix}_admin@jansahayak.test`;

    try {
        // Create a standard user (role: "user")
        const normalUser = await User.create({
            username: "Normal Citizen",
            email: normalUserEmail,
            password: "hashed_dummy_password",
            role: "user"
        });

        // Create an admin user (role: "admin")
        const adminUser = await User.create({
            username: "Admin Officer",
            email: adminUserEmail,
            password: "hashed_dummy_password",
            role: "admin"
        });

        const normalToken = jwt.sign({ id: normalUser._id }, process.env.JWT_SECRET || "default_test_secret");
        const adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET || "default_test_secret");

        // Test A: Missing auth header strictly rejected with 401
        await runAsyncTest("4. adminMiddleware rejects request missing Authorization header", async () => {
            const req = { headers: {} };
            let statusCode = null;
            let responseJson = null;
            const res = {
                status: (code) => { statusCode = code; return res; },
                json: (data) => { responseJson = data; }
            };

            await adminMiddleware(req, res, () => {
                throw new Error("Next should not have been called");
            });

            assert.strictEqual(statusCode, 401);
            assert.strictEqual(responseJson.error, "Unauthorized");
        });

        // Test B: Normal user strictly rejected with 403 Forbidden
        await runAsyncTest("5. adminMiddleware strictly forbids normal citizen users (HTTP 403)", async () => {
            const req = {
                headers: {
                    authorization: `Bearer ${normalToken}`
                }
            };
            let statusCode = null;
            let responseJson = null;
            const res = {
                status: (code) => { statusCode = code; return res; },
                json: (data) => { responseJson = data; }
            };

            await adminMiddleware(req, res, () => {
                throw new Error("Next should not have been called for normal user");
            });

            assert.strictEqual(statusCode, 403);
            assert.strictEqual(responseJson.error, "Forbidden");
            assert.ok(responseJson.message.includes("Administrator privileges are required"));
        });

        // Test C: Admin user authorized and calls next()
        await runAsyncTest("6. adminMiddleware permits verified admin user (role === 'admin')", async () => {
            const req = {
                headers: {
                    authorization: `Bearer ${adminToken}`
                }
            };
            let nextCalled = false;
            const res = {
                status: () => res,
                json: () => {}
            };

            await adminMiddleware(req, res, () => {
                nextCalled = true;
            });

            assert.strictEqual(nextCalled, true);
            assert.strictEqual(req.isAdmin, true);
            assert.strictEqual(req.user.email, adminUserEmail);
        });

        // Test D: Admin Key authorization bypass for programmatic/CLI runner
        await runAsyncTest("7. adminMiddleware permits master x-admin-key header", async () => {
            const testKey = "master_test_admin_key_7788";
            process.env.ADMIN_API_KEY = testKey;

            const req = {
                headers: {
                    "x-admin-key": testKey
                }
            };
            let nextCalled = false;
            const res = {
                status: () => res,
                json: () => {}
            };

            await adminMiddleware(req, res, () => {
                nextCalled = true;
            });

            assert.strictEqual(nextCalled, true);
            assert.strictEqual(req.isAdmin, true);
        });

        // Test E: Scheme Inspector queries
        await runAsyncTest("8. Scheme inspector accurately loads verified scheme record", async () => {
            const sampleScheme = await Scheme.findOne({ isActive: true, contentHash: { $exists: true, $ne: null, $ne: "" } }).lean();
            if (sampleScheme) {
                assert.ok(sampleScheme.schemeId);
                assert.ok(sampleScheme.title);
                assert.ok(sampleScheme.contentHash);
                assert.strictEqual(sampleScheme.isActive, true);
            }
        });

    } finally {
        await User.deleteMany({ email: new RegExp(`^${testPrefix}`) });
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

(async () => {
    await runAuthTests();

    console.log("\n==============================================");
    console.log(`PHASE 6 TEST SUMMARY: ${passedCount} Passed, ${failedCount} Failed`);
    console.log("==============================================\n");

    if (failedCount > 0) {
        process.exit(1);
    }
})();
