const SummarizerService = require('../src/services/SummarizerService');
const { OpenRouter } = require('@openrouter/sdk');

// Mock OpenRouter SDK
jest.mock('@openrouter/sdk', () => {
  return {
    OpenRouter: jest.fn().mockImplementation(() => {
      return {
        chat: {
          send: jest.fn()
        }
      };
    })
  };
});

describe('SummarizerService', () => {
  let mockOpenRouterInstance;

  beforeEach(() => {
    // Get the instance created in the service
    mockOpenRouterInstance = SummarizerService.openRouter;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call OpenRouter SDK with correct parameters', async () => {
    const mockResponse = {
      choices: [
        { message: { content: 'This is a summary.' } }
      ]
    };
    mockOpenRouterInstance.chat.send.mockResolvedValue(mockResponse);

    const summary = await SummarizerService.summarize('Chat content');
    
    expect(mockOpenRouterInstance.chat.send).toHaveBeenCalledWith(expect.objectContaining({
      model: expect.any(String),
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: expect.stringContaining('Chat content') })
      ])
    }));
    expect(summary).toBe('This is a summary.');
  });

  it('should handle API errors gracefully', async () => {
    mockOpenRouterInstance.chat.send.mockRejectedValue(new Error('SDK Error'));
    const summary = await SummarizerService.summarize('content');
    expect(summary).toBe('Failed to generate summary due to an API error.');
  });

  it('should return default message for empty content', async () => {
    const summary = await SummarizerService.summarize('');
    expect(summary).toBe('No content to summarize.');
  });

  it('should handle invalid SDK response gracefully', async () => {
    mockOpenRouterInstance.chat.send.mockResolvedValue({}); // Empty response
    const summary = await SummarizerService.summarize('content');
    expect(summary).toBe('Failed to generate summary due to an API error.');
  });
});
