import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import cookieParser from "cookie-parser";
import mongoose, { connect } from 'mongoose';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import chatRoutes from "./routes/chat.js";
import userRoutes from "./routes/user.js";
import schemesRoutes from "./routes/schemes.js";
import { initScheduler, stopScheduler, getSchedulerStatus } from "./pipeline/scheduler.js";
import Scheme from "./models/Scheme.js";
import SchemeChunk from "./models/SchemeChunk.js";
import { sanitizeErrorMessage } from './utils/security.js';
import { defaultEmbeddingService } from './utils/embeddings.js';

const app = express();
const PORT = process.env.PORT || 5000 ;
const allowedOrigins = [
    "http://localhost:5173",
    ...(process.env.CLIENT_URL?.split(",") || [])
];

// Security headers middleware
app.use(helmet());

// Enforce strict request body size limit to prevent Denial-of-Service
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// NoSQL Injection sanitizer (Express 5 compatible)
app.use((req, res, next) => {
    if (req.body) mongoSanitize.sanitize(req.body);
    if (req.params) mongoSanitize.sanitize(req.params);
    next();
});

app.use(cors({
  origin: function (origin, callback) {

    if (!origin)
        return callback(null, true);

    if (allowedOrigins.includes(origin))
        return callback(null, true);

    // Limit Vercel previews to this project's unique identifier to avoid wildcard exploits
    if (origin.includes("bodhi-ai-eight") && origin.endsWith(".vercel.app"))
        return callback(null, true);

    return callback(new Error("Not allowed by CORS"));
    },   
  methods: ["GET", "POST", "DELETE"],
  credentials: true
}));

app.use("/", userRoutes);
app.use("/api", chatRoutes);
app.use("/api/schemes", schemesRoutes);

// Comprehensive Health check endpoint for container orchestrators and monitoring
app.get("/api/health", async (req, res) => {
    const isDbConnected = mongoose.connection.readyState === 1;
    let schemesCount = 0;
    let chunksCount = 0;

    if (isDbConnected) {
        try {
            schemesCount = await Scheme.countDocuments({ isActive: true });
            chunksCount = await SchemeChunk.countDocuments({ isActive: true });
        } catch {
            // Non-fatal if counts cannot be read
        }
    }

    let schedulerInfo = { enabled: false, isCronActive: false };
    try {
        const sched = await getSchedulerStatus();
        schedulerInfo = {
            enabled: sched.scheduler?.enabled || false,
            isCronActive: sched.scheduler?.isCronActive || false,
            lastTriggerTime: sched.scheduler?.lastTriggerTime || null
        };
    } catch {
        // Non-fatal
    }

    let embeddingInfo = { provider: "unknown", model: "unknown", healthy: false };
    try {
        embeddingInfo = await defaultEmbeddingService.healthCheck();
    } catch {
        // Non-fatal — embedding health check failure shouldn't crash the health endpoint
    }

    const statusCode = isDbConnected ? 200 : 503;
    res.status(statusCode).json({
        status: isDbConnected ? "ok" : "degraded",
        app: "Bodhi AI — JanSahayak",
        environment: process.env.NODE_ENV || "development",
        uptimeSeconds: Math.floor(process.uptime()),
        database: {
            status: isDbConnected ? "connected" : "disconnected",
            readyState: mongoose.connection.readyState,
            schemesIndexed: schemesCount,
            vectorChunksActive: chunksCount
        },
        embedding: embeddingInfo,
        scheduler: schedulerInfo,
        timestamp: new Date()
    });
});

// Global Error Handler to avoid leaking internal file paths, credentials, or stack traces
app.use((err, req, res, next) => {
    console.error("Internal Server Error:", err.message || err);
    const safeError = sanitizeErrorMessage(err);
    res.status(err.status || 500).json({ error: safeError });
});

// Database connection & lifecycle management
const connectDB = async () => {
    try {
        mongoose.connection.on("disconnected", () => {
            console.warn("[MongoDB] Connection disconnected. Attempting auto-reconnect...");
        });
        mongoose.connection.on("reconnected", () => {
            console.log("[MongoDB] Connection re-established successfully.");
        });

        await mongoose.connect(process.env.MONGODB_URL);
        console.log("[MongoDB] Connected with database successfully.");
        initScheduler();
    } catch (err) {
        console.error("[MongoDB] Failed to connect with database:", err.message);
    }
};

const server = app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT} (NODE_ENV: ${process.env.NODE_ENV || "development"})`);
    connectDB();
});

// Graceful Shutdown for Docker, Kubernetes, and Cloud Platforms (SIGINT / SIGTERM)
async function gracefulShutdown(signal) {
    console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

    // 1. Stop background scheduled tasks
    try {
        stopScheduler();
    } catch (e) {
        console.warn("[Server] Error stopping scheduler:", e.message);
    }

    // 2. Stop accepting new HTTP connections
    server.close(async () => {
        console.log("[Server] HTTP server closed.");

        // 3. Close database connections cleanly
        try {
            await mongoose.connection.close(false);
            console.log("[Server] MongoDB connection closed cleanly.");
            process.exit(0);
        } catch (err) {
            console.error("[Server] Error closing database connection:", err.message);
            process.exit(1);
        }
    });

    // Safety timeout: force exit if graceful shutdown takes longer than 10 seconds
    setTimeout(() => {
        console.error("[Server] Graceful shutdown timeout (10s) exceeded. Forcing exit.");
        process.exit(1);
    }, 10000).unref();
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
