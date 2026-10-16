import 'dotenv/config';

const getOpenAPIResponse = async (message) => {
    const models = [
        "openrouter/free",
        "liquid/lfm-2.5-2.6b:free",
        "z-ai/glm-5.2:free"
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
                    "X-Title": "SigmaGPT"
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{
                        role: "user",
                        content: message,
                    }]
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.warn(`[OpenRouter] Model ${model} failed (${response.status}):`, data.error?.message);
                lastError = new Error(data.error?.message || `Model ${model} returned error ${response.status}`);
                continue;
            }

            if (!data.choices || !data.choices.length) {
                console.warn(`[OpenRouter] Model ${model} returned no choices.`);
                lastError = new Error(`No response received from model ${model}`);
                continue;
            }

            return data.choices[0].message.content;
        } catch (err) {
            console.error(`[OpenRouter] Error with model ${model}:`, err.message);
            lastError = err;
        }
    }

    throw lastError || new Error("Failed to connect to AI after trying available models.");
};

export default getOpenAPIResponse;
