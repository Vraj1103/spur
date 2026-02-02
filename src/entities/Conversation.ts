import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Column,
  OneToMany,
} from "typeorm";
import type { Message } from "./Message.js";

@Entity()
export class Conversation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: "varchar", nullable: true })
  title?: string;

  @Column("jsonb", { nullable: true })
  metadata?: Record<string, any>;

  @OneToMany("Message", (message: any) => message.conversation)
  messages!: Message[];
}
