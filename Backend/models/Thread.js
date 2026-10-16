import mongoose from "mongoose";

const CitationSchema = new mongoose.Schema({
    schemeId: { type: String },
    schemeTitle: { type: String },
    chunkType: { type: String },
    sourceUrl: { type: String },
    relevanceScore: { type: Number }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ["user", "assistant"],
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    citations: [CitationSchema],
    timestamp: {
        type: Date,
        default: Date.now
    },
});

const ThreadSchema = new mongoose.Schema({
    threadId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true
    },
    title: {
        type: String,
        required: true,
    },
    mode: {
        type: String,
        enum: ["auto", "schemes", "general"],
        default: "auto"
    },
    messages: [MessageSchema],
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    }
});

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
    },
    preferredLanguage: {
        type: String,
        enum: ["en", "hi", "mr", "ta", "te", "bn", "gu", "kn", "pa"],
        default: "en"
    },
    refreshToken: {
        type: String,
        default: null,
    },
    plan: {
        type: String,
        enum: ["free", "pro", "ultra"],
        default: "free",
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user",
        index: true
    },
    threads: [ThreadSchema],
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

let Thread = mongoose.model("Thread", ThreadSchema);
let User = mongoose.model("User", userSchema);

export { Thread, User };
