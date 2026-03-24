const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');

async function checkFile() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect('mongodb://localhost:27017/pdf-tool');
        console.log('Connected!');

        const File = mongoose.model('File', new mongoose.Schema({
            path: String,
            originalName: String
        }));

        const fileId = '69c2a29e90dc221794a662b9';
        const file = await File.findById(fileId);

        if (!file) {
            console.log(`❌ File with ID ${fileId} NOT found in database.`);

            // List some files in DB to see what's there
            const allFiles = await File.find().limit(5);
            console.log('Top 5 files in DB:', allFiles.map(f => ({ id: f._id, name: f.originalName })));
        } else {
            console.log(`✅ File found in DB: ${file.originalName}`);
            console.log(`Path: ${file.path}`);

            // Check if file is absolute or relative
            const fullPath = path.isAbsolute(file.path) ? file.path : path.join(__dirname, file.path);
            const exists = await fs.pathExists(fullPath);
            console.log(`Physical file exists at ${fullPath}: ${exists}`);

            if (!exists) {
                // Check relative to back-end root
                const altPath = path.join('d:\\GITHUB-2\\converter-tool\\converter-tool-back-end', file.path);
                console.log(`Trying alt path: ${altPath}`);
                console.log(`Physical file exists at alt: ${await fs.pathExists(altPath)}`);
            }
        }
    } catch (err) {
        console.error('Error during check:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

checkFile();
