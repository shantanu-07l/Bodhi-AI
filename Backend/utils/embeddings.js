import "dotenv/config";

const DEFAULT_DIMENSIONS = 768;
const MAX_CACHE_SIZE = 500;
const queryCache = new Map();

/**
 * Computes cosine similarity between two float vectors.
 */
export function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
        return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Deterministic dense semantic vector generator.
 * Produces unit-normalized vectors matching configured dimensions.
 * Used for zero-dependency offline mode, rate limits, and transient failover.
 */
export function generateDeterministicVector(text, dimensions = DEFAULT_DIMENSIONS) {
    const vector = new Array(dimensions).fill(0);
    const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
    const words = cleaned.split(/\s+/).filter(w => w.length > 2);

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        let hash = 0;
        for (let j = 0; j < word.length; j++) {
            hash = (hash << 5) - hash + word.charCodeAt(j);
            hash |= 0;
        }
        const index = Math.abs(hash) % dimensions;
        const sign = (hash % 2 === 0) ? 1 : -1;
        vector[index] += sign * (1 / Math.sqrt(i + 1));
    }

    let norm = 0;
    for (let v of vector) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) {
        for (let i = 0; i < dimensions; i++) vector[i] /= norm;
    }
    return vector;
}

/**
 * EmbeddingService — uses Ollama local inference as the primary provider.
 *
 * Provider priority:
 *   1. Ollama (http://localhost:11434/api/embed) — free, local, true neural embeddings
 *   2. Deterministic hash-based fallback — zero-dependency degraded mode
 *
 * Ollama model: nomic-embed-text (768 dimensions by default)
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md#generate-embeddings
 */
export class EmbeddingService {
    constructor(config = {}) {
        this.dimensions = config.dimensions || parseInt(process.env.EMBEDDING_DIMENSIONS, 10) || DEFAULT_DIMENSIONS;

        // Ollama model name (strip org prefix if present, e.g. "nomic-ai/nomic-embed-text-v1.5" → "nomic-embed-text")
        const rawModel = config.model || process.env.EMBEDDING_MODEL || "nomic-embed-text";
        this.model = this._normalizeOllamaModelName(rawModel);

        // Ollama API endpoint (configurable for Docker networking, e.g. http://ollama:11434)
        this.ollamaEndpoint = config.ollamaEndpoint
            || process.env.OLLAMA_EMBEDDING_URL
            || process.env.OLLAMA_BASE_URL
            || "http://localhost:11434";

        this.maxRetries = config.maxRetries || 2;
        this.circuitBreakerActive = false;
        this._ollamaHealthy = null; // null = unknown, true/false after first check
    }

    /**
     * Normalize HuggingFace-style model identifiers to Ollama model names.
     * "nomic-ai/nomic-embed-text-v1.5" → "nomic-embed-text"
     * "nomic-embed-text" → "nomic-embed-text" (no change)
     */
    _normalizeOllamaModelName(name) {
        // Strip org prefix (e.g. "nomic-ai/")
        const parts = name.split("/");
        let modelName = parts[parts.length - 1];

        // Ollama's registry uses "nomic-embed-text" (without version suffix)
        // but also supports tags like "nomic-embed-text:v1.5"
        // Map common HuggingFace names to Ollama equivalents
        const HF_TO_OLLAMA = {
            "nomic-embed-text-v1.5": "nomic-embed-text",
            "nomic-embed-text-v1": "nomic-embed-text",
        };

        if (HF_TO_OLLAMA[modelName]) {
            modelName = HF_TO_OLLAMA[modelName];
        }

        return modelName;
    }

    getDimensions() {
        return this.dimensions;
    }

    getModelName() {
        return this.model;
    }

    getProviderName() {
        return this.circuitBreakerActive ? "deterministic-fallback" : "ollama";
    }

    /**
     * Embeds a single text string (document chunk or user query).
     */
    async embedText(text, isQuery = false) {
        if (!text || typeof text !== "string" || !text.trim()) {
            return generateDeterministicVector("empty", this.dimensions);
        }

        const trimmed = text.trim();
        if (isQuery && queryCache.has(trimmed)) {
            return queryCache.get(trimmed);
        }

        // Try Ollama if circuit breaker is not tripped
        if (!this.circuitBreakerActive) {
            const vector = await this._embedViaOllama(trimmed);
            if (vector) {
                if (isQuery) {
                    if (queryCache.size >= MAX_CACHE_SIZE) {
                        queryCache.delete(queryCache.keys().next().value);
                    }
                    queryCache.set(trimmed, vector);
                }
                return vector;
            }
        }

        // Fallback: Deterministic high-quality vector
        const fallback = generateDeterministicVector(trimmed, this.dimensions);
        if (isQuery) {
            queryCache.set(trimmed, fallback);
        }
        return fallback;
    }

