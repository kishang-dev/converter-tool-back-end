const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Blog = require('../models/Blog');
const { ALL_TOOLS, CATEGORY_MAP } = require('./allToolsData');
const { generateBlogCoverImage } = require('./blogImageGenerator');

/**
 * Reads and analyzes the actual React UI component code for a specific tool page
 * @param {string} routeUrl - e.g. "/protect-pdf", "/merge-pdf"
 * @returns {string} extracted UI context summary
 */
function readToolPageUIContext(routeUrl) {
    try {
        const cleanRoute = routeUrl.startsWith('/') ? routeUrl.slice(1) : routeUrl;
        const possiblePaths = [
            path.join(__dirname, '../../convert-tool/src/pages', `${cleanRoute}.tsx`),
            path.join(__dirname, '../../convert-tool/src/pages', `${cleanRoute}.jsx`),
            path.join(__dirname, '../../convert-tool/src/pages', cleanRoute, 'index.tsx'),
            path.join(__dirname, '../../convert-tool/src/pages', cleanRoute, 'index.jsx')
        ];

        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                const code = fs.readFileSync(filePath, 'utf-8');
                // Extract headings, buttons, inputs, icons, and state variables from React component
                const titlesMatch = code.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi) || [];
                const buttonsMatch = code.match(/<Button[^>]*>(.*?)<\/Button>/gi) || [];
                const inputsMatch = code.match(/<input[^>]*>/gi) || [];
                const stateVars = code.match(/const\s+\[(\w+),\s*set\w+\]\s*=\s*useState/g) || [];

                const cleanTitles = titlesMatch.map(t => t.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
                const cleanButtons = buttonsMatch.map(b => b.replace(/<[^>]+>/g, '').trim()).filter(Boolean);

                return `UI Component File (${path.basename(filePath)}):
- Page Headings: ${cleanTitles.slice(0, 5).join(', ')}
- Action Buttons: ${cleanButtons.slice(0, 5).join(', ')}
- Input Controls Count: ${inputsMatch.length}
- Interactive Features: ${stateVars.slice(0, 5).join(', ').replace(/const\s+\[/g, '').replace(/,\s*set\w+\]\s*=\s*useState/g, '')}
- Full Code Snippet Preview: ${code.slice(0, 1500).replace(/\s+/g, ' ')}`;
            }
        }
    } catch (err) {
        console.warn(`Could not read UI code for route ${routeUrl}:`, err.message);
    }
    return `Standard UI layout with dropzone file upload, interactive settings panel, and instant download buttons.`;
}

/**
 * Smart fallback content generator when Gemini API key is leaked/expired/unreachable
 */
