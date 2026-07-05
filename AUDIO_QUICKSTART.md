# 🎤 Audio Setup - Quick Start

## 1. Configure Backend

```bash
cd back

# Create .env with your Gemini API key
echo "GEMINI_API_KEY=your_key_here" > .env

# Start server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Note:** Backend must be accessible from your device (use real IP, not localhost)

## 2. Configure Frontend

```bash
cd front

# Create .env with your backend IP
# Option A: For web and local devices on same network
echo "EXPO_PUBLIC_API_URL=192.168.1.XX" > .env

# Option B: For local testing (web only)
echo "EXPO_PUBLIC_API_URL=127.0.0.1" > .env
```

## 3. Start Frontend

```bash
# Web (Recommended for testing)
npm run web

# Android (requires Android Studio emulator or real device)
npm run android

# iOS (requires Xcode)
npm run ios
```

## 4. Test Audio

### On Web:
1. Open browser console (F12)
2. Look for: `[WebSocket] Connected` ✅
3. Click the audio button
4. Speak and verify state changes: IDLE → LISTENING → THINKING → SPEAKING
5. Check console logs for audio data being sent

### On Android:
1. Grant microphone permission when prompted
2. Same testing as web
3. Audio playback requires additional setup (see AUDIO_SETUP.md)

## Troubleshooting

### "Cannot connect to server"
```
❌ EXPO_PUBLIC_API_URL is wrong
❌ Backend is not running
❌ Firewall is blocking port 8000
✅ Use: hostname -I (Linux) or ipconfig (Windows) to get your IP
```

### "Microphone permission denied"
```
Web: Check browser permissions
Android: Go to Settings → Permissions → Microphone → Allow
iOS: Check Info.plist has NSMicrophoneUsageDescription
```

### "Audio not playing"
```
Web: Should work automatically via Web Audio API
Android: Requires WAV conversion (in progress)
iOS: Requires WAV conversion (in progress)
```

## Architecture Quick Reference

```
User speaks
    ↓
useAudioStream hook records audio
    ↓
Converts to PCM16 (16000 Hz)
    ↓
Sends via WebSocket to /api/v1/stream
    ↓
Backend processes with Gemini
    ↓
Backend sends audio response
    ↓
Frontend plays audio (web only for now)
```

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `hooks/useAudioStream.ts` | Core audio logic | ✅ Complete |
| `components/AudioButton.tsx` | UI component | ✅ Complete |
| `app/learner/index.tsx` | Learner interface | ✅ Ready |
| `AUDIO_SETUP.md` | Detailed guide | ✅ Complete |

## Next Steps

1. Test web version thoroughly
2. If native playback needed: Configure WAV output on backend
3. For native real-time streaming: Install `react-native-audio-stream`
4. Add audio visualization feedback

---

**Quick Test Command:**
```bash
# Terminal 1: Start backend
cd back && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Start frontend
cd front && npm run web

# Then open http://localhost:8081 in your browser
```
