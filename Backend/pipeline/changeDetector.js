import crypto from "crypto";

/**
 * Section-level change detector for scheme refresh pipeline.
 *
 * Compares normalized incoming scheme data with what is already stored in MongoDB,
 * producing granular change events at the section level for eligibility, benefits,
 * documents, and application steps — the sections citizens most depend on for accuracy.
 *
 * IMPORTANT: A detected content change on myscheme.gov.in reflects that
 * the webpage was updated. It does not confirm that an official rule has
 * legally changed or taken effect. Verification must be done via gazette sources.
 */

// Tracked sections with display labels
export const TRACKED_SECTIONS = {
    description: "Overview & Description",
    eligibility: "Eligibility Criteria",
    eligibilityGeneral: "General Eligibility Requirements",
    exclusions: "Ineligibility & Exclusions",
    benefits: "Benefits & Financial Assistance",
    applicationProcess: "Application Procedure & Steps",
    documentsRequired: "Required Documents Checklist"
};

/**
 * Computes a SHA-256 hash of a section's content for fast comparison.
 * Returns an empty string for absent or blank sections.
 */
export function sectionHash(text) {
    if (!text || typeof text !== "string" || !text.trim()) return "";
    return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * Computes per-section hashes for a normalized scheme document.
 * Returns a map of { sectionKey -> contentHash }.
 */
export function computeSectionHashes(scheme) {
    const hashes = {};
    for (const sectionKey of Object.keys(TRACKED_SECTIONS)) {
        const value = scheme[sectionKey] || "";
        const text = typeof value === "string" ? value :
            (Array.isArray(value)
                ? value.map(f => `${f.question || ""}|${f.answer || ""}`).join("||")
                : JSON.stringify(value));
        hashes[sectionKey] = sectionHash(text);
    }
    return hashes;
}

/**
 * Compares an incoming normalized scheme against the persisted Scheme document.
 * Returns an array of section-level change descriptors, or empty array if unchanged.
 *
 * @param {Object} incoming  - Normalized incoming scheme from normalizer.js
 * @param {Object} persisted - Existing Scheme Mongoose document (or plain object)
 * @returns {Array}          - Array of change descriptors
 */
export function detectSectionChanges(incoming, persisted) {
    if (!incoming || !persisted) return [];

    const changes = [];
    const incomingHashes = computeSectionHashes(incoming);
    const persistedHashes = computeSectionHashes(persisted);

    for (const [sectionKey, label] of Object.entries(TRACKED_SECTIONS)) {
        const inHash = incomingHashes[sectionKey];
        const prevHash = persistedHashes[sectionKey];

        // Skip sections that are absent in both old and new
        if (!inHash && !prevHash) continue;

        if (inHash !== prevHash) {
            // Map scheme field name -> SchemeChunk section enum
            const chunkSection = mapSchemeFieldToChunkSection(sectionKey);

            changes.push({
                schemeId: incoming.schemeId,
                schemeTitle: incoming.title,
                sourceUrl: incoming.sourceUrl,
                changeType: "section_modified",
                section: chunkSection,
                sectionKey,
                sectionLabel: label,
                previousHash: prevHash || null,
                currentHash: inHash || null,
                previousVersion: persisted.version || 1,
                currentVersion: (persisted.version || 1) + 1,
                sourceDateReported: incoming.sourceDate || null,
                verificationStatus: "unverified",
                summary: buildChangeSummary(sectionKey, prevHash, inHash)
            });
        }
    }

    return changes;
}

/**
 * Maps a Scheme model field name to the SchemeChunk section enum value.
 */
function mapSchemeFieldToChunkSection(schemeField) {
    const mapping = {
        description: "description",
        eligibility: "eligibility",
        eligibilityGeneral: "eligibility",
        exclusions: "exclusions",
        benefits: "benefits",
        applicationProcess: "application_steps",
        documentsRequired: "documents"
    };
    return mapping[schemeField] || "overview";
}

/**
 * Builds a human-readable summary string for a detected change.
 * Does NOT assert legal effect; only describes the content change.
 */
function buildChangeSummary(sectionKey, prevHash, newHash) {
    const label = TRACKED_SECTIONS[sectionKey] || sectionKey;
    if (!prevHash && newHash) {
        return `Section '${label}' was added (content where previously absent).`;
    }
    if (prevHash && !newHash) {
        return `Section '${label}' was removed (content now absent).`;
    }
    return `Section '${label}' content changed. Webpage updated — verify via official gazette for legal effect.`;
}

/**
 * Determines which SchemeChunk sections need to be re-indexed for a changed scheme.
 * Avoids re-embedding unchanged sections.
 *
 * @param {Array} sectionChanges - Output of detectSectionChanges()
 * @returns {Set<string>}        - Set of SchemeChunk section enum values to re-index
 */
export function getSectionsToReindex(sectionChanges) {
    const sections = new Set();
    for (const change of sectionChanges) {
        if (change.section) sections.add(change.section);
    }
    return sections;
}
