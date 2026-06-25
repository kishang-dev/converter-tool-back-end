const Resume = require('../models/Resume');
const { PDFExtract } = require('pdf.js-extract');
const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

// Advanced grouping with column awareness
function groupItemsIntoBlocks(items) {
    if (!items || items.length === 0) return [];

    // Sort items by Y then X
    const sortedItems = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

    const lines = [];
    let currentLine = [];
    let lastY = -1;
    let tolerance = 5;

    sortedItems.forEach(item => {
        if (lastY === -1 || Math.abs(item.y - lastY) < tolerance) {
            currentLine.push(item);
        } else {
            lines.push(currentLine.sort((a, b) => a.x - b.x));
            currentLine = [item];
        }
        lastY = item.y;
    });
    if (currentLine.length > 0) lines.push(currentLine.sort((a, b) => a.x - b.x));

    const blocks = [];
    lines.forEach(line => {
        let currentBlock = [];
        for (let i = 0; i < line.length; i++) {
            const item = line[i];
            // Split if there's a significant gap on the same line (columns)
            if (i > 0 && (item.x - (line[i - 1].x + line[i - 1].width)) > 40) {
                blocks.push({
                    text: currentBlock.map(i => i.str).join(' ').trim(),
                    height: Math.max(...currentBlock.map(i => i.height)),
                    x: currentBlock[0].x,
                    y: currentBlock[0].y,
                    width: currentBlock.reduce((acc, curr) => acc + curr.width, 0)
                });
                currentBlock = [];
            }
            currentBlock.push(item);
        }
        if (currentBlock.length > 0) {
            blocks.push({
                text: currentBlock.map(i => i.str).join(' ').trim(),
                height: Math.max(...currentBlock.map(i => i.height)),
                x: currentBlock[0].x,
                y: currentBlock[0].y,
                width: currentBlock.reduce((acc, curr) => acc + curr.width, 0)
            });
        }
    });

    return blocks.filter(b => b.text.length > 0);
}

exports.parseResume = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Please upload a file' });

        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();

        let allBlocks = [];
        let rawText = "";

        if (fileExt === '.pdf') {
            const buffer = await fs.readFile(filePath);

            // Fixed pdfParse call with validation
            try {
                if (typeof pdfParse === 'function') {
                    const pdfData = await pdfParse(buffer);
                    rawText = pdfData.text || "";
                } else if (pdfParse && typeof pdfParse.default === 'function') {
                    const pdfData = await pdfParse.default(buffer);
                    rawText = pdfData.text || "";
                }
            } catch (err) {
                console.warn("pdf-parse failed:", err.message);
            }

            const extractor = new PDFExtract();
            const coordinateData = await extractor.extract(filePath, {});
            coordinateData.pages.forEach(page => {
                const blocks = groupItemsIntoBlocks(page.content);
                allBlocks.push(...blocks);
                if (!rawText) {
                    rawText += blocks.map(b => b.text).join(' ') + '\n';
                }
            });
        } else if (fileExt === '.docx' || fileExt === '.doc') {
            const result = await mammoth.extractRawText({ path: filePath });
            rawText = result.value;
            allBlocks = rawText.split('\n').map(l => ({ text: l.trim(), height: 10, x: 0, y: 0 }));
        } else {
            rawText = await fs.readFile(filePath, 'utf8');
            allBlocks = rawText.split('\n').map(l => ({ text: l.trim(), height: 10, x: 0, y: 0 }));
        }

        const parsedData = {
            personalInfo: { fullName: '', email: '', phone: '', address: '', summary: '' },
            experience: [],
            education: [],
            skills: [],
            projects: [],
            languages: []
        };

        // GLOBAL FALLBACK EXTRACTION
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/;

        const emailMatch = rawText.match(emailRegex);
        if (emailMatch) parsedData.personalInfo.email = emailMatch[0];

        const phoneMatch = rawText.match(phoneRegex);
        if (phoneMatch) parsedData.personalInfo.phone = phoneMatch[0];

        // NAME EXTRACTION
        const nameCandidates = allBlocks.slice(0, 20).filter(b =>
            b.text.length > 3 &&
            b.text.length < 40 &&
            !b.text.includes('@') &&
            !/resume|cv|curriculum|phone|email|address|contact|profile/i.test(b.text)
        );

        if (nameCandidates.length > 0) {
            const bestCandidate = nameCandidates.sort((a, b) => b.height - a.height)[0];
            parsedData.personalInfo.fullName = bestCandidate.text;
        }

        // SECTION SPLITTING
        const sectionKeywords = {
            summary: ['summary', 'profile', 'objective', 'about', 'career objective', 'professional summary'],
            experience: ['experience', 'work', 'employment', 'history', 'professional experience', 'internship', 'career history'],
            education: ['education', 'academic', 'qualification', 'degree', 'study', 'academic background'],
            skills: ['skills', 'technologies', 'expertise', 'technical skills', 'competencies', 'skill set'],
            languages: ['languages'],
            interests: ['interests', 'hobbies', 'activities', 'volunteering']
        };

        let currentSection = '';
        let sectionBuffer = [];

        allBlocks.forEach((block, idx) => {
            const text = block.text.trim();
            const lower = text.toLowerCase();
            let foundNew = false;

            for (const [key, keywords] of Object.entries(sectionKeywords)) {
                const isHeading = keywords.some(kw =>
                    lower === kw ||
                    (text.length < 50 && (lower.startsWith(kw + ':') || lower.startsWith(kw + ' ')))
                ) && text.length < 50;

                if (isHeading) {
                    saveSectionData(currentSection, sectionBuffer, parsedData);
                    currentSection = key;
                    sectionBuffer = [];
                    foundNew = true;
                    break;
                }
            }

            if (!foundNew) {
                if (currentSection) {
                    sectionBuffer.push(block);
                } else if (idx < 30 && parsedData.personalInfo.fullName && !parsedData.personalInfo.fullName.includes(text)) {
                    if (/\d+/.test(text) && text.length > 8 && !text.includes('@') && !/phone|tel/i.test(text)) {
                        parsedData.personalInfo.address += (parsedData.personalInfo.address ? ', ' : '') + text;
                    }
                }
            }
        });
        saveSectionData(currentSection, sectionBuffer, parsedData);

        // CLEANUP
        parsedData.skills = [...new Set(parsedData.skills.flatMap(s => s.split(/[|,;•]/)).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50))];
        parsedData.personalInfo.address = [...new Set(parsedData.personalInfo.address.split(', '))].join(', ');

        if (!parsedData.personalInfo.fullName && rawText.split('\n')[0]) {
            parsedData.personalInfo.fullName = rawText.split('\n')[0].trim();
        }

        res.status(200).json({ success: true, data: parsedData });
    } catch (error) {
        console.error("Parse error:", error);
        res.status(500).json({ error: 'Resume parsing failed' });
    }
};

