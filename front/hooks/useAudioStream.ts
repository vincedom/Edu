import { Audio } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';

// ======================================
// Types & Constants
// ======================================
export type AudioState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';

export interface TranscriptMessage {
  id?: string;
  role: 'user' | 'ai' | 'tool' | 'system';
  text: string;
  timestamp: number;
  final?: boolean;
  payload?: Record<string, unknown>;
}

interface AudioContextType {
  state: AudioState;
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
  transcripts: TranscriptMessage[];
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  sendAudio: (audioData: ArrayBuffer) => void;
  sendImage: (imageUri?: string) => Promise<string | null>;
}

const SAMPLE_RATE = 16000;
const GEMINI_AUDIO_OUTPUT_SAMPLE_RATE = 24000;
const FRAME_DURATION_MS = 30;
const FRAME_BYTE_SIZE = Math.floor((SAMPLE_RATE * FRAME_DURATION_MS) / 1000) * 2; // 2 bytes per sample (16-bit)
const SCRIPT_PROCESSOR_SIZE = 512; // valid power-of-two buffer size for createScriptProcessor

// WebSocket retry configuration
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 30000; // 30 seconds

// ======================================
// Web Audio Recorder (ScriptProcessorNode fallback)
// ======================================
class WebAudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private onAudioFrame: ((frame: ArrayBuffer) => void) | null = null;

  async start(onAudioFrame: (frame: ArrayBuffer) => void): Promise<void> {
    try {
      this.onAudioFrame = onAudioFrame;

      // Check if Web APIs are available
      if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Web Audio API not available. Make sure you are running on a web browser, not a native platform.'
        );
      }

      console.log('[WebAudioRecorder] Requesting microphone access...');

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });

      console.log('[WebAudioRecorder] Microphone access granted');

      // Create audio context with correct sample rate
      const AudioContextClass =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      
      if (!AudioContextClass) {
        throw new Error('AudioContext not available in this browser');
      }

      this.audioContext = new AudioContextClass({
        sampleRate: SAMPLE_RATE,
      });

      if (!this.audioContext) {
        throw new Error('Failed to create AudioContext');
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();

      // Use ScriptProcessorNode for audio frame capture
      // Note: This is deprecated but widely supported. For production, consider AudioWorklet.
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        SCRIPT_PROCESSOR_SIZE, // valid power-of-two buffer size
        1, // input channels
        1  // output channels
      );

      this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const pcm16 = this.convertFloat32ToPCM16(inputData);
        this.onAudioFrame?.(pcm16.buffer as ArrayBuffer);
      };

      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.analyser!);
      this.analyser!.connect(this.audioContext.destination);

      console.log('[WebAudioRecorder] Audio recording initialized');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[WebAudioRecorder] Start error:', errorMsg);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext && this.audioContext.state === 'running') {
      await this.audioContext.close();
    }
  }

  async playAudio(audioData: ArrayBuffer): Promise<void> {
    // Playback is handled by WebAudioPlayer
    // This method is here for interface compatibility
    console.log('[WebAudioRecorder] Use WebAudioPlayer for playback');
  }

  private convertFloat32ToPCM16(float32Array: Float32Array): Uint8Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return new Uint8Array(pcm16.buffer as ArrayBuffer);
  }
}

// ======================================
// Native Audio Recorder (Expo Audio)
// ======================================
class NativeAudioRecorder {
  private recording: any = null; // Audio.Recording
  private sound: any = null; // Audio.Sound
  private onAudioFrame: ((frame: ArrayBuffer) => void) | null = null;
  private recordingInterval: ReturnType<typeof setTimeout> | null = null;

