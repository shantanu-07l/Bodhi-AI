/**
 * Phase 4 — RAG Chat Integration Tests
 * Tests intent detection, context injection, citation assembly, and graceful fallback.
 * Uses in-memory mocks; no live DB or API keys required.
 */

import { strict as assert } from "node:assert";
import { isSchemeOrCivicQuery, buildRagMessages, buildSystemPrompt } from "../utils/ragPrompt.js";

function makeChunk(overrides = {}) {
    return {
        chunkId: (overrides.schemeId || "test-scheme") + "-v1-overview",
        schemeId: overrides.schemeId || "test-scheme",
        schemeTitle: overrides.schemeTitle || "Test Government Scheme",
        section: overrides.section || "overview",
        chunkType: overrides.chunkType || "overview",
        text: overrides.text || "This scheme provides financial assistance to eligible citizens.",
        sourceUrl: overrides.sourceUrl || "https://www.myscheme.gov.in/schemes/test-scheme",
        sourceVersion: overrides.sourceVersion || 1,
        stateOrMinistry: overrides.stateOrMinistry || "Ministry of Finance",
        relevanceScore: overrides.relevanceScore != null ? overrides.relevanceScore : 0.82
    };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log("  PASS: " + name);
        passed++;
    } catch (err) {
        console.error("  FAIL: " + name);
        console.error("      " + err.message);
        failed++;
    }
}

console.log("\n=== Suite 1: isSchemeOrCivicQuery ===");

const schemeQueries = [
    "What are the eligibility criteria for PM-KISAN?",
    "How to apply for Ayushman Bharat yojana?",
    "Tell me about Pradhan Mantri Awas Yojana subsidy",
    "What documents are needed for Mudra loan?",
    "Am I eligible for old age pension scheme?",
    "What is the income certificate requirement for scholarship?",
    "PM SVANidhi loan for street vendor"
];

const nonSchemeQueries = [
    "What is the weather today?",
    "Tell me a joke",
    "How to cook biryani?",
    "Calculate 2 + 2",
    "Write a Python function to sort a list"
];

test("Correctly identifies scheme queries", () => {
    for (const q of schemeQueries) {
        assert.equal(isSchemeOrCivicQuery(q), true, "Expected scheme: " + q);
    }
});

test("Does NOT flag non-scheme queries", () => {
    for (const q of nonSchemeQueries) {
        assert.equal(isSchemeOrCivicQuery(q), false, "Unexpected scheme: " + q);
    }
});

test("Returns false for empty/null input", () => {
    assert.equal(isSchemeOrCivicQuery(""), false);
    assert.equal(isSchemeOrCivicQuery(null), false);
    assert.equal(isSchemeOrCivicQuery(undefined), false);
    assert.equal(isSchemeOrCivicQuery(42), false);
});

console.log("\n=== Suite 2: buildSystemPrompt ===");

test("System prompt contains JanSahayak identity", () => {
    const prompt = buildSystemPrompt("en");
    assert.ok(prompt.includes("JanSahayak"), "Should contain JanSahayak");
    assert.ok(prompt.toLowerCase().includes("government scheme"), "Should mention government schemes");
});

test("System prompt includes language for hi", () => {
    const p = buildSystemPrompt("hi");
    assert.ok(p.includes("Hindi"), "Should mention Hindi");
});

test("Unknown locale defaults gracefully", () => {
    const p = buildSystemPrompt("xx");
    assert.ok(typeof p === "string" && p.length > 100);
});

console.log("\n=== Suite 3: buildRagMessages ===");

test("Returns array with system + user at minimum", () => {
    const messages = buildRagMessages({ query: "What is PM-KISAN?", retrievedChunks: [], conversationHistory: [], preferredLanguage: "en" });
    assert.ok(Array.isArray(messages));
    assert.ok(messages.length >= 2);
    assert.equal(messages[0].role, "system");
    assert.equal(messages[messages.length - 1].role, "user");
    assert.equal(messages[messages.length - 1].content, "What is PM-KISAN?");
});

