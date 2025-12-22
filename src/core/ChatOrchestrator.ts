import { ChatService } from "../services/ChatService.js";
import { ChatType } from "../strategies/ChatType.js";
import { ChatStrategyFactory } from "../strategies/ChatStrategyFactory.js";
import { Message } from "../entities/Message.js";
import { globalLogger } from "../utils/logger.js";
import OpenAI from "openai";

export class ChatOrchestrator {
  private chatService: ChatService;
  private userId: string;
  private conversationId: string;
  private openai: OpenAI;

  constructor(
    chatService: ChatService,
    userId: string,
    conversationId: string
  ) {
    this.chatService = chatService;
    this.userId = userId;
    this.conversationId = conversationId;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  private async generateTitle(message: string): Promise<void> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates concise titles for chat conversations based on the first user message. The title should be 3-5 words max. Do not use quotes.",
          },
          {
            role: "user",
            content: `Generate a title for this message: "${message}"`,
          },
        ],
        max_tokens: 10,
      });

      const title = response.choices[0]?.message?.content?.trim();
      if (title) {
        await this.chatService.updateTitle(this.conversationId, title);
        globalLogger.debug("Generated conversation title", {
          conversationId: this.conversationId,
          title,
        });
      }
    } catch (error: any) {
      globalLogger.warn("Failed to generate conversation title", {
        error: error.message,
        conversationId: this.conversationId,
      });
    }
  }

  async *processMessage(
    message: string,
    chatType: ChatType
  ): AsyncGenerator<string, void, unknown> {
    // 1. PRE-PROCESSING: Save User Message
    await this.chatService.addMessage(this.conversationId, "user", message);

    // 2. CONTEXT LOADING: Fetch Memory
    const memory = await this.chatService.getHistory(this.conversationId);

    // Check if this is the first message (memory length will be 1, just the message we added)
    if (memory.length === 1) {
      // Generate title in background - don't await to avoid blocking response
      this.generateTitle(message).catch((err) =>
        globalLogger.error("Background title generation failed", {
          error: err.message,
        })
      );
    }

    // 3. FACTORY: Get the right strategy
    const strategy = ChatStrategyFactory.getStrategy(
      chatType,
      this.userId,
      memory,
      this.chatService // Pass chatService as dbSession
    );

    // 4. EXECUTION: Run the strategy and stream
    let fullResponse = "";
    try {
      for await (const chunk of strategy.generateResponse(message)) {
        yield chunk; // Stream to client
        // Parse chunk for saving (only text content)
        if (chunk.startsWith("data: ")) {
          const content = chunk.replace("data: ", "").replace("\n\n", "");
          if (
            !content.startsWith("[") &&
            !content.includes("{") &&
            content !== "STANDARD_STRATEGY" &&
            content !== "RAG_STRATEGY" &&
            content !== "AGENT_STRATEGY"
          ) {
            fullResponse += content;
          }
        }
      }
    } catch (error) {
      // Handle errors gracefully
      yield "[ERROR]\n\n";
      yield `data: ${JSON.stringify({
        message: "An error occurred while generating the response.",
      })}\n\n`;
      yield "[DONE]\n\n";
      return;
    }

    // 5. POST-PROCESSING: Save AI Response
    if (fullResponse) {
      await this.chatService.addMessage(
        this.conversationId,
        "ai",
        fullResponse
      );
      globalLogger.debug("Saved AI response to history", {
        conversationId: this.conversationId,
        responseLength: fullResponse.length,
      });
    }
  }
}
