import asyncio
from fastapi import WebSocket
from google import genai
from google.genai import types

from app.core.config import settings
from app.core.audio.base_session import (
    BaseAudioModelSession,
    TUTOR_SYSTEM_PROMPT,
    piloter_interface_tuteur,
    split_internal_events
)

ai_client = genai.Client(api_key=settings.GEMINI_API_KEY)

class GeminiLiveAudioSession(BaseAudioModelSession):
    def __init__(self, websocket: WebSocket):
        super().__init__(websocket)
        self.gemini_session = None
        self.receive_task = None

    async def start(self):
        live_config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            tools=[piloter_interface_tuteur],
            system_instruction=types.Content(parts=[types.Part.from_text(text=TUTOR_SYSTEM_PROMPT)]),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(disabled=True),
                turn_coverage=types.TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
            ),
            temperature=0.3,
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Puck")
                )
            )
        )
        
        self._ctx = ai_client.aio.live.connect(model="gemini-3.1-flash-live-preview", config=live_config)
        self.gemini_session = await self._ctx.__aenter__()
        self.receive_task = asyncio.create_task(self._receive_loop())
        print("🟢 Bidirectional session established with Gemini Live API")

    async def signal_speech_start(self, buffered_frames: list[bytes]):
        await self.gemini_session.send_realtime_input(activity_start=types.ActivityStart())
        for buffered_frame in buffered_frames:
            await self.send_audio_frame(buffered_frame)

    async def send_audio_frame(self, frame: bytes):
        await self.gemini_session.send_realtime_input(
            audio=types.Blob(
                data=frame,
                mime_type=f"audio/pcm;rate={settings.SAMPLE_RATE}"
            )
        )

    async def signal_speech_stop(self):
        await self.gemini_session.send_realtime_input(activity_end=types.ActivityEnd())

    async def _receive_loop(self):
        user_transcript_text = ""
        ai_transcript_text = ""
        try:
            while True:
                async for response in self.gemini_session.receive():
                    if response.go_away:
                        print(f"⚠️ Gemini GoAway: {response.go_away}")

                    if response.tool_call:
                        function_responses = []
                        for call in response.tool_call.function_calls:
                            if call.name != "piloter_interface_tuteur": continue
                            args = call.args or {}
                            await self._send_tool_event(call.name, args)
                            await self.websocket.send_json({
                                "state": "speaking",
                                "skill": args.get("active_skill"),
                                "screen_command": args.get("screen_command"),
                                "reasoning": args.get("reasoning")
                            })
                            function_responses.append(
                                types.FunctionResponse(
                                    name=call.name, id=call.id,
                                    response={"result": "Interface updated successfully."}
                                )
                            )
                        if function_responses:
                            await self.gemini_session.send_tool_response(function_responses=function_responses)

                    server_content = response.server_content
                    if not server_content: continue

                    if server_content.input_transcription and server_content.input_transcription.text:
                        text = server_content.input_transcription.text
                        user_transcript_text = self._merge_transcript(user_transcript_text, text)
                        await self.websocket.send_json({
                            "type": "transcript", "id": f"turn-{self.transcript_turn_index}-user",
                            "role": "user", "text": user_transcript_text, "final": False,
                        })

                    if server_content.output_transcription and server_content.output_transcription.text:
                        text = server_content.output_transcription.text
                        visible_text, internal_events = split_internal_events(text)
                        for event in internal_events:
                            await self._send_tool_event(event["tool"], event)
                        ai_transcript_text = self._merge_transcript(ai_transcript_text, visible_text)
                        await self.websocket.send_json({
                            "type": "transcript", "id": f"turn-{self.transcript_turn_index}-ai",
                            "role": "ai", "text": ai_transcript_text, "final": False,
                        })

                    if server_content.model_turn:
                        for part in server_content.model_turn.parts:
                            if part.inline_data:
                                await self.websocket.send_bytes(part.inline_data.data)

                    if server_content.interrupted:
                        user_transcript_text = ""
                        ai_transcript_text = ""
                        self.transcript_turn_index += 1
                        self.event_index = 0
                        await self._send_internal_event("system", "Gemini response interrupted.")
                        await self.websocket.send_json({"state": "idle"})

                    if server_content.turn_complete:
                        if user_transcript_text.strip():
                            await self.websocket.send_json({
                                "type": "transcript", "id": f"turn-{self.transcript_turn_index}-user",
                                "role": "user", "text": user_transcript_text.strip(), "final": True,
                            })
                        if ai_transcript_text.strip():
                            await self.websocket.send_json({
                                "type": "transcript", "id": f"turn-{self.transcript_turn_index}-ai",
                                "role": "ai", "text": ai_transcript_text.strip(), "final": True,
                            })
                        user_transcript_text = ""
                        ai_transcript_text = ""
                        self.transcript_turn_index += 1
                        self.event_index = 0
                        await self.websocket.send_json({"state": "idle"})

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Error in Gemini Live receive loop: {e}")

    async def close(self):
        if self.receive_task and not self.receive_task.done():
            self.receive_task.cancel()
        if self.gemini_session:
            await self._ctx.__aexit__(None, None, None)