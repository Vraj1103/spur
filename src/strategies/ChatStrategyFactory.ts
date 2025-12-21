import { ChatType } from "./ChatType.js";
import { BaseChatStrategy } from "./BaseChatStrategy.js";
import { StandardLLMStrategy } from "./StandardLLMStrategy.js";

export class ChatStrategyFactory {
  private static map: Map<ChatType, new (...args: any[]) => BaseChatStrategy> =
    new Map([[ChatType.STANDARD, StandardLLMStrategy]]);

  static register(
    chatType: ChatType,
    strategyClass: new (...args: any[]) => BaseChatStrategy
  ) {
    this.map.set(chatType, strategyClass);
  }

  static getStrategy(chatType: ChatType, ...args: any[]): BaseChatStrategy {
    const StrategyClass = this.map.get(chatType);
    if (!StrategyClass) {
      throw new Error(`Unknown chat type: ${chatType}`);
    }
    return new StrategyClass(...args);
  }
}
