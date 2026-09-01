import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import cookieParser from "cookie-parser";
import mongoose, { connect } from 'mongoose';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import chatRoutes from "./routes/chat.js";
import userRoutes from "./routes/user.js";

const app = express();
const PORT = process.env.PORT || 5000 ;
const allowedOrigins = [
    "http://localhost:5173",
    ...(process.env.CLIENT_URL?.split(",") || [])
];

// Security headers middleware
app.use(helmet());

app.use(express.json());
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

// Global Error Handler to avoid leaking absolute file paths or stack traces to clients
app.use((err, req, res, next) => {
    console.error("Internal Server Error:", err.stack || err);
    res.status(500).json({ error: "Internal Server Error" });
});


const connectDB = async() => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("Connected with database");
    } catch(err) {
        console.log(err);
        console.log("Failed to connect with database", err);
    }
}

app.listen(PORT, () => {
    console.log(`server is listening on port ${PORT}`);
    connectDB();
});
