const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`✅ MongoDB Connected Successfully: ${conn.connection.host}`);
        console.log(`📁 Database: ${conn.connection.name}`);
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        console.error("💡 Make sure MongoDB is running on your system");
        console.error("💡 Check your MONGODB_URI in .env file");
        process.exit(1);
    }
};

module.exports = connectDB;
