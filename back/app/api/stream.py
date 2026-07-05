import asyncio
import json
import re
from collections import deque
import webrtcvad

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from app.core.config import settings
from app.core.auth import AuthenticationError, verify_access_token

router = APIRouter()

# Initialize Voice Activity Detection (VAD) - Aggressiveness level 3 (highest sensitivity)
vad = webrtcvad.Vad(3)

# Calculate the exact audio frame size needed by webrtcvad (e.g., 16000Hz * 2 bytes * 30ms / 1000)
FRAME_SIZE = int(settings.SAMPLE_RATE * 2 * (settings.FRAME_DURATION_MS / 1000))

# Initialize the official Google GenAI asynchronous client
ai_client = genai.Client(api_key=settings.GEMINI_API_KEY)

# Message types for WebSocket communication
class MessageType:
    AUDIO = "audio"
    TEXT_TRANSCRIPT = "text_transcript"
    IMAGE = "image"
    STATE_UPDATE = "state_update"
    TOOL_CALL = "tool_call"
    ERROR = "error"


TOOL_TEXTCALL_PATTERN = re.compile(r"textcall:([A-Za-z_][A-Za-z0-9_]*)\{([^}]*)\}")


def parse_textcall_args(raw_args: str) -> dict[str, str]:
    args = {}
    for chunk in raw_args.split(","):
        key, separator, value = chunk.partition(":")
        if separator:
            args[key.strip()] = value.strip()
    return args


def split_internal_events(text: str) -> tuple[str, list[dict]]:
    events = []

    def replace_textcall(match: re.Match) -> str:
        tool_name = match.group(1)
        args = parse_textcall_args(match.group(2))
        events.append({
            "tool": tool_name,
            "active_skill": args.get("active_skill"),
            "screen_command": args.get("screen_command"),
            "reasoning": args.get("reasoning"),
            "raw": match.group(0),
        })
        return ""

    visible_text = TOOL_TEXTCALL_PATTERN.sub(replace_textcall, text)
    visible_text = " ".join(visible_text.split())
    return visible_text, events


# =====================================================================
# 🛠️ TOOL DEFINITION (FUNCTION CALLING) FOR GEMINI
# =====================================================================
def piloter_interface_tuteur(active_skill: str, screen_command: str, reasoning: str) -> str:
    """
    Updates the tutor's current mode and controls the child's interface screen.
    
    Args:
        active_skill: The active skill mode ('HOMEWORK_MANAGEMENT', 'COGNITIVE_BLOCK_HANDLER', 'EMOTIONAL_SUPPORT')
        screen_command: The hardware display command ('SLEEP', 'SHOW_EXPLANATION', 'SHOW_REWARD')
        reasoning: Short textual diagnosis explaining why this action is taken
    """
    return "Interface successfully updated."


# System prompt defining the behaviors and boundaries of Leo's story-box tutor
TUTOR_SYSTEM_PROMPT = """
You are Leo's voice tutor, inspired by the Lunii audio storyboxes. You communicate EXCLUSIVELY via voice.
Your absolute top priority: NEVER give away answers directly. Value mistakes as learning steps, and protect Leo's emotional security.

You MUST call the `piloter_interface_tuteur` tool in the background as soon as the student's situation changes:
1. If Leo gets stuck or frustrated -> Activate 'COGNITIVE_BLOCK_HANDLER'.
2. If Leo is anxious or exhausted -> Activate 'EMOTIONAL_SUPPORT' and set the screen to 'SLEEP'. Speak softly and do breathing exercises.
3. If Leo succeeds -> Activate 'HOMEWORK_MANAGEMENT'. At the very end of an exercise, set the screen to 'SHOW_REWARD'.

Golden Rule: The screen must remain on 'SLEEP' (turned off) most of the time to avoid visual distractions.
"""

