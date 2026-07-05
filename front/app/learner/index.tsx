import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  Mic,
  MicOff,
  Play
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { useAudioStream, type AudioState } from '../../hooks/useAudioStream';

const STATE_CONFIG: Record<AudioState, { color: string; label: string }> = {
  IDLE: { color: '#9CA3AF', label: 'IDLE' },
  LISTENING: { color: '#EF4444', label: 'LISTENING' },
  THINKING: { color: '#F59E0B', label: 'THINKING' },
  SPEAKING: { color: '#10B981', label: 'SPEAKING' },
};

export default function LearnerHomeScreen() {
  const router = useRouter();
  const {
    state,
    isConnected,
    error,
    transcripts,
    startListening,
    stopListening,
    sendImage
  } = useAudioStream();

  const [hasStarted, setHasStarted] = useState(false);
  const [isMicActive, setIsMicActive] = useState(true);
  const [showWebCamera, setShowWebCamera] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const videoRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Auto-scroll to bottom of transcripts when they change
  useEffect(() => {
    if (hasStarted) {
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [transcripts, hasStarted]);

  // Handle Starting the Conversation
  const handleStart = async () => {
    setHasStarted(true);
    setIsMicActive(true);
    try {
      await startListening();
    } catch (err) {
      console.error('[handleStart] Error starting listening:', err);
    }
  };

  // Toggle Microphone State
  const handleToggleMic = async () => {
    if (isMicActive) {
      await stopListening();
      setIsMicActive(false);
    } else {
      await startListening();
      setIsMicActive(true);
    }
  };

  const startWebCamera = async () => {
    try {
      setShowWebCamera(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('[startWebCamera] Error:', err);
      alert("Impossible d'accéder à l'appareil photo : " + err);
      setShowWebCamera(false);
    }
  };

  const stopWebCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowWebCamera(false);
  };

  const captureWebPhoto = async () => {
    try {
      if (!videoRef.current) return;
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        await sendImage(dataUrl);
      }
    } catch (err) {
      console.error('[captureWebPhoto] Error:', err);
      alert("Erreur lors de la capture de la photo.");
    } finally {
      stopWebCamera();
    }
  };

  // Handle Photo Capture
  const handleTakePhoto = async () => {
    if (Platform.OS === 'web') {
      await startWebCamera();
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        alert("Permission to access camera is required!");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedUri = result.assets[0].uri;
        await sendImage(selectedUri);
      }
    } catch (err) {
      console.error('[handleTakePhoto] Error:', err);
      alert('Failed to launch camera.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Hide default navigation stack header */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* 1. TOP BREADCRUMB HEADER */}
      <View style={styles.header}>
        <View style={styles.breadcrumbContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              stopListening().catch(console.error);
              router.replace('/');
            }}
          >
            <ArrowLeft color="#9CA3AF" size={20} />
          </TouchableOpacity>
          <View style={styles.breadcrumbPath}>
            <Text style={styles.breadcrumbLink} onPress={() => router.replace('/')}>Edu</Text>
            <ChevronRight color="#4B5563" size={14} style={styles.breadcrumbSep} />
            <Text style={styles.breadcrumbActive}>Espace Apprenant</Text>
          </View>
        </View>

        {/* Small Connection Status indicator */}
        <View style={styles.connectionStatusContainer}>
          <View style={[
            styles.connectionStatusDot,
            { backgroundColor: isConnected ? '#10B981' : '#EF4444' }
          ]} />
          <Text style={styles.connectionStatusText}>
            {isConnected ? 'Connecté' : 'Déconnecté'}
          </Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* 2. MAIN SCREEN CONTENT */}
      {!hasStarted ? (
        /* LANDING STATE (START BUTTON) */
        <View style={styles.landingContainer}>
          <TouchableOpacity
            style={[
              styles.startCircleButton,
              !isConnected && styles.startCircleButtonDisabled
            ]}
            onPress={handleStart}
            disabled={!isConnected}
          >
            {isConnected ? (
              <View style={styles.startButtonInner}>
                <Play color="#FFFFFF" size={40} fill="#FFFFFF" style={styles.playIcon} />
                <Text style={styles.startCircleText}>START</Text>
              </View>
            ) : (
              <ActivityIndicator color="#FFFFFF" size="large" />
            )}
          </TouchableOpacity>

          {!isConnected && (
            <Text style={styles.connectingHint}>
              Connexion au serveur en cours...
            </Text>
          )}
        </View>
      ) : (
        /* ACTIVE STATE (CONVERSATION TRANSCRIPTS) */
        <View style={styles.activeContainer}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.transcriptsScrollView}
            contentContainerStyle={styles.transcriptsContent}
            keyboardShouldPersistTaps="handled"
          >
            {transcripts.length === 0 ? (
              <View style={styles.emptyConversation}>
                <Text style={styles.emptyText}>
                  Micro activé ! Dis "Bonjour" pour commencer la discussion.
                </Text>
              </View>
            ) : (
              transcripts.map((msg, index) => {
                // Determine styling and labels
                const isUser = msg.role === 'user';
                const isSystem = msg.role === 'system';
                const isTool = msg.role === 'tool';

                if (isSystem || isTool) {
                  return (
                    <View key={msg.id || index} style={styles.systemMessageContainer}>
                      <Text style={styles.systemMessageText}>
                        {isTool ? '🔧 Action : ' : '⚙️ '} {msg.text}
                      </Text>
                    </View>
                  );
                }

                return (
                  <View
                    key={msg.id || index}
                    style={[
                      styles.messageRow,
                      isUser ? styles.userRow : styles.aiRow
                    ]}
                  >
                    {!isUser && <Text style={styles.speakerAvatar}>🤖</Text>}
                    <View style={[
                      styles.messageBubble,
                      isUser ? styles.userBubble : styles.aiBubble
                    ]}>
                      {/* Image attachment rendering if present in payload */}
                      {!!msg.payload?.imageUri && (
                        <ExpoImage
                          source={{ uri: msg.payload.imageUri as string }}
                          style={styles.messageImage}
                          contentFit="cover"
                        />
                      )}
                      {/* Text content */}
                      {msg.text !== 'Image added' && (
                        <Text style={styles.messageText}>{msg.text}</Text>
                      )}

                      <Text style={styles.messageTime}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* 3. BOTTOM CONTROL BAR */}
          <View style={styles.bottomBar}>
            {/* Left Action: Camera button */}
            <TouchableOpacity
              style={styles.bottomBarButton}
              onPress={handleTakePhoto}
              activeOpacity={0.7}
            >
              <Camera color="#F9FAFB" size={24} />
            </TouchableOpacity>

            {/* Center Action: Raw State */}
            <View style={styles.statusDisplay}>
              <View style={[
                styles.statusDot,
                { backgroundColor: STATE_CONFIG[state]?.color || '#9CA3AF' }
              ]} />
              <Text style={styles.statusLabel}>
                {STATE_CONFIG[state]?.label || state}
              </Text>
            </View>

            {/* Right Action: Mic toggle (couper/allumer) */}
            <TouchableOpacity
              style={[
                styles.bottomBarButton,
                isMicActive ? styles.micButtonActive : styles.micButtonMuted
              ]}
              onPress={handleToggleMic}
              activeOpacity={0.7}
            >
              {isMicActive ? (
                <Mic color="#FFFFFF" size={24} />
              ) : (
                <MicOff color="#EF4444" size={24} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 4. WEB CAMERA OVERLAY MODAL */}
      {showWebCamera && Platform.OS === 'web' && (
        <View style={styles.webCameraModal}>
          <View style={styles.webCameraContainer}>
            <Text style={styles.webCameraTitle}>Prendre une photo</Text>
            <View style={styles.webVideoWrapper}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', borderRadius: 12, backgroundColor: '#000', transform: 'scaleX(-1)' }}
              />
            </View>
            <View style={styles.webCameraControls}>
              <TouchableOpacity 
                style={[styles.webCameraBtn, styles.webCameraCaptureBtn]} 
                onPress={captureWebPhoto}
              >
                <Camera color="#FFFFFF" size={20} style={{ marginRight: 8 }} />
                <Text style={styles.webCameraBtnText}>Capturer</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.webCameraBtn, styles.webCameraCancelBtn]} 
                onPress={stopWebCamera}
              >
                <Text style={styles.webCameraBtnText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // Premium immersive dark slate blue
  },
  // 1. TOP BREADCRUMB HEADER
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  breadcrumbContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 8,
    padding: 4,
  },
  breadcrumbPath: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbLink: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  breadcrumbSep: {
    marginHorizontal: 4,
  },
  breadcrumbActive: {
    fontSize: 14,
    color: '#F9FAFB',
    fontWeight: '600',
  },
  connectionStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  connectionStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  connectionStatusText: {
    fontSize: 11,
    color: '#D1D5DB',
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: '#7F1D1D',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    color: '#FEE2E2',
    fontSize: 12,
    fontWeight: '500',
  },
  // 2. LANDING STATE (START BUTTON)
  landingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  welcomeInfo: {
    alignItems: 'center',
    marginBottom: 48,
  },
  robotEmoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F9FAFB',
    marginBottom: 12,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 24,
  },
  startCircleButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#4F46E5', // Main Indigo color
    justifyContent: 'center',
    alignItems: 'center',
    // Glow effect
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  startCircleButtonDisabled: {
    backgroundColor: '#374151',
    shadowColor: '#000',
    shadowOpacity: 0,
  },
  startButtonInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    marginLeft: 4, // Visual balance correction for play triangle
    marginBottom: 4,
  },
  startCircleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  connectingHint: {
    marginTop: 20,
    color: '#9CA3AF',
    fontSize: 14,
    fontStyle: 'italic',
  },
  // 3. ACTIVE STATE (CONVERSATION)
  activeContainer: {
    flex: 1,
  },
  transcriptsScrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  transcriptsContent: {
    paddingVertical: 20,
    paddingBottom: 40,
  },
  emptyConversation: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 32,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 6,
    maxWidth: '85%',
  },
  userRow: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  aiRow: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
  },
  speakerAvatar: {
    fontSize: 24,
    marginRight: 8,
    marginTop: 4,
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  userBubble: {
    backgroundColor: '#4F46E5', // Indigo for user messages
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 2,
  },
  aiBubble: {
    backgroundColor: '#1E293B', // Slate gray for AI messages
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 2,
  },
  messageText: {
    color: '#F9FAFB',
    fontSize: 15,
    lineHeight: 22,
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
  },
  messageTime: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  systemMessageContainer: {
    alignSelf: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginVertical: 8,
  },
  systemMessageText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '500',
  },
  // 4. BOTTOM CONTROL BAR
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#0F172A',
    height: 80,
  },
  bottomBarButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  micButtonActive: {
    backgroundColor: '#4F46E5', // Glowing indigo background when mic is active
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
  },
  micButtonMuted: {
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  statusDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 120,
    justifyContent: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F9FAFB',
    letterSpacing: 0.5,
  },
  // 5. WEB CAMERA OVERLAY MODAL STYLES
  webCameraModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  webCameraContainer: {
    backgroundColor: '#1E293B',
    padding: 24,
    borderRadius: 24,
    width: '90%',
    maxWidth: 500,
    alignItems: 'center',
  },
  webCameraTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 16,
  },
  webVideoWrapper: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 20,
  },
  webCameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: 12,
  },
  webCameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    flex: 1,
  },
  webCameraCaptureBtn: {
    backgroundColor: '#4F46E5',
  },
  webCameraCancelBtn: {
    backgroundColor: '#374151',
  },
  webCameraBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
