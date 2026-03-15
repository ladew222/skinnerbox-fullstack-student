from __future__ import annotations


class ApiError(Exception):
    """Structured backend error that can be surfaced directly in the frontend UI."""

    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        details: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}

    def to_payload(self) -> dict[str, object]:
        payload = {
            "error": {
                "code": self.code,
                "message": self.message,
            }
        }
        if self.details:
            payload["error"]["details"] = self.details
        return payload


class ConfigurationError(ApiError):
    """Raised when incoming test settings cannot be converted into a valid test."""

    def __init__(self, message: str, details: dict[str, object] | None = None) -> None:
        super().__init__(
            code="INVALID_TEST_CONFIGURATION",
            message=message,
            status=400,
            details=details,
        )
