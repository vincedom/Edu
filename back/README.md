# Backend - FastAPI + Strawberry GraphQL

## Tech Stack

- **Framework**: FastAPI
- **Package Manager**: `uv` (Astral) for ultra-fast dependency management
- **API Layer**: Strawberry GraphQL (for administrative data, dashboards, and xAPI reporting)
- **Real-Time Audio**: Native FastAPI WebSockets at `/api/v1/stream` (dedicated to binary PCM streaming)
- **Database**: PostgreSQL (SQLAlchemy Async)
- **Audio/VAD**: `webrtcvad` or `silero-vad`

## Architecture Guidelines

- **Real-Time Audio**: Use native FastAPI WebSockets at `/api/v1/stream` for continuous binary PCM audio streaming (highest performance for raw bytes).
- **Data & Analytics API**: Use **Strawberry GraphQL** (`/graphql`) for all CRUD, configuration, and analytics:
  - *Queries/Mutations*: Fetching learner profiles, updating settings, serving the Parent/Teacher dashboards.
  - *Subscriptions*: Real-time alerts sent to the Parent/Teacher interfaces (behavioral triggers, completion alerts).

## Strict Code Standards

- Use strict Python type hinting.
- Use asynchronous operations (`async/await`) for database, network, and GraphQL resolvers.
- Keep all code comments and schemas documented in English.

## Setup

```bash
cd back

# Install dependencies
uv sync

# Create .env with your Gemini API key
cp .env.example .env

# Start server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `/api/v1/stream` | WebSocket for real-time audio streaming | Working |
| `/graphql` | Strawberry GraphQL API | Pending |

## Dependencies

- `fastapi>=0.137.0`
- `google-genai>=2.8.0`
- `pydantic-settings>=2.14.1`
- `strawberry-graphql[fastapi]>=0.316.0`
- `uvicorn>=0.49.0`
- `webrtcvad-wheels>=2.0.14`
- `websockets>=16.0`