function saveSectionData(section, buffer, data) {
    if (!buffer || buffer.length === 0) return;
    const lines = buffer.map(b => b.text);

    switch (section) {
        case 'summary':
            data.personalInfo.summary = lines.join(' ');
            break;
        case 'skills':
            data.skills.push(...lines);
            break;
        case 'experience':
            parseExperienceLines(buffer, data.experience);
            break;
        case 'education':
            parseEducationLines(buffer, data.education);
            break;
        case 'languages':
            data.languages = lines.map(l => ({ language: l, proficiency: 'Fluent' }));
            break;
        case 'interests':
            data.interests = lines.flatMap(l => l.split(/[|,;•·]/)).map(i => i.trim()).filter(i => i.length > 0);
            break;
    }
}

function parseExperienceLines(blocks, list) {
    let current = null;

    blocks.forEach(block => {
        const text = block.text.trim();
        const dateRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|[0-9]{1,2})?[-.\s]?(19|20)\d{2}|present|current/gi;
        const hasDate = dateRegex.test(text);
        const dateMatches = text.match(dateRegex);
        const isOnlyDate = hasDate && text.length < 25 && dateMatches && dateMatches[0].length > text.length * 0.5;

        // New Item detection
        if ((block.height > 11 || (hasDate && !isOnlyDate)) && text.length < 120 && text.length > 3) {
            if (current) list.push(current);
            current = { company: text, position: '', description: '', startDate: '', endDate: '' };
            if (hasDate) {
                const dates = text.match(dateRegex);
                if (dates.length >= 1) current.startDate = dates[0].trim();
                if (dates.length >= 2) current.endDate = dates[1].trim();
                else if (text.toLowerCase().includes('present')) current.endDate = 'Present';
            }
        } else if (current) {
            if (hasDate && !current.startDate) {
                const dates = text.match(dateRegex);
                if (dates.length >= 1) current.startDate = dates[0].trim();
                if (dates.length >= 2) current.endDate = dates[1].trim();
            } else if (!current.position && text.length < 80) {
                current.position = text;
            } else {
                current.description += (current.description ? '\n' : '') + text;
            }
        }
    });
    if (current) list.push(current);
}

function parseEducationLines(blocks, list) {
    let current = null;
    blocks.forEach(block => {
        const text = block.text.trim();
        const hasDate = /(19|20)\d{2}/.test(text);

        if (block.height > 11 || (hasDate && text.length < 100)) {
            if (current) list.push(current);
            current = { school: text, degree: '', fieldOfStudy: '', startDate: '', endDate: '' };
        } else if (current) {
            if (!current.degree) current.degree = text;
            else current.description = (current.description || '') + ' ' + text;
        }
    });
    if (current) list.push(current);
}

