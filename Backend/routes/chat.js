import express from 'express';
import { Thread, User } from '../models/Thread.js';
import getOpenAPIResponse from '../utils/openai.js';
import { searchSchemeChunks } from '../utils/vectorSearch.js';
import { buildRagMessages, isSchemeOrCivicQuery } from '../utils/ragPrompt.js';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import 'dotenv/config';
import { aiLimiter } from "../middleware/rateLimiter.js";
import upload from "../middleware/upload.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { redactPII } from "../utils/security.js";

const router = express.Router();

// --- Sarvam AI Speech-to-Text Route ---
router.post("/transcribe", aiLimiter, authMiddleware, upload.single('audio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            error: "No audio file uploaded",
        });
    }

    try {
        const form = new FormData();
        form.append("file", fs.createReadStream(req.file.path));
        form.append("model", "saaras:v3");
        
        // Pass user's preferred language code if available, default en-IN
        const userLang = req.user?.preferredLanguage;
        const langCodeMap = {
            hi: "hi-IN",
            mr: "mr-IN",
            ta: "ta-IN",
            te: "te-IN",
            bn: "bn-IN",
            gu: "gu-IN",
            kn: "kn-IN",
            pa: "pa-IN",
            en: "en-IN"
        };
        form.append("language_code", langCodeMap[userLang] || "en-IN");

        const sarvamResponse = await axios.post(
            "https://api.sarvam.ai/speech-to-text",
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    "api-subscription-key": process.env.SARVAM_API_KEY,
                },
                timeout: 30000,
            }
        );

        // Async delete temporary audio file
        await fs.promises.unlink(req.file.path);

        return res.json({
            transcript: sarvamResponse.data.transcript,
        });

    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) {
            await fs.promises.unlink(req.file.path);
        }

        console.error("Sarvam Error:", err.response?.data || err.message);
        return res.status(500).json({
            error: "Failed to transcribe audio",
        });
    }
});

// --- Chat & Thread Management ---

// Get all threads for the user
router.get("/thread", authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const sortedThreads = (user.threads || []).sort(
            (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        );
        res.json(sortedThreads);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch threads" });
    }
});

// Get specific thread history
router.get("/thread/:threadId", authMiddleware, async (req, res) => {
    const { threadId } = req.params;

    try {
        const user = req.user;
        if (!user) return res.status(404).json({ error: "User not found" });
        const thread = user.threads?.find(t => t.threadId === threadId);

        if (!thread) return res.status(404).json({ error: "Thread not found" });
        res.json(thread.messages);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch thread" });
    }
});

// Delete a thread
router.delete("/thread/:threadId", authMiddleware, async (req, res) => {
    const { threadId } = req.params;

    try {
        const user = req.user;
        const threadIndex = user.threads?.findIndex(t => t.threadId === threadId);
        if (threadIndex === -1 || threadIndex === undefined) {
            return res.status(404).json({ error: "Thread not found" });
        }

        user.threads.splice(threadIndex, 1);
        user.markModified('threads');
        await user.save();

        res.status(200).json({ success: "Thread deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete thread" });
    }
});

// JanSahayak RAG Chat Interaction
router.post("/chat", aiLimiter, authMiddleware, async (req, res) => {
    const { threadId, message, mode = "auto" } = req.body;

    if (!threadId || !message) {
        return res.status(400).json({ error: "Missing required field: threadId or message" });
    }

    try {
        const user = req.user;
        if (!user.threads) user.threads = [];

        let thread = user.threads.find(t => t.threadId === threadId);

        if (!thread) {
            const cleanTitle = message.trim().replace(/^["'\s]+|["'\s]+$/g, "");
            const newThread = {
                threadId,
                userId: user._id,
                title: cleanTitle.substring(0, 32) + (cleanTitle.length > 32 ? "..." : ""),
                mode: mode,
                messages: [{ role: "user", content: message }]
            };
            user.threads.push(newThread);
            thread = user.threads[user.threads.length - 1];
        } else {
            thread.messages.push({ role: "user", content: message });
        }

        // --- Phase 4: RAG Pipeline ---
        const preferredLanguage = req.body.language || req.body.locale || user.preferredLanguage || "en";

        // 1. Detect whether this is a government scheme / civic query
        const isSchemeQuery = isSchemeOrCivicQuery(message);

        // 2. Retrieve relevant scheme chunks (only for scheme queries)
        let retrievedChunks = [];
        if (isSchemeQuery) {
            try {
                retrievedChunks = await searchSchemeChunks(message, {
                    limit: 5,
                    minScore: 0.30
                });
            } catch (searchErr) {
                // Non-fatal: log and proceed without context
                console.warn("[RAG] Vector search failed, proceeding without context:", searchErr.message);
            }
        }

        // 3. Build augmented message array: system + context + history + query
        const conversationHistory = (thread.messages || []).slice(0, -1); // exclude the just-appended user message
        const ragMessages = buildRagMessages({
            query: message,
            retrievedChunks,
            conversationHistory,
            preferredLanguage
        });

        // 4. Call LLM with the full RAG message array
        const assistantReply = await getOpenAPIResponse(ragMessages);

        // 5. Build deduplicated citations from retrieved chunks
        const citations = [];
        const seenSchemeIds = new Set();
        for (const chunk of retrievedChunks) {
            if (!seenSchemeIds.has(chunk.schemeId)) {
                seenSchemeIds.add(chunk.schemeId);
                citations.push({
                    schemeId: chunk.schemeId,
                    schemeTitle: chunk.schemeTitle,
                    chunkType: chunk.chunkType || chunk.section,
                    sourceUrl: chunk.sourceUrl || `https://www.myscheme.gov.in/schemes/${chunk.schemeId}`,
                    stateOrMinistry: chunk.stateOrMinistry || "Government of India",
                    sourceVersion: chunk.sourceVersion,
                    relevanceScore: chunk.relevanceScore
                });
            }
        }

        const assistantMessage = {
            role: "assistant",
            content: assistantReply,
            citations,
            timestamp: new Date()
        };

        thread.messages.push(assistantMessage);
        thread.updatedAt = new Date();

        user.markModified('threads');
        await user.save();

        res.json({
            reply: assistantReply,
            citations,
            ragUsed: isSchemeQuery && retrievedChunks.length > 0
        });

    } catch (err) {
        console.error("Error in /chat:", redactPII(err.message || String(err)));
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
