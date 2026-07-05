import { useState, useEffect, useRef } from 'react';
import { Pressable, Platform, PermissionsAndroid, StyleSheet, Alert, View, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CameraType } from 'expo-camera';

interface ImageCaptureButtonProps {
  onImageSelected: (uri: string) => void;
  isCaptureEnabled?: boolean;
}

export function ImageCaptureButton({ onImageSelected, isCaptureEnabled = true }: ImageCaptureButtonProps) {
  const [type, setType] = useState(CameraType.back);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const cameraRef = useRef<Camera | null>(null);

  useEffect(() => {
    async function requestCameraPermission() {
      if (Platform.OS === 'android') {
        const { status } = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Permission to access camera',
            message: 'This app needs access to your camera to take pictures.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
            buttonNeutral: 'Ask Me Later',
          }
        );
        if (status !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission denied', 'We cannot access the camera without permission.');
          return;
        }
      }
    }
    requestCameraPermission();
  }, []);

  const handleTakePhoto = async () => {
    try {
      if (!cameraRef.current) return;
      
      const options: ImagePickerOptions = {
        mediaTypes: { images: true },
        clearDefaultTimeoutOnLaunch: false,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      };
      
      const result = await ImagePicker.launchCamera(options);
      
      if (!result.cancelled) {
        setImageUri(result.uri);
        onImageSelected(result.uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  const handlePickFromLibrary = async () => {
    try {
      const options: ImagePickerOptions = {
        mediaTypes: { images: true },
        clearDefaultTimeoutOnLaunch: false,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1.0,
      };
      
      const result = await ImagePicker.launchImageLibrary(options);
      
      if (!result.cancelled) {
        setImageUri(result.uri);
        onImageSelected(result.uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick from library');
    }
  };

  const handleTypeToggle = () => {
    setType(prevType => (prevType === CameraType.back ? CameraType.front : CameraType.back));
  };

  const commonStyles = {
    container: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      paddingVertical: 12,
    },
    button: {
      flex: 1,
    },
    icon: {
      fontSize: 24,
      color: '#3B82F6',
    },
    label: {
      fontSize: 14,
      color: '#3B82F6',
      fontWeight: '500',
    },
    separator: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    separatorText: {
      color: '#6B7280',
      marginHorizontal: 4,
    },
  };

  return (
    <View style={commonStyles.container}>
      <Pressable onPress={handleTypeToggle} style={commonStyles.button}>
        <Text style={commonStyles.label}>
          {type === CameraType.back ? 'Back Camera' : 'Front Camera'}
          {cameraRef.current ? ' 📸' : ''}
        </Text>
      </Pressable>
      
      <View style={commonStyles.separator}>
        <Text style={commonStyles.separatorText}>-</Text>
      </View>
      
      <Pressable
        onPress={handleTakePhoto}
        style={[{ flex: 1, ...commonStyles.button }, { backgroundColor: '#3B82F6' }]}
        disabled={!isCaptureEnabled}
      >
        <Text style={commonStyles.icon}>📷</Text>
        <Text style={commonStyles.label}>Take Photo</Text>
      </Pressable>
      
      <Pressable
        onPress={handlePickFromLibrary}
        style={[{ flex: 1, ...commonStyles.button }, { backgroundColor: '#10B981' }]}
        disabled={!isCaptureEnabled}
      >
        <Text style={commonStyles.icon}>📚</Text>
        <Text style={commonStyles.label}>From Library</Text>
      </Pressable>
      
      {imageUri && (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Text style={{ color: '#1DBF73', fontSize: 12 }}>🖼️</Text>
          <Text style={{ color: '#1DBF73', fontSize: 12 }}>
            {imageUri}
          </Text>
        </View>
      )}
    </View>
  );
}