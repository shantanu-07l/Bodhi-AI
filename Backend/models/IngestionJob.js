import mongoose from "mongoose";

const IngestionJobSchema = new mongoose.Schema({
    jobId: {
        type: String,
        required: true,
        unique: true
    },
    type: {
        type: String,
        enum: ["full_scrape", "incremental", "seed", "rescrape", "scrape_ingest", "test"],
        default: "seed"
    },
    status: {
        type: String,
        enum: ["pending", "running", "completed", "failed"],
        default: "pending"
    },
    source: {
        type: String,
        default: "gov-myscheme-dataset"
    },
    stats: {
        totalSchemes: { type: Number, default: 0 },
        newSchemes: { type: Number, default: 0 },
        updatedSchemes: { type: Number, default: 0 },
        unchangedSchemes: { type: Number, default: 0 },
        chunksCreated: { type: Number, default: 0 },
        embeddingsGenerated: { type: Number, default: 0 },
        errors: { type: Number, default: 0 }
    },
    errorLog: [{
        schemeId: String,
        error: String,
        timestamp: { type: Date, default: Date.now }
    }],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

const IngestionJob = mongoose.model("IngestionJob", IngestionJobSchema);
export default IngestionJob;
