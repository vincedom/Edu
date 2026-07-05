import asyncio
import io
import wave
from pathlib import Path

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel
from fastapi import WebSocket
from google import genai
from google.genai import types
from pyttsx3 import init as init_tts

from app.core.config import settings
from app.core.audio.base_session import (
    BaseAudioModelSession,
    TUTOR_SYSTEM_PROMPT,
    piloter_interface_tuteur,
    split_internal_events
)

ai_client = genai.Client(api_key=settings.GEMINI_API_KEY)

whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
tts_engine = init_tts()
tts_engine.setProperty("rate", 180)

class TextModelWithSTTAndTTS(BaseAudioModelSession):
    def __init__(self, websocket: WebSocket):
        super().__init__(websocket)
        self.collected_audio_bytes = bytearray()

    async def start(self):
        print("🟢 Text-based Pipeline initialized (STT -> local Whisper + Gemini text -> local pyttsx3)")

    async def signal_speech_start(self, buffered_frames: list[bytes]):
        self.collected_audio_bytes.clear()
        for frame in buffered_frames:
            self.collected_audio_bytes.extend(frame)

    async def send_audio_frame(self, frame: bytes):
        self.collected_audio_bytes.extend(frame)

    async def signal_speech_stop(self):
        async def process_pipeline():
            try:
                if not self.collected_audio_bytes:
                    await self.websocket.send_json({"state": "idle"})
                    return

                # 1. ÉTAPE STT (Audio to Text) locale
                pcm_bytes = bytes(self.collected_audio_bytes)
                audio_buffer = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                audio_buffer = audio_buffer.reshape(-1)

                segments, _ = whisper_model.transcribe(
                    audio_buffer,
                    beam_size=1,
                    language="fr",
                    vad_filter=True,
                    initial_prompt="Bonjour"
                )
                user_text = " ".join(segment.text.strip() for segment in segments if segment.text and segment.text.strip()).strip()
                if not user_text:
                    await self.websocket.send_json({"state": "idle"})
                    return

                await self.websocket.send_json({
                    "type": "transcript", "id": f"turn-{self.transcript_turn_index}-user",
                    "role": "user", "text": user_text, "final": True,
                })
                await self.websocket.send_json({
                    "state": "thinking",
                    "message": "Transcription reçue"
                })

                # 2. ÉTAPE MODÈLE DE TEXTE (Gemini conservé pour la compréhension)
                text_response = await ai_client.aio.models.generate_content(
                    model="gemini-2.5-flash",
                    config=types.GenerateContentConfig(
                        system_instruction=TUTOR_SYSTEM_PROMPT,
                        tools=[piloter_interface_tuteur],
                        temperature=0.3
                    ),
                    contents=user_text
                )

                if text_response.function_calls:
                    for call in text_response.function_calls:
                        if call.name == "piloter_interface_tuteur":
                            args = call.args or {}
                            await self._send_tool_event(call.name, args)
                            await self.websocket.send_json({
                                "state": "speaking",
                                "skill": args.get("active_skill"),
                                "screen_command": args.get("screen_command"),
                                "reasoning": args.get("reasoning")
                            })

                ai_text = text_response.text if text_response.text else ""
                visible_text, internal_events = split_internal_events(ai_text)
                for event in internal_events:
                    await self._send_tool_event(event["tool"], event)

                await self.websocket.send_json({
                    "type": "transcript", "id": f"turn-{self.transcript_turn_index}-ai",
                    "role": "ai", "text": visible_text, "final": True,
                })
                await self.websocket.send_json({
                    "state": "speaking",
                    "message": "Réponse générée"
                })

                # 3. ÉTAPE TTS locale
                tts_engine.save_to_file(visible_text, "/tmp/edu_tts.wav")
                tts_engine.runAndWait()
                if Path("/tmp/edu_tts.wav").exists():
                    audio_bytes = Path("/tmp/edu_tts.wav").read_bytes()
                    await self.websocket.send_bytes(audio_bytes)

            except Exception as e:
                print(f"Error in text-pipeline execution: {e}")
            finally:
                self.transcript_turn_index += 1
                self.event_index = 0
                await self.websocket.send_json({"state": "idle"})

        asyncio.create_task(process_pipeline())

    async def close(self):
        pass