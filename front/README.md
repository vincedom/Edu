# Frontend - Expo React Native

## Tech Stack

- **Framework**: Expo (React Native) + Expo Router
- **Icons**: `lucide-react-native`
- **Audio Handling**: `expo-av` for recording, WebSocket for streaming
- **State Management**: Real-time state handling (IDLE, LISTENING, THINKING, SPEAKING)

## Architecture Guidelines

- `app/index.tsx`: Main entry router routing to either the learner or admin spaces.
- `app/learner/`: 100% immersive, voice-centric interface for the child. No text input/typing allowed. Every feature must be driven by audio interaction or camera capture.
- `app/admin/`: Ecosystem for adults. Contains `parent/` (full features, well-being analytics) and `teacher/` (streamlined version focused strictly on pedagogical competence matrix).

## Strict Code Standards

- NEVER use HTML tags (`<div>`, `<p>`, etc.). Always use React Native core primitives (`View`, `Text`, `TouchableOpacity`, `Pressable`, `StyleSheet`).
- Implement strict TypeScript types for all components, hooks, and navigation parameters.
- Keep all inline comments and code documentation in English.

## Setup

```bash
cd front

# Install dependencies
npm install

# Create .env with your backend IP
echo "EXPO_PUBLIC_API_URL=192.168.1.XX" > .env
# Or use EXPO_PUBLIC_API_URL=127.0.0.1 for web-only testing

# Start development server
npm run web    # Recommended for testing
npm run android
npm run ios
```

## Key Components

| File | Purpose | Status |
|------|---------|--------|
| `hooks/useAudioStream.ts` | Core audio logic and WebSocket management | Complete |
| `components/AudioButton.tsx` | UI component for audio interaction | Complete |
| `app/learner/index.tsx` | Learner interface | Ready |

## Audio States

1. **IDLE** - Waiting for voice input
2. **LISTENING** - Recording user's voice
3. **THINKING** - Backend processing the audio
4. **SPEAKING** - Playing AI response

## Audio Architecture

```
User speaks → useAudioStream records → PCM16 (16kHz) → WebSocket → Backend processes → AI response → Audio playback
```

## Current Status

### ✅ Web (Working)
- Real-time audio recording using Web Audio API
- PCM16 audio streaming to backend
- Audio playback from backend responses

### ⚠️ Android/iOS (Partial)
- Audio recording using `expo-av` (file-based)
- WebSocket connection and state management working
- Audio playback requires additional setup (WAV conversion)

See `AUDIO_SETUP.md` at project root for detailed audio streaming setup.