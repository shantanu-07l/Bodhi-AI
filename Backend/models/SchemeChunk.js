import mongoose from "mongoose";

const SchemeChunkSchema = new mongoose.Schema({
    // Stable chunk identifier: e.g. "pm-kisan-samman-nidhi:eligibility:0:v2"
    chunkId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    schemeId: {
        type: String,
        required: true,
        index: true
    },
    schemeVersion: {
        type: Number,
        required: true,
        default: 1,
        index: true
    },
    chunkIndex: {
        type: Number,
        required: true
    },
    // Distinct section classifications
    section: {
        type: String,
        enum: [
            "description",
            "eligibility",
            "benefits",
            "exclusions",
            "documents",
            "application_steps",
            "faq",
            "overview"
        ],
        required: true,
        index: true
    },
    // Normalized text with context header
    text: {
        type: String,
        required: true
    },
    // Deterministic hash of the chunk's text for incremental indexing
    chunkHash: {
        type: String,
        required: true,
        index: true
    },
    // Dense vector embedding (768 dimensions for nomic-embed-text-v1.5)
    embedding: {
        type: [Number],
        required: true
    },
    dimensions: {
        type: Number,
        default: 768
    },
    // Active flag for atomic blue-green version transitions
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    // Comprehensive traceable metadata attached to each vector
    metadata: {
        title: { type: String, required: true },
        section: { type: String, required: true },
        stateOrMinistry: { type: String, default: "Government of India" },
        level: { type: String, default: "Central" },
        tags: [{ type: String }],
        sourceUrl: { type: String, required: true },
        sourceVersion: { type: Number, default: 1 },
        sourceHash: { type: String },
        sourceDate: { type: Date, default: null },
        scrapedAt: { type: Date, default: Date.now }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Composite indexes for fast multi-attribute filtering & version reconciliation
SchemeChunkSchema.index({ schemeId: 1, schemeVersion: 1, isActive: 1 });
SchemeChunkSchema.index({ schemeId: 1, section: 1 });
SchemeChunkSchema.index({ "metadata.tags": 1 });
SchemeChunkSchema.index({ "metadata.stateOrMinistry": 1 });

const SchemeChunk = mongoose.model("SchemeChunk", SchemeChunkSchema);
export default SchemeChunk;
