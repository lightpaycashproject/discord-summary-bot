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

    this.systemPrompt = `You are an expert Discord conversation summarizer. 
Your goal is to provide a highly readable, structured, and visually appealing summary using full Discord Markdown capabilities:
- Use **bolding** for emphasis on names, key terms, or dates.
- Use bullet points or numbered lists for clear structure.
- Use > quotes for important direct statements.
- Use \`inline code\` or \`\`\`code blocks\`\`\` for technical details or links.
- Group the summary into logical sections like ## 📌 Main Topics and ## ✅ Decisions/Actions.

Mention key participants and summarize the context of any X.com/Twitter threads provided.
IMPORTANT: If you use an internal thinking process, wrap it in <think> tags. 
The final user-visible output must NOT contain thinking tags or their content.`;
  }

  /**
   * Summarizes the provided content using the OpenRouter SDK with streaming.
   * @param {string} content - The text to summarize.
   * @param {Function} onUpdate - Callback for filtered text updates.
   * @returns {Promise<string>} - The final summarized text.
   */
  async summarize(content, onUpdate = null) {
    if (!content || content.trim().length === 0) {
      return "No content to summarize.";
    }

    try {
      const response = await this.openRouter.chat.send({
        model: llm.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: `Summarize the following conversation:\n\n${content}` }
        ],
        stream: !!onUpdate
      });

      if (onUpdate) {
        let fullText = '';
        let isThinking = false;
        let buffer = '';

        for await (const part of response) {
          const chunk = part.choices[0]?.delta?.content || '';
          buffer += chunk;

          // Process thinking tags filtering in the stream
          // This is a simple state-machine for the stream
          while (buffer.length > 0) {
            if (!isThinking) {
              const startIdx = buffer.indexOf('<think>');
              if (startIdx !== -1) {
                // Output everything before the tag
                const clearText = buffer.substring(0, startIdx);
                fullText += clearText;
                if (clearText) onUpdate(fullText);
                
                isThinking = true;
                buffer = buffer.substring(startIdx + 7);
              } else {
                // No think tag yet. Check if we have a partial '<' at the end to avoid breaking tags
                const lastBracket = buffer.lastIndexOf('<');
                if (lastBracket !== -1 && lastBracket > buffer.length - 7) {
                  const safePart = buffer.substring(0, lastBracket);
                  fullText += safePart;
                  if (safePart) onUpdate(fullText);
                  buffer = buffer.substring(lastBracket);
                  break; 
                } else {
                  fullText += buffer;
                  onUpdate(fullText);
                  buffer = '';
                }
              }
            } else {
              const endIdx = buffer.indexOf('</think>');
              if (endIdx !== -1) {
                isThinking = false;
                buffer = buffer.substring(endIdx + 8);
              } else {
                // Still thinking, discard buffer
                buffer = '';
                break;
              }
            }
          }
        }
        return fullText.trim();
      } else {
        // Standard non-streaming fallback
        const content = response.choices[0]?.message?.content || '';
        return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      }
    } catch (error) {
      console.error('Error summarizing content:', error.message);
      return 'Failed to generate summary due to an API error.';
    }
  }
}

module.exports = new SummarizerService();
