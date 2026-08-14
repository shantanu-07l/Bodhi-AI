import rateLimit from "express-rate-limit";
// Signup Limiter
export const signupLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5,
    message: {
        message: "Too many signup attempts. Please try again after 5 minutes."
    }
});

// Login Limiter
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: {
        message: "Too many login attempts. Please try again after 15 minutes."
    }
});

// General API limiter
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: {
        error: "Too many requests. Please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// AI Routes Limiter
export const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    message: {
        error: "AI request limit exceeded. Try again in one minute."
    },
    standardHeaders: true,
    legacyHeaders: false,
});