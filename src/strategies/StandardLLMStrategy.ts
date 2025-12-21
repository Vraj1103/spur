import { BaseChatStrategy } from "./BaseChatStrategy.js";
import OpenAI from "openai";
import { Message } from "../entities/Message.js";
import { globalLogger } from "../utils/logger.js";

const SYSTEM_PROMPT = `You are a helpful support agent for a small e-commerce store called 'Spur'. 

You have access to the full conversation history. Use it to answer follow-up questions and recall previous user queries.

Here is some information about our policies:

Shipping: We ship worldwide within 3-5 business days. Free shipping on orders over $50.

Returns: Returns accepted within 30 days with original receipt. Refunds processed within 7 days.

Support Hours: Monday to Friday, 9 AM to 5 PM EST.

Answer clearly and concisely.`;

export class StandardLLMStrategy extends BaseChatStrategy {
  private openai: OpenAI;

  constructor(userId: string, memory: Message[], dbSession: any) {
    super(userId, memory, dbSession);
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async *generateResponse(
    userQuery: string
  ): AsyncGenerator<string, void, unknown> {
    try {
      // Signal start
      yield "[CALL_TO]\n\n";
      yield "data: STANDARD_STRATEGY\n\n";

      // Build messages
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM_PROMPT },
      ];

      // Add conversation history
      // Note: The current user message is already in 'this.memory' because ChatOrchestrator saves it before calling this strategy.

      for (const msg of this.memory) {
        messages.push({
          role: msg.sender === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }

      globalLogger.debug("Sending messages to OpenAI", {
        messageCount: messages.length,
        conversationId:
          this.memory.length > 0 ? this.memory[0].conversationId : "unknown",
        allMessages: messages,
      });

      // Stream from OpenAI with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout

      const stream = await this.openai.chat.completions.create(
        {
          model: "gpt-4o",
          messages,
          stream: true,
          max_tokens: 500,
        },
        { signal: controller.signal }
      );

      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            yield `data: ${content}\n\n`;
          }
        }
        clearTimeout(timeoutId);
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === "AbortError") {
          throw new Error("Request timed out");
        }
        throw error;
      }

      // Signal completion
      yield "[DONE]\n\n";
    } catch (error: any) {
      globalLogger.error("OpenAI API error", {
        error: error.message,
        status: error.status,
        code: error.code,
      });
      let errorMessage = "Failed to generate response. Please try again.";
      if (error?.status === 429) {
        errorMessage = "Rate limit exceeded. Please wait and try again.";
      } else if (error?.status === 401) {
        errorMessage = "Invalid API key. Please check your configuration.";
      } else if (error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT") {
        errorMessage = "Request timed out. Please try again.";
      }
      yield "[ERROR]\n\n";
      yield `data: ${JSON.stringify({ message: errorMessage })}\n\n`;
      yield "[DONE]\n\n";
    }
  }
}
