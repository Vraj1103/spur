import { createClient } from "redis";
import { globalLogger } from "./logger.js";

const REDIS_URL =
  process.env.REDIS_URL ||
  "redis://default:XCAWwkAiC3ny0AnOhbguwYRzlL8InbIE@redis-19244.crce220.us-east-1-4.ec2.cloud.redislabs.com:19244";

export const redisClient = createClient({
  url: REDIS_URL,
});

redisClient.on("error", (err) => {
  // Only log error if we previously connected or if it's a runtime error
  // We don't want to spam logs if it's just down
  globalLogger.warn("Redis Client Error", { error: err.message });
});

let isRedisConnected = false;

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    isRedisConnected = true;
    globalLogger.info("Connected to Redis successfully");
  } catch (error: any) {
    globalLogger.warn(
      "Failed to connect to Redis - Application will run without caching",
      {
        error: error.message,
      }
    );
    isRedisConnected = false;
  }
};

export const isRedisAvailable = () => {
  return isRedisConnected && redisClient.isOpen;
};