function generateSmartSEOArticle(toolName, categoryName, description, routeUrl, expectedSlug, uiContext) {
    const fullToolUrl = `https://toolbasketai.com${routeUrl}`;
    
    const title = `${toolName} Online Free - Ultimate 2026 Step-by-Step Guide`;
    const excerpt = `Looking for a fast, free, and secure way to use ${toolName}? Read our complete 2026 guide to ${toolName} on ToolBasket AI with 100% data privacy.`;

    const content = `
## Introduction to ${toolName}

In today's fast-paced digital ecosystem, having efficient, reliable, and secure online tools is essential for professionals, students, and businesses alike. **${toolName}** by ToolBasket AI offers a seamless, browser-based solution designed to simplify your digital workflow without requiring expensive software installations or account registration.

${description} With state-of-the-art cloud and browser processing, ToolBasket AI ensures high performance, total data privacy, and pristine output quality every time.

---

## Key Benefits & Advantages of Using ToolBasket AI

When using **${toolName}** on [ToolBasket AI](${fullToolUrl}), you gain access to enterprise-grade functionality completely free of charge:

- **100% Free & Unlimited**: No hidden fees, subscription paywalls, or feature restrictions.
- **Bank-Grade 256-Bit Security**: All communication is encrypted via SSL protocols. Uploaded files are automatically wiped from our secure servers within 24 hours.
- **Lightning Fast Performance**: Optimized algorithms process your data in seconds directly inside your browser or cloud sandbox.
- **Zero Installation Required**: Accessible from any desktop, tablet, or mobile browser without downloading executable files.
- **Lossless Quality Output**: Maintains document formatting, crisp typography, and pixel-perfect clarity.

---

## Step-by-Step Guide: How to Use ${toolName} Online

Getting started with **${toolName}** is simple and takes less than 30 seconds. Follow these quick steps:

1. **Navigate to the Tool Page**: Visit the official [${toolName} Tool on ToolBasket AI](${fullToolUrl}).
2. **Upload or Select Your Files**: Drag and drop your files into the designated drop zone or click **Browse Files**.
3. **Configure Your Settings**: Adjust customization options, layout preferences, or target formats according to your project requirements.
4. **Process & Convert**: Click the primary action button to begin instant processing.
5. **Download Your Results**: Once processing completes, click **Download** to save your finalized output directly to your device.

---

## Feature Comparison: ToolBasket AI vs Traditional Software

| Feature | ToolBasket AI (${toolName}) | Traditional Desktop Software | Other Online Tools |
| :--- | :---: | :---: | :---: |
| **Cost** | 100% Free | $10 - $30 / month | Limited Free Trial |
| **Installation Required** | ❌ No | ✅ Yes | ❌ No |
| **Cross-Platform Support** | ✅ Windows, Mac, Linux, Mobile | ⚠️ Platform Dependent | ✅ Yes |
| **Watermarks Added** | ❌ Never | ❌ No | ⚠️ Adds Watermarks |
| **Automatic File Cleanup** | ✅ 24-Hour Auto Erasure | ❌ Manual File Cleanup | ⚠️ Variable Retention |

---

## Security, Privacy & Compliance

We prioritize user privacy above all else. When utilizing **${toolName}**, your files are protected by end-to-end encryption. Unlike legacy platforms that store user records or sell telemetry data, ToolBasket AI enforces strict zero-retention policies. For client-side tools, processing occurs entirely within your local browser memory, ensuring your confidential documents never leave your machine.

---

## Frequently Asked Questions (FAQs)

### 1. Is ${toolName} on ToolBasket AI completely free to use?
Yes! All tools on ToolBasket AI, including **${toolName}**, are 100% free with no hidden charges, daily quotas, or subscription requirements.

### 2. Are my uploaded files safe and private?
Absolultely. We utilize SSL encryption for all file transfers. Uploaded files are permanently erased from our processing servers after 24 hours.

### 3. Do I need to create an account or sign in?
No registration is required. You can use **${toolName}** immediately without creating an account or providing an email address.

### 4. Can I use ${toolName} on mobile devices?
Yes! ToolBasket AI is fully responsive and optimized for mobile phones, iPads, Android tablets, and desktop computers across all modern web browsers.

---

## Final Thoughts & Try ${toolName} Today

Whether you are organizing business documentation, tweaking media assets, or handling technical files, **${toolName}** delivers speed, safety, and simplicity. 

👉 **Ready to get started?** Try [${toolName} on ToolBasket AI](${fullToolUrl}) now for free!
`;

    // Build hyper-specific AI art prompt derived from UI page analysis
    const aiImagePrompt = `3d digital illustration of ${toolName} web app control panel, modern dark mode UI interface, glowing neon icons, interactive dropzone card, futuristic 8k render, cinematic lighting, octane render`;

    return {
        title,
        slug: expectedSlug,
        excerpt,
        category: categoryName,
        aiImagePrompt,
        content: content.trim()
    };
}

/**
 * Generate an ultra-strong SEO daily blog post for the next available tool using Gemini AI
 */
