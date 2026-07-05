import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import {
  loginWithPkce,
  logoutSession,
  prefetchAuthConfiguration,
  refreshSession,
  type StoredAuthSession,
} from '@/services/auth';

const ACCESS_TOKEN_KEY = 'edu.auth.accessToken';
const REFRESH_TOKEN_KEY = 'edu.auth.refreshToken';
const ID_TOKEN_KEY = 'edu.auth.idToken';
const TOKEN_EXPIRY_KEY = 'edu.auth.accessTokenExpiry';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiry: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isNativeSupported: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getValidAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistSession(session: StoredAuthSession): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken ?? '');
  await SecureStore.setItemAsync(ID_TOKEN_KEY, session.idToken ?? '');
  await SecureStore.setItemAsync(
    TOKEN_EXPIRY_KEY,
    session.accessTokenExpirationDate ?? '',
  );
}

async function clearSessionStorage(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(ID_TOKEN_KEY);
  await SecureStore.deleteItemAsync(TOKEN_EXPIRY_KEY);
}

async function readStoredSession(): Promise<Pick<
  AuthState,
  'accessToken' | 'refreshToken' | 'idToken' | 'accessTokenExpiry'
>> {
  const [accessToken, refreshToken, idToken, accessTokenExpiry] =
    await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.getItemAsync(ID_TOKEN_KEY),
      SecureStore.getItemAsync(TOKEN_EXPIRY_KEY),
    ]);

  return {
    accessToken,
    refreshToken: refreshToken || null,
    idToken,
    accessTokenExpiry,
  };
}

function isExpired(expirationDate: string | null): boolean {
  if (!expirationDate) {
    return false;
  }
  return new Date(expirationDate).getTime() <= Date.now() + 60_000;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isNativeSupported = Platform.OS !== 'web';

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [accessTokenExpiry, setAccessTokenExpiry] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!isNativeSupported) {
        setIsLoading(false);
        return;
      }

      try {
        await prefetchAuthConfiguration();
        const stored = await readStoredSession();
        if (cancelled) {
          return;
        }

        setAccessToken(stored.accessToken);
        setRefreshToken(stored.refreshToken);
        setIdToken(stored.idToken);
        setAccessTokenExpiry(stored.accessTokenExpiry);
      } catch (bootstrapError) {
        if (!cancelled) {
          const message =
            bootstrapError instanceof Error
              ? bootstrapError.message
              : 'Failed to restore session';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [isNativeSupported]);

  const applySession = useCallback((session: StoredAuthSession) => {
    setAccessToken(session.accessToken);
    setRefreshToken(session.refreshToken ?? null);
    setIdToken(session.idToken ?? null);
    setAccessTokenExpiry(session.accessTokenExpirationDate ?? null);
    setError(null);
  }, []);

  const login = useCallback(async () => {
    if (!isNativeSupported) {
      setError('OIDC login requires a native dev build (expo-dev-client).');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await loginWithPkce();
      await persistSession(result);
      applySession(result);
    } catch (loginError) {
      const message =
        loginError instanceof Error ? loginError.message : 'Login failed';
      setError(message);
      throw loginError;
    } finally {
      setIsLoading(false);
    }
  }, [applySession, isNativeSupported]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (accessToken) {
        await logoutSession({
          accessToken,
          refreshToken,
          idToken: idToken ?? undefined,
        });
      }
    } catch (logoutError) {
      const message =
        logoutError instanceof Error ? logoutError.message : 'Logout failed';
      setError(message);
    } finally {
      await clearSessionStorage();
      setAccessToken(null);
      setRefreshToken(null);
      setIdToken(null);
      setAccessTokenExpiry(null);
      setIsLoading(false);
    }
  }, [accessToken, idToken, refreshToken]);

  const getValidAccessToken = useCallback(async () => {
    if (!accessToken) {
      return null;
    }

    if (!isExpired(accessTokenExpiry)) {
      return accessToken;
    }

    if (!refreshToken || !isNativeSupported) {
      return null;
    }

    try {
      const result = await refreshSession(refreshToken);
      await persistSession(result);
      applySession(result);
      return result.accessToken;
    } catch (refreshError) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : 'Session refresh failed';
      setError(message);
      await clearSessionStorage();
      setAccessToken(null);
      setRefreshToken(null);
      setIdToken(null);
      setAccessTokenExpiry(null);
      return null;
    }
  }, [
    accessToken,
    accessTokenExpiry,
    applySession,
    isNativeSupported,
    refreshToken,
  ]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      refreshToken,
      idToken,
      accessTokenExpiry,
      isAuthenticated: Boolean(accessToken),
      isLoading,
      isNativeSupported,
      error,
      login,
      logout,
      getValidAccessToken,
    }),
    [
      accessToken,
      accessTokenExpiry,
      error,
      getValidAccessToken,
      idToken,
      isLoading,
      isNativeSupported,
      login,
      logout,
      refreshToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
