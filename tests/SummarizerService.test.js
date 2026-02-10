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

  it('should call OpenRouter SDK with correct parameters (non-streaming)', async () => {
    const mockResponse = {
      choices: [
        { message: { content: 'This is a summary.' } }
      ]
    };
    mockSend.mockResolvedValue(mockResponse);

    const summary = await SummarizerService.summarize('Chat content');
    expect(summary).toBe('This is a summary.');
  });

  it('should filter <think> tags in non-streaming mode', async () => {
    const mockResponse = {
      choices: [
        { message: { content: '<think>Reasoning</think>Final result' } }
      ]
    };
    mockSend.mockResolvedValue(mockResponse);

    const summary = await SummarizerService.summarize('Chat content');
    expect(summary).toBe('Final result');
  });

  it('should filter <think> tags in streaming mode', async () => {
    // Create an async generator for the stream
    const mockStream = (async function* () {
      yield { choices: [{ delta: { content: 'Part 1 ' } }] };
      yield { choices: [{ delta: { content: '<think>' } }] };
      yield { choices: [{ delta: { content: 'reasoning' } }] };
      yield { choices: [{ delta: { content: '</think>' } }] };
      yield { choices: [{ delta: { content: 'Part 2' } }] };
    })();

    mockSend.mockResolvedValue(mockStream);

    const updates = [];
    const onUpdate = (text) => updates.push(text);

    const summary = await SummarizerService.summarize('content', onUpdate);

    expect(summary).toBe('Part 1 Part 2');
    // Verify updates never contained 'reasoning'
    updates.forEach(u => expect(u).not.toContain('reasoning'));
  });

  it('should handle partial tags at the end of chunks correctly', async () => {
    const mockStream = (async function* () {
      yield { choices: [{ delta: { content: 'Part 1 ' } }] };
      yield { choices: [{ delta: { content: '<thi' } }] }; // Partial tag
      yield { choices: [{ delta: { content: 'nk>' } }] };    // Completion
      yield { choices: [{ delta: { content: 'Inside' } }] };
      yield { choices: [{ delta: { content: '</think>' } }] };
      yield { choices: [{ delta: { content: 'Part 2' } }] };
    })();

    mockSend.mockResolvedValue(mockStream);
    const updates = [];
    const summary = await SummarizerService.summarize('content', (text) => updates.push(text));

    expect(summary).toBe('Part 1 Part 2');
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
});
