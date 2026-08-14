import 'dotenv/config';

const getOpenAPIResponse = async(message) => {
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization" : `Bearer ${process.env.OPENAI_API_KEY}`,
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "SigmaGPT"
        },
        body: JSON.stringify({
            model: "openai/gpt-oss-20b:free",
            messages: [{
                role: "user",
                content: message,
            }]
        })
    }
    
    try {

    const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        options
    );

    const data = await response.json();

    console.log("OpenRouter Response:", data);

    if (!response.ok) {
        throw new Error(data.error?.message || "OpenRouter API Error");
    }

    if (!data.choices || !data.choices.length) {
        throw new Error("No response received from AI");
    }

    return data.choices[0].message.content;

} catch (err) {

    console.error("OpenAI Error:", err);

    throw err;

}
    
}

export default getOpenAPIResponse;