  async start(onAudioFrame: (frame: ArrayBuffer) => void): Promise<void> {
    try {
      this.onAudioFrame = onAudioFrame;

      // Request microphone permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Microphone permission denied');
      }

      // Configure audio session for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpiece: false,
        staysActiveInBackground: false,
      } as any);

      // Create recording with preset settings (HIGH_QUALITY uses 16000 Hz)
      this.recording = new Audio.Recording();
      await this.recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      const recordingURI = this.recording.getURI();
      console.log('[NativeAudioRecorder] Recording URI:', recordingURI);

      await this.recording.startAsync();
      console.log('[NativeAudioRecorder] Recording started');

      // Note: For true real-time PCM streaming, native modules are needed.
      // expo-av records to a file and doesn't expose raw PCM frames directly.
      // This is a limitation of the current Expo API.
      // Consider using react-native-audio-stream or similar for production.
    } catch (error) {
      console.error('[NativeAudioRecorder] Start error:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.recordingInterval) {
        clearInterval(this.recordingInterval);
        this.recordingInterval = null;
      }

      if (this.recording) {
        await this.recording.stopAndUnloadAsync();
        this.recording = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      } as any);
      console.log('[NativeAudioRecorder] Recording stopped');
    } catch (error) {
      console.error('[NativeAudioRecorder] Stop error:', error);
    }
  }

  async playAudio(audioData: ArrayBuffer): Promise<void> {
    try {
      // Configure audio session for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpiece: false,
      } as any);

      if (this.sound) {
        await this.sound.unloadAsync();
      }

      // For native playback of PCM16 audio, we need to decode it properly.
      // This is a simplified approach - for production, consider:
      // 1. Converting PCM16 to WAV format on the backend
      // 2. Using a native module that handles raw PCM playback
      // 3. Saving to a temporary file first

      console.warn(
        '[NativeAudioRecorder] Native playback of PCM audio requires additional setup. ' +
        'Consider using a native audio module or decoding to WAV format on the backend.'
      );
    } catch (error) {
      console.error('[NativeAudioRecorder] Play error:', error);
    }
  }
}

// ======================================
// Web Audio Playback
// ======================================
class WebAudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;

  async playAudio(audioData: ArrayBuffer): Promise<void> {
    try {
      if (!this.audioContext) {
        const AudioContextClass =
          (window as any).AudioContext || (window as any).webkitAudioContext;

        if (!AudioContextClass) {
          console.warn(
            '[WebAudioPlayer] AudioContext not available. Audio playback not supported on this platform.'
          );
          return;
        }

        this.audioContext = new AudioContextClass();
      }

      if (!this.audioContext) {
        throw new Error('Failed to initialize AudioContext');
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const pcm16 = new Int16Array(audioData);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] < 0 ? pcm16[i] / 0x8000 : pcm16[i] / 0x7fff;
      }

      const audioBuffer = this.audioContext.createBuffer(
        1,
        float32.length,
        GEMINI_AUDIO_OUTPUT_SAMPLE_RATE
      );
      audioBuffer.getChannelData(0).set(float32);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      const startTime = Math.max(this.audioContext.currentTime + 0.02, this.nextStartTime);
      source.start(startTime);
      this.nextStartTime = startTime + audioBuffer.duration;
    } catch (error) {
      console.error('[WebAudioPlayer] Play error:', error);
    }
  }

  reset(): void {
    this.nextStartTime = 0;
  }

  async close(): Promise<void> {
    this.reset();
    if (this.audioContext && this.audioContext.state === 'running') {
      await this.audioContext.close();
    }
  }
}

