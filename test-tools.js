process.env.GEMINI_API_KEY = "AQ.Ab8RN6LLEQ1ECwS1_-rpR_duzu4QRA741SlKsH_4Il3-m6M5gg";
const { generateBlogCoverImage } = require("./utils/blogImageGenerator");
const fs = require("fs");

async function run() {
    var tools = [
        { name: "Split PDF", cat: "pdf", route: "/split-pdf", desc: "Separate PDF pages or extract individual pages into standalone PDFs.",
          tagline: "Extract Pages. Save What Matters.", bullets: ["Split by Range","Extract Selected Pages","Preview Before Saving","Fast, Secure & Easy","100% Free to Use"] },
        { name: "Merge PDF", cat: "pdf", route: "/merge-pdf", desc: "Combine multiple PDF documents into one single file online for free.",
          tagline: "Combine. Organize. Done.", bullets: ["Unlimited PDF Merging","Drag & Drop Reorder","Preserve Original Quality","Fast & Secure","100% Free to Use"] },
        { name: "Compress PDF", cat: "pdf", route: "/compress-pdf", desc: "Shrink PDF file size while retaining crystal clear quality.",
          tagline: "Smaller Files. Same Quality.", bullets: ["3 Compression Levels","Batch Compress PDFs","Preview Before Download","Lossless Quality","100% Free to Use"] }
    ];
    for (var i = 0; i < tools.length; i++) {
        var t = tools[i];
        console.log("\n--- Testing: " + t.name + " ---");
        try {
            var f = await generateBlogCoverImage(t.name, t.cat, t.name.toLowerCase().replace(/[^a-z0-9]+/g,"-") + "-test", {
                routeUrl: t.route, tagline: t.tagline, description: t.desc, bullets: t.bullets
            });
            var size = fs.statSync("./uploads/" + f).size;
            console.log("OK: " + f + " (" + size + " bytes)");
            console.log("View: http://localhost:5000/uploads/" + f);
        } catch(e) { console.error("FAIL: " + e.message); }
    }
}
run();
