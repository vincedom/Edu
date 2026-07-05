# Audio Streaming Setup Guide

## Overview
This guide explains the audio streaming implementation for both **web** and **Android/iOS** platforms in the Edu app.

## Current Status

### ✅ Web (Working)
- Real-time audio recording using Web Audio API
- PCM16 audio streaming to backend
- Audio playback from backend responses
- Full duplex support (simultaneous record/playback)

### ⚠️ Android/iOS (Partial)
- Audio recording using `expo-av` (file-based)
- WebSocket connection and state management
- Audio playback **requires additional setup**

## Architecture

### Audio Hook (`hooks/useAudioStream.ts`)

The `useAudioStream()` hook provides:

```typescript
interface AudioContextType {
  state: AudioState;              // 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING'
  isConnected: boolean;            // WebSocket connection status
  error: string | null;            // Error messages
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  sendAudio: (audioData: ArrayBuffer) => void;
}
```

### Audio States

1. **IDLE** - Waiting for user input
2. **LISTENING** - Recording user's voice
3. **THINKING** - Backend processing the audio
4. **SPEAKING** - Backend sending audio response

## Platform-Specific Implementation

### Web Platform

**Recording:**
- Uses `ScriptProcessorNode` (Web Audio API)
- Converts float32 to PCM16 format
- Captures audio at 16000 Hz sample rate

**Playback:**
- Creates `AudioBuffer` from PCM16 data
- Plays through `BufferSource` node

**Setup:**
```bash
# Already configured in package.json
# No additional setup needed
```

### Android & iOS

**Recording:**
- Uses `expo-av` Audio.Recording
- Records to a file (HIGH_QUALITY preset = 16000 Hz)
- ⚠️ Limitation: Cannot access raw PCM frames in real-time

**Playback:**
- Uses `expo-av` Audio.Sound
- ⚠️ Requires WAV/MP3 format (not raw PCM)

## Known Limitations & Solutions

### 1. Native Audio Streaming (Android/iOS)

**Problem:** `expo-av` records to files, not real-time PCM streams.

**Current State:**
- Recording works, but audio isn't streaming to backend in real-time
- State updates (IDLE → LISTENING → THINKING) work via WebSocket

**Solutions for Production:**

#### Option A: Use a Native Audio Module (Recommended)
```bash
npm install react-native-audio-stream
# or
npm install react-native-audio-recorder-player
```

Update `NativeAudioRecorder` to use real-time streaming APIs.

#### Option B: Implement Native Module
Create a native module that exposes raw audio data:
- Android: Use `AudioRecord` API
- iOS: Use `AVAudioEngine` or `Audio Queue Services`

#### Option C: File-Based Chunking
Record to a file, read chunks periodically, and send via WebSocket. Less ideal for latency.

### 2. Native Audio Playback

**Problem:** Backend sends PCM16, but `expo-av` expects audio files (WAV/MP3).

**Solutions:**

#### Option A: Backend Returns WAV Format
Modify backend to encode PCM → WAV before sending.

```python
# Example: Convert PCM to WAV on backend
import wave
wav_buffer = io.BytesIO()
with wave.open(wav_buffer, 'wb') as wav:
    wav.setnchannels(1)          # Mono
    wav.setsampwidth(2)           # 16-bit
    wav.setframerate(16000)       # 16 kHz
    wav.writeframes(audio_bytes)
wav_buffer.seek(0)
```

#### Option B: Frontend Conversion
Use a library like `wav-encoder` to convert PCM → WAV on the frontend.

#### Option C: Use a Native Module
Use `react-native-audio-recorder-player` which handles raw PCM playback.

## Setup Instructions

### 1. Configure Environment Variables

Create `.env` in the `front/` directory:

```
# Use your machine's IP address (not localhost)
EXPO_PUBLIC_API_URL=192.168.1.XX

# Or use 127.0.0.1 for web only
EXPO_PUBLIC_API_URL=127.0.0.1
```

### 2. Start Backend Server

```bash
cd back
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Start Frontend

**Web:**
```bash
cd front
npm run web
```

**Android:**
```bash
cd front
npm run android
```

**iOS:**
```bash
cd front
npm run ios
```

### 4. Test the Setup

1. Open the app and navigate to the learner interface
2. You should see the audio button with connection status
3. On web: Click the button to start recording
4. Verify console logs show:
   - `[WebSocket] Connected`
   - `[WebAudioRecorder] Recording started`
   - `[handleWebSocketMessage] State update: listening`

## Debugging

### WebSocket Connection Issues

```typescript
// Check connection status in AudioButton component
if (!isConnected) {
  // Show: "Connecting to server..."
}
```

**Solutions:**
- Verify backend is running on `0.0.0.0:8000`
- Check `EXPO_PUBLIC_API_URL` environment variable
- On Android emulator, use `10.0.2.2` instead of `127.0.0.1`

### Microphone Permission Denied

**Web:**
- Browser will prompt for permission
- Check console for errors

**Android:**
- Add to `app.json`:
```json
{
  "plugins": [
    [
      "expo-av",
      {
        "microphonePermission": "Allow $(PRODUCT_NAME) to access your microphone."
      }
    ]
  ]
}
```

**iOS:**
- Add to `Info.plist`:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app needs microphone access for voice interaction.</string>
```

### No Audio from Backend

1. Check backend logs for errors
2. Verify Gemini API key is set in backend `.env`
3. Check network tab in browser dev tools
4. Verify PCM16 format is correct (16-bit signed, 16000 Hz)

## Performance Optimization

### Web Audio
- Use `AudioWorklet` instead of `ScriptProcessorNode` (replace deprecated API)
- Implement audio compression (opus/webm)
- Add voice activity detection (VAD) on client side

### Native Audio
- Use ring buffer for recording
- Implement VAD to reduce bandwidth
- Add automatic gain control (AGC)

## Testing Checklist

- [ ] Web: Audio recording works
- [ ] Web: Audio playback works
- [ ] Web: State updates (IDLE → LISTENING → THINKING → SPEAKING)
- [ ] Android: WebSocket connects
- [ ] Android: Microphone permissions granted
- [ ] Android: Audio recording starts
- [ ] Android: Audio playback works (after WAV conversion)
- [ ] Cross-platform: Handles network interruptions gracefully
- [ ] Cross-platform: Cleans up resources on unmount

## References

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [expo-av Documentation](https://docs.expo.dev/versions/latest/sdk/av/)
- [React Native Audio Libraries](https://reactnative.dev/docs/integration-with-existing-apps#known-issues)
- [PCM Audio Format](https://en.wikipedia.org/wiki/Pulse-code_modulation)
