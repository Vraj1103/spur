# Spur Chat Backend

A robust, production-ready TypeScript backend for a customer support chat system. Built with **Express**, **TypeORM**, and **PostgreSQL**, leveraging **OpenAI's GPT-4o** for intelligent responses. Features include real-time streaming, Redis caching, and a modular strategy-based architecture.

---

## 🚀 How to Run It Locally

### Step 1: Prerequisites

Ensure you have the following installed:

- **Node.js** (v18+)
- **PostgreSQL** (v12+)
- **Redis** (Optional, for caching)

### Step 2: Clone & Install

Frontend repo url : ``` https://github.com/Vraj1103/Spur-FE ```

```bash
git clone https://github.com/Vraj1103/spur.git
cd spur
npm install
```

### Step 3: Configure Environment

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

### Step 4: Start the Server

```bash
# Development mode (with hot-reload)
npm run dev

# Production build
npm run build
npm start
```

The server will start on `http://localhost:8000`.

---

## 🗄️ How to Set Up DB

This project uses **TypeORM** with `synchronize: true` for development, meaning **migrations are handled automatically**.

1. **Create a Local Database**:
   The application attempts to automatically create the database `spur_chat` if it doesn't exist.
   _Ensure your PostgreSQL user has permission to create databases._

2. **Manual Setup (If auto-creation fails)**:

   ```sql
   CREATE DATABASE spur_chat;
   ```

3. **Seeding**:
   Currently, no seeding script is required as the app creates necessary tables on startup.

---

## 🔑 Environment Variables

Configure these in your `.env` file:

| Variable              | Description                  | Default     |
| --------------------- | ---------------------------- | ----------- |
| `PORT`                | Server port                  | `8000`      |
| `DB_HOST`             | Database host                | `localhost` |
| `DB_PORT`             | Database port                | `5432`      |
| `DB_USERNAME`         | Database user                | `postgres`  |
| `DB_PASSWORD`         | Database password            | `postgres`  |
| `DB_NAME`             | Database name                | `spur_chat` |
| `DB_SSL`              | Enable SSL (for cloud DBs)   | `false`     |
| `OPENAI_API_KEY`      | **Required**. OpenAI API Key | -           |
| `REDIS_URL`           | Redis connection string      | -           |
| `ALLOWED_ORIGINS`     | CORS allowed origins         | `*`         |
| `RENDER_EXTERNAL_URL` | Self-ping URL for KeepAlive  | -           |

---

## 🏗️ Short Architecture Overview

The backend follows a **modular, layered architecture** designed for scalability and maintainability.

### **Layers & Modules**

- **Routes (`src/routes`)**: Defines API endpoints (`/chat`, `/health`). Handles request validation and response formatting.
- **Services (`src/services`)**: Contains business logic.
  - `ChatService`: Manages conversation history and DB interactions.
  - `KeepAliveService`: Prevents cold starts on serverless platforms.
- **Core & Strategies (`src/core`, `src/strategies`)**:
  - **`ChatOrchestrator`**: The central brain that directs messages to the correct strategy.
  - **Strategy Pattern**: Implements `BaseChatStrategy`. Currently features `StandardLLMStrategy` for direct LLM interaction. This allows easy addition of new modes (e.g., RAG, Agentic) without rewriting core logic.
- **Entities (`src/entities`)**: TypeORM models defining the database schema (`Conversation`, `Message`).
- **Utils (`src/utils`)**: Shared utilities for Logging (Winston), Redis, and Error Handling.

### **Interesting Design Decisions**

1. **Strategy Pattern for Chat**: Instead of hardcoding the LLM logic in the controller, we use a Strategy pattern. This makes it trivial to swap out "GPT-4o" for a "RAG Agent" or "Rule-based Bot" based on user intent or configuration.
2. **Dual-Mode Responses**: The `/message` endpoint supports both **Server-Sent Events (SSE)** for real-time streaming and standard JSON responses, handled dynamically based on the `?stream=true` query param.
---

## 🤖 LLM Notes

### **Provider**

- **OpenAI (GPT-4o)**: Chosen for its superior reasoning capabilities and speed.

### **Prompting Strategy**

- We use a **System Prompt** to define the persona and constraints.
- Context is managed by fetching the last `N` messages from the conversation history (cached in Redis) and appending the new user query.
- **Streaming**: We utilize OpenAI's streaming API to provide immediate feedback to the user, improving perceived latency.

---

