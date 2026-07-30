"""Application settings, loaded once from environment / .env file.

Everything configurable lives here so no module reads os.environ directly.
Import the singleton `settings` anywhere you need a value.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Database ---
    DATABASE_URL: str = "postgresql+asyncpg://realty:realty@localhost:5432/realty"

    # --- Security ---
    SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- App ---
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = "http://localhost:5173"

    # --- First admin (seed) ---
    FIRST_ADMIN_EMAIL: str = "admin@realty.uz"
    FIRST_ADMIN_PASSWORD: str = "admin12345"
    FIRST_ADMIN_NAME: str = "System Administrator"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.ENVIRONMENT == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
