import { AppDataSource } from "../data-source.js";
import { Conversation } from "../entities/Conversation.js";
import { Message, SenderType } from "../entities/Message.js";

export class ChatService {
  private conversationRepository = AppDataSource.getRepository(Conversation);
  private messageRepository = AppDataSource.getRepository(Message);

  async createConversation(
    metadata?: Record<string, any>
  ): Promise<Conversation> {
    const conversation = this.conversationRepository.create({ metadata });
    return await this.conversationRepository.save(conversation);
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
    return await this.messageRepository.save(message);
  }

  async getHistory(conversationId: string): Promise<Message[]> {
    return await this.messageRepository.find({
      where: { conversationId },
      order: { timestamp: "ASC" },
    });
  }
}
