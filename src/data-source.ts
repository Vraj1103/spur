import "reflect-metadata";
import { DataSource } from "typeorm";
import { Conversation } from "./entities/Conversation.js";
import { Message } from "./entities/Message.js";
import dotenv from "dotenv";
import { globalLogger } from "./utils/logger.js";

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "spur_chat",
  ssl: process.env.DB_SSL === "true",
};

async function createDatabaseIfNotExists() {
  // If using SSL (Cloud DB), likely the DB is already created or we might not have permissions
  // to connect to 'postgres' database. We'll try, but proceed if it fails.
  const tempDataSource = new DataSource({
    type: "postgres",
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: "postgres", // Connect to default postgres database
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
  });

  try {
    await tempDataSource.initialize();
    await tempDataSource.query(`CREATE DATABASE "${dbConfig.database}"`);
    globalLogger.info(`Database "${dbConfig.database}" created successfully`);
  } catch (error: any) {
    // Database might already exist, which is fine
    if (error.code === "42P04") {
      globalLogger.info(`Database "${dbConfig.database}" already exists`);
    } else {
      // If we can't connect to 'postgres' db or other errors, just log and warn
      // The main connection might still work if the DB exists
      globalLogger.warn(
        "Could not create database (might already exist or permission denied)",
        { error: error.message }
      );
    }
  } finally {
    if (tempDataSource.isInitialized) {
      await tempDataSource.destroy();
    }
  }
}

export const AppDataSource = new DataSource({
  type: "postgres",
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.username,
  password: dbConfig.password,
  database: dbConfig.database,
  synchronize: true, // Don't use this in production!
  logging: false,
  entities: [Conversation, Message],
  migrations: [],
  subscribers: [],
  ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
});

export async function initializeDatabase() {
  try {
    await createDatabaseIfNotExists();
    await AppDataSource.initialize();
    globalLogger.info("Data Source has been initialized!");
  } catch (error: any) {
    globalLogger.error("Error during Data Source initialization", {
      error: error.message,
    });
    throw error;
  }
}
