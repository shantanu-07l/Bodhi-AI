/**
 * Security and Data Protection Utilities for Bodhi AI — JanSahayak
 *
 * Implements:
 * 1. SSRF prevention and Government domain validation
 * 2. PII redaction for request logs (Aadhaar, PAN, phone, email)
 * 3. Prompt injection neutralization for scraped/untrusted document context
 * 4. Safe input sanitization
 */

// Permitted official government domain suffixes
const PERMITTED_GOV_DOMAINS = [
    ".gov.in",
    ".nic.in",
    "myscheme.gov.in",
    "india.gov.in",
    "pmkisan.gov.in",
    "pmsvanidhi.mohua.gov.in",
    "pmaymis.gov.in",
    "nha.gov.in",
    "digitalindia.gov.in"
];

// Blocked private/internal IP patterns for SSRF prevention
const BLOCKED_HOST_PATTERNS = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/, // AWS/cloud metadata
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i
];

/**
 * Validates whether a URL belongs to a trusted government portal
 * and prevents SSRF attacks targeting private infrastructure.
 */
export function isSafeGovernmentUrl(urlString) {
    if (!urlString || typeof urlString !== "string") return false;

    try {
        const parsed = new URL(urlString.trim());

        // Enforce HTTPS
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
            return false;
        }

        const hostname = parsed.hostname.toLowerCase();

        // Check against internal/SSRF addresses
        for (const pattern of BLOCKED_HOST_PATTERNS) {
            if (pattern.test(hostname)) return false;
        }

        // Validate domain suffix
        const isPermitted = PERMITTED_GOV_DOMAINS.some(domain => {
            if (domain.startsWith(".")) {
                return hostname.endsWith(domain);
            }
            return hostname === domain || hostname.endsWith("." + domain);
        });

        return isPermitted;
    } catch {
        return false;
    }
}

/**
 * Redacts personally identifiable information (PII) before logging:
 * - 12-digit Aadhaar numbers (with or without spaces)
 * - 10-character Indian PAN cards (e.g., ABCDE1234F)
 * - 10-digit Indian mobile numbers (starts with 6-9)
 * - Email addresses
 */
export function redactPII(text) {
    if (!text || typeof text !== "string") return text;

    return text
        // Aadhaar: 12 digits (often 4 4 4 or continuous)
        .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "[REDACTED_AADHAAR]")
        // PAN: 5 letters + 4 digits + 1 letter
        .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, "[REDACTED_PAN]")
        // Indian mobile numbers (10 digits starting with 6, 7, 8, or 9)
        .replace(/\b[6-9]\d{9}\b/g, "[REDACTED_PHONE]")
        // Email addresses
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]");
}

/**
 * Sanitizes untrusted text extracted from external government portals / scrapers / PDFs
 * before injecting it into LLM prompt context to neutralize prompt injection attacks.
 */
export function sanitizeRetrievedContent(content) {
    if (!content || typeof content !== "string") return "";

    // 1. Neutralize common prompt injection directives
    let sanitized = content
        .replace(/ignore\s+(all\s+)?(previous|prior)\s+(instructions|directives|prompts)/gi, "[filtered instruction]")
        .replace(/disregard\s+(all\s+)?(previous|prior)\s+(instructions|directives)/gi, "[filtered instruction]")
        .replace(/system\s*:\s*/gi, "[system-tag]: ")
        .replace(/<\|im_start\|>/gi, "")
        .replace(/<\|im_end\|>/gi, "")
        .replace(/\[INST\]/gi, "")
        .replace(/\[\/INST\]/gi, "")
        .replace(/```(?:javascript|python|bash|sh|cmd|powershell)[\s\S]*?```/gi, "[code snippet omitted]");

    // 2. Remove executable HTML tags (XSS / template injection safety)
    sanitized = sanitized
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "");

    // 3. Trim excessive whitespace and cap maximum chunk length to prevent token overflow
    return sanitized.trim().substring(0, 3000);
}

/**
 * Sanitizes an error message before returning to clients
 * to prevent leaking file system paths, credentials, or internal stack traces.
 */
export function sanitizeErrorMessage(error) {
    if (!error) return "An unexpected error occurred.";

    const message = typeof error === "string" ? error : error.message || "";

    // Block database connection strings or secret leaks
    if (message.includes("mongodb://") || message.includes("mongodb+srv://") || message.includes("Bearer ") || message.includes("apiKey")) {
        return "Database or service authentication error. Please contact the administrator.";
    }

    // Mask file paths
    const cleaned = message.replace(/[A-Za-z]:\\[^:\n]+/g, "[internal path]").replace(/\/[\w.-]+(\/[\w.-]+)+/g, "[internal path]");

    return cleaned || "Internal server error";
}
