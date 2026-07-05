import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LogIn } from 'lucide-react-native';

import { useAuth } from '@/contexts/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error, isNativeSupported } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    setIsSubmitting(true);
    try {
      await login();
      router.replace('/admin/parent');
    } catch {
      // Error state is handled by AuthContext.
    } finally {
      setIsSubmitting(false);
    }
  };

  const busy = isLoading || isSubmitting;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Adult Space</Text>
      <Text style={styles.subtitle}>
        Sign in with Rauthy using OIDC Authorization Code + PKCE.
      </Text>

      {!isNativeSupported && (
        <Text style={styles.warning}>
          Native OIDC via react-native-app-auth is not available on web. Build a
          dev client with `npx expo prebuild` and run on Android or iOS.
        </Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={busy || !isNativeSupported}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <LogIn color="#FFFFFF" size={22} />
            <Text style={styles.buttonText}>Sign in with Rauthy</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>

      {Platform.OS !== 'web' ? (
        <Text style={styles.hint}>
          Ensure Rauthy is running (`docker compose up`) and the client
          `edu-front-app` is registered with redirect URI `front://oauth/callback`.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
    lineHeight: 22,
  },
  warning: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    lineHeight: 20,
  },
  error: {
    color: '#B91C1C',
    marginBottom: 16,
    lineHeight: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#374151',
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginLeft: 8,
  },
  backButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#4B5563',
    fontSize: 16,
  },
  hint: {
    marginTop: 24,
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
  },
});
