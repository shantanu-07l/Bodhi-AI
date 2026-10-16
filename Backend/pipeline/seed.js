import mongoose from 'mongoose';
import 'dotenv/config';
import crypto from 'crypto';
import Scheme from '../models/Scheme.js';
import SchemeChunk from '../models/SchemeChunk.js';
import IngestionJob from '../models/IngestionJob.js';
import { chunkScheme } from './chunker.js';
import { getEmbedding } from '../utils/embeddings.js';

const DATASET_JSON_URL = "https://raw.githubusercontent.com/Aryan-Pardeshi/gov-myscheme-dataset/main/gov_myscheme_data.json";
const DATASET_CSV_URL = "https://raw.githubusercontent.com/Aryan-Pardeshi/gov-myscheme-dataset/main/gov_myscheme_data.csv";

/**
 * Normalizes a raw scheme record from the dataset to match the Scheme Mongoose model.
 */
function normalizeRecord(raw) {
    const title = raw["Scheme Name"] || raw.title || raw.name || "Untitled Scheme";
    const slug = raw["Scheme Slug"] || raw.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const levelRaw = (raw["Level"] || raw.level || "").toString().toLowerCase();
    const level = levelRaw.includes("central") ? "Central" : "State/UT";

    const tagsRaw = raw["Tags / Categories"] || raw.tags || "";
    const tags = Array.isArray(tagsRaw)
        ? tagsRaw
        : tagsRaw.split(",").map(t => t.trim()).filter(Boolean);

    const description = raw["Description"] || raw.description || "";
    const eligibility = raw["Eligibility Criteria"] || raw.eligibility || "";
    const eligibilityGeneral = raw["Eligibility (General)"] || raw.eligibilityGeneral || "";
    const exclusions = raw["Exclusions / Ineligibility"] || raw.exclusions || "";
    const benefits = raw["Benefits"] || raw.benefits || "";
    const applicationProcess = raw["Application Process"] || raw.applicationProcess || "";
    const documentsRequired = raw["Documents Required"] || raw.documentsRequired || "";
    const sourceUrl = raw["Source URL"] || raw.sourceUrl || `https://www.myscheme.gov.in/schemes/${slug}`;

    const contentHash = crypto.createHash("sha256")
        .update(`${title}|${description}|${eligibility}|${benefits}|${applicationProcess}`)
        .digest("hex");

    return {
        schemeId: slug,
        title,
        level,
        stateOrMinistry: raw["State / UT / Ministry"] || raw.stateOrMinistry || "Government of India",
        applicationMode: raw["Application Mode"] || raw.applicationMode || "Online & Offline",
        tags,
        description,
        eligibility,
        eligibilityGeneral,
        exclusions,
        benefits,
        applicationProcess,
        documentsRequired,
        sourceUrl,
        sourcePortal: "myscheme.gov.in",
        contentHash,
        version: 1,
        lastScrapedAt: new Date(),
        updatedAt: new Date()
    };
}

