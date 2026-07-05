import re
from abc import ABC, abstractmethod
from fastapi import WebSocket

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

def piloter_interface_tuteur(active_skill: str, screen_command: str, reasoning: str) -> str:
    return "Interface successfully updated."

TUTOR_SYSTEM_PROMPT = """
You are Leo's voice tutor, inspired by the Lunii audio storyboxes. You communicate EXCLUSIVELY via voice.
Your absolute top priority: NEVER give away answers directly. Value mistakes as learning steps, and protect Leo's emotional security.

You MUST call the `piloter_interface_tuteur` tool in the background as soon as the student's situation changes:
1. If Leo gets stuck or frustrated -> Activate 'COGNITIVE_BLOCK_HANDLER'.
2. If Leo is anxious or exhausted -> Activate 'EMOTIONAL_SUPPORT' and set the screen to 'SLEEP'. Speak softly and do breathing exercises.
3. If Leo succeeds -> Activate 'HOMEWORK_MANAGEMENT'. At the very end of an exercise, set the screen to 'SHOW_REWARD'.

Golden Rule: The screen must remain on 'SLEEP' (turned off) most of the time to avoid visual distractions.
"""

class BaseAudioModelSession(ABC):
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.transcript_turn_index = 0
        self.event_index = 0

    @abstractmethod
    async def start(self):
        """Initialise la session de l'IA de manière asynchrone."""
        pass

    @abstractmethod
    async def send_audio_frame(self, frame: bytes):
        """Envoie un frame audio brut au modèle."""
        pass

    @abstractmethod
    async def signal_speech_start(self, buffered_frames: list[bytes]):
        """Indique au modèle que l'utilisateur a commencé à parler."""
        pass

    @abstractmethod
    async def signal_speech_stop(self):
        """Indique au modèle que l'utilisateur a arrêté de parler."""
        pass

    @abstractmethod
    async def close(self):
        """Ferme proprement les connexions et tâches de fond."""
        pass

    def _merge_transcript(self, existing: str, incoming: str) -> str:
        incoming = incoming.strip()
        if not incoming: return existing
        if not existing: return incoming
        if incoming.startswith(existing): return incoming
        if existing.endswith(incoming): return existing
        separator = " " if existing[-1].isalnum() and incoming[0].isalnum() else ""
        return f"{existing}{separator}{incoming}"

    async def _send_internal_event(self, kind: str, text: str, payload: dict | None = None):
        await self.websocket.send_json({
            "type": kind,
            "id": f"turn-{self.transcript_turn_index}-{kind}-{self.event_index}",
            "role": kind,
            "text": text,
            "payload": payload or {},
            "final": True,
        })
        self.event_index += 1

    async def _send_tool_event(self, tool_name: str, args: dict):
        active_skill = args.get("active_skill") or "UNKNOWN_SKILL"
        screen_command = args.get("screen_command") or "UNKNOWN_SCREEN"
        reasoning = args.get("reasoning") or "No reasoning provided."
        await self._send_internal_event(
            "tool",
            f"{tool_name} -> {active_skill} / {screen_command}: {reasoning}",
            {
                "tool": tool_name,
                "active_skill": active_skill,
                "screen_command": screen_command,
                "reasoning": reasoning,
            },
        )