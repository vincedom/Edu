# OpenCode Frontend Directives - Edu App (Expo Native)

You are an expert React Native + TypeScript developer building a mobile-first application using Expo and Expo Router.


## Architecture Guidelines
- `app/index.tsx`: Main entry router routing to either the learner or admin spaces.
- `app/learner/`: 100% immersive, voice-centric interface for the child. No text input/typing allowed. Every feature must be driven by audio interaction or camera capture.
- `app/admin/`: Ecosytem for adults. Contains `parent/` (full features, well-being analytics) and `teacher/` (streamlined version focused strictly on pedagogical competence matrix).

## Tech Stack Requirements
- **Framework**: Expo (React Native) + Expo Router (File-based routing)
- **Icons**: `lucide-react-native`
- **Audio Handling (Full-Duplex)**: Implement continuous audio streaming. Audio bytes (PCM) must be captured in real-time and sent through a secure WebSocket connection to the backend. Avoid saving static audio files.
- **State Management**: The UI must handle 4 real-time states sent by the socket/VAD: `IDLE` (listening for voice), `LISTENING` (child is speaking), `THINKING` (AI processing), and `SPEAKING` (playing AI response).
- **Camera Handling**: Use `expo-camera` (CameraView) for textbook and assignment ingestion.

## Strict Code Standards
- NEVER use HTML tags (`<div>`, `<p>`, etc.). Always use React Native core primitives (`View`, `Text`, `TouchableOpacity`, `Pressable`, `StyleSheet`).
## Directives 
- **CRITICAL**: Never use web browser browser APIs (`window.AudioContext`, `navigator.mediaDevices`, `ScriptProcessorNode`, etc.). This is a native mobile Expo app. All audio recording must use React Native native modules or native streams compatible with Expo Go.
- Implement strict TypeScript types for all components, hooks, and navigation parameters.
- Keep all inline comments and code documentation in English.