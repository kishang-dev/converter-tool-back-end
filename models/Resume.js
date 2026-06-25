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
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Resume', resumeSchema);
