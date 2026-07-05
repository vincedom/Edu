# Edu App

An educational application with real-time audio streaming powered by AI. The project consists of a FastAPI backend with Strawberry GraphQL and an Expo frontend for mobile and web.

## Project Structure

```
Edu2/
├── back/       # FastAPI + Strawberry GraphQL backend
└── front/      # Expo React Native frontend
```

## Focus & Functional Features

1. **Voice-centric learner interface** - Immersive audio-driven experience for children
2. **Real-time audio streaming** - Full-duplex WebSocket communication
3. **Multi-platform support** - Web, Android, and iOS
4. **GraphQL API** - For administrative data and analytics
5. **Visual analytics dashboard** - Parent/Teacher dashboards with behavioral analytics

## Key Technical Components

- **Backend**: FastAPI, Strawberry GraphQL, WebSockets
- **Frontend**: Expo Router, React Native, expo-av
- **AI Processing**: Gemini API integration

## Setup

### Backend (back/)```
cd back
uv sync
cp .env.example .env
# Add GEMINI_API_KEY
extend uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (front/)```
cd front
npm install
echo "EXPO_PUBLIC_API_URL=192.168.1.XX" > .env
npm run web
```