import express from 'express';
import { Thread, User } from '../models/Thread.js';
import getOpenAPIResponse from '../utils/openai.js';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import 'dotenv/config';
import { aiLimiter } from "../middleware/rateLimiter.js";
import upload from "../middleware/upload.js";
import authMiddleware from "../middleware/authMiddleware.js";


const router = express.Router();


// --- Sarvam AI Speech-to-Text Route ---
router.post("/transcribe",aiLimiter,authMiddleware, upload.single('audio'), async (req, res) => {
    
        if (!req.file) {
            return res.status(400).json({
                error: "No audio file uploaded",
            });
        }

        try {

            const form = new FormData();

            form.append(
                "file",
                fs.createReadStream(req.file.path)
            );

            form.append("model", "saaras:v3");

            form.append("language_code", "en-IN");

            const sarvamResponse = await axios.post(

                "https://api.sarvam.ai/speech-to-text",

                form,

                {

                    headers: {
                        ...form.getHeaders(),
                        "api-subscription-key":
                            process.env.SARVAM_API_KEY,
                    },

                    timeout: 30000,

                }

            );

            // Async delete
            await fs.promises.unlink(req.file.path);

            return res.json({

                transcript:
                    sarvamResponse.data.transcript,

            });

        } catch (err) {

            if (
                req.file &&
                fs.existsSync(req.file.path)
            ) {
                await fs.promises.unlink(req.file.path);
            }

            console.error(
                "Sarvam Error:",
                err.response?.data || err.message
            );

            return res.status(500).json({

                error: "Failed to transcribe audio",

            });

        }

    }
);

// --- Chat & Thread Management ---

// Get all threads for the user
router.get("/thread", authMiddleware,async (req, res) => {

    try {
        const user = req.user;
        const sortedThreads = user.threads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        res.json(sortedThreads);
    } catch (err) {
        res.status(500).json("failed to fetch threads");
    }
});

// Get specific thread history
router.get("/thread/:threadId",authMiddleware, async (req, res) => {
    const { threadId } = req.params;
    

    try {
        const user = req.user;
        if (!user) return res.status(404).json({ error: "User not found" });
        let thread = user.threads.find(t => t.threadId === threadId);

        if (!thread) return res.status(404).json({ error: "Thread not found" });
        res.json(thread.messages);
    } catch (err) {
        res.status(500).json("failed to fetch thread");
    }
});

// Delete a thread
router.delete("/thread/:threadId",authMiddleware, async (req, res) => {
    const { threadId } = req.params;

    try {
        const user = req.user;
        const threadIndex = user.threads.findIndex(t => t.threadId === threadId);
        if (threadIndex === -1) return res.status(404).json({ error: "Thread not found" });

        user.threads.splice(threadIndex, 1);
        user.markModified('threads');
        await user.save();

        res.status(200).json({ success: "Thread deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "failed to delete thread" });
    }
});

// OpenAI Chat Interaction
router.post("/chat", aiLimiter,authMiddleware, async (req, res) => {
    const { threadId, message } = req.body;

    if (!threadId || !message) {
        return res.status(400).json({ error: "missing required field" });
    }

    try {
        let user=req.user;
        if (!user.threads) user.threads = [];
        let thread = user.threads.find(t => t.threadId === threadId);

        if (!thread) {
            const newThread = {
                threadId,
                title: message.substring(0, 30) + "...", // Better title preview
                messages: [{ role: "user", content: message }]
            };
            user.threads.push(newThread);
            thread = user.threads[user.threads.length - 1];
        } else {
            thread.messages.push({ role: "user", content: message });
        }

        // Get Response from OpenAI
        const assistantReply = await getOpenAPIResponse(message);
        
        thread.messages.push({ role: "assistant", content: assistantReply });
        thread.updatedAt = new Date();

        user.markModified('threads');
        console.log(user.threads);
        await user.save();
        console.log("After save");
        
        res.json({ reply: assistantReply });

    } catch (err) {
        console.error("Error in /chat:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
