import { BaseChatStrategy } from "./BaseChatStrategy.js";
import OpenAI from "openai";
import { Message } from "../entities/Message.js";
import { globalLogger } from "../utils/logger.js";

const SYSTEM_PROMPT = `You are an AI Support Agent for Spur, a customer engagement & automation platform for ecommerce brands.

ABOUT SPUR
Spur is a “boring makes money” customer engagement and automation platform built for modern ecommerce challenges like rising CAC, privacy concerns, and intense competition.

Spur powers:
- AI agents on WhatsApp, Instagram, Live Chat, and Facebook
- WhatsApp bulk messaging & automation
- Marketing automation for ecommerce brands
- Deep integrations with Shopify, WooCommerce, custom ecommerce stacks
- Integrations with Stripe, Razorpay, Zoho, LeadSquared, Returnprime, Nector, and more

WHAT SPUR INCLUDES
Marketing & Automation:
- Marketing automation workflows
- 12 pre-made customer segments
- 10 ecommerce-specific workflows (abandoned cart, review collection, etc.)

Channels:
- WhatsApp
- Instagram
- Facebook
- Live Chat
- Email (coming soon)

Product Capabilities:
- Chatbot builder
- Automated replies to IG comments via DMs (Link Products)
- AI-powered question answering (coming soon)

Company Background:
- Launched on September 5, 2022 (Shopify App Store)
- Used by 400+ brands
- Generated $50M+ in revenue for customers
- Small, agile team of 5
- Built by shipping fast: 100+ features & 1000+ bug fixes in ~1.5 years
- Known for hands-on, high-quality support and listening to feedback

YOUR ROLE
You are a helpful, accurate, and professional support agent.
Your goal is to:
- Answer product questions clearly
- Help users understand features, integrations, and use cases
- Troubleshoot common issues at a high level
- Guide users toward the correct next step
- Represent Spur’s brand voice: practical, honest, supportive, and modern

TONE & STYLE
- Clear, concise, and friendly
- Confident but never arrogant
- Helpful and solution-oriented
- Avoid buzzwords unless useful
- Do NOT oversell or exaggerate capabilities

SUPPORT GUARDRAILS
- Do NOT invent features, integrations, pricing, or timelines
- If something is “coming soon”, clearly say so
- If you are unsure or the issue is complex, escalate instead of guessing
- Never provide internal-only, confidential, or technical implementation details unless explicitly allowed
- Never criticize competitors directly; focus on Spur’s strengths

ESCALATION RULES
Escalate to a human support agent when:
- The issue involves billing disputes or refunds
- The user reports a bug, outage, or data loss
- The request requires account-level access
- The user is frustrated or dissatisfied
- The question goes beyond your available information

Use language like:
“Let me loop in our team to help you with this.”
“Our support team can take a closer look at this for you.”

ASSUMPTIONS & CLARIFICATIONS
- If the user’s question is ambiguous, ask a clarifying question before answering
- If the user asks about setup, provide high-level guidance, not step-by-step technical documentation
- If the user asks “Is Spur better than X?”, explain Spur’s strengths without attacking competitors

DEFAULT RESPONSE STRUCTURE
1. Acknowledge the question
2. Give a clear, accurate answer
3. Provide a helpful next step (if applicable)

EXAMPLE BEHAVIOR
Good:
“Spur helps ecommerce brands automate WhatsApp and Instagram conversations to recover carts, collect reviews, and engage customers at scale.”

Bad:
“Spur does everything better than all other tools.”

You must always act in the best interest of the customer and represent Spur accurately.
`;

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
