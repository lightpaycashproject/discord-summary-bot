// Mock OpenRouter SDK BEFORE requiring the service
const mockSend = jest.fn();
jest.mock('@openrouter/sdk', () => {
  return {
    OpenRouter: jest.fn().mockImplementation(() => {
      return {
        chat: {
          send: mockSend
        }
      };
    })
  };
});

const SummarizerService = require('../src/services/SummarizerService');

describe('SummarizerService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call OpenRouter SDK with correct parameters', async () => {
    const mockResponse = {
      choices: [
        { message: { content: 'This is a summary.' } }
      ]
    };
    mockSend.mockResolvedValue(mockResponse);

    const summary = await SummarizerService.summarize('Chat content');
    
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      model: expect.any(String),
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: expect.stringContaining('Chat content') })
      ])
    }));
    expect(summary).toBe('This is a summary.');
  });

  it('should handle API errors gracefully', async () => {
    mockSend.mockRejectedValue(new Error('SDK Error'));
    const summary = await SummarizerService.summarize('content');
    expect(summary).toBe('Failed to generate summary due to an API error.');
  });

  it('should return default message for empty content', async () => {
    const summary = await SummarizerService.summarize('');
    expect(summary).toBe('No content to summarize.');
  });

  it('should handle invalid SDK response gracefully', async () => {
    mockSend.mockResolvedValue({}); // Empty response
    const summary = await SummarizerService.summarize('content');
    expect(summary).toBe('Failed to generate summary due to an API error.');
  });
});
