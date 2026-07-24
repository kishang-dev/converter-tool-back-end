const mongoose = require('mongoose');

const resumeSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        default: 'Untitled Resume'
    },
    personalInfo: {
        fullName: String,
        email: String,
        phone: String,
        address: String,
        website: String,
        linkedin: String,
        github: String,
        summary: String
    },
    experience: [
        {
            company: String,
            position: String,
            location: String,
            startDate: String,
            endDate: String,
            current: Boolean,
            description: String
        }
    ],
    education: [
        {
            school: String,
            degree: String,
            fieldOfStudy: String,
            location: String,
            startDate: String,
            endDate: String,
            description: String
        }
    ],
    skills: [String],
    projects: [
        {
            name: String,
            description: String,
            link: String,
            technologies: [String]
        }
    ],
    certifications: [
        {
            name: String,
            issuer: String,
            date: String
        }
    ],
    languages: [
        {
            language: String,
            proficiency: String
        }
    ],
    awards: [
        {
            title: String,
            issuer: String,
            date: String
        }
    ],
    interests: [String],
    references: [
        {
            name: String,
            position: String,
            company: String,
            contact: String
        }
    ],
    publications: [
        {
            title: String,
            publisher: String,
            date: String,
            url: String
        }
    ],
    volunteer: [{ organization: String, role: String, startDate: String, endDate: String, description: String }],
    softSkills: [String],
    coursework: [String],
    patents: [{ title: String, date: String, url: String, description: String }],
    speakingEngagements: [{ title: String, event: String, date: String, url: String }],
    testimonials: [{ name: String, quote: String, position: String }],
    template: {
        type: String,
        default: 'modern'
    },
    color: {
        type: String,
        default: '#3b82f6'
    },
    font: {
        type: String,
        default: 'Inter'
    },
    styling: {
        fontSize: {
            name: { type: Number, default: 48 },
            headings: { type: Number, default: 14 },
            body: { type: Number, default: 10 }
        },
        sectionFonts: {
            name: { type: String, default: 'Inter' },
            headings: { type: String, default: 'Inter' },
            body: { type: String, default: 'Inter' }
        },
        lineHeight: { type: Number, default: 1.5 },
        margins: { type: String, default: 'normal' },
        pageSize: { type: String, default: 'A4' }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Resume', resumeSchema);
