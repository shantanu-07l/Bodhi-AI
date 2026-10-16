import crypto from "crypto";

/**
 * Splits long text blocks into coherent chunks while preserving paragraph boundaries.
 * Short sections are kept intact to avoid unnecessary fragmentation.
 */
function splitTextPreservingContext(title, sectionName, fullText, maxChars = 1200, overlap = 150) {
    if (!fullText || typeof fullText !== "string") return [];

    const cleanText = fullText.trim();
    if (!cleanText) return [];

    const contextPrefix = `Scheme: ${title}\nSection: ${sectionName}\n\n`;

    // If text fits in a single chunk, return it whole
    if (cleanText.length <= maxChars) {
        return [`${contextPrefix}${cleanText}`];
    }

    // Split on paragraphs or bullet points
    const paragraphs = cleanText.split(/\n\s*\n|\n(?=[•\-\*]|\d+\.)/);
    const chunks = [];
    let currentChunk = "";

    for (const para of paragraphs) {
        const trimmedPara = para.trim();
        if (!trimmedPara) continue;

        if ((currentChunk + "\n\n" + trimmedPara).length <= maxChars) {
            currentChunk = currentChunk ? `${currentChunk}\n\n${trimmedPara}` : trimmedPara;
        } else {
            if (currentChunk) {
                chunks.push(`${contextPrefix}${currentChunk}`);
                // Retain overlap from end of previous chunk if useful
                const words = currentChunk.split(/\s+/);
                const overlapWords = words.slice(-Math.min(20, Math.floor(overlap / 7))).join(" ");
                currentChunk = `${overlapWords}\n\n${trimmedPara}`;
            } else {
                // Single huge paragraph: slice by character limit
                for (let i = 0; i < trimmedPara.length; i += (maxChars - overlap)) {
                    const slice = trimmedPara.slice(i, i + maxChars);
                    chunks.push(`${contextPrefix}${slice}`);
                }
                currentChunk = "";
            }
        }
    }

    if (currentChunk.trim()) {
        chunks.push(`${contextPrefix}${currentChunk.trim()}`);
    }

    return chunks;
}

/**
 * Converts a structured Scheme model into granular semantic chunks.
 * Sections: description, eligibility, benefits, exclusions, documents, application_steps, faq, overview.
 */
export function chunkScheme(scheme) {
    if (!scheme || !scheme.title) return [];

    const schemeId = scheme.schemeId;
    const version = scheme.version || 1;
    const title = scheme.title;

    const baseMetadata = {
        title: title,
        stateOrMinistry: scheme.stateOrMinistry || "Government of India",
        level: scheme.level || "Central",
        tags: Array.isArray(scheme.tags) ? scheme.tags : [],
        sourceUrl: scheme.sourceUrl || `https://www.myscheme.gov.in/schemes/${schemeId}`,
        sourceVersion: version,
        sourceHash: scheme.contentHash || "",
        sourceDate: scheme.sourceDate || null,
        scrapedAt: scheme.scrapedAt || new Date()
    };

    const chunks = [];

    // Helper to add chunks for a section
    function addSectionChunks(sectionKey, sectionLabel, textContent) {
        if (!textContent || typeof textContent !== "string" || !textContent.trim()) {
            return;
        }

        const textBlocks = splitTextPreservingContext(title, sectionLabel, textContent);
        textBlocks.forEach((text, chunkIndex) => {
            const chunkHash = crypto.createHash("sha256").update(text.trim()).digest("hex");
            const chunkId = `${schemeId}:${sectionKey}:${chunkIndex}:v${version}`;

            chunks.push({
                chunkId,
                schemeId,
                schemeVersion: version,
                chunkIndex,
                section: sectionKey,
                text,
                chunkHash,
                sourceUrl: baseMetadata.sourceUrl,
                tokenEstimate: Math.ceil(text.length / 4),
                isActive: true,
                metadata: {
                    ...baseMetadata,
                    section: sectionLabel
                }
            });
        });
    }

    // 1. Overview / Summary
    const overviewParts = [
        scheme.description ? `Overview: ${scheme.description}` : null,
        scheme.applicationMode ? `Application Mode: ${scheme.applicationMode}` : null,
        scheme.tags?.length ? `Tags: ${scheme.tags.join(", ")}` : null
    ].filter(Boolean).join("\n\n");
    addSectionChunks("overview", "Overview & Scope", overviewParts);

    // 2. Eligibility
    const eligibilityContent = [
        scheme.eligibility,
        scheme.eligibilityGeneral ? `General Requirements:\n${scheme.eligibilityGeneral}` : null
    ].filter(Boolean).join("\n\n");
    addSectionChunks("eligibility", "Eligibility Criteria", eligibilityContent);

    // 3. Exclusions
    if (scheme.exclusions) {
        addSectionChunks("exclusions", "Ineligibility & Exclusions", scheme.exclusions);
    }

    // 4. Benefits & Financial Aid
    if (scheme.benefits) {
        addSectionChunks("benefits", "Benefits & Financial Assistance", scheme.benefits);
    }

    // 5. Application Steps & Procedure
    if (scheme.applicationProcess) {
        addSectionChunks("application_steps", "Application Procedure & Steps", scheme.applicationProcess);
    }

    // 6. Required Documents
    if (scheme.documentsRequired) {
        addSectionChunks("documents", "Required Documents Checklist", scheme.documentsRequired);
    }

    // 7. Frequently Asked Questions (FAQs)
    if (Array.isArray(scheme.faqs) && scheme.faqs.length > 0) {
        const faqText = scheme.faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n");
        addSectionChunks("faq", "Frequently Asked Questions", faqText);
    }

    return chunks;
}
