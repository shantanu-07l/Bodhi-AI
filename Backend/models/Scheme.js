import mongoose from "mongoose";

const FaqSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true }
}, { _id: false });

const SchemeSchema = new mongoose.Schema({
    // Stable identifier / slug
    schemeId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true
    },
    // Scheme title
    title: {
        type: String,
        required: true,
        index: true,
        trim: true
    },
    // Nodal Ministry or State Department
    stateOrMinistry: {
        type: String,
        index: true,
        trim: true,
        default: "Government of India"
    },
    // Level classification
    level: {
        type: String,
        enum: ["Central", "State/UT", "Unknown"],
        default: "Central"
    },
    applicationMode: {
        type: String,
        trim: true,
        default: "Online & Offline"
    },
    tags: [{
        type: String,
        trim: true
    }],

    // Content sections
    description: { type: String, default: "" },
    benefits: { type: String, default: "" },
    eligibility: { type: String, default: "" },
    eligibilityGeneral: { type: String, default: "" },
    exclusions: { type: String, default: "" },
    applicationProcess: { type: String, default: "" },
    documentsRequired: { type: String, default: "" },
    faqs: [FaqSchema],

    // Source provenance & timestamps
    sourceUrl: { type: String, default: "" },
    sourcePortal: { type: String, default: "myscheme.gov.in" },
    sourceDate: { type: Date, default: null }, // Publication/update date reported by official portal
    scrapedAt: { type: Date, default: Date.now }, // Timestamp when raw crawler fetched the content
    retrievalTime: { type: Date, default: Date.now }, // Timestamp when Bodhi-AI ingested this record
    isAuthoritative: { type: Boolean, default: true }, // true for verified official portal, false for seed data

    provenance: {
        sourceName: { type: String, default: "myscheme-scraper" },
        format: { type: String, default: "json" },
        ingestedAt: { type: Date, default: Date.now },
        crawlerVersion: { type: String, default: "1.0.0" }
    },

    // Idempotency & change detection
    contentHash: { type: String, required: true, index: true },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Full-text index for hybrid search and fast keyword lookup
SchemeSchema.index({
    title: "text",
    description: "text",
    eligibility: "text",
    benefits: "text",
    tags: "text",
    stateOrMinistry: "text"
}, {
    weights: {
        title: 10,
        tags: 5,
        eligibility: 4,
        benefits: 3,
        description: 2,
        stateOrMinistry: 2
    },
    name: "SchemeTextIndex"
});

const Scheme = mongoose.model("Scheme", SchemeSchema);
export default Scheme;
