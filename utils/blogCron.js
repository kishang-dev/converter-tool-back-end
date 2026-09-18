const cron = require('node-cron');
const { generateNextToolBlog } = require('./geminiBlogGenerator');

function initBlogCron() {
    // Schedule task to run every day at 10:00 AM server local time ('0 10 * * *')
    console.log('⏰ [Cron Service] Initializing Daily 10:00 AM Auto-Blog Scheduler...');
    
    cron.schedule('0 10 * * *', async () => {
        console.log('⏰ [Cron Service] Morning 10:00 AM trigger activated! Running automated Gemini blog upload...');
        try {
            const blog = await generateNextToolBlog();
            console.log(`🎉 [Cron Service] Successfully published daily tool blog: "${blog.title}"`);
        } catch (error) {
            console.error('❌ [Cron Service] Daily blog generation failed:', error.message);
        }
    });
}

module.exports = { initBlogCron };
