const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        // bufferCommands: true so queries queue while connecting instead of failing instantly
        mongoose.set('bufferCommands', true);

        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error('MONGODB_URI is not defined in environment variables');
        }

        console.log(`🔌 Connecting to MongoDB...`);

        const conn = await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 30000, // 30s — Atlas can be slow on first connect
            socketTimeoutMS: 45000,
        });

        console.log(`✅ MongoDB Connected Successfully: ${conn.connection.host}`);
        console.log(`📁 Database: ${conn.connection.name}`);
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        console.error("❌ Full error:", err.name, err.code || '');
        if (err.message && err.message.includes('ETIMEDOUT')) {
            console.error("💡 Atlas IP Whitelist: Go to MongoDB Atlas → Network Access → Add IP Address → Add 0.0.0.0/0 (allow all)");
        }
        if (err.message && err.message.includes('authentication')) {
            console.error("💡 Check your Atlas username/password in MONGODB_URI");
        }
        // Don't exit — server continues, DB operations will fail with clear error
    }
};

module.exports = connectDB;