async function runSeed() {
    const args = process.argv.slice(2);
    const limitArgIndex = args.indexOf("--limit");
    const limit = limitArgIndex !== -1 ? parseInt(args[limitArgIndex + 1], 10) : 50; // Default seed 50 popular schemes for fast bootstrap

    console.log(`\n========================================`);
    console.log(`JanSahayak Scheme Ingestion & Seeding`);
    console.log(`========================================`);
    console.log(`Target limit: ${limit === 0 ? "ALL schemes" : limit + " schemes"}`);

    if (!process.env.MONGODB_URL) {
        console.error("ERROR: MONGODB_URL is not defined in .env");
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("Connected to MongoDB successfully.");
    } catch (dbErr) {
        console.error("MongoDB Connection Failed:", dbErr.message);
        process.exit(1);
    }

    const jobId = `seed_${Date.now()}`;
    const job = new IngestionJob({
        jobId,
        type: "seed",
        status: "running",
        source: "gov-myscheme-dataset"
    });
    await job.save();

    try {
        console.log(`Fetching dataset from: ${DATASET_JSON_URL}...`);
        const response = await fetch(DATASET_JSON_URL);

        let rawSchemes = [];
        if (response.ok) {
            const fetched = await response.json();
            // Prepend essential schemes to guarantee flagship schemes are always indexed first
            const essential = getEssentialSchemes();
            const essentialIds = new Set(essential.map(s => s["Scheme Slug"]));
            const filteredFetched = fetched.filter(f => !essentialIds.has(f["Scheme Slug"]));
            rawSchemes = [...essential, ...filteredFetched];
            console.log(`Fetched ${fetched.length} schemes from dataset (including ${essential.length} flagship schemes prioritized).`);
        } else {
            console.warn(`JSON download failed (${response.status}), attempting fallback sample schemes...`);
            rawSchemes = getEssentialSchemes();
        }

        const toProcess = limit > 0 ? rawSchemes.slice(0, limit) : rawSchemes;
        console.log(`Processing and indexing ${toProcess.length} schemes...`);

        let newCount = 0;
        let updatedCount = 0;
        let chunksCount = 0;

        for (let i = 0; i < toProcess.length; i++) {
            const raw = toProcess[i];
            const normalized = normalizeRecord(raw);

            // Upsert scheme
            const existing = await Scheme.findOne({ schemeId: normalized.schemeId });
            if (!existing) {
                await Scheme.create(normalized);
                newCount++;
            } else {
                await Scheme.updateOne({ schemeId: normalized.schemeId }, normalized);
                updatedCount++;
            }

            // Semantic chunking
            const chunks = chunkScheme(normalized);

            // Clear old chunks for this scheme to avoid duplicates
            await SchemeChunk.deleteMany({ schemeId: normalized.schemeId });

            // Generate embeddings and store chunks
            for (const chunk of chunks) {
                const vector = await getEmbedding(chunk.text, false);
                await SchemeChunk.create({
                    ...chunk,
                    embedding: vector
                });
                chunksCount++;
            }

            if ((i + 1) % 10 === 0 || i + 1 === toProcess.length) {
                console.log(`[Progress] Processed ${i + 1}/${toProcess.length} schemes (${chunksCount} chunks indexed)...`);
            }
        }

        job.status = "completed";
        job.stats = {
            totalSchemes: toProcess.length,
            newSchemes: newCount,
            updatedSchemes: updatedCount,
            chunksCreated: chunksCount,
            embeddingsGenerated: chunksCount,
            errors: 0
        };
        job.completedAt = new Date();
        await job.save();

        console.log(`\n Seeding Complete!`);
        console.log(`- New Schemes: ${newCount}`);
        console.log(`- Updated Schemes: ${updatedCount}`);
        console.log(`- Total Chunks Indexed: ${chunksCount}`);
        console.log(`========================================\n`);

    } catch (err) {
        console.error("Seeding Error:", err);
        job.status = "failed";
        job.errorLog.push({ schemeId: "all", error: err.message, timestamp: new Date() });
        job.completedAt = new Date();
        await job.save();
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

function getEssentialSchemes() {
    return [
        {
            "Scheme Name": "Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)",
            "Scheme Slug": "pm-kisan",
            "Level": "Central Government",
            "State / UT / Ministry": "Ministry of Agriculture and Farmers Welfare",
            "Application Mode": "Online & Offline",
            "Tags / Categories": "Agriculture, Farmers, Income Support, DBT",
            "Description": "Central sector scheme to supplement financial needs of all landholding farmers' families in procuring various inputs to ensure proper crop health and appropriate yields.",
            "Eligibility Criteria": "All landholding farmer families having cultivable landholding in their names are eligible. Subject to certain exclusions.",
            "Eligibility (General)": "Landholding farmers' families with valid Aadhaar and land revenue records.",
            "Exclusions / Ineligibility": "Institutional land holders, constitutional post holders, serving/retired government employees, income tax payees.",
            "Benefits": "Financial benefit of ₹6,000 per year is released in three 4-monthly installments of ₹2,000 directly into the bank accounts of beneficiaries.",
            "Application Process": "Visit pmkisan.gov.in -> Farmers Corner -> New Farmer Registration. Fill Aadhaar, mobile number, state and land details.",
            "Documents Required": "Aadhaar Card, Land ownership documents (Khatauni), Bank Account Passbook, Mobile Number.",
            "Source URL": "https://pmkisan.gov.in"
        },
        {
            "Scheme Name": "Pradhan Mantri Jan Dhan Yojana (PMJDY)",
            "Scheme Slug": "pm-jandhan",
            "Level": "Central Government",
            "State / UT / Ministry": "Ministry of Finance",
            "Application Mode": "Offline & Bank Branches",
            "Tags / Categories": "Banking, Financial Inclusion, Insurance, Pension",
            "Description": "National Mission for Financial Inclusion to ensure access to financial services including banking, savings & deposit accounts, remittance, credit, insurance, pension in an affordable manner.",
            "Eligibility Criteria": "Any Indian citizen above 10 years of age who does not have a basic savings bank account.",
            "Eligibility (General)": "Indian citizens without a bank account.",
            "Exclusions / Ineligibility": "Persons already possessing active savings bank accounts.",
            "Benefits": "Zero balance account, RuPay debit card, ₹2 Lakh accidental insurance cover, ₹10,000 overdraft facility.",
            "Application Process": "Visit any bank branch or Bank Mitra / CSP outlet. Submit account opening form with KYC documents.",
            "Documents Required": "Aadhaar card or voter ID or driving license or passport.",
            "Source URL": "https://pmjdy.gov.in"
        },
        {
            "Scheme Name": "Ayushman Bharat Pradhan Mantri Jan Arogya Yojana (AB-PMJAY)",
            "Scheme Slug": "pm-jay",
            "Level": "Central Government",
            "State / UT / Ministry": "National Health Authority",
            "Application Mode": "Online & Empanelled Hospitals",
            "Tags / Categories": "Health, Insurance, Hospitalization, Medical Care",
            "Description": "World's largest government-funded healthcare program providing cashless access to secondary and tertiary medical care.",
            "Eligibility Criteria": "Families identified on the basis of deprivation and occupational criteria as per the Socio-Economic Caste Census 2011 (SECC 2011) and all senior citizens aged 70+.",
            "Eligibility (General)": "Vulnerable families listed under SECC 2011 database and senior citizens aged 70 and above.",
            "Exclusions / Ineligibility": "Families having motorized two/three/four wheelers, mechanized farming equipment, or regular government salary.",
            "Benefits": "Health cover of ₹5 Lakh per family per year for secondary and tertiary care hospitalization across all empanelled public and private hospitals.",
            "Application Process": "Check eligibility on beneficiary.nha.gov.in or visit any Ayushman Arogya Mandir / empanelled hospital with Aadhaar and Ration Card.",
            "Documents Required": "Aadhaar Card, Ration Card / PMAM letter, Mobile number.",
            "Source URL": "https://pmjay.gov.in"
        },
        {
            "Scheme Name": "Pradhan Mantri Awas Yojana (PMAY - Urban / Gramin)",
            "Scheme Slug": "pmay",
            "Level": "Central Government",
            "State / UT / Ministry": "Ministry of Housing and Urban Affairs",
            "Application Mode": "Online & Common Service Centres",
            "Tags / Categories": "Housing, Urban, Rural, Pucca House, Subsidy",
            "Description": "Comprehensive housing mission aiming to provide pucca houses with basic amenities to all eligible urban and rural homeless or kutcha house dwellers.",
            "Eligibility Criteria": "Beneficiary family should not own a pucca house in any part of India. EWS, LIG, and MIG income category limits apply.",
            "Eligibility (General)": "Families with annual household income up to ₹3 Lakh (EWS), ₹6 Lakh (LIG), without pucca house.",
            "Exclusions / Ineligibility": "Any family that already owns a pucca house or has previously availed central assistance for housing.",
            "Benefits": "Financial assistance of ₹1.20 Lakh in plains, ₹1.30 Lakh in hilly/difficult areas, or interest subsidy up to ₹2.67 Lakh on home loans under CLSS.",
            "Application Process": "Apply online at pmaymis.gov.in or pmayg.nic.in, or visit the nearest Common Service Centre (CSC) or Gram Panchayat office.",
            "Documents Required": "Aadhaar Card, Income Certificate, Bank Details, Proof of no pucca house, Land certificate (if applicable).",
            "Source URL": "https://pmaymis.gov.in"
        },
        {
            "Scheme Name": "PM Street Vendor's AtmaNirbhar Nidhi (PM SVANidhi)",
            "Scheme Slug": "pm-svanidhi",
            "Level": "Central Government",
            "State / UT / Ministry": "Ministry of Housing and Urban Affairs",
            "Application Mode": "Online",
            "Tags / Categories": "Street Vendors, Micro-credit, Working Capital, Urban Livelihood",
            "Description": "Micro-credit scheme providing collateral-free working capital loans to urban street vendors to resume their businesses.",
            "Eligibility Criteria": "Street vendors vending in urban areas on or before March 24, 2020 with Certificate of Vending or Identity Card.",
            "Eligibility (General)": "Street vendors possessing Certificate of Vending / ID Card or Letter of Recommendation from Urban Local Body.",
            "Exclusions / Ineligibility": "Persons not engaged in street vending activities in urban areas.",
            "Benefits": "Initial working capital loan up to ₹10,000, 2nd loan up to ₹20,000, and 3rd loan up to ₹50,000. 7% interest subsidy on timely repayment and digital cashback.",
            "Application Process": "Visit pmsvanidhi.mohua.gov.in or apply via PM SVANidhi mobile app or local Municipal Corporation office.",
            "Documents Required": "Aadhaar Card, Voter ID, Certificate of Vending or Letter of Recommendation (LoR), Bank Account details.",
            "Source URL": "https://pmsvanidhi.mohua.gov.in"
        }
    ];
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith("seed.js")) {
    runSeed();
}

export { runSeed, normalizeRecord };
