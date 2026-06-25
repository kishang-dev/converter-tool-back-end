const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');

async function checkFile() {
    try {
        await mongoose.connect('mongodb://localhost:27017/pdf-tool');
        const File = mongoose.model('File', new mongoose.Schema({
            path: String,
            originalName: String
        }));

        const fileId = '69c2a29e90dc221794a662b9';
        const file = await File.findById(fileId);

        if (!file) {
            console.log('NOT_FOUND');
        } else {
            const fullPath = path.isAbsolute(file.path) ? file.path : path.join(__dirname, file.path);
            const exists = await fs.pathExists(fullPath);
            console.log(`FOUND|${file.originalName}|${fullPath}|${exists}`);
        }
    } catch (err) {
        console.error('ERROR:', err.message);
    } finally {
        await mongoose.disconnect();
    }
}

checkFile();
