import asyncio
from collections import deque
import json
import webrtcvad

from fastapi import APIRouter, WebSocket
from google import genai
from google.genai import types

from app.core.config import settings

router = APIRouter()
vad = webrtcvad.Vad(3)
FRAME_SIZE = int(settings.SAMPLE_RATE * 2 * (settings.FRAME_DURATION_MS / 1000))
ai_client = genai.Client(api_key=settings.GEMINI_API_KEY)

# =====================================================================
# 🛠️ DÉFINITION DE L'OUTIL (FUNCTION CALLING) POUR GEMINI
# =====================================================================
def piloter_interface_tuteur(active_skill: str, screen_command: str, reasoning: str) -> str:
    """
    Permet de mettre à jour le mode du tuteur et de contrôler l'écran de l'enfant.
    À appeler dès que l'état émotionnel/académique de l'enfant change, ou qu'un affichage est requis.
    
    Args:
        active_skill: Le skill actif ('HOMEWORK_MANAGEMENT', 'COGNITIVE_BLOCK_HANDLER', 'EMOTIONAL_SUPPORT')
        screen_command: La commande de l'écran ('SLEEP', 'SHOW_EXPLANATION', 'SHOW_REWARD')
        reasoning: Court diagnostic textuel de la situation (ex: 'Léo stresse sur la retenue')
    """
    # Cette fonction est une coquille pour Gemini. Quand il l'appelle, 
    # on intercepte les arguments pour les envoyer au Front en JSON.
    return "Interface mise à jour avec succès."


# On adapte le prompt pour lui expliquer COMMENT et QUAND utiliser cet outil
TUTOR_SYSTEM_PROMPT = """
Tu es le tuteur vocal de Léo, inspiré des boîtes à histoires Lunii. Tu communiques UNIQUEMENT par la voix.
Ta priorité absolue : ne JAMAIS donner la réponse, valoriser l'erreur et préserver sa sécurité émotionnelle.

Tu as à ta disposition l'outil `piloter_interface_tuteur`. Tu DOIS l'appeler en tâche de fond dès que la situation change :
1. Si Léo bloque ou s'énerve -> Active 'COGNITIVE_BLOCK_HANDLER'. Si le blocage persiste, tu peux passer l'écran à 'SHOW_EXPLANATION'.
2. Si Léo est anxieux ou fatigué -> Active 'EMOTIONAL_SUPPORT' et passe l'écran à 'SLEEP'. Stoppe les maths, parle doucement et propose de respirer.
3. Si Léo réussit -> Active 'HOMEWORK_MANAGEMENT'. Pour la fin de l'exercice, passe l'écran à 'SHOW_REWARD'.

Règle d'or Lunii : L'écran doit rester sur 'SLEEP' (éteint) la majorité du temps pour éviter les distractions.
"""

@router.websocket("/stream")
async def audio_stream_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    print("Frontend connecté au WebSocket Vocal (Function Calling activé)")

    audio_buffer = bytearray()
    vad_history = deque(maxlen=10)
    is_speaking = False
    chat_history = []

    try:
        while True:
            data = await websocket.receive_bytes()
            if not data:
                continue

            audio_buffer.extend(data)

            while len(audio_buffer) >= FRAME_SIZE:
                frame = bytes(audio_buffer[:FRAME_SIZE])
                del audio_buffer[:FRAME_SIZE]

                is_speech = vad.is_speech(frame, settings.SAMPLE_RATE)
                vad_history.append(is_speech)
                voiced_frames = sum(1 for f in vad_history if f)
                
                if not is_speaking and voiced_frames >= 5:
                    is_speaking = True
                    await websocket.send_json({"state": "listening"})

                elif is_speaking and voiced_frames <= 1:
                    is_speaking = False
                    await websocket.send_json({"state": "thinking"})
                    
                    try:
                        # Demande de génération à Gemini avec sortie AUDIO + OUTILS
                        response = ai_client.models.generate_content(
                            model='gemini-2.5-flash',
                            contents=[
                                *chat_history,
                                types.Part.from_bytes(
                                    data=bytes(audio_buffer),
                                    mime_type='audio/pcm;rate=16000'
                                )
                            ],
                            config=types.GenerateContentConfig(
                                system_instruction=TUTOR_SYSTEM_PROMPT,
                                # 🎙️ LE CHANGEMENT CLÉ : On demande à Gemini de répondre directement en AUDIO
                                response_mime_type="audio/pcm", 
                                # 🛠️ ON INJECTE NOTRE FONCTION DANS LES OUTILS DE GEMINI
                                tools=[piloter_interface_tuteur], 
                                temperature=0.3
                            ),
                        )
                        
                        # 1. Vérification si Gemini a décidé d'appeler notre outil en tâche de fond
                        if response.function_calls:
                            for call in response.function_calls:
                                if call.name == "piloter_interface_tuteur":
                                    args = call.args
                                    print(f"🚨 L'IA appelle l'outil ! Skill: {args.get('active_skill')} | Écran: {args.get('screen_command')}")
                                    
                                    # On envoie immédiatement la mise à jour JSON à l'application Expo
                                    await websocket.send_json({
                                        "state": "speaking",
                                        "skill": args.get("active_skill"),
                                        "screen_command": args.get("screen_command"),
                                        "reasoning": args.get("reasoning")
                                    })

                        # 2. On récupère et on stream le flux audio natif généré par Gemini
                        # Le SDK Gemini retourne l'audio dans les parts de la réponse
                        for part in response.candidates[0].content.parts:
                            if part.inline_data:
                                # C'est le flux audio direct généré par la voix de Gemini !
                                await websocket.send_bytes(part.inline_data.data)
                        
                        # Sauvegarde dans l'historique
                        chat_history.append(types.Content(role="user", parts=[types.Part.from_bytes(data=bytes(audio_buffer), mime_type='audio/pcm;rate=16000')]))
                        chat_history.append(response.candidates[0].content)

                    except Exception as gemini_err:
                        print(f"Erreur flux Gemini Live / Tools: {gemini_err}")
                    
                    await websocket.send_json({"state": "idle"})
                    audio_buffer.clear()
                    vad_history.clear()

    except Exception as e:
        print(f"Connexion fermée : {e}")