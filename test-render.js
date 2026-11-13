process.env.GEMINI_API_KEY = "AQ.Ab8RN6LLEQ1ECwS1_-rpR_duzu4QRA741SlKsH_4Il3-m6M5gg";
const { generateBlogCoverImage } = require("./utils/blogImageGenerator");
const fs = require("fs");
const toolDetails = {
    routeUrl: "/split-pdf",
    tagline: "Extract Pages. Save What Matters.",
    description: "Split PDF pages into separate documents easily.",
    bullets: ["Split by Range", "Extract Selected Pages", "Preview Before Saving", "Fast, Secure & Easy", "100% Free to Use"]
};
generateBlogCoverImage("Split PDF", "pdf", "split-test-" + Date.now(), toolDetails)
  .then(function(f) {
    const size = fs.statSync("./uploads/" + f).size;
    console.log("SUCCESS: " + f + " (" + size + " bytes)");
    console.log("Open: http://localhost:5000/uploads/" + f);
  })
  .catch(function(e) { console.error("FAILED: " + e.message); process.exit(1); });