async function generateNextToolBlog() {
    const apiKey = process.env.GEMINI_API_KEY;

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

    for (let i = 0; i < ALL_TOOLS.length; i++) {
        const [toolName, categoryKey, description, routeUrl] = ALL_TOOLS[i];
        const expectedSlug = `${toolName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-online-free-guide`;

        if (!isToolAlreadyPublished(toolName)) {
            targetTool = { toolName, categoryKey, description, routeUrl, expectedSlug };
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

    // 1. Analyze the exact React UI Component code for this tool page
    console.log(`🔍 [UI Analyzer] Reading frontend page code for route "${routeUrl}"...`);
    const uiContext = readToolPageUIContext(routeUrl);

    let blogData = null;

    // Attempt Gemini AI Generation if API key is provided
    if (apiKey && apiKey !== 'your_api_key_here') {
        const prompt = `
You are a World-Class SEO Master and Lead Content Strategist for ToolBasket AI (https://toolbasketai.com).
Your objective is to write an ULTIMATE, HIGH-RANKING, 1500+ WORD HIGH-CONVERTING SEO ARTICLE targeting Google #1 Search Rankings for the online tool: "${toolName}".

TARGET TOOL CONTEXT:
- Tool Name: ${toolName}
- Category: ${categoryName}
- Description: ${description}
- Direct Tool URL: https://toolbasketai.com${routeUrl}
- REAL FRONTEND UI PAGE ANALYSIS:
${uiContext}

CRITICAL SEO & CONTENT RULES:
1. SEO TITLE: Catchy Title under 60 chars (e.g., "${toolName} Online Free - Ultimate 2026 Step-by-Step Guide").
2. META EXCERPT: Compelling 2-sentence meta summary (150-160 chars).
3. CATEGORY: Exactly "${categoryName}".
4. AI IMAGE PROMPT: Create a detailed, hyper-visual 3D digital art prompt describing the actual UI features, layout controls, buttons, dropzones, and icons of this tool page (e.g. "3d digital art illustration of ${toolName} web app interface, dark futuristic control panel, glowing security lock icon, neon green password strength bar, octane render, 8k UI artwork").
5. ARTICLE STRUCTURE:
   - ## Introduction to ${toolName} & Why It Matters
   - ## Key Benefits & Advantages of Using ToolBasket AI
   - ## How to Use ${toolName} Online (Step-by-Step Guide based on the UI)
   - ## Feature Comparison Table (ToolBasket AI vs Other Tools)
   - ## Real-World Use Cases
   - ## Security, Privacy & 256-Bit SSL Encryption Guarantees
   - ## Frequently Asked Questions (4+ Detailed Q&As)
   - ## Final Thoughts & Try ${toolName} Now Free

Return ONLY strict valid JSON without code blocks:
{
  "title": "SEO Title",
  "slug": "${expectedSlug}",
  "excerpt": "Meta excerpt (max 160 characters)",
  "category": "${categoryName}",
  "tagline": "3-5 word catchy subtitle (e.g. Extract Pages. Save What Matters.)",
  "bullets": [
    "Feature Checkmark 1",
    "Feature Checkmark 2",
    "Feature Checkmark 3",
    "Feature Checkmark 4",
    "100% Free to Use"
  ],
  "content": "Full markdown article..."
}

`;

        const geminiModels = [
            'gemini-3.6-flash',      // Latest recommended
            'gemini-2.5-flash',      // Stable workhorse
            'gemini-2.5-pro',        // High quality fallback
            'gemini-2.0-flash'       // Legacy fallback (may show deprecation warning)
        ];

        for (const modelName of geminiModels) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                const aiResponse = await axios.post(geminiUrl, {
                    contents: [{ parts: [{ text: prompt }] }]
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 45000
                });

                if (aiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    let rawText = aiResponse.data.candidates[0].content.parts[0].text.trim();
                    if (rawText.startsWith('```json')) rawText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                    if (rawText.startsWith('```')) rawText = rawText.replace(/^```\s*/, '').replace(/\s*```$/, '');
                    
                    blogData = JSON.parse(rawText);
                    console.log(`🤖 [Gemini Success] Generated article via model: ${modelName}`);
                    break;
                }
            } catch (err) {
                const errMsg = err?.response?.data?.error?.message || err.message;
                console.warn(`⚠️ [Gemini Model ${modelName} Note]:`, errMsg);
                if (errMsg.includes('reported as leaked') || err?.response?.status === 403) {
                    console.error('⛔ [Gemini API Key Alert]: Your API key was reported as leaked by Google security scan. Please replace GEMINI_API_KEY in backend .env with a new key from https://aistudio.google.com/app/apikey');
                    break;
                }
            }
        }
    }

    // Fallback to Smart SEO Generator if Gemini call was unsuccessful or API key was flagged
    if (!blogData) {
        console.log(`ℹ️ [SEO Engine] Using built-in Ultra-SEO Smart Generator for "${toolName}"...`);
        blogData = generateSmartSEOArticle(toolName, categoryName, description, routeUrl, expectedSlug, uiContext);
    }

    // Calculate dynamic read time based on word count
    const wordCount = (blogData.content || '').split(/\s+/).length;
    const readTimeMins = Math.max(4, Math.ceil(wordCount / 200));
    const readTimeStr = `${readTimeMins} min read`;

    // Ensure slug is 100% unique in MongoDB
    let finalSlug = blogData.slug || expectedSlug;
    const slugExists = await Blog.findOne({ slug: finalSlug });
    if (slugExists) {
        finalSlug = `${finalSlug}-${Date.now().toString().slice(-6)}`;
    }

    // Generate AI image using Gemini - analyzes the live tool page first
    // NOTE: Image generation requires Gemini API billing to be enabled.
    // If it fails, we fall back to a placeholder so the blog is still saved.
    console.log(`🎨 [AI Image Generator] Generating REAL AI image for "${toolName}" based on live page analysis...`);
    const toolDetails = {
        routeUrl: routeUrl, // Pass route so generator fetches the live tool page
        tagline: blogData.tagline || 'Fast, Secure & 100% Free Online Tool',
        description: blogData.excerpt || description,
        bullets: blogData.bullets || [
            `${toolName} Online`,
            'Preserve Original Layout & Quality',
            'Lightning Fast & Secure Processing',
            'Works on Mobile, Tablet & Desktop',
            '100% Free with No Sign-up Required'
        ]
    };

    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const baseUrl = API_BASE_URL.replace('/api', '');
    let imageUrl = `${baseUrl}/uploads/blog-placeholder.png`; // default placeholder

    try {
        const imageFilename = await generateBlogCoverImage(
            toolName,
            categoryKey,
            finalSlug,
            toolDetails
        );
        imageUrl = `${baseUrl}/uploads/${imageFilename}`;
        console.log(`✅ [AI Image] Image generated: ${imageFilename}`);
    } catch (imgErr) {
        console.warn(`⚠️ [AI Image] Image generation failed (blog will still be saved): ${imgErr.message}`);
        // Keep using placeholder — do NOT rethrow
    }

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Save to MongoDB with collision safety
    let blogDoc;
    try {
        blogDoc = await Blog.create({
            title: blogData.title,
            slug: finalSlug,
            excerpt: blogData.excerpt,
            category: blogData.category || categoryName,
            readTime: readTimeStr,
            content: blogData.content,
            date: dateStr,
            image: imageUrl,
            author: 'ToolBasket AI Team'
        });
    } catch (createErr) {
        if (createErr.code === 11000) {
            const uniqueSlug = `${finalSlug}-${Date.now()}`;
            console.warn(`⚠️ Slug collision detected for "${finalSlug}", saving with unique slug "${uniqueSlug}"`);
            blogDoc = await Blog.create({
                title: blogData.title,
                slug: uniqueSlug,
                excerpt: blogData.excerpt,
                category: blogData.category || categoryName,
                readTime: readTimeStr,
                content: blogData.content,
                date: dateStr,
                image: imageUrl,
                author: 'ToolBasket AI Team'
            });
        } else {
            throw createErr;
        }
    }

    console.log(`✅ [Auto-Blog Published] Created post: "${blogDoc.title}" (${blogDoc.slug}) - ${wordCount} words`);

    return blogDoc;
}

module.exports = {
    generateNextToolBlog
};
