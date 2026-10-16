import 'dotenv/config';

/**
 * Sends chat completion requests to OpenRouter with fallback models.
 * Accepts either a single string message (legacy) or an array of message objects:
 * [{ role: "system"|"user"|"assistant", content: string }]
 */
const getOpenAPIResponse = async (input) => {
    // Standardize input into messages array
    let messagesPayload = [];
    if (typeof input === "string") {
        messagesPayload = [{ role: "user", content: input }];
    } else if (Array.isArray(input)) {
        messagesPayload = input;
    } else {
        throw new Error("Invalid message input provided to getOpenAPIResponse");
    }

    const models = [
        "liquid/lfm-2.5-2.6b:free",
        "openrouter/free",
        "meta-llama/llama-3.2-3b-instruct:free",
        "mistralai/mistral-7b-instruct:free"
    ];

    let lastError = null;

    for (const model of models) {
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "Bodhi AI - JanSahayak"
                },
                body: JSON.stringify({
                    model: model,
                    messages: messagesPayload,
                    temperature: 0.4,
                    max_tokens: 1500
                }),
                signal: AbortSignal.timeout(15000)
            });

            const data = await response.json();

            if (!response.ok) {
                console.warn(`[OpenRouter] Model ${model} failed (${response.status}):`, data.error?.message);
                lastError = new Error(data.error?.message || `Model ${model} returned error ${response.status}`);
                continue;
            }

            if (!data.choices || !data.choices.length || !data.choices[0].message) {
                console.warn(`[OpenRouter] Model ${model} returned no choices.`);
                lastError = new Error(`No response received from model ${model}`);
                continue;
            }

            return data.choices[0].message.content;
        } catch (err) {
            const isTimeout = err.name === "TimeoutError" || err.message?.includes("aborted");
            console.warn(`[OpenRouter] ${isTimeout ? "Timeout (15s)" : "Error"} with model ${model}:`, err.message);
            lastError = err;
        }
    }

    throw lastError || new Error("Failed to connect to AI after trying available models.");
};

export default getOpenAPIResponse;
