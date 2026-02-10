const scraper = require("./src/services/ScraperService");

async function test() {
  const urls = [
    "https://x.com/derteil00/status/2020857102021914803", // Real tweet with quote
    "https://x.com/saylor/status/2020846107685695931",   // The quoted tweet
    "https://x.com/elonmusk/status/1888806208643354714" // Potential thread/deleted/invalid check
  ];
  
  for (const url of urls) {
    console.log(`\n--- Testing: ${url} ---`);
    try {
      const result = await scraper.scrapeTweet(url);
      console.log("SUCCESS:");
      console.log(result);
    } catch (e) {
      console.error("FAILED:", e.message);
    }
  }
}

test();
