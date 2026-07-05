import { useState, useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ScrollView, KeyboardAvoidingView, Platform, Modal, TouchableOpacity } from 'react-native';
import { useAudioStream, type AudioState, type TranscriptMessage } from '../hooks/useAudioStream';
import { Image } from 'expo-image';

const AUDIO_STATES: Record<AudioState, { label: string; color: string; icon: string }> = {
  IDLE: { label: 'Tap to speak', color: '#4F46E5', icon: '🎤' },
  LISTENING: { label: 'Listening...', color: '#DC2626', icon: '⏺️' },
  THINKING: { label: 'Thinking...', color: '#F59E0B', icon: '⚙️' },
  SPEAKING: { label: 'Speaking...', color: '#10B981', icon: '🔊' },
};

function getMessageStyle(role: TranscriptMessage['role']) {
  if (role === 'user') return styles.userMessage;
  if (role === 'tool') return styles.toolMessage;
  if (role === 'system') return styles.systemMessage;
  return styles.aiMessage;
}

function getTextStyle(role: TranscriptMessage['role']) {
  if (role === 'user') return styles.userText;
  if (role === 'tool') return styles.toolText;
  if (role === 'system') return styles.systemText;
  return styles.aiText;
}

function getMessageLabel(role: TranscriptMessage['role']) {
  if (role === 'tool') return 'Tool';
  if (role === 'system') return 'System';
  return null;
}

export function AudioButton() {
  const { state, isConnected, error, startListening, stopListening, transcripts, sendImage } = useAudioStream();
  const [isPressed, setIsPressed] = useState(false);
  const [showImageCapture, setShowImageCapture] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const stateInfo = AUDIO_STATES[state];

  const handlePressIn = async () => {
    setIsPressed(true);
    if (state === 'IDLE') {
      await startListening();
    }
  };

  const handlePressOut = async () => {
    setIsPressed(false);
    if (state === 'LISTENING') {
      await stopListening();
    }
  };

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <View style={styles.statusContainer}>
          <ActivityIndicator color="#9CA3AF" size="small" />
          <Text style={styles.connectionStatus}>Connecting to server...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={[styles.statusContainer, { borderColor: '#DC2626' }]}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, width: '100%' }}
      >
        <ScrollView 
          style={styles.scrollContainer}
          contentContainerStyle={styles.transcriptContainer}
          keyboardShouldPersistTaps="handled"
        >
          {transcripts.map((msg, index) => (
            <View 
              key={msg.id || index} 
              style={[
                styles.messageBubble,
                getMessageStyle(msg.role)
              ]}
            >
              {getMessageLabel(msg.role) && (
                <Text style={styles.messageLabel}>
                  {getMessageLabel(msg.role)}
                </Text>
              )}
              <Text style={getTextStyle(msg.role)}>
                {msg.text}
              </Text>
              <Text style={styles.timestamp}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}
        </ScrollView>

        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: stateInfo.color,
              opacity: pressed && state === 'IDLE' ? 0.8 : 1,
            },
          ]}
          disabled={state !== 'IDLE' && state !== 'LISTENING'}
        >
          <Text style={styles.icon}>{stateInfo.icon}</Text>
          <Text style={styles.label}>{stateInfo.label}</Text>
        </Pressable>

        <Text style={styles.hint}>
          {state === 'IDLE' ? 'Press and hold to record your voice' : ''}
          {state === 'LISTENING' ? 'Release to send your message' : ''}
          {state === 'THINKING' ? 'AI is processing your question...' : ''}
          {state === 'SPEAKING' ? 'AI is speaking to you...' : ''}
        </Text>

        <Pressable
          style={styles.imageButton}
          onPress={() => setShowImageCapture(true)}
          disabled={state !== 'IDLE'}
        >
          <Text style={styles.imageButtonText}>📷 Add Image</Text>
        </Pressable>
      </KeyboardAvoidingView>

      <Modal
        animationType="slide"
        transparent={false}
        visible={showImageCapture}
        onRequestClose={() => setShowImageCapture(false)}
      >
        <View style={styles.imageCaptureContainer}>
          <Text style={styles.imageCaptureTitle}>Add an Image</Text>
          <Text style={styles.imageCaptureHint}>Select an image to send to the AI tutor</Text>
          
          <TouchableOpacity 
            style={styles.imageCaptureOption}
            onPress={async () => {
              const result = await sendImage();
              if (result) {
                setSelectedImageUri(result);
              }
              setShowImageCapture(false);
            }}
          >
            <Text style={styles.imageCaptureOptionText}>📷 Take Photo</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.imageCaptureOption}
            onPress={async () => {
              const result = await sendImage();
              if (result) {
                setSelectedImageUri(result);
              }
              setShowImageCapture(false);
            }}
          >
            <Text style={styles.imageCaptureOptionText}>📚 Choose from Library</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => setShowImageCapture(false)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {selectedImageUri && (
        <View style={styles.selectedImageContainer}>
          <Image source={{ uri: selectedImageUri }} style={styles.selectedImage} />
          <TouchableOpacity 
            style={styles.removeImageButton}
            onPress={() => setSelectedImageUri(null)}
          >
            <Text style={styles.removeImageText}>Remove</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 20,
    width: '100%',
  },
  scrollContainer: {
    width: '100%',
    height: 200,
    marginBottom: 10,
  },
  transcriptContainer: {
    padding: 10,
    alignItems: 'stretch',
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minWidth: 200,
  },
  icon: {
    fontSize: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1F2937',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  connectionStatus: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  imageButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  imageButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  messageBubble: {
    padding: 12,
    marginVertical: 4,
    borderRadius: 18,
    maxWidth: '80%',
  },
  userMessage: {
    backgroundColor: '#4F46E5',
    alignSelf: 'flex-end',
  },
  aiMessage: {
    backgroundColor: '#6B7280',
    alignSelf: 'flex-start',
  },
  userText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  aiText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  timestamp: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  imageCaptureContainer: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    margin: 20,
  },
  imageCaptureTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  imageCaptureHint: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
    textAlign: 'center',
  },
  imageCaptureOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginVertical: 4,
  },
  imageCaptureOptionText: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  cancelButton: {
    paddingVertical: 10,
    marginTop: 16,
    backgroundColor: '#EF4444',
    borderRadius: 6,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  selectedImageContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  selectedImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  removeImageButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#EF4444',
    borderRadius: 4,
  },
  removeImageText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
});
