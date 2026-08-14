import mongoose from "mongoose";

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
    timestamp: {
        type: Date,
        default: Date.now
    },
});

const ThreadSchema = new mongoose.Schema({
    threadId: {
        type: String,
        required: true,
    },
    title: {
        type: String,
        required: true,
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
    },
    password: {
        type: String,
        required: true,
    },
    refreshToken: {
        type: String,
        default: null,
    },
    threads: [ThreadSchema],
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

let Thread = mongoose.model("Thread", ThreadSchema);
let User =  mongoose.model("User", userSchema);

export {Thread, User};
