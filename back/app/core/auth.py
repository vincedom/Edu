from dataclasses import dataclass

import jwt
from jwt import PyJWKClient, PyJWTError

from app.core.config import settings


@dataclass(frozen=True)
class AuthUser:
    sub: str
    email: str | None = None
    name: str | None = None
    roles: tuple[str, ...] = ()


class AuthenticationError(Exception):
    pass


_jwk_client: PyJWKClient | None = None


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        jwks_url = f"{settings.OIDC_ISSUER.rstrip('/')}/.well-known/jwks.json"
        _jwk_client = PyJWKClient(jwks_url)
    return _jwk_client


def verify_access_token(token: str) -> AuthUser:
    if not settings.OIDC_ISSUER:
        raise AuthenticationError("OIDC issuer is not configured")

    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "RS384", "RS512", "EdDSA"],
            issuer=settings.OIDC_ISSUER.rstrip("/"),
            options={"verify_aud": False, "require": ["exp", "sub"]},
        )
    except PyJWTError as exc:
        raise AuthenticationError("Invalid access token") from exc

    if settings.OIDC_AUDIENCE:
        token_audience = payload.get("aud")
        allowed_audiences = (
            {token_audience}
            if isinstance(token_audience, str)
            else set(token_audience or [])
        )
        if settings.OIDC_AUDIENCE not in allowed_audiences:
            raise AuthenticationError("Token audience mismatch")

    raw_roles = payload.get("roles") or payload.get("role") or []
    if isinstance(raw_roles, str):
        roles = (raw_roles,)
    else:
        roles = tuple(str(role) for role in raw_roles)

    return AuthUser(
        sub=str(payload["sub"]),
        email=payload.get("email"),
        name=payload.get("name") or payload.get("preferred_username"),
        roles=roles,
    )
