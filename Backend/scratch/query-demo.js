import "dotenv/config";
import mongoose from "mongoose";
import { searchSchemeChunks } from "../utils/vectorSearch.js";

async function runDemo() {
    await mongoose.connect(process.env.MONGODB_URL);

    const queries = [
        "What documents are needed for Pradhan Mantri Awas Yojana?",
        "Who is eligible for Ayushman Bharat 5 lakh hospital treatment?",
        "What is the minimum annual deposit in Sukanya Samriddhi Yojana?"
    ];

    for (const q of queries) {
        console.log("\n========================================");
        console.log("QUERY:", q);
        console.log("========================================");
        const res = await searchSchemeChunks(q, { limit: 2 });
        res.forEach((r, idx) => {
            console.log(`  Match #${idx + 1}:`);
            console.log(`    Title: ${r.schemeTitle} (v${r.sourceVersion})`);
            console.log(`    Section: ${r.section}`);
            console.log(`    Score: ${r.relevanceScore}`);
            console.log(`    URL: ${r.sourceUrl}`);
            console.log(`    Snippet: ${r.text.replace(/\n/g, ' ').slice(0, 160)}...`);
        });
    }

    await mongoose.disconnect();
}

runDemo();