exports.saveResume = async (req, res) => {
    try {
        req.body.user = req.user.id;
        const resume = await Resume.create(req.body);
        res.status(201).json({ success: true, data: resume });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getUserResumes = async (req, res) => {
    try {
        const resumes = await Resume.find({ user: req.user.id }).sort('-createdAt');
        res.status(200).json({ success: true, data: resumes });
    } catch (error) {
        console.error("Failed to fetch resumes (DB might be offline):", error.message);
        res.json({ success: true, data: [] });
    }
};

exports.getResumeById = async (req, res) => {
    try {
        const resume = await Resume.findOne({ _id: req.params.id, user: req.user.id });
        if (!resume) return res.status(404).json({ error: 'Resume not found' });
        res.status(200).json({ success: true, data: resume });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateResume = async (req, res) => {
    try {
        let resume = await Resume.findOne({ _id: req.params.id, user: req.user.id });
        if (!resume) return res.status(404).json({ error: 'Resume not found' });
        
        resume = await Resume.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.status(200).json({ success: true, data: resume });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteResume = async (req, res) => {
    try {
        const resume = await Resume.findOne({ _id: req.params.id, user: req.user.id });
        if (!resume) return res.status(404).json({ error: 'Resume not found' });
        
        await resume.deleteOne();
        res.status(200).json({ success: true, message: 'Resume deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.exportResume = async (req, res) => {
    try {
        let resumeId = req.params.id;
        let filename;

        if (resumeId !== 'temp') {
            const resume = await Resume.findById(resumeId);
            if (!resume) return res.status(404).json({ error: 'Resume not found' });
            filename = `resume-${resume._id}-${Date.now()}.pdf`;
        } else {
            filename = `resume-temp-${Date.now()}.pdf`;
        }

        const { html, resumeData } = req.body;
        if (!html) return res.status(400).json({ error: 'HTML content is required' });

        const { getBrowser } = require('../utils/browserUtils');
        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 1600 });
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
        await new Promise(r => setTimeout(r, 1000));

        const outputPath = path.join(__dirname, '../outputs', filename);
        const outputsDir = path.join(__dirname, '../outputs');
        if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

        // Step 1: Render temporary PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
        });
        await browser.close();

        // Step 2: Inject Invisible AI Data for Instant Re-editing (The "Magic" Bit)
        const { PDFDocument } = require('pdf-lib');
        const pdfDoc = await PDFDocument.load(pdfBuffer);

        if (resumeData) {
            // We encode the JSON in the 'Subject' and 'Producer' fields as a backup.
            // This ensures our parser can reclaim the exact data later without AI hallucination.
            const encoded = Buffer.from(JSON.stringify(resumeData)).toString('base64');
            pdfDoc.setSubject(`RESUME_DATA:${encoded}`);
            pdfDoc.setProducer('Antigravity Resume Builder Engine');
            pdfDoc.setTitle(resumeData.personalInfo?.fullName || 'My Resume');
        }

        const finalPdfBytes = await pdfDoc.save();
        await fs.writeFile(outputPath, Buffer.from(finalPdfBytes));

        res.status(200).json({ success: true, downloadUrl: `/outputs/${filename}`, filename });
    } catch (error) {
        console.error("Export Error:", error);
        res.status(500).json({ error: 'Failed to export PDF: ' + error.message });
    }
};

// Update parseResume to handle this new metadata
const originalParseResume = exports.parseResume;
exports.parseResume = async (req, res) => {
    try {
        if (!req.file || path.extname(req.file.originalname).toLowerCase() !== '.pdf') {
            return await originalParseResume(req, res);
        }

        const buffer = await fs.readFile(req.file.path);
        const { PDFDocument } = require('pdf-lib');

        try {
            const pdfDoc = await PDFDocument.load(buffer);
            const subject = pdfDoc.getSubject();

            if (subject && subject.startsWith('RESUME_DATA:')) {
                console.log("⚡ INSTANT RECOVERY: Found embedded AI metadata.");
                const base64 = subject.split(':')[1];
                const data = JSON.parse(Buffer.from(base64, 'base64').toString());

                // Map location to address if needed (backwards compatibility for AI schema)
                if (data.personalInfo && data.personalInfo.location && !data.personalInfo.address) {
                    data.personalInfo.address = data.personalInfo.location;
                }

                return res.status(200).json({ success: true, data, source: 'embedded' });
            }
        } catch (e) {
            console.warn("Metadata check failed, falling back to heuristic parsing:", e.message);
        }

        return await originalParseResume(req, res);
    } catch (error) {
        console.error("Parse wrapper error:", error);
        res.status(500).json({ error: 'Resume parsing failed' });
    }
};
