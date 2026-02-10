// Mock DatabaseService BEFORE everything
jest.mock('../src/services/DatabaseService', () => {
  return {
    getCachedSummary: jest.fn(),
    saveSummary: jest.fn(),
    getCachedTweet: jest.fn(),
    saveTweet: jest.fn()
  };
});

// Mock OpenRouter SDK
const mockSend = jest.fn();
jest.mock('@openrouter/sdk', () => {
  return {
    OpenRouter: jest.fn().mockImplementation(() => {
      return { chat: { send: mockSend } };
    })
  };
});

const SummarizerService = require('../src/services/SummarizerService');
const db = require('../src/services/DatabaseService');

describe('SummarizerService with Caching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call DB for cached summary', () => {
    db.getCachedSummary.mockReturnValue('Cached summary');
    const result = SummarizerService.getCachedSummary('chan1', 'msg1');
    expect(result).toBe('Cached summary');
    expect(db.getCachedSummary).toHaveBeenCalledWith('chan1', 'msg1');
  });

  it('should call SDK and return summary (non-streaming)', async () => {
    const mockResponse = { choices: [{ message: { content: 'Summary text' } }] };
    mockSend.mockResolvedValue(mockResponse);

    const summary = await SummarizerService.summarize('Chat content');
    
    expect(summary).toBe('Summary text');
    expect(mockSend).toHaveBeenCalled();
  });

  it('should save summary to DB', () => {
    SummarizerService.saveSummary('chan1', 'msg1', 'Summary text');
    expect(db.saveSummary).toHaveBeenCalledWith('chan1', 'msg1', 'Summary text');
  });

  it('should handle API errors', async () => {
    mockSend.mockRejectedValue(new Error('API Fail'));
    const summary = await SummarizerService.summarize('content');
    expect(summary).toBe('Failed to generate summary due to an API error.');
  });
});
