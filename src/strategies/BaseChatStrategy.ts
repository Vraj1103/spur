import { Message } from "../entities/Message.js";

export abstract class BaseChatStrategy {
  protected userId: string;
  protected memory: Message[];
  protected dbSession: any; // TypeORM DataSource or Repository

  constructor(userId: string, memory: Message[], dbSession: any) {
    this.userId = userId;
    this.memory = memory;
    this.dbSession = dbSession;
  }

  abstract generateResponse(
    userQuery: string
  ): AsyncGenerator<string, void, unknown>;
}