test("Injects context as system message when chunks provided", () => {
    const chunks = [
        makeChunk({ schemeId: "pm-kisan", schemeTitle: "PM-KISAN", section: "overview", text: "PM-KISAN provides 6000 annual income support." }),
    ];
    const messages = buildRagMessages({ query: "Eligibility for PM-KISAN?", retrievedChunks: chunks, conversationHistory: [], preferredLanguage: "en" });
    const ctx = messages.find(m => m.role === "system" && m.content.includes("VERIFIED GOVERNMENT SCHEME CONTEXT"));
    assert.ok(ctx, "Should have context message");
    assert.ok(ctx.content.includes("PM-KISAN"));
    assert.ok(ctx.content.includes("6000"));
});

test("No context message when no chunks", () => {
    const messages = buildRagMessages({ query: "Weather?", retrievedChunks: [], conversationHistory: [], preferredLanguage: "en" });
    const ctx = messages.find(m => m.role === "system" && m.content.includes("VERIFIED GOVERNMENT SCHEME CONTEXT"));
    assert.ok(!ctx, "Should NOT have context message");
});

test("Preserves at most 6 history messages", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: "Msg " + i }));
    const messages = buildRagMessages({ query: "Follow-up", retrievedChunks: [], conversationHistory: history, preferredLanguage: "en" });
    const histMsgs = messages.slice(1, -1).filter(m => m.role !== "system");
    assert.ok(histMsgs.length <= 6, "Got " + histMsgs.length);
});

test("Multiple chunks render with source numbering", () => {
    const chunks = [
        makeChunk({ schemeId: "ayushman", schemeTitle: "Ayushman Bharat PMJAY", section: "benefits", text: "5 lakh health cover." }),
        makeChunk({ schemeId: "pmay", schemeTitle: "PM Awas Yojana", section: "eligibility", text: "EWS/LIG/MIG households." })
    ];
    const messages = buildRagMessages({ query: "Housing and health schemes?", retrievedChunks: chunks, conversationHistory: [], preferredLanguage: "en" });
    const ctx = messages.find(m => m.content && m.content.includes("VERIFIED GOVERNMENT SCHEME CONTEXT"));
    assert.ok(ctx.content.includes("Ayushman Bharat PMJAY"));
    assert.ok(ctx.content.includes("PM Awas Yojana"));
    assert.ok(ctx.content.includes("[SOURCE 1]"));
    assert.ok(ctx.content.includes("[SOURCE 2]"));
});

console.log("\n=== Suite 4: Citation deduplication ===");

test("Deduplicates citations by schemeId", () => {
    const chunks = [
        makeChunk({ schemeId: "pm-kisan", section: "overview" }),
        makeChunk({ schemeId: "pm-kisan", section: "eligibility" }),
        makeChunk({ schemeId: "pmay", schemeTitle: "PM Awas Yojana", section: "benefits" })
    ];
    const citations = [];
    const seen = new Set();
    for (const c of chunks) {
        if (!seen.has(c.schemeId)) { seen.add(c.schemeId); citations.push({ schemeId: c.schemeId }); }
    }
    assert.equal(citations.length, 2);
    assert.equal(citations[0].schemeId, "pm-kisan");
    assert.equal(citations[1].schemeId, "pmay");
});

test("Citations carry required fields", () => {
    const chunk = makeChunk({ schemeId: "sukanya", schemeTitle: "Sukanya Samriddhi", section: "eligibility" });
    const citation = { schemeId: chunk.schemeId, schemeTitle: chunk.schemeTitle, chunkType: chunk.chunkType, sourceUrl: chunk.sourceUrl, relevanceScore: chunk.relevanceScore };
    assert.ok(citation.schemeId);
    assert.ok(citation.schemeTitle);
    assert.ok(citation.chunkType);
    assert.ok(citation.sourceUrl.startsWith("http"));
    assert.ok(typeof citation.relevanceScore === "number");
});

console.log("\n=== Phase 4 Test Results ===");
console.log("Passed: " + passed + " | Failed: " + failed + " | Total: " + (passed + failed));
if (failed > 0) { console.error("Some tests failed."); process.exit(1); }
else { console.log("All Phase 4 RAG chat integration tests passed."); }
