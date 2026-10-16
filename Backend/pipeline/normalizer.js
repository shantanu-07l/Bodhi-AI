import crypto from "crypto";

/**
 * Formats an array or string into clean multi-line bullet points or paragraphs.
 */
function formatBulletList(input) {
    if (!input) return "";
    if (Array.isArray(input)) {
        return input
            .map(item => (typeof item === "string" ? item.trim() : JSON.stringify(item)))
            .filter(Boolean)
            .map(item => (item.startsWith("•") || item.startsWith("-") || item.startsWith("*") ? item : `• ${item}`))
            .join("\n");
    }
    return typeof input === "string" ? input.trim() : String(input);
}

/**
 * Normalizes application process information from either structured object or text.
 */
function formatApplicationProcess(input) {
    if (!input) return { mode: "Online & Offline", processText: "" };

    if (typeof input === "object" && !Array.isArray(input)) {
        const mode = input.mode || "Online & Offline";
        const steps = Array.isArray(input.steps)
            ? input.steps
                .map((step, idx) => (typeof step === "string" ? step.trim() : JSON.stringify(step)))
                .filter(Boolean)
                .map((step, idx) => `${idx + 1}. ${step}`)
                .join("\n")
            : (input.steps || "");
        return {
            mode,
            processText: steps ? `Mode: ${mode}\n\nSteps:\n${steps}` : `Mode: ${mode}`
        };
    }

    return {
        mode: "Online & Offline",
        processText: typeof input === "string" ? input.trim() : String(input)
    };
}

/**
 * Normalizes FAQs into an array of { question, answer }.
 */
function normalizeFaqs(input) {
    if (!Array.isArray(input)) return [];
    return input
        .filter(f => f && (f.question || f.q) && (f.answer || f.a))
        .map(f => ({
            question: (f.question || f.q || "").trim(),
            answer: (f.answer || f.a || "").trim()
        }))
        .filter(f => f.question.length > 0 && f.answer.length > 0);
}

/**
 * Generates a stable URL slug identifier.
 */
export function generateSlug(rawId, title) {
    if (rawId && typeof rawId === "string" && rawId.trim().length > 1) {
        return rawId
            .trim()
            .toLowerCase()
            .replace(/_/g, "-")
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/(^-|-$)/g, "");
    }
    return (title || "untitled-scheme")
        .toLowerCase()
        .replace(/_/g, "-")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/(^-|-$)/g, "");
}

/**
 * Normalizes a raw scheme record from either myscheme-scraper or gov-myscheme-dataset.
 * Returns { valid: boolean, scheme?: Object, error?: string }
 */
