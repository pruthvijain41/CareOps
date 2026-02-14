"""
CareOps — Base External Service
Provides retry logic, structured error handling, and logging
for all external API integrations.
"""

import logging
from typing import Any, TypeVar

from tenacity import (
    RetryError,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import Settings, get_settings

T = TypeVar("T")
logger = logging.getLogger(__name__)


class ExternalServiceError(Exception):
    """Raised when an external API call fails after all retries."""

    def __init__(self, service_name: str, message: str, original_error: Exception | None = None):
        self.service_name = service_name
        self.original_error = original_error
        super().__init__(f"[{service_name}] {message}")


class BaseExternalService:
    """
    Base class for all external API service wrappers.

    Features:
    - Automatic retry with exponential backoff (via tenacity)
    - Structured logging for all calls
    - Graceful failure handling — never crashes the request
    """

    service_name: str = "BaseService"

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.logger = logging.getLogger(f"careops.services.{self.service_name}")

    def _get_retry_decorator(self) -> Any:
        """Build a tenacity retry decorator from settings."""
        return retry(
            stop=stop_after_attempt(self.settings.EXTERNAL_API_MAX_RETRIES),
            wait=wait_exponential(
                multiplier=self.settings.EXTERNAL_API_RETRY_DELAY,
                min=1,
                max=30,
            ),
            retry=retry_if_exception_type((ConnectionError, TimeoutError, OSError)),
            before_sleep=self._log_retry,
            reraise=True,
        )

    def _log_retry(self, retry_state: Any) -> None:
        """Log each retry attempt."""
        self.logger.warning(
            "Retry %d/%d for %s — %s",
            retry_state.attempt_number,
            self.settings.EXTERNAL_API_MAX_RETRIES,
            self.service_name,
            retry_state.outcome.exception() if retry_state.outcome else "unknown",
        )

    async def _execute_with_retry(self, func: Any, *args: Any, **kwargs: Any) -> Any:
        """
        Execute an async function with retry logic.
        Returns the result or raises ExternalServiceError on total failure.
        """
        retry_decorator = self._get_retry_decorator()

        @retry_decorator
        async def _wrapped() -> Any:
            return await func(*args, **kwargs)

        try:
            result = await _wrapped()
            self.logger.info("✅ %s call succeeded", self.service_name)
            return result
        except RetryError as exc:
            self.logger.error(
                "❌ %s failed after %d retries",
                self.service_name,
                self.settings.EXTERNAL_API_MAX_RETRIES,
            )
            original = exc.last_attempt.exception() if exc.last_attempt else None
            raise ExternalServiceError(
                service_name=self.service_name,
                message=f"All {self.settings.EXTERNAL_API_MAX_RETRIES} retries exhausted",
                original_error=original,  # type: ignore[arg-type]
            ) from exc

    async def health_check(self) -> bool:
        """Override in subclasses to verify connectivity."""
        return True