## ⏳ Trade-offs & "If I had more time..."

### **Trade-offs**

- **Synchronize: True**: Used for speed of development. In a real production environment, I would disable this and use proper **TypeORM Migrations** to manage schema changes safely.
- **In-Memory/Redis Context**: Context window management is simple. For very long conversations, a summarization strategy would be more cost-effective.

### **If I had more time...**

1.  **RAG Support (Retrieval-Augmented Generation)**: Integrate a vector database (like Pinecone or pgvector) to allow the LLM to query a knowledge base for more accurate, domain-specific answers.
2.  **Agentic Orchestration Layer**: Implement an agent framework (like LangChain or a custom loop) where the LLM can decide to call tools (search, calculator, API) before answering.
3.  **LLM Vendor Neutrality**: Abstract the LLM provider layer further to support Anthropic (Claude), Google (Gemini), or local models (via Ollama) via configuration.
4.  **Optimized Context Management**: Implement a better technique of utilising conversation_history using responses api.

```bash
curl -X POST http://localhost:8000/chat/conversation
```

**Response:**

```json
{
  "conversationId": "uuid...",
  "title": "New Conversation",
  "createdAt": "2025-12-22T..."
}
```

### POST /chat/message

Main chat endpoint. Supports streaming and non-streaming. Automatically updates the title for the first message in a conversation.

**Request Body:**

```json
{
  "message": "What is your return policy?",
  "sessionId": "optional-uuid"
}
```

- `message`: Required string (max 1000 chars).
- `sessionId`: Optional UUID for conversation continuity.

#### Non-Streaming (Default)

```bash
curl -X POST http://localhost:8000/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "sessionId": "optional-uuid"}'
# Response: {"reply": "Hi there! How can I help?", "sessionId": "uuid"}
```

#### Streaming

```bash
curl -X POST "http://localhost:8000/chat/message?stream=true" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
# Response: Server-Sent Events stream (e.g., [CALL_TO]\ndata: STANDARD_STRATEGY\n\ndata: Hi\n\ndata: there\n\n[DONE])
```

### GET /chat/conversations

Get a list of conversations for the sidebar (cached in Redis).

**Query Parameters:**

- `limit`: Number of items (default: 50)
- `offset`: Pagination offset (default: 0)

```bash
curl "http://localhost:8000/chat/conversations?limit=20&offset=0"
```

**Response:**

```json
[
  {
    "id": "uuid...",
    "title": "Return Policy Inquiry",
    "createdAt": "2025-12-22T..."
  }
]
```

### GET /chat/conversation/:id

Get full message history for a specific conversation (cached in Redis).

```bash
curl "http://localhost:8000/chat/conversation/uuid-here"
```

**Response:**

```json
{
  "conversationId": "uuid...",
  "messages": [
    { "sender": "user", "content": "Hi", ... },
    { "sender": "ai", "content": "Hello!", ... }
  ]
}
```

### DELETE /chat/conversation/:id

Delete a conversation and its history. Clears relevant Redis caches.

```bash
curl -X DELETE "http://localhost:8000/chat/conversation/uuid-here"
```

**Response:**

```json
{
  "message": "Conversation deleted successfully",
  "conversationId": "uuid..."
}
```

## Caching (Redis)

The application uses Redis for performance optimization:

1.  **Conversation History**: Uses Redis Lists (`RPUSH`, `LRANGE`) to append new messages and fetch history instantly without DB queries.
2.  **Conversation List**: Uses Redis Strings to cache the sidebar list. The cache is automatically invalidated when a new conversation is created or a title is updated.

If Redis is unavailable, the application gracefully falls back to PostgreSQL.

## Architecture

- **Facade-Factory-Strategy Pattern**: Orchestrator manages chat flow, factory selects strategies.
- **Streaming Protocol**: Uses Server-Sent Events with control flags for UI updates.
- **Persistence**: Conversations and messages stored in PostgreSQL via TypeORM.
- **LLM Integration**: OpenAI GPT-3.5-turbo with store knowledge in system prompt.

## Notes

- The system currently uses only the `STANDARD` chat strategy.
- Input validation: Messages must be non-empty strings ≤1000 characters.
- Error handling: Graceful failures with user-friendly messages.
- Cost control: Max 500 tokens per response.

## Development

- `npm run build`: Compile TypeScript.
- `npm run dev`: Run with nodemon for development.
- Database schema is auto-managed by TypeORM (synchronize: true in dev only).
