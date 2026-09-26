import { MongoClient } from "mongodb";
import type { AppLogger } from "../server/logger.js";
import type { Env } from "../config/env.js";
import type { Conversation, StoredMessage } from "./conversation.js";

export interface ConversationRepository {
  get(conversationId: string): Promise<Conversation | null>;
  append(
    conversationId: string,
    messages: StoredMessage[],
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  close(): Promise<void>;
}

export class MemoryConversationRepository implements ConversationRepository {
  private readonly conversations = new Map<string, Conversation>();

  async get(conversationId: string): Promise<Conversation | null> {
    const conversation = this.conversations.get(conversationId);
    return conversation ? structuredClone(conversation) : null;
  }

  async append(
    conversationId: string,
    messages: StoredMessage[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const existing = this.conversations.get(conversationId);
    const now = new Date();
    if (!existing) {
      this.conversations.set(conversationId, {
        conversationId,
        createdAt: now,
        updatedAt: now,
        messages: [...messages],
        ...(metadata ? { metadata } : {}),
      });
      return;
    }
    existing.messages.push(...messages);
    existing.updatedAt = now;
    if (metadata) existing.metadata = { ...existing.metadata, ...metadata };
  }

  async close(): Promise<void> {}
}

interface ConversationDocument extends Conversation {
  _id?: unknown;
}

export class MongoConversationRepository implements ConversationRepository {
  private readonly client: MongoClient;
  private connected = false;

  constructor(uri: string) {
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.client.db().command({ ping: 1 });
    await this.collection().createIndex({ conversationId: 1 }, { unique: true });
    this.connected = true;
  }

  async get(conversationId: string): Promise<Conversation | null> {
    const document = await this.collection().findOne({ conversationId });
    if (!document) return null;
    return {
      conversationId: document.conversationId,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      messages: document.messages,
      ...(document.metadata ? { metadata: document.metadata } : {}),
    };
  }

  async append(
    conversationId: string,
    messages: StoredMessage[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date();
    await this.collection().updateOne(
      { conversationId },
      {
        $setOnInsert: { conversationId, createdAt: now },
        $set: { updatedAt: now, ...(metadata ? { metadata } : {}) },
        $push: { messages: { $each: messages } },
      },
      { upsert: true },
    );
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    await this.client.close();
    this.connected = false;
  }

  private collection() {
    return this.client.db().collection<ConversationDocument>("conversations");
  }
}

export async function createConversationRepository(
  env: Env,
  logger: AppLogger,
): Promise<ConversationRepository> {
  if (env.memoryDriver === "memory") {
    logger.info("using in-memory conversation store");
    return new MemoryConversationRepository();
  }
  const repository = new MongoConversationRepository(env.mongodbUri);
  await repository.connect();
  logger.info("connected to MongoDB");
  return repository;
}
