const axios = require('axios');
const Blog = require('../models/Blog');
const { ALL_TOOLS, CATEGORY_MAP } = require('./allToolsData');
const { generateBlogCoverImage } = require('./blogImageGenerator');

/**
 * Generate an ultra-strong SEO daily blog post for the next available tool using Gemini AI
 */
async function generateNextToolBlog() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured in environment variables.');
    }

    // Get all existing blogs from DB
    const existingBlogs = await Blog.find({}, 'slug title category').lean();

    // Helper to check if a tool already has a published blog post
    const isToolAlreadyPublished = (toolName) => {
        const cleanTool = toolName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return existingBlogs.some(b => {
            const cleanSlug = (b.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanTitle = (b.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return cleanSlug.includes(cleanTool) || cleanTitle.includes(cleanTool);
        });
    };

    // Find the next tool in ALL_TOOLS list that hasn't been generated yet
    let targetTool = null;
    let targetIndex = -1;

    for (let i = 0; i < ALL_TOOLS.length; i++) {
        const [toolName, categoryKey, description, routeUrl] = ALL_TOOLS[i];
        const expectedSlug = `${toolName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-online-free-guide`;

        if (!isToolAlreadyPublished(toolName)) {
            targetTool = { toolName, categoryKey, description, routeUrl, expectedSlug };
            targetIndex = i;
            break;
        }
    }

    // If all tools have been covered, pick a tool sequentially based on existing count
    if (!targetTool) {
        const nextIdx = existingBlogs.length % ALL_TOOLS.length;
        const [toolName, categoryKey, description, routeUrl] = ALL_TOOLS[nextIdx];
        const timestampSlug = `guide-${toolName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
        targetTool = { toolName, categoryKey, description, routeUrl, expectedSlug: timestampSlug };
    }

    const { toolName, categoryKey, description, routeUrl, expectedSlug } = targetTool;
    const categoryName = CATEGORY_MAP[categoryKey] || 'PDF Tools';

    console.log(`🤖 [Gemini Ultra SEO] Writing high-ranking SEO blog for Tool: "${toolName}" (${categoryName})...`);

    const prompt = `
You are a World-Class SEO Master and Lead Content Strategist for ToolBasket AI (https://toolbasketai.com).
Your objective is to write an ULTIMATE, HIGH-RANKING, 1500+ WORD HIGH-CONVERTING SEO ARTICLE targeting Google #1 Search Rankings for the online tool: "${toolName}".

TARGET TOOL CONTEXT:
- Tool Name: ${toolName}
- Category: ${categoryName}
- Description: ${description}
- Direct Tool URL: https://toolbasketai.com${routeUrl}

CRITICAL SEO & CONTENT RULES:
1. SEO TITLE: Catchy, High CTR Title under 60 characters (e.g., "${toolName} Online Free - Ultimate 2026 Step-by-Step Guide").
2. META EXCERPT: Compelling, keyword-rich 2-sentence meta summary (150-160 characters).
3. CATEGORY: Exactly "${categoryName}".
4. AI IMAGE PROMPT: A detailed 3D visual art description for generating a cover graphic (e.g., "high quality 3d digital artwork for ${toolName}, dark futuristic UI with neon glow, 8k render").
5. ULTIMATE SEO ARTICLE STRUCTURE:
   - ## Introduction to ${toolName} & Why It Matters
   - ## Key Benefits & Advantages of Using ToolBasket AI
   - ## How to Use ${toolName} Online (Step-by-Step Guide)
   - ## Feature Comparison Table (ToolBasket AI vs Other Tools)
   - ## Real-World Use Cases (Students, Businesses, Developers, Freelancers)
   - ## Security, Privacy & 256-Bit SSL Encryption Guarantees
   - ## Frequently Asked Questions (4+ Detailed Q&As)
   - ## Final Thoughts & Try ${toolName} Now Free

Formatting:
- Write in clean markdown using ## for main section headers.
- Include a Markdown Comparison Table.
- Provide clear bullet points and bold text for key insights.
- Do NOT mention any competitors by trademarked names; focus on ToolBasket AI superior performance.

OUTPUT REQUIREMENT:
Return ONLY strict valid JSON without code blocks or markdown backticks surrounding the JSON object:
{
  "title": "Ultra SEO Title",
  "slug": "${expectedSlug}",
  "excerpt": "Compelling meta excerpt here",
  "category": "${categoryName}",
  "aiImagePrompt": "3d visual prompt description for AI image generator",
  "content": "Full 1500+ word markdown article..."
}
`;

    // Call Gemini API (using gemini-1.5-flash with fallback model)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    let aiResponse;
    try {
        aiResponse = await axios.post(geminiUrl, {
            contents: [{ parts: [{ text: prompt }] }]
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });
    } catch (err) {
        console.error('Gemini 1.5 Flash request failed, trying gemini-pro fallback...', err?.response?.data || err.message);
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
        aiResponse = await axios.post(fallbackUrl, {
            contents: [{ parts: [{ text: prompt }] }]
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });
    }

    const rawText = aiResponse.data.candidates[0].content.parts[0].text;
    
    // Clean JSON markdown wrappers if present
    let jsonString = rawText.trim();
    if (jsonString.startsWith('```json')) {
        jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const blogData = JSON.parse(jsonString);

    // Calculate dynamic read time based on word count
    const wordCount = (blogData.content || '').split(/\s+/).length;
    const readTimeMins = Math.max(4, Math.ceil(wordCount / 200));
    const readTimeStr = `${readTimeMins} min read`;

    // 2. Generate 100% AI Cover Image with Brand Overlay
    console.log(`🎨 [AI Cover Image] Generating visual banner for "${toolName}"...`);
    const imageFilename = await generateBlogCoverImage(
        toolName,
        categoryKey,
        blogData.slug,
        blogData.aiImagePrompt || ''
    );
    
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    const baseUrl = API_BASE_URL.replace('/api', '');
    const imageUrl = `${baseUrl}/uploads/${imageFilename}`;

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // 3. Save to MongoDB
    const blogDoc = await Blog.create({
        title: blogData.title,
        slug: blogData.slug,
        excerpt: blogData.excerpt,
        category: blogData.category || categoryName,
        readTime: readTimeStr,
        content: blogData.content,
        date: dateStr,
        image: imageUrl,
        author: 'ToolBasket AI Team'
    });

    console.log(`✅ [Ultra SEO Blog Success] Created: "${blogDoc.title}" (${blogDoc.slug}) - ${wordCount} words`);

    return blogDoc;
}

module.exports = {
    generateNextToolBlog
};