    /**
     * Call Ollama /api/embed endpoint with retry and circuit breaker logic.
     * Returns a float array on success, or null on failure.
     */
    async _embedViaOllama(text) {
        let attempt = 0;
        const url = `${this.ollamaEndpoint}/api/embed`;

        while (attempt <= this.maxRetries) {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: this.model,
                        input: text
                    }),
                    signal: AbortSignal.timeout(30000) // Ollama may need longer on first call (model loading)
                });

                if (response.ok) {
                    const data = await response.json();

                    // Ollama /api/embed returns { embeddings: [[...]] } (array of arrays)
                    let vector = null;
                    if (data.embeddings && Array.isArray(data.embeddings) && data.embeddings.length > 0) {
                        vector = data.embeddings[0];
                    }
                    // Also handle OpenAI-compatible format: { data: [{ embedding: [...] }] }
                    else if (data.data && data.data[0] && Array.isArray(data.data[0].embedding)) {
                        vector = data.data[0].embedding;
                    }

                    if (vector && Array.isArray(vector)) {
                        // Validate and adapt dimensions
                        if (vector.length !== this.dimensions) {
                            console.warn(`[EmbeddingService] Dimension mismatch: expected ${this.dimensions}, got ${vector.length}. Adapting.`);
                            if (vector.length > this.dimensions) {
                                vector = vector.slice(0, this.dimensions);
                            } else {
                                vector = [...vector, ...new Array(this.dimensions - vector.length).fill(0)];
                            }
                        }
                        this._ollamaHealthy = true;
                        return vector;
                    }

                    // Unexpected response shape
                    console.warn("[EmbeddingService] Ollama returned OK but no embeddings found in response:", JSON.stringify(data).slice(0, 200));
                    attempt++;
                } else if (response.status === 404) {
                    // Model not found in Ollama — trip circuit breaker
                    const errBody = await response.text().catch(() => "");
                    console.warn(`[EmbeddingService] Ollama model '${this.model}' not found (404). Run: ollama pull ${this.model}. Error: ${errBody.slice(0, 200)}`);
                    this.circuitBreakerActive = true;
                    this._ollamaHealthy = false;
                    return null;
                } else if (response.status === 429) {
                    // Rate limited (unlikely for local Ollama but handled for completeness)
                    const delayMs = (Math.pow(2, attempt) * 500) + Math.random() * 200;
                    await new Promise(res => setTimeout(res, delayMs));
                    attempt++;
                } else {
                    const errBody = await response.text().catch(() => "");
                    console.warn(`[EmbeddingService] Ollama returned ${response.status}: ${errBody.slice(0, 200)}`);
                    attempt++;
                }
            } catch (err) {
                attempt++;
                const isConnRefused = err.cause?.code === "ECONNREFUSED" || err.message?.includes("ECONNREFUSED");
                const isTimeout = err.name === "TimeoutError" || err.message?.includes("aborted");

                if (isConnRefused) {
                    // Ollama server is not running — trip circuit breaker
                    console.warn("[EmbeddingService] Ollama is not running at", this.ollamaEndpoint, "— using fallback vectors. Start Ollama with: ollama serve");
                    this.circuitBreakerActive = true;
                    this._ollamaHealthy = false;
                    return null;
                }

                if (attempt > this.maxRetries) {
                    console.warn(`[EmbeddingService] Ollama request failed after ${this.maxRetries + 1} attempts: ${err.message}. Using fallback.`);
                }
            }
        }
        return null;
    }

    /**
     * Embeds a batch of texts with concurrency control.
     */
    async embedBatch(texts, batchSize = 10) {
        if (!Array.isArray(texts)) return [];
        const embeddings = [];

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchVectors = await Promise.all(batch.map(t => this.embedText(t, false)));
            embeddings.push(...batchVectors);
        }

        return embeddings;
    }

    /**
     * Checks whether Ollama is reachable and the configured model is available.
     * Returns { healthy: boolean, provider: string, model: string, error?: string }
     */
    async healthCheck() {
        const result = {
            healthy: false,
            provider: "ollama",
            model: this.model,
            dimensions: this.dimensions,
            endpoint: this.ollamaEndpoint
        };

        try {
            // Check Ollama server
            const resp = await fetch(`${this.ollamaEndpoint}/api/tags`, {
                signal: AbortSignal.timeout(5000)
            });
            if (!resp.ok) {
                result.error = `Ollama returned ${resp.status}`;
                return result;
            }
            const data = await resp.json();
            const models = (data.models || []).map(m => m.name || m.model);
            const modelAvailable = models.some(m => m.startsWith(this.model));

            if (!modelAvailable) {
                result.error = `Model '${this.model}' not found. Available: ${models.join(", ") || "none"}. Run: ollama pull ${this.model}`;
                return result;
            }

            // Quick embedding test
            const testVector = await this._embedViaOllama("health check test");
            if (testVector && testVector.length === this.dimensions) {
                result.healthy = true;
                this._ollamaHealthy = true;
                this.circuitBreakerActive = false;
            } else if (testVector) {
                result.healthy = true;
                result.warning = `Dimensions mismatch: model returns ${testVector.length}, configured ${this.dimensions}`;
            } else {
                result.error = "Embedding test returned null";
            }
        } catch (err) {
            result.error = err.message;
        }

        return result;
    }

    /**
     * Reset the circuit breaker (e.g., after restarting Ollama).
     */
    resetCircuitBreaker() {
        this.circuitBreakerActive = false;
        this._ollamaHealthy = null;
        console.log("[EmbeddingService] Circuit breaker reset. Will retry Ollama on next request.");
    }
}

// Global default service instance
export const defaultEmbeddingService = new EmbeddingService();

// Export legacy functions for backwards compatibility
export async function getEmbedding(text, isQuery = false) {
    return defaultEmbeddingService.embedText(text, isQuery);
}

export async function getBatchEmbeddings(texts, concurrency = 5) {
    return defaultEmbeddingService.embedBatch(texts, concurrency);
}
