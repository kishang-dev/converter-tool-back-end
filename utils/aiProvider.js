const axios = require("axios");

const extractJSON = (text) => {
    if (typeof text !== 'string') return text;
    // Remove markdown code blocks if present
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    try {
        return JSON.parse(cleaned);
    } catch (err) {
        // Try to find the first { and last }
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            const potentialJson = match[0];
            try {
                return JSON.parse(potentialJson);
            } catch (e) {
                // Try to fix common trailing comma issues
                try {
                    const fixed = potentialJson.replace(/,\s*([\]}])/g, "$1");
                    return JSON.parse(fixed);
                } catch (e2) {
                    // Fallthrough
                }
            }
        }
        throw new Error("Failed to parse JSON from AI response. Likely due to model limitations. Try a more powerful model.");
    }
};

/**
 * AI Provider Utility to handle different AI platforms
 */
const callAIProvider = async ({ platform, apiKey, prompt, systemPrompt }) => {
    switch (platform.toLowerCase()) {
        case "openai":
            return await callOpenAI({ apiKey, prompt, systemPrompt });
        case "groq":
            return await callGroq({ apiKey, prompt, systemPrompt });
        case "grok":
            return await callGrok({ apiKey, prompt, systemPrompt });
        case "claude":
            return await callClaude({ apiKey, prompt, systemPrompt });
        default:
            throw new Error(`Unsupported AI platform: ${platform}`);
    }
};

const callOpenAI = async ({ apiKey, prompt, systemPrompt }) => {
    try {
        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini", // Use gpt-4o-mini for efficiency
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            },
            {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                }
            }
        );
        return extractJSON(response.data.choices[0].message.content);
    } catch (error) {
        console.error("OpenAI Error:", error.response?.data || error.message);
        throw new Error(`OpenAI Error: ${error.response?.data?.error?.message || error.message}`);
    }
};

const callGroq = async ({ apiKey, prompt, systemPrompt }) => {
    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            },
            {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                }
            }
        );
        return extractJSON(response.data.choices[0].message.content);
    } catch (error) {
        console.error("Groq Error:", error.response?.data || error.message);
        throw new Error(`Groq Error: ${error.response?.data?.error?.message || error.message}`);
    }
};

const callGrok = async ({ apiKey, prompt, systemPrompt }) => {
    try {
        const response = await axios.post(
            "https://api.x.ai/v1/chat/completions",
            {
                model: "grok-2-latest",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            },
            {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                }
            }
        );
        return extractJSON(response.data.choices[0].message.content);
    } catch (error) {
        console.error("Grok Error:", error.response?.data || error.message);
        throw new Error(`Grok Error: ${error.response?.data?.error?.message || error.message}`);
    }
};

const callClaude = async ({ apiKey, prompt, systemPrompt }) => {
    try {
        const response = await axios.post(
            "https://api.anthropic.com/v1/messages",
            {
                model: "claude-3-5-sonnet-20240620",
                max_tokens: 4096,
                system: systemPrompt,
                messages: [
                    { role: "user", content: prompt }
                ]
            },
            {
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json"
                }
            }
        );

        return extractJSON(response.data.content[0].text);
    } catch (error) {
        console.error("Claude Error:", error.response?.data || error.message);
        throw new Error(`Claude Error: ${error.response?.data?.error?.message || error.message}`);
    }
};

module.exports = { callAIProvider };
