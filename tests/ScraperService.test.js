const ScraperService = require('../src/services/ScraperService');
const axios = require('axios');

jest.mock('axios');

describe('ScraperService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract tweet ID correctly', () => {
    const id = ScraperService.extractTweetId('https://x.com/user/status/123456');
    expect(id).toBe('123456');
  });

  it('should scrape a single tweet successfully', async () => {
    const mockTweet = {
      author: { screen_name: 'testuser' },
      text: 'Hello world',
      quote: null,
      replying_to_status: null
    };
    axios.get.mockResolvedValueOnce({ data: { tweet: mockTweet } });

    const content = await ScraperService.scrapeTweet('https://x.com/user/status/123');
    
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/123'), expect.any(Object));
    expect(content).toBe('@testuser: Hello world');
  });

  it('should handle quoted tweets', async () => {
    const mockTweet = {
      author: { screen_name: 'userA' },
      text: 'Check this out',
      quote: {
        author: { screen_name: 'userB' },
        text: 'Original content'
      },
      replying_to_status: null
    };
    axios.get.mockResolvedValueOnce({ data: { tweet: mockTweet } });

    const content = await ScraperService.scrapeTweet('https://x.com/user/status/123');
    expect(content).toContain('@userA: Check this out');
    expect(content).toContain('[Quoting @userB]: Original content');
  });

  it('should unroll a thread (recursive fetch)', async () => {
    const tweet2 = {
      author: { screen_name: 'user' },
      text: 'Second tweet',
      replying_to_status: '111'
    };
    const tweet1 = {
      author: { screen_name: 'user' },
      text: 'First tweet',
      replying_to_status: null
    };

    axios.get
      .mockResolvedValueOnce({ data: { tweet: tweet2 } })
      .mockResolvedValueOnce({ data: { tweet: tweet1 } });

    const content = await ScraperService.scrapeTweet('https://x.com/user/status/222');
    
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(content).toContain('First tweet');
    expect(content).toContain('Second tweet');
  });

  it('should handle invalid URLs', async () => {
    const result = await ScraperService.scrapeTweet('https://google.com');
    expect(result).toContain('Error');
  });

  it('should handle API failures gracefully (empty thread)', async () => {
    axios.get.mockRejectedValue(new Error('Network error'));
    const result = await ScraperService.scrapeTweet('https://x.com/user/status/123');
    expect(result).toContain('Could not fetch tweet content');
  });

  it('should handle API returning no tweet data', async () => {
    axios.get.mockResolvedValueOnce({ data: {} });
    const result = await ScraperService.scrapeTweet('https://x.com/user/status/123');
    expect(result).toContain('Could not fetch tweet content');
  });

  it('should limit thread depth to 10', async () => {
    const mockTweet = (id, parentId) => ({
      author: { screen_name: 'user' },
      text: `Tweet ${id}`,
      replying_to_status: parentId
    });

    // Mock many tweets
    for (let i = 0; i < 15; i++) {
      axios.get.mockResolvedValueOnce({ data: { tweet: mockTweet(i, 'parent') } });
    }

    const content = await ScraperService.scrapeTweet('https://x.com/user/status/111');
    const tweets = content.split('\n---\n');
    expect(tweets.length).toBe(10);
  });

  it('should handle fatal errors in scrapeTweet', async () => {
    const spy = jest.spyOn(ScraperService, 'fetchThread').mockRejectedValueOnce(new Error('Fatal'));
    const result = await ScraperService.scrapeTweet('https://x.com/user/status/123');
    expect(result).toContain('Error fetching tweet: Fatal');
    spy.mockRestore();
  });
});
