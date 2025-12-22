# Spur Chat Backend

A TypeScript backend for a customer support chat system using OpenAI's API, with streaming and non-streaming responses. Built with Express, TypeORM, and PostgreSQL.

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

1. Clone the repository:

   ```bash
   git clone <repo-url>
   cd spur
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Environment Setup

Create a `.env` file in the root directory with the following keys:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=spur_chat
PORT=8000
OPENAI_API_KEY=your_openai_api_key_here
REDIS_URL=redis://default:password@host:port (Optional)
```

- `DB_*`: PostgreSQL connection details. The database will be created automatically if it doesn't exist.
- `PORT`: Server port (default: 8000).
- `OPENAI_API_KEY`: Your OpenAI API key (required for chat functionality).
- `REDIS_URL`: Connection string for Redis caching. If omitted, the app runs without caching.

## Running the App

1. Ensure PostgreSQL is running and accessible.
2. (Optional) Ensure Redis is running for caching support.

3. Build the TypeScript code:

   ```bash
   npm run build
   ```

4. Start the server:
   - Development (with auto-reload): `npm run dev`
   - Production: `npm start`

The server will start on the specified `PORT` and validate environment variables on startup.

## Logging

The app uses Winston for structured logging with console and daily-rotating file outputs.

- **Log Levels**: ERROR, WARN, INFO, DEBUG
- **Log Files**: Located in `logs/` directory (auto-created)
  - `spur-backend-YYYY-MM-DD.log` for server logs
  - `spur-sql-YYYY-MM-DD.log` for database logs
- **Default Level**: ERROR (can be adjusted via code if needed)

Logs include timestamps, levels, and metadata for debugging.

## API Endpoints

### GET /ping

Basic health check.

```bash
curl http://localhost:8000/ping
# Response: "pong"
```

### GET /health

Detailed health check.

```bash
curl http://localhost:8000/health
# Response: {"status": "ok", "timestamp": "2025-12-21T..."}
```

### POST /chat/message

Main chat endpoint. Supports streaming and non-streaming.

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
