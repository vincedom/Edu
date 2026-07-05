import {
  authorize,
  logout as endOidcSession,
  prefetchConfiguration,
  refresh,
  revoke,
  type AuthConfiguration,
  type AuthorizeResult,
  type RefreshResult,
} from 'react-native-app-auth';

export const AUTH_REDIRECT_URL = 'front://oauth/callback';
export const AUTH_POST_LOGOUT_REDIRECT_URL = 'front://oauth/logout';

const issuer =
  process.env.EXPO_PUBLIC_OIDC_ISSUER ?? 'https://localhost:8443/auth/v1';
const clientId = process.env.EXPO_PUBLIC_OIDC_CLIENT_ID ?? 'edu-front-app';

export const authConfig: AuthConfiguration = {
  issuer,
  clientId,
  redirectUrl: AUTH_REDIRECT_URL,
  scopes: ['openid', 'profile', 'email'],
  additionalParameters: {},
  iosCustomBrowser: 'safari',
  usePKCE: true,
};

export interface StoredAuthSession {
  accessToken: string;
  refreshToken?: string | null;
  idToken?: string;
  accessTokenExpirationDate?: string;
}

export async function prefetchAuthConfiguration(): Promise<void> {
  await prefetchConfiguration({
    ...authConfig,
    warmAndPrefetchChrome: true,
  });
}

export async function loginWithPkce(): Promise<AuthorizeResult> {
  return authorize(authConfig);
}

export async function refreshSession(refreshToken: string): Promise<RefreshResult> {
  return refresh(authConfig, {
    refreshToken,
  });
}

export async function logoutSession(session: StoredAuthSession): Promise<void> {
  if (session.refreshToken || session.accessToken) {
    await revoke(authConfig, {
      tokenToRevoke: session.refreshToken ?? session.accessToken,
      sendClientId: true,
    });
  }

  if (session.idToken) {
    await endOidcSession(
      {
        issuer,
        clientId,
      },
      {
        idToken: session.idToken,
        postLogoutRedirectUrl: AUTH_POST_LOGOUT_REDIRECT_URL,
      },
    );
  }
}
