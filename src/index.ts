import express from "express";
import { initializeDatabase } from "./data-source.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import indexRoutes from "./routes/index.js";
import chatRoutes from "./routes/chat.js";
import { globalLogger } from "./utils/logger.js";
import { connectRedis } from "./utils/redis.js";

const app = express();
const PORT = process.env.PORT || 8000;

// Validate required environment variables on startup
function validateEnvironment() {
  const required = ["OPENAI_API_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    globalLogger.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
  globalLogger.info("Environment variables validated successfully.");
}

app.use(express.json());

// Routes
app.use("/", indexRoutes);
app.use("/chat", chatRoutes);

// Global error handler
app.use(errorHandler);

// Initialize database and start server
initializeDatabase()
  .then(async () => {
    validateEnvironment();

    // Try connecting to Redis, but don't block startup if it fails
    await connectRedis();

    globalLogger.info(`Server is running on port ${PORT}`);
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    globalLogger.error("Error during Data Source initialization", {
      error: err.message,
    });
    console.error("Error during Data Source initialization", err);
  });
