const ScraperService = require('../src/services/ScraperService');
const puppeteer = require('puppeteer');

// Mock Puppeteer
jest.mock('puppeteer');

describe('ScraperService', () => {
  let mockBrowser, mockPage;

  beforeEach(() => {
    mockPage = {
      goto: jest.fn().mockResolvedValue(true),
      evaluate: jest.fn(),
      close: jest.fn().mockResolvedValue(true),
    };

    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(true),
    };

    puppeteer.launch.mockResolvedValue(mockBrowser);
    ScraperService.browser = null; // Reset browser instance
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize browser successfully', async () => {
    await ScraperService.init();
    expect(puppeteer.launch).toHaveBeenCalled();
  });

  it('should scrape tweet content successfully', async () => {
    mockPage.evaluate.mockResolvedValueOnce('This is a tweet text') // tweet content
      .mockResolvedValueOnce('[Quote Tweet]: quoted text'); // quote content

    const content = await ScraperService.scrapeTweet('https://x.com/user/status/123456');
    
    expect(mockPage.goto).toHaveBeenCalledWith(expect.stringContaining('nitter.poast.org'), expect.any(Object));
    expect(content).toContain('Tweet: This is a tweet text');
    expect(content).toContain('[Quote Tweet]: quoted text');
  });

  it('should handle invalid URLs gracefully', async () => {
    const result = await ScraperService.scrapeTweet('invalid-url');
    expect(result).toContain('Invalid URL');
  });
});
