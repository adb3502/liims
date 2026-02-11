from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "LIIMS"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://liims:password@postgres:5432/liims"
    REPLICA_DATABASE_URL: str = ""

    # Redis
    REDIS_URL: str = "redis://redis:6379"

    # Security
    SECRET_KEY: str = "change-me-in-production"
    JWT_EXPIRY_HOURS: int = 24
    JWT_ALGORITHM: str = "HS256"
    BCRYPT_ROUNDS: int = 12

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8080"]

    # Session
    SESSION_TIMEOUT_MINUTES: int = 30
    MAX_CONCURRENT_SESSIONS: int = 3

    # ODK Integration
    ODK_CENTRAL_URL: str = ""
    ODK_CENTRAL_EMAIL: str = ""
    ODK_CENTRAL_PASSWORD: str = ""
    ODK_SYNC_INTERVAL_MINUTES: int = 60

    # Email / SMTP
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_NAME: str = "LIIMS Alerts"
    SMTP_USE_TLS: bool = True

    # NAS / File Storage
    NAS_MOUNT_PATH: str = "/data/nas"

    # Celery
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/1"

    # Dashboard
    DASHBOARD_REFRESH_INTERVAL_MINUTES: int = 15

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


settings = Settings()