// ======================================
// Main Hook
// ======================================
export function useAudioStream(): AudioContextType {
  const { getValidAccessToken } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<WebAudioRecorder | NativeAudioRecorder | null>(null);
  const playerRef = useRef<WebAudioPlayer | null>(null);
  const isRecordingRef = useRef(false);
  const selectedImageUriRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const [state, setState] = useState<AudioState>('IDLE');
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const audioMimeTypeRef = useRef<string | null>(null);

  // ======================================
  // WebSocket Setup
  // ======================================
  const getWebSocketUrl = useCallback(async (): Promise<string> => {
    const devIp = process.env.EXPO_PUBLIC_API_URL || '127.0.0.1';
    const host =
      Platform.OS === 'android' && devIp === '127.0.0.1'
        ? '10.0.2.2:8000'
        : `${devIp}:8000`;

    const accessToken = await getValidAccessToken();
    const tokenQuery = accessToken
      ? `?token=${encodeURIComponent(accessToken)}`
      : '';

    return `ws://${host}/api/stream${tokenQuery}`;
  }, [getValidAccessToken]);

  const openSocket = useCallback(async () => {
    try {
      const url = await getWebSocketUrl();
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        retryCountRef.current = 0;
        setIsConnected(true);
        setIsReconnecting(false);
        setError(null);
      };

      ws.onmessage = (event) => {
        handleWebSocketMessage(event.data);
      };

      ws.onerror = (event) => {
        const errorMsg = `WebSocket error: ${event.type}`;
        console.error('[WebSocket] Error:', errorMsg);
        setError(errorMsg);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);
        // Trigger reconnection if not already reconnecting
        if (isMountedRef.current && !isReconnecting) {
          reconnectWithRetry();
        }
      };

      wsRef.current = ws;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[openSocket] Error:', errorMsg);
      setError(errorMsg);
      setIsConnected(false);
      // Trigger reconnection on initial connection failure
      if (isMountedRef.current && !isReconnecting) {
        reconnectWithRetry();
      }
    }
  }, [getWebSocketUrl, isReconnecting]);

  // ======================================
  // Reconnection Logic with Exponential Backoff
  // ======================================
  const reconnectWithRetry = useCallback(() => {
    if (!isMountedRef.current) return;

    // Increment retry count
    retryCountRef.current += 1;

    if (retryCountRef.current > MAX_RETRIES) {
      console.error('[WebSocket] Max retries reached. Giving up.');
      setIsReconnecting(false);
      setError(`Failed to reconnect after ${MAX_RETRIES} attempts. Please check your connection.`);
      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current - 1),
      MAX_RETRY_DELAY_MS
    );

    console.log(
      `[WebSocket] Reconnection attempt ${retryCountRef.current}/${MAX_RETRIES} in ${delay}ms...`
    );

    setIsReconnecting(true);
    setError(`Reconnecting in ${delay / 1000} seconds... (Attempt ${retryCountRef.current}/${MAX_RETRIES})`);

    // Clear any existing timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    // Schedule reconnection
    retryTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        openSocket().catch((err) => {
          console.error('[reconnectWithRetry] Failed to reconnect:', err);
          // Continue retrying
          reconnectWithRetry();
        });
      }
    }, delay);
  }, [openSocket]);

  // ======================================
  // WebSocket Message Handler
  // ======================================
  const handleWebSocketMessage = useCallback((data: any) => {
    try {
      if (data instanceof ArrayBuffer) {
        console.log('[handleWebSocketMessage] Received audio data:', data.byteLength, 'bytes');
        setState('SPEAKING');
        if (Platform.OS === 'web') {
          playerRef.current?.playAudio(data);
        } else {
          recorderRef.current?.playAudio(data).catch((err: Error) => {
            console.error('[handleWebSocketMessage] Native playback error:', err.message);
          });
        }
      } else if (typeof data === 'string') {
        try {
          const json = JSON.parse(data);
          if (json.audio_mime_type) {
            audioMimeTypeRef.current = json.audio_mime_type;
          }
          
          // Handle transcript messages from backend
          if (json.type === 'transcript' || json.text) {
            const role = json.role || 'ai';
            const text = json.text || '';
            if (text) {
              const newTranscript: TranscriptMessage = {
                id: json.id,
                role: role as TranscriptMessage['role'],
                text,
                timestamp: Date.now(),
                final: json.final,
                payload: json.payload,
              };
              setTranscripts(prev => {
                const existingIndex = json.id
                  ? prev.findIndex(message => message.id === json.id)
                  : -1;

                if (existingIndex === -1) {
                  return [...prev, newTranscript];
                }

                return prev.map((message, index) =>
                  index === existingIndex
                    ? {
                        ...message,
                        text,
                        final: json.final,
                      }
                    : message
                );
              });
              console.log('[handleWebSocketMessage] Transcript:', newTranscript);
            }
          }
          
          console.log('[handleWebSocketMessage] State update:', json.state);
          if (json.state === 'listening') {
            playerRef.current?.reset();
            setState('LISTENING');
          } else if (json.state === 'thinking') {
            setState('THINKING');
          } else if (json.state === 'idle') {
            setState('IDLE');
          }
        } catch {
          console.warn('[handleWebSocketMessage] Failed to parse JSON:', data);
        }
      }
    } catch (err) {
      console.error('[handleWebSocketMessage] Error:', err);
    }
  }, []);

  // ======================================
  // Audio Frame Callback
  // ======================================
  const handleAudioFrame = useCallback((frame: ArrayBuffer) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(frame);
    }
  }, []);

  // ======================================
  // Start Listening
  // ======================================
  const startListening = useCallback(async () => {
    try {
      if (!isConnected) {
        throw new Error('WebSocket not connected');
      }

      if (isRecordingRef.current) {
        console.warn('[startListening] Already recording');
        return;
      }

      setState('IDLE');
      isRecordingRef.current = true;

      // Detect platform: prefer Web APIs if available, fall back to native
      const isWebPlatform = Platform.OS === 'web';

      console.log('[startListening] Platform detected:', Platform.OS, 'isWebPlatform:', isWebPlatform);

      if (isWebPlatform) {
        if (!recorderRef.current) {
          console.log('[startListening] Using WebAudioRecorder');
          recorderRef.current = new WebAudioRecorder();
        }
      } else {
        if (!recorderRef.current) {
          console.log('[startListening] Using NativeAudioRecorder');
          recorderRef.current = new NativeAudioRecorder();
        }
      }

      await recorderRef.current.start(handleAudioFrame);
      console.log('[startListening] Recording started');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[startListening] Error:', errorMsg);
      setError(errorMsg);
      isRecordingRef.current = false;
    }
  }, [isConnected, handleAudioFrame]);

  // ======================================
  // Stop Listening
  // ======================================
  const stopListening = useCallback(async () => {
    try {
      if (!isRecordingRef.current) {
        return;
      }

      if (recorderRef.current) {
        await recorderRef.current.stop();
      }

      isRecordingRef.current = false;
      setState('IDLE');
      console.log('[stopListening] Recording stopped');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[stopListening] Error:', errorMsg);
      setError(errorMsg);
    }
  }, []);

  // ======================================
  // Send Audio Manually
  // ======================================
  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(audioData);
      console.log('[sendAudio] Sent', audioData.byteLength, 'bytes');
    }
  }, []);

  // ======================================
  // Send Image to Backend
  // ======================================
  const sendImage = useCallback(async (imageUri?: string): Promise<string | null> => {
    try {
      const uri = imageUri || selectedImageUriRef.current;
      if (!uri) {
        console.warn('[sendImage] No image URI provided');
        return null;
      }

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not connected');
      }

      // Create image message object
      const imageMessage = {
        type: 'image',
        uri: uri,
        timestamp: Date.now(),
      };

      // Send as JSON string
      wsRef.current.send(JSON.stringify(imageMessage));
      console.log('[sendImage] Sent image:', uri);

      // Add to transcripts
      const currentTimestamp = Date.now();
      setTranscripts(prev => [
        ...prev,
        { role: 'user', text: 'Image added', timestamp: currentTimestamp, payload: { imageUri: uri } }
      ]);

      return uri;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[sendImage] Error:', errorMsg);
      setError(errorMsg);
      return null;
    }
  }, []);

  // ======================================
  // Setup & Cleanup
  // ======================================
  useEffect(() => {
    isMountedRef.current = true;

    // Initialize web audio player if Web APIs are available
    const isWebPlatform =
      Platform.OS === 'web' || typeof navigator !== 'undefined';

    if (isWebPlatform && !playerRef.current) {
      console.log('[useEffect] Initializing WebAudioPlayer');
      playerRef.current = new WebAudioPlayer();
    }

    // Open WebSocket connection
    openSocket();

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;

      // Clear retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      if (isRecordingRef.current) {
        stopListening().catch(console.error);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (playerRef.current) {
        playerRef.current.close().catch(console.error);
      }
    };
  }, [openSocket, stopListening]);

  return {
    state,
    isConnected,
    isReconnecting,
    error,
    transcripts,
    startListening,
    stopListening,
    sendAudio,
    sendImage,
  };
}
