# OpenCode Backend Directives - Edu App (FastAPI + Strawberry GraphQL)

You are an expert Python developer building a high-performance backend using FastAPI, Strawberry GraphQL, and WebSockets.

## Architecture Guidelines
- **Real-Time Audio**: Use native FastAPI WebSockets at `/api/v1/stream` for continuous binary PCM audio streaming (highest performance for raw bytes).
- **Data & Analytics API**: Use **Strawberry GraphQL** (`/graphql`) for all CRUD, configuration, and analytics:
  - *Queries/Mutations*: Fetching learner profiles, updating settings, serving the Parent/Teacher dashboards.
  - *Subscriptions*: Real-time alerts sent to the Parent/Teacher interfaces (behavioral triggers, completion alerts).

## Tech Stack Requirements
- **Framework**: FastAPI
- **Package Manager**: `uv` (Astral) for ultra-fast dependency management and virtual environments.
- **API Layer**: Strawberry GraphQL (for administrative data, dashboards, and xAPI reporting)
- **Real-Time Audio**: Native FastAPI WebSockets at `/api/v1/stream` (dedicated to binary PCM streaming)
- **Database**: PostgreSQL (SQLAlchemy Async)
- **Audio/VAD**: `webrtcvad` or `silero-vad`

## Strict Code Standards
- Use strict Python type hinting.
- Use asynchronous operations (`async/await`) for database, network, and GraphQL resolvers.
- ALL COMMENTS MUST BE IN ENGLISH. This includes code comments, schema definitions, and any documentation within the backend.