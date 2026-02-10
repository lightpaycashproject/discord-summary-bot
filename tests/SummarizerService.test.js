const SummarizerService = require('../src/services/SummarizerService');
const axios = require('axios');

jest.mock('axios');

describe('SummarizerService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call LLM API with correct parameters', async () => {
    const mockResponse = {
      data: {
        choices: [
          { message: { content: 'This is a summary.' } }
        ]
      }
    };
    axios.post.mockResolvedValue(mockResponse);

    const summary = await SummarizerService.summarize('Chat log content here');
    
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({
        model: expect.any(String),
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: expect.stringContaining('Chat log content here') })
        ])
      }),
      expect.any(Object)
    );
    expect(summary).toBe('This is a summary.');
  });

  it('should handle API errors gracefully', async () => {
    axios.post.mockRejectedValue(new Error('API Error'));
    const summary = await SummarizerService.summarize('content');
    expect(summary).toBe('Failed to generate summary due to an API error.');
  });

  it('should return default message for empty content', async () => {
    const summary = await SummarizerService.summarize('');
    expect(summary).toBe('No content to summarize.');
  });
});
