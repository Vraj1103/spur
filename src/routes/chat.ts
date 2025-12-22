import { Router, Request, Response } from "express";
import { ChatService } from "../services/ChatService.js";
import { ChatOrchestrator } from "../core/ChatOrchestrator.js";
import { ChatType } from "../strategies/ChatType.js";
import { globalLogger } from "../utils/logger.js";

const router = Router();

// Create a new conversation explicitly
router.post("/conversation", async (req: Request, res: Response) => {
  try {
    const chatService = new ChatService();
    const conversation = await chatService.createConversation();

    globalLogger.info("Created new conversation explicitly", {
      conversationId: conversation.id,
    });

    res.json({
      conversationId: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
    });
  } catch (error: any) {
    globalLogger.error("Failed to create conversation", {
      error: error.message,
    });
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Main chat endpoint: handles both streaming and non-streaming responses
router.post("/message", async (req: Request, res: Response) => {
  const { message, sessionId } = req.body;

  globalLogger.info("Chat message request", {
    message: message?.substring(0, 100),
    sessionId,
  });

  // Input validation
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    globalLogger.warn("Invalid message input", { message });
    return res
      .status(400)
      .json({ error: "Message is required and cannot be empty." });
  }

  const trimmedMessage = message.trim();
  if (trimmedMessage.length > 1000) {
    globalLogger.warn("Message too long", { length: trimmedMessage.length });
    return res
      .status(400)
      .json({ error: "Message is too long. Max 1000 characters." });
  }

  const chatService = new ChatService();
  let conversationId = sessionId;

  // Create or retrieve conversation
  if (!conversationId) {
    const conversation = await chatService.createConversation();
    conversationId = conversation.id;
    globalLogger.debug("New conversation created", { conversationId });
  } else {
    const existing = await chatService.getConversation(conversationId);
    if (!existing) {
      const conversation = await chatService.createConversation();
      conversationId = conversation.id;
      globalLogger.debug("New conversation created for provided sessionId", {
        conversationId,
      });
    }
  }

  const orchestrator = new ChatOrchestrator(
    chatService,
    "anonymous", // Placeholder user ID
    conversationId
  );

  const isStreaming = req.query.stream === "true";

  if (isStreaming) {
    // Streaming response using Server-Sent Events
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      for await (const chunk of orchestrator.processMessage(
        trimmedMessage,
        ChatType.STANDARD
      )) {
        res.write(chunk);
      }
      res.end();
      globalLogger.info("Streaming response completed", { conversationId });
    } catch (error: any) {
      globalLogger.error("Streaming response error", {
        error: error.message,
        conversationId,
      });
      res.write("[ERROR]\n\n");
      res.write(
        `data: ${JSON.stringify({ message: "Internal server error." })}\n\n`
      );
      res.write("[DONE]\n\n");
      res.end();
    }
  } else {
    // Non-streaming response: collect full text and return JSON
    let fullResponse = "";
    try {
      for await (const chunk of orchestrator.processMessage(
        trimmedMessage,
        ChatType.STANDARD
      )) {
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
      globalLogger.info("Non-streaming response completed", {
        conversationId,
        responseLength: fullResponse.length,
      });
      res.json({ reply: fullResponse, sessionId: conversationId });
    } catch (error: any) {
      globalLogger.error("Non-streaming response error", {
        error: error.message,
        conversationId,
      });
      res.status(500).json({ error: "Failed to generate response." });
    }
  }
});

// Get all conversations (for sidebar)
router.get("/conversations", async (req: Request, res: Response) => {
  try {
    const chatService = new ChatService();
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const conversations = await chatService.getConversationsList(limit, offset);
    res.json(conversations);
  } catch (error: any) {
    globalLogger.error("Failed to fetch conversations", {
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Get specific conversation history
router.get("/conversation/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Conversation ID is required" });
    }

    const chatService = new ChatService();
    // We use getHistory to leverage Redis caching
    const messages = await chatService.getHistory(id);

    // If no messages found, check if conversation exists at all
    if (messages.length === 0) {
      const conversation = await chatService.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
    }

    res.json({ conversationId: id, messages });
  } catch (error: any) {
    globalLogger.error("Failed to fetch conversation history", {
      error: error.message,
      conversationId: req.params.id,
    });
    res.status(500).json({ error: "Failed to fetch conversation history" });
  }
});

// Delete conversation
router.delete("/conversation/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Conversation ID is required" });
    }

    const chatService = new ChatService();
    const deleted = await chatService.deleteConversation(id);

    if (!deleted) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    globalLogger.info("Conversation deleted", { conversationId: id });
    res.json({
      message: "Conversation deleted successfully",
      conversationId: id,
    });
  } catch (error: any) {
    globalLogger.error("Failed to delete conversation", {
      error: error.message,
      conversationId: req.params.id,
    });
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

export default router;
