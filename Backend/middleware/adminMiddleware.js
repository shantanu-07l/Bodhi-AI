import jwt from "jsonwebtoken";
import { User } from "../models/Thread.js";
import "dotenv/config";

/**
 * Server-side Authorization Middleware
 *
 * Enforces strict administrative privileges:
 * 1. Bearer JWT whose user document has role === 'admin' OR email matching process.env.ADMIN_EMAIL
 * 2. OR valid master admin API key passed via header 'x-admin-key'
 *
 * Requests from unauthenticated or regular users are strictly rejected with 401 or 403.
 */
export async function adminMiddleware(req, res, next) {
    try {
        // Method 1: Master Admin Key header (for server-to-server / automated triggers)
        const adminKey = req.headers["x-admin-key"];
        if (adminKey && process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY) {
            req.isAdmin = true;
            return next();
        }

        // Method 2: User JWT Token
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                error: "Unauthorized",
                message: "Authentication token required for administrative access"
            });
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            return res.status(401).json({
                error: "Unauthorized",
                message: "Bearer token missing"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password -threads");

        if (!user) {
            return res.status(401).json({
                error: "Unauthorized",
                message: "User account not found"
            });
        }

        const isEnvAdmin = process.env.ADMIN_EMAIL && user.email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();
        const hasAdminRole = user.role === "admin";

        if (!hasAdminRole && !isEnvAdmin) {
            return res.status(403).json({
                error: "Forbidden",
                message: "Access denied. Administrator privileges are required."
            });
        }

        req.user = user;
        req.isAdmin = true;
        next();
    } catch (err) {
        return res.status(401).json({
            error: "Unauthorized",
            message: "Invalid or expired authentication token"
        });
    }
}

export default adminMiddleware;
