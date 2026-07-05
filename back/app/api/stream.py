import math
from collections import deque
import webrtcvad

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.auth import AuthenticationError, verify_access_token
from app.core.audio.gemini_live_session import GeminiLiveAudioSession
from app.core.audio.text_pipeline_session import TextModelWithSTTAndTTS

router = APIRouter()

vad = webrtcvad.Vad(3)
FRAME_SIZE = int(settings.SAMPLE_RATE * 2 * (settings.FRAME_DURATION_MS / 1000))
ENERGY_THRESHOLD = 0.015


def compute_frame_energy(frame: bytes) -> float:
    if len(frame) < 2:
        return 0.0

    sample_count = len(frame) // 2
    squared_sum = 0
    for offset in range(0, len(frame) - 1, 2):
        sample = int.from_bytes(frame[offset:offset + 2], byteorder="little", signed=True)
        squared_sum += sample * sample

    if sample_count == 0:
        return 0.0

    rms = math.sqrt(squared_sum / sample_count) / 32768.0
    return rms


def classify_speech(frame: bytes) -> tuple[bool, float]:
    vad_result = vad.is_speech(frame, settings.SAMPLE_RATE)
    energy = compute_frame_energy(frame)
    return vad_result or energy >= ENERGY_THRESHOLD, energy

@router.websocket("/stream")
async def audio_stream_endpoint(
    websocket: WebSocket,
    token: str | None = Query(default=None),
    mode: str = Query(default="text_pipeline")
) -> None:
    if settings.AUTH_REQUIRED:
        if not token:
            await websocket.close(code=1008, reason="Missing access token")
            return
        try:
            verify_access_token(token)
        except AuthenticationError:
            await websocket.close(code=1008, reason="Invalid access token")
            return

    await websocket.accept()
    print(f"🚀 Frontend connected. Mode: {mode}")

    # Choix dynamique de la stratégie injectée
    if mode == "text_pipeline":
        ai_session = TextModelWithSTTAndTTS(websocket)
    else:
        ai_session = GeminiLiveAudioSession(websocket)

    await ai_session.start()

    audio_buffer = bytearray()
    pre_speech_frames = deque(maxlen=10)
    vad_history = deque(maxlen=20)
    is_speaking = False

    try:
        while True:
            data = await websocket.receive_bytes()
            print(f"Received {len(data)} bytes of audio data.")
            if not data: continue

            audio_buffer.extend(data)

            while len(audio_buffer) >= FRAME_SIZE:
                frame = bytes(audio_buffer[:FRAME_SIZE])
                print(f"Processing frame of size {len(frame)}.")
                del audio_buffer[:FRAME_SIZE]
                pre_speech_frames.append(frame)

                is_speech, energy = classify_speech(frame)
                vad_history.append(is_speech)
                voiced_frames = sum(1 for f in vad_history if f)
                print(
                    f"VAD: speech={is_speech} (energy={energy:.4f}), "
                    f"voiced_frames={voiced_frames}/{len(vad_history)}, is_speaking={is_speaking}"
                )

                # TRIGGER : L'utilisateur commence à parler
                if not is_speaking and voiced_frames >= 5:
                    is_speaking = True
                    await websocket.send_json({"state": "listening"})
                    print("🎙️ Speech started...")
                    await ai_session.signal_speech_start(list(pre_speech_frames))

                # TRIGGER : Silence détecté (Fin de parole)
                elif is_speaking and voiced_frames <= 1:
                    is_speaking = False
                    await websocket.send_json({"state": "thinking"})
                    print("🛑 Speech stopped...")
                    await ai_session.signal_speech_stop()

                # Pendant l'élocution active
                elif is_speaking:
                    await ai_session.send_audio_frame(frame)

    except WebSocketDisconnect:
        print("🔴 Frontend terminated the WebSocket connection.")
    except Exception as e:
        print(f"💥 Critical exception occurred: {e}")
    finally:
        await ai_session.close()