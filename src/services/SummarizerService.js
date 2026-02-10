const { OpenRouter } = require('@openrouter/sdk');
const { llm } = require('../../config');

class SummarizerService {
  constructor() {
    this.openRouter = new OpenRouter({
      apiKey: llm.apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/lightpaycashproject/discord-summary-bot',
        'X-Title': 'Discord Summary Bot',
      }
    });
  }

  /**
   * Summarizes the provided content using the OpenRouter SDK.
   * @param {string} content - The text to summarize.
   * @returns {Promise<string>} - The summarized text.
   */
  async summarize(content) {
    if (!content || content.trim().length === 0) {
      return "No content to summarize.";
    }

    try {
      const response = await this.openRouter.chat.send({
        model: llm.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes Discord chat logs. Provide a concise summary of the conversation, highlighting key topics, decisions, and any external links mentioned (especially tweets). Be brief and to the point.'
          },
          {
            role: 'user',
            content: `Summarize the following conversation:\n\n${content}`
          }
        ],
        stream: false
      });

      if (response && response.choices && response.choices.length > 0) {
        return response.choices[0].message.content.trim();
      } else {
        throw new Error('Invalid response from OpenRouter SDK');
      }
    } catch (error) {
      console.error('Error summarizing content:', error.message);
      return 'Failed to generate summary due to an API error.';
    }
  }
}

module.exports = new SummarizerService();
