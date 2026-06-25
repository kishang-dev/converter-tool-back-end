const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        mongoose.set('bufferCommands', false);
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log(`✅ MongoDB Connected Successfully: ${conn.connection.host}`);
        console.log(`📁 Database: ${conn.connection.name}`);
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        console.error("💡 Make sure MongoDB is running on your system");
        console.error("💡 Check your MONGODB_URI in .env file");
        // process.exit(1); // Removed to allow server to continue without DB
    }
};

module.exports = connectDB;
