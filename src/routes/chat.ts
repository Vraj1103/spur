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

// Helper for UUID validation
const isValidUUID = (uuid: string) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Main chat endpoint: handles both streaming and non-streaming responses
router.post("/message", async (req: Request, res: Response) => {
  const { message, sessionId } = req.body;

  globalLogger.info("Chat message request", {
    message:
      typeof message === "string" ? message.substring(0, 100) : "INVALID_TYPE",
    sessionId,
  });

  // 1. Input Validation: Message
  if (message === undefined || message === null) {
    globalLogger.warn("Missing message input");
    return res.status(400).json({
      error: "Bad Request",
      details: "The 'message' field is required.",
    });
  }

  if (typeof message !== "string") {
    globalLogger.warn("Invalid message type", { type: typeof message });
    return res.status(400).json({
      error: "Bad Request",
      details: "The 'message' field must be a string.",
    });
  }

  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    globalLogger.warn("Empty message input");
    return res.status(400).json({
      error: "Bad Request",
      details: "The 'message' field cannot be empty or whitespace only.",
    });
  }

  if (trimmedMessage.length > 100000) {
    globalLogger.warn("Message too long", { length: trimmedMessage.length });
    return res.status(400).json({
      error: "Bad Request",
      details: `Message length exceeds limit. Maximum allowed is 100000 characters. Received: ${trimmedMessage.length}.`,
    });
  }

  // 2. Input Validation: Session ID
  if (sessionId !== undefined && sessionId !== null) {
    if (typeof sessionId !== "string") {
      globalLogger.warn("Invalid sessionId type", { type: typeof sessionId });
      return res.status(400).json({
        error: "Bad Request",
        details: "The 'sessionId' field must be a string if provided.",
      });
    }

    if (sessionId.trim() === "") {
      globalLogger.warn("Empty sessionId provided");
      return res.status(400).json({
        error: "Bad Request",
        details: "The 'sessionId' field cannot be an empty string.",
      });
    }

    if (!isValidUUID(sessionId)) {
      globalLogger.warn("Invalid sessionId format", { sessionId });
      return res.status(400).json({
        error: "Bad Request",
        details: "The 'sessionId' must be a valid UUID (v4).",
      });
    }
  }

  const chatService = new ChatService();
  let conversationId = sessionId;

  try {
    // 3. Session Handling
    if (conversationId) {
      const existing = await chatService.getConversation(conversationId);
      if (!existing) {
        globalLogger.warn("Session not found", { conversationId });
        return res.status(404).json({
          error: "Not Found",
          details: `Session ID '${conversationId}' does not exist. Please create a new conversation first.`,
        });
      }
    } else {
      // If no sessionId provided, create a new one (Auto-create mode)
      const conversation = await chatService.createConversation();
      conversationId = conversation.id;
      globalLogger.debug("New conversation created (auto)", { conversationId });
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
        // If headers are already sent, we can't send a JSON error response
        // We send a special SSE error event
        res.write("[ERROR]\n\n");
        res.write(
          `data: ${JSON.stringify({
            error: "Internal Server Error",
            details: "An error occurred during the streaming process.",
          })}\n\n`
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
        res.status(500).json({
          error: "Internal Server Error",
          details: "Failed to generate response from the AI service.",
        });
      }
    }
  } catch (error: any) {
    // Catch any unexpected errors during setup (e.g. DB connection failed)
    globalLogger.error("Chat endpoint error", { error: error.message });
    res.status(500).json({
      error: "Internal Server Error",
      details: "An unexpected error occurred while processing your request.",
    });
  }
});

// Get all conversations (for sidebar)
router.get("/conversations", async (req: Request, res: Response) => {
  try {
    const chatService = new ChatService();
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (isNaN(limit) || limit < 1) {
      return res.status(400).json({
        error: "Bad Request",
        details: "Limit must be a positive integer.",
      });
    }

    if (isNaN(offset) || offset < 0) {
      return res.status(400).json({
        error: "Bad Request",
        details: "Offset must be a non-negative integer.",
      });
    }

    const conversations = await chatService.getConversationsList(limit, offset);
    res.json(conversations);
  } catch (error: any) {
    globalLogger.error("Failed to fetch conversations", {
      error: error.message,
    });
    res.status(500).json({
      error: "Internal Server Error",
      details: "Failed to fetch conversations list.",
    });
  }
});

// Get specific conversation history
router.get("/conversation/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        error: "Bad Request",
        details: "Conversation ID is required.",
      });
    }

    if (!isValidUUID(id)) {
      return res.status(400).json({
        error: "Bad Request",
        details: "Invalid Conversation ID format. Must be a UUID.",
      });
    }

    const chatService = new ChatService();
    // We use getHistory to leverage Redis caching
    const messages = await chatService.getHistory(id);

    // If no messages found, check if conversation exists at all
    if (messages.length === 0) {
      const conversation = await chatService.getConversation(id);
      if (!conversation) {
        return res.status(404).json({
          error: "Not Found",
          details: "Conversation not found.",
        });
      }
    }

    res.json({ conversationId: id, messages });
  } catch (error: any) {
    globalLogger.error("Failed to fetch conversation history", {
      error: error.message,
      conversationId: req.params.id,
    });
    res.status(500).json({
      error: "Internal Server Error",
      details: "Failed to fetch conversation history.",
    });
  }
});

// Delete conversation
router.delete("/conversation/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        error: "Bad Request",
        details: "Conversation ID is required.",
      });
    }

    if (!isValidUUID(id)) {
      return res.status(400).json({
        error: "Bad Request",
        details: "Invalid Conversation ID format. Must be a UUID.",
      });
    }

    const chatService = new ChatService();
    const deleted = await chatService.deleteConversation(id);

    if (!deleted) {
      return res.status(404).json({
        error: "Not Found",
        details: "Conversation not found or already deleted.",
      });
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
    res.status(500).json({
      error: "Internal Server Error",
      details: "Failed to delete conversation.",
    });
  }
});

export default router;
