from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Le titre et l'environnement de l'API
    PROJECT_NAME: str = "Edu Backend API"
    VERSION: str = "0.1.0"
    DEBUG: bool = False

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug_mode(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"release", "prod", "production"}:
                return False
            if normalized in {"dev", "debug", "development"}:
                return True
        return value

    # Clé API obligatoire pour Gemini
    # Pydantic lèvera une erreur claire au démarrage si elle est manquante
    GEMINI_API_KEY: str

    # OIDC / Rauthy (JWT validation via JWKS)
    OIDC_ISSUER: str = "https://localhost:8443/auth/v1"
    OIDC_AUDIENCE: str = "edu-front-app"
    AUTH_REQUIRED: bool = False

    # Configuration Audio (On centralise pour éviter les "magic numbers")
    SAMPLE_RATE: int = 16000
    FRAME_DURATION_MS: int = 30

    # Permet de charger automatiquement un fichier .env à la racine du projet /back
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8",
        extra="ignore" # Ignore les variables du .env non définies ici
    )

# Instance unique (Singleton) à importer dans tes autres fichiers
settings = Settings()
