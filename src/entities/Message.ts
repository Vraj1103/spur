import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { Conversation } from "./Conversation.js";

export type SenderType = "user" | "ai";

@Entity()
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  conversationId!: string;

  @ManyToOne("Conversation", (conversation: any) => conversation.messages)
  @JoinColumn({ name: "conversationId" })
  conversation!: Conversation;

  @Column({
    type: "enum",
    enum: ["user", "ai"],
  })
  sender!: SenderType;

  @Column("text")
  content!: string;

  @CreateDateColumn()
  timestamp!: Date;
}