# =====================================================================
# 🎙️ HIGH-PERFORMANCE AUDIO STREAMING WEBSOCKET ENDPOINT
# =====================================================================
@router.websocket("/stream")
async def audio_stream_endpoint(
    websocket: WebSocket,
    token: str | None = Query(default=None),
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
    print("🚀 Frontend connected to Vocal WebSocket (Live Bidi Mode Active)")

    # Real-time bidirectional streaming session configuration
    live_config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        tools=[piloter_interface_tuteur],
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=TUTOR_SYSTEM_PROMPT)]
        ),
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

    audio_buffer = bytearray()
    pre_speech_frames = deque(maxlen=10)
    vad_history = deque(maxlen=20)
    is_speaking = False
    
    receive_task = None

    try:
        # FIX: Updated to 'gemini-3.1-flash-live-preview', the current public live-gateway model
        async with ai_client.aio.live.connect(model="gemini-3.1-flash-live-preview", config=live_config) as gemini_session:
            print("🟢 Bidirectional session established with Gemini Live API")
            
            # -----------------------------------------------------------------
            # 🔄 BACKGROUND TASK: LISTENING TO GEMINI RESPONSES
            # -----------------------------------------------------------------
            async def receive_from_gemini():
                user_transcript_text = ""
                ai_transcript_text = ""
                transcript_turn_index = 0
                event_index = 0

                def merge_transcript(existing: str, incoming: str) -> str:
                    incoming = incoming.strip()
                    if not incoming:
                        return existing
                    if not existing:
                        return incoming
                    if incoming.startswith(existing):
                        return incoming
                    if existing.endswith(incoming):
                        return existing
                    separator = " " if existing[-1].isalnum() and incoming[0].isalnum() else ""
                    return f"{existing}{separator}{incoming}"

                async def send_internal_event(kind: str, text: str, payload: dict | None = None):
                    nonlocal event_index
                    await websocket.send_json({
                        "type": kind,
                        "id": f"turn-{transcript_turn_index}-{kind}-{event_index}",
                        "role": kind,
                        "text": text,
                        "payload": payload or {},
                        "final": True,
                    })
                    event_index += 1

                async def send_tool_event(tool_name: str, args: dict):
                    active_skill = args.get("active_skill") or "UNKNOWN_SKILL"
                    screen_command = args.get("screen_command") or "UNKNOWN_SCREEN"
                    reasoning = args.get("reasoning") or "No reasoning provided."
                    await send_internal_event(
                        "tool",
                        f"{tool_name} -> {active_skill} / {screen_command}: {reasoning}",
                        {
                            "tool": tool_name,
                            "active_skill": active_skill,
                            "screen_command": screen_command,
                            "reasoning": reasoning,
                        },
                    )

                async def flush_transcripts():
                    nonlocal user_transcript_text, ai_transcript_text
                    user_text = user_transcript_text.strip()
                    ai_text = ai_transcript_text.strip()

                    if user_text:
                        await websocket.send_json({
                            "type": "transcript",
                            "id": f"turn-{transcript_turn_index}-user",
                            "role": "user",
                            "text": user_text,
                            "final": True,
                        })

                    if ai_text:
                        await websocket.send_json({
                            "type": "transcript",
                            "id": f"turn-{transcript_turn_index}-ai",
                            "role": "ai",
                            "text": ai_text,
                            "final": True,
                        })

                    user_transcript_text = ""
                    ai_transcript_text = ""

                try:
                    while True:
                        async for response in gemini_session.receive():
                            if response.go_away:
                                print(f"⚠️ Gemini GoAway: {response.go_away}")

                            # Scenario 1: Gemini decides to execute our background tool
                            if response.tool_call:
                                function_responses = []
                                for call in response.tool_call.function_calls:
                                    if call.name != "piloter_interface_tuteur":
                                        continue

                                    args = call.args or {}
                                    print(f"🚨 Tool triggered by AI -> Skill: {args.get('active_skill')}")
                                    await send_tool_event(call.name, args)

                                    await websocket.send_json({
                                        "state": "speaking",
                                        "skill": args.get("active_skill"),
                                        "screen_command": args.get("screen_command"),
                                        "reasoning": args.get("reasoning")
                                    })

                                    function_responses.append(
                                        types.FunctionResponse(
                                            name=call.name,
                                            id=call.id,
                                            response={"result": "Interface updated successfully."}
                                        )
                                    )

                                if function_responses:
                                    await gemini_session.send_tool_response(
                                        function_responses=function_responses
                                    )

                            server_content = response.server_content
                            if not server_content:
                                continue

                            if server_content.input_transcription and server_content.input_transcription.text:
                                text = server_content.input_transcription.text
                                print(f"📝 User transcript: {text}")
                                user_transcript_text = merge_transcript(user_transcript_text, text)
                                await websocket.send_json({
                                    "type": "transcript",
                                    "id": f"turn-{transcript_turn_index}-user",
                                    "role": "user",
                                    "text": user_transcript_text,
                                    "final": False,
                                })

                            if server_content.output_transcription and server_content.output_transcription.text:
                                text = server_content.output_transcription.text
                                print(f"🗣️ Gemini transcript: {text}")
                                visible_text, internal_events = split_internal_events(text)
                                for event in internal_events:
                                    await send_tool_event(event["tool"], event)

                                ai_transcript_text = merge_transcript(ai_transcript_text, visible_text)
                                if ai_transcript_text:
                                    await websocket.send_json({
                                        "type": "transcript",
                                        "id": f"turn-{transcript_turn_index}-ai",
                                        "role": "ai",
                                        "text": ai_transcript_text,
                                        "final": False,
                                    })

                            # Scenario 2: Receiving audio chunks from Gemini
                            if server_content.model_turn:
                                for part in server_content.model_turn.parts:
                                    if part.inline_data:
                                        await websocket.send_bytes(part.inline_data.data)

                            if server_content.interrupted:
                                print("⏸️ Gemini response interrupted")
                                user_transcript_text = ""
                                ai_transcript_text = ""
                                transcript_turn_index += 1
                                event_index = 0
                                await send_internal_event("system", "Gemini response interrupted.")
                                await websocket.send_json({"state": "idle"})

                            # Scenario 3: Turn completion
                            if server_content.turn_complete:
                                print("✅ Gemini turn complete")
                                await flush_transcripts()
                                transcript_turn_index += 1
                                event_index = 0
                                await websocket.send_json({"state": "idle"})

                        print("🔁 Gemini receive iterator completed, listening for next turn")

                except asyncio.CancelledError:
                    pass  
                except Exception as e:
                    print(f"Error while receiving data from Gemini: {e}")

            # Start listening task
            receive_task = asyncio.create_task(receive_from_gemini())

            # -----------------------------------------------------------------
            # 🔄 MAIN LOOP: RECEIVING INCOMING AUDIO FROM THE APP (FRONTEND)
            # -----------------------------------------------------------------
            while True:
                data = await websocket.receive_bytes()
                if not data:
                    continue

                audio_buffer.extend(data)

                while len(audio_buffer) >= FRAME_SIZE:
                    frame = bytes(audio_buffer[:FRAME_SIZE])
                    del audio_buffer[:FRAME_SIZE]
                    pre_speech_frames.append(frame)

                    is_speech = vad.is_speech(frame, settings.SAMPLE_RATE)
                    vad_history.append(is_speech)
                    voiced_frames = sum(1 for f in vad_history if f)

                    # TRIGGER: Speech Started
                    if not is_speaking and voiced_frames >= 5:
                        is_speaking = True
                        await websocket.send_json({"state": "listening"})
                        await gemini_session.send_realtime_input(
                            activity_start=types.ActivityStart()
                        )
                        print("🎙️ Speech started, streaming audio to Gemini")

                        for buffered_frame in pre_speech_frames:
                            await gemini_session.send_realtime_input(
                                audio=types.Blob(
                                    data=buffered_frame,
                                    mime_type=f"audio/pcm;rate={settings.SAMPLE_RATE}"
                                )
                            )

                    # TRIGGER: Speech Stopped (Silence)
                    elif is_speaking and voiced_frames <= 1:
                        is_speaking = False
                        await websocket.send_json({"state": "thinking"})
                        await gemini_session.send_realtime_input(
                            activity_end=types.ActivityEnd()
                        )
                        print("🛑 Speech stopped, activity_end sent to Gemini")

                    elif is_speaking:
                        await gemini_session.send_realtime_input(
                            audio=types.Blob(
                                data=frame,
                                mime_type=f"audio/pcm;rate={settings.SAMPLE_RATE}"
                            )
                        )

    except WebSocketDisconnect:
        print("🔴 Frontend terminated the WebSocket connection.")
    except Exception as e:
        print(f"💥 Critical exception occurred within the WebSocket session: {e}")
    finally:
        if receive_task and not receive_task.done():
            receive_task.cancel()
