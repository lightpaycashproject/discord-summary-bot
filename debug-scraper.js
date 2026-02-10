const scraper = require("./src/services/ScraperService");

async function test() {
  const url = "https://x.com/derteil00/status/2020857102021914803";
  console.log(`Testing scraper with: ${url}`);
  try {
    const result = await scraper.scrapeTweet(url);
    console.log("--- RESULT ---");
    console.log(result);
    console.log("--- END ---");
  } catch (e) {
    console.error("Scrape failed:", e.message);
  }
}

test();
