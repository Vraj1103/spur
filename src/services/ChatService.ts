import { AppDataSource } from "../data-source.js";
import { Conversation } from "../entities/Conversation.js";
import { Message, SenderType } from "../entities/Message.js";
import { redisClient, isRedisAvailable } from "../utils/redis.js";
import { globalLogger } from "../utils/logger.js";

export class ChatService {
  private conversationRepository = AppDataSource.getRepository(Conversation);
  private messageRepository = AppDataSource.getRepository(Message);

  async createConversation(
    metadata?: Record<string, any>,
    title: string = "New Conversation"
  ): Promise<Conversation> {
    const conversation = this.conversationRepository.create({
      metadata,
      title,
    });
    const saved = await this.conversationRepository.save(conversation);
    await this.invalidateConversationListCache();
    return saved;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return await this.conversationRepository.findOne({
      where: { id },
      relations: ["messages"],
      order: {
        messages: {
          timestamp: "ASC",
        },
      },
    });
  }

  async addMessage(
    conversationId: string,
    sender: SenderType,
    content: string
  ): Promise<Message> {
    const message = this.messageRepository.create({
      conversationId,
      sender,
      content,
    });
    const savedMessage = await this.messageRepository.save(message);

    if (isRedisAvailable()) {
      try {
        const cacheKey = `chat:${conversationId}:history`;
        // Only append if the cache exists to maintain consistency
        // If it doesn't exist, the next getHistory will populate it fully
        const exists = await redisClient.exists(cacheKey);
        if (exists) {
          await redisClient.rPush(cacheKey, JSON.stringify(savedMessage));
          await redisClient.expire(cacheKey, 3600); // Refresh TTL
        }
      } catch (error) {
        globalLogger.warn("Failed to update Redis cache", {
          conversationId,
        });
      }
    }

    return savedMessage;
  }

  async getHistory(conversationId: string): Promise<Message[]> {
    const cacheKey = `chat:${conversationId}:history`;

    if (isRedisAvailable()) {
      try {
        const cachedData = await redisClient.lRange(cacheKey, 0, -1);
        if (cachedData && cachedData.length > 0) {
          return cachedData.map((item) => JSON.parse(item));
        }
      } catch (error) {
        globalLogger.warn("Failed to fetch from Redis cache", {
          conversationId,
        });
      }
    }

    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { timestamp: "ASC" },
    });

    if (isRedisAvailable() && messages.length > 0) {
      try {
        const multi = redisClient.multi();
        // Clear any potential partial data (though unlikely if we checked lRange)
        multi.del(cacheKey);
        messages.forEach((msg) => multi.rPush(cacheKey, JSON.stringify(msg)));
        multi.expire(cacheKey, 3600); // 1 hour
        await multi.exec();
      } catch (error) {
        globalLogger.warn("Failed to set Redis cache", { conversationId });
      }
    }

    return messages;
  }

  async getConversationsList(
    limit: number = 50,
    offset: number = 0
  ): Promise<any[]> {
    const cacheKey = `chat:conversations:list:${limit}:${offset}`;

    if (isRedisAvailable()) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        globalLogger.warn("Failed to fetch conversation list from Redis", {
          error,
        });
      }
    }

    // Fetch just the conversation details for the sidebar
    const conversations = await this.conversationRepository.find({
      select: ["id", "title", "createdAt"],
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    const result = conversations.map((conv) => ({
      id: conv.id,
      title: conv.title || "New Conversation",
      createdAt: conv.createdAt,
    }));

    if (isRedisAvailable()) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(result), {
          EX: 300, // 5 minutes
        });
      } catch (error) {
        globalLogger.warn("Failed to set conversation list cache", { error });
      }
    }

    return result;
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.conversationRepository.update(id, { title });
    await this.invalidateConversationListCache();
  }

  async deleteConversation(id: string): Promise<boolean> {
    // Manually delete messages first to avoid FK constraint issues if CASCADE isn't set up
    await this.messageRepository.delete({ conversationId: id });

    const result = await this.conversationRepository.delete(id);

    if (result.affected && result.affected > 0) {
      // Clear Redis cache for this conversation
      if (isRedisAvailable()) {
        try {
          await redisClient.del(`chat:${id}:history`);
        } catch (error) {
          globalLogger.warn(
            "Failed to delete conversation history from Redis",
            {
              conversationId: id,
            }
          );
        }
      }

      // Invalidate the list cache since an item was removed
      await this.invalidateConversationListCache();
      return true;
    }
    return false;
  }

  private async invalidateConversationListCache() {
    if (!isRedisAvailable()) return;
    try {
      const keys: string[] = [];
      const iterator = redisClient.scanIterator({
        MATCH: "chat:conversations:list:*",
      });

      for await (const key of iterator) {
        // The key from scanIterator might be coming as string[] in some type definitions
        // or just string. Let's handle it safely.
        if (Array.isArray(key)) {
          keys.push(...key);
        } else {
          keys.push(key as unknown as string);
        }
      }

      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (error: any) {
      globalLogger.warn("Failed to invalidate conversation list cache", {
        error: error.message,
      });
    }
  }
}