export function normalizeScheme(raw, options = {}) {
    if (!raw || typeof raw !== "object") {
        return { valid: false, error: "Record is empty or not a valid JSON object" };
    }

    // 1. Title validation
    const title = (
        raw.title ||
        raw["Scheme Name"] ||
        raw.name ||
        raw.scheme_name ||
        ""
    ).trim();

    if (!title || title.length < 3) {
        return { valid: false, error: "Validation failed: 'title' is missing or too short" };
    }

    // 2. Stable identifier
    const rawId = raw.id || raw["Scheme Slug"] || raw.slug || raw.scheme_id;
    const schemeId = generateSlug(rawId, title);

    if (!schemeId) {
        return { valid: false, error: "Validation failed: Unable to generate stable schemeId" };
    }

    // 3. Content fields
    const description = (
        raw.description ||
        raw["Description"] ||
        raw.brief_description ||
        ""
    ).trim();

    const benefits = formatBulletList(raw.benefits || raw["Benefits"]);
    const eligibility = formatBulletList(raw.eligibility || raw["Eligibility Criteria"]);
    const eligibilityGeneral = formatBulletList(raw.eligibilityGeneral || raw["Eligibility (General)"]);
    const exclusions = formatBulletList(raw.exclusions || raw["Exclusions / Ineligibility"]);
    const documentsRequired = formatBulletList(raw.documentsRequired || raw["Documents Required"] || raw.documents);

    const appProcData = formatApplicationProcess(raw.applicationProcess || raw["Application Process"]);
    const applicationProcess = appProcData.processText;
    const applicationMode = raw.applicationMode || raw["Application Mode"] || appProcData.mode || "Online & Offline";

    // Content completeness check: must have at least one informative section
    if (!description && !eligibility && !benefits && !applicationProcess) {
        return {
            valid: false,
            error: `Validation failed for '${title}': Record has no description, eligibility, or benefits content`
        };
    }

    // 4. Ministry / State Classification
    const stateOrMinistry = (
        raw.ministry ||
        raw["State / UT / Ministry"] ||
        raw.stateOrMinistry ||
        raw.department ||
        "Government of India"
    ).trim();

    const levelRaw = (raw.level || raw["Level"] || "").toLowerCase();
    const level = levelRaw.includes("state") ? "State/UT" : "Central";

    // 5. Tags
    let tags = [];
    const rawTags = raw.tags || raw["Tags / Categories"];
    if (Array.isArray(rawTags)) {
        tags = rawTags.map(t => (typeof t === "string" ? t.trim() : "")).filter(Boolean);
    } else if (typeof rawTags === "string") {
        tags = rawTags.split(",").map(t => t.trim()).filter(Boolean);
    }

    // 6. Source Provenance and Timestamps
    const sourceUrl = (
        raw.url ||
        raw["Source URL"] ||
        raw.sourceUrl ||
        `https://www.myscheme.gov.in/schemes/${schemeId}`
    ).trim();

    const sourcePortal = options.sourcePortal || "myscheme.gov.in";
    const isAuthoritative = options.isAuthoritative !== undefined ? options.isAuthoritative : true;

    // Distinguish source publication/revision date from scrape time
    let sourceDate = null;
    if (raw.sourceDate || raw.lastUpdatedOn || raw.publishedAt) {
        const parsedSourceDate = new Date(raw.sourceDate || raw.lastUpdatedOn || raw.publishedAt);
        if (!isNaN(parsedSourceDate.getTime())) {
            sourceDate = parsedSourceDate;
        }
    }

    let scrapedAt = new Date();
    if (raw.scrapedAt || raw.retrievedAt) {
        const parsedScrapeDate = new Date(raw.scrapedAt || raw.retrievedAt);
        if (!isNaN(parsedScrapeDate.getTime())) {
            scrapedAt = parsedScrapeDate;
        }
    }

    const retrievalTime = new Date();

    // 7. FAQs
    const faqs = normalizeFaqs(raw.faqs || raw["FAQs"]);

    // 8. Deterministic SHA-256 Content Hash for change detection
    const hashPayload = [
        title,
        stateOrMinistry,
        level,
        description,
        benefits,
        eligibility,
        exclusions,
        applicationProcess,
        documentsRequired,
        faqs.map(f => `${f.question}|${f.answer}`).join("||")
    ].join("@@");

    const contentHash = crypto.createHash("sha256").update(hashPayload).digest("hex");

    const normalizedDoc = {
        schemeId,
        title,
        stateOrMinistry,
        level,
        applicationMode,
        tags,
        description,
        benefits,
        eligibility,
        eligibilityGeneral,
        exclusions,
        applicationProcess,
        documentsRequired,
        faqs,
        sourceUrl,
        sourcePortal,
        sourceDate,
        scrapedAt,
        retrievalTime,
        isAuthoritative,
        provenance: {
            sourceName: options.sourceName || "myscheme-scraper",
            format: options.format || "json",
            ingestedAt: retrievalTime,
            crawlerVersion: options.crawlerVersion || "1.0.0"
        },
        contentHash,
        version: 1
    };

    return { valid: true, scheme: normalizedDoc };
}
