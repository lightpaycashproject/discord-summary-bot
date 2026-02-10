const { OpenRouter } = require("@openrouter/sdk");
const { llm } = require("../../config");
const db = require("./DatabaseService");

class SummarizerService {
  constructor() {
    this.openRouter = new OpenRouter({
      apiKey: llm.apiKey,
      defaultHeaders: {
        "HTTP-Referer":
          "https://github.com/lightpaycashproject/discord-summary-bot",
        "X-Title": "Discord Summary Bot",
      },
    });

    this.systemPrompt = `You are an expert Discord conversation summarizer, specialized in crypto communities, alpha discovery, and project tracking.

Your goal is to provide a highly readable, structured summary using full Discord Markdown:
- Use **bolding** for emphasis on names, key terms, or dates.
- Use bullet points or numbered lists.
- Use > quotes for important statements.
- Group into sections: ## 📌 Main Topics, ## 💎 Alpha & Crypto News, ## ✅ Decisions/Actions, and ## 👤 User Contributions.

CRITICAL INSTRUCTIONS:
1. **User Contributions**: In the ## 👤 User Contributions section, briefly list what each significant participant contributed to the discussion.
2. **Alpha & Projects**: Pay special attention to any "alpha", crypto signals, price discussions, new project mentions, or technical leaks. Highlight these in the ## 💎 Alpha & Crypto News section.
3. **X.com Context**: Integrate the provided X.com/Twitter thread context into the relevant sections. Always include image URLs provided in the context so they embed in the final summary.

IMPORTANT: Wrap internal reasoning in <think> tags. The final output must NOT contain these tags.`;
  }

  getCachedSummary(channelId, lastMessageId) {
    return db.getCachedSummary(channelId, lastMessageId);
  }

  saveSummary(
    channelId,
    lastMessageId,
    summaryText,
    guildId,
    userId,
    tokens,
    cost,
    model,
  ) {
    db.saveSummary(
      channelId,
      lastMessageId,
      summaryText,
      guildId,
      userId,
      tokens,
      cost,
      model,
    );
  }

  /**
   * Summarizes the provided content using the OpenRouter SDK with streaming.
   * @param {string} content - The text to summarize.
   * @param {Function} onUpdate - Callback for filtered text updates.
   * @returns {Promise<Object>} - Object containing final summary, usage, and model.
   */
  async summarize(content, onUpdate = null) {
    if (!content || content.trim().length === 0) {
      return { summary: "No content to summarize.", usage: null, model: null };
    }

    try {
      const response = await this.openRouter.chat.send({
        model: llm.model,
        messages: [
          { role: "system", content: this.systemPrompt },
          {
            role: "user",
            content: `Summarize the following conversation:\n\n${content}`,
          },
        ],
        stream: !!onUpdate,
      });

      let fullText = "";
      let usage = null;
      let usedModel = llm.model;

      if (onUpdate) {
        let isThinking = false;
        let buffer = "";

        for await (const part of response) {
          // Track usage and model if provided in stream
          if (part.usage) usage = part.usage;
          if (part.model) usedModel = part.model;

          const chunk = part.choices[0]?.delta?.content || "";
          buffer += chunk;

          while (buffer.length > 0) {
            if (!isThinking) {
              const startIdx = buffer.indexOf("<think>");
              if (startIdx !== -1) {
                const clearText = buffer.substring(0, startIdx);
                fullText += clearText;
                if (clearText) onUpdate(fullText);

                isThinking = true;
                buffer = buffer.substring(startIdx + 7);
              } else {
                const lastBracket = buffer.lastIndexOf("<");
                if (lastBracket !== -1 && lastBracket > buffer.length - 7) {
                  const safePart = buffer.substring(0, lastBracket);
                  fullText += safePart;
                  if (safePart) onUpdate(fullText);
                  buffer = buffer.substring(lastBracket);
                  break;
                } else {
                  fullText += buffer;
                  onUpdate(fullText);
                  buffer = "";
                }
              }
            } else {
              const endIdx = buffer.indexOf("</think>");
              if (endIdx !== -1) {
                isThinking = false;
                buffer = buffer.substring(endIdx + 8);
              } else {
                buffer = "";
                break;
              }
            }
          }
        }
        return { summary: fullText.trim(), usage, model: usedModel };
      } else {
        usage = response.usage;
        usedModel = response.model || llm.model;
        const text = response.choices[0]?.message?.content || "";
        return {
          summary: text.replace(/<think>[\s\S]*?<\/think>/g, "").trim(),
          usage,
          model: usedModel,
        };
      }
    } catch (error) {
      console.error("Error summarizing content:", error.message);
      throw error;
    }
  }
}

module.exports = new SummarizerService();
