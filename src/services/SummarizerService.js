const axios = require('axios');
const { llm } = require('../../config');

class SummarizerService {
  /**
   * Summarizes the provided content using the configured LLM API.
   * @param {string} content - The text to summarize (includes scraped data).
   * @returns {Promise<string>} - The summarized text.
   */
  async summarize(content) {
    if (!content || content.trim().length === 0) {
      return "No content to summarize.";
    }

    try {
      const response = await axios.post(
        llm.baseURL + '/chat/completions',
        {
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
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${llm.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        return response.data.choices[0].message.content.trim();
      } else {
        throw new Error('Invalid response from LLM API');
      }
    } catch (error) {
      console.error('Error summarizing content:', error.response ? error.response.data : error.message);
      return 'Failed to generate summary due to an API error.';
    }
  }
}

module.exports = new SummarizerService();
