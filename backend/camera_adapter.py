from __future__ import annotations

import os
from pathlib import Path
import threading
import time


SUPPORTED_CAMERA_MODES = {"auto", "off", "mock", "real"}


def _normalize_camera_mode(raw_mode=None):
    """Return a supported camera mode from env input or a direct override."""

    normalized = str(raw_mode or "auto").strip().lower()
    if normalized in SUPPORTED_CAMERA_MODES:
        return normalized
    return "auto"


def resolve_camera_mode(raw_mode=None):
    """Choose the camera mode from the explicit override or environment."""

    return _normalize_camera_mode(
        os.getenv("CAMERA_MODE") if raw_mode is None else raw_mode
    )


class CameraUnavailableError(RuntimeError):
    """Raised when an optional camera preview is requested but unavailable."""


class CameraManager:
    """Optional USB camera helper used by the Trial page snapshot preview."""

    def __init__(self, raw_mode=None):
        self.mode = resolve_camera_mode(raw_mode)
        self.device_index = max(int(os.getenv("CAMERA_DEVICE_INDEX", "0")), 0)
        self.width = max(int(os.getenv("CAMERA_WIDTH", "320")), 1)
        self.height = max(int(os.getenv("CAMERA_HEIGHT", "240")), 1)
        self.refresh_interval_seconds = max(
            float(os.getenv("CAMERA_REFRESH_INTERVAL_SECONDS", "1.5")),
            0.5,
        )
        self.jpeg_quality = min(
            max(int(os.getenv("CAMERA_JPEG_QUALITY", "70")), 30),
            95,
        )
        self._status_cache_ttl_seconds = max(
            float(os.getenv("CAMERA_STATUS_CACHE_SECONDS", "5")),
            0.0,
        )
        self._status_cache = None
        self._status_cache_expires_at = 0.0
        self._lock = threading.Lock()

    def get_status(self) -> dict[str, object]:
        """Return whether a compatible preview camera is available right now."""

        with self._lock:
            now = time.monotonic()
            if (
                self._status_cache is not None
                and now < self._status_cache_expires_at
            ):
                return dict(self._status_cache)

            status = self._build_status()
            self._status_cache = dict(status)
            self._status_cache_expires_at = now + self._status_cache_ttl_seconds
            return dict(status)

    def invalidate_status_cache(self) -> None:
        """Force the next status check to probe the hardware again."""

        with self._lock:
            self._status_cache = None
            self._status_cache_expires_at = 0.0

    def capture_frame(self) -> tuple[bytes, str]:
        """Return one preview frame and its MIME type for the active camera mode."""

        status = self.get_status()
        if not status.get("available"):
            raise CameraUnavailableError(
                status.get("reason") or "No optional camera preview is available on this box."
            )

        if status.get("mode") == "mock":
            return self._mock_frame_bytes(), "image/svg+xml"

        cv2 = self._import_cv2()
        if cv2 is None:
            raise CameraUnavailableError(
                "OpenCV camera support is not installed on this box."
            )

        capture = cv2.VideoCapture(self.device_index)
        try:
            if not capture.isOpened():
                raise CameraUnavailableError(
                    f"Unable to open camera device /dev/video{self.device_index}."
                )

            capture.set(cv2.CAP_PROP_FRAME_WIDTH, float(self.width))
            capture.set(cv2.CAP_PROP_FRAME_HEIGHT, float(self.height))

            # Warm up the camera slightly before reading the frame we return.
            for _ in range(2):
                capture.read()

            success, frame = capture.read()
            if not success or frame is None:
                raise CameraUnavailableError("Unable to read a frame from the camera.")

            success, encoded = cv2.imencode(
                ".jpg",
                frame,
                [int(cv2.IMWRITE_JPEG_QUALITY), int(self.jpeg_quality)],
            )
            if not success:
                raise CameraUnavailableError("Unable to encode the camera frame.")

            return encoded.tobytes(), "image/jpeg"
        finally:
            capture.release()

    def _build_status(self) -> dict[str, object]:
        """Probe the current camera mode and summarize preview availability."""

        base_status = {
            "mode": self.mode,
            "deviceIndex": self.device_index,
            "refreshIntervalSeconds": self.refresh_interval_seconds,
            "resolution": f"{self.width}x{self.height}",
        }

        if self.mode == "off":
            return {
                **base_status,
                "available": False,
                "reason": "Camera preview is disabled on this box.",
            }

        if self.mode == "mock":
            return {
                **base_status,
                "available": True,
                "deviceName": "Mock Camera",
            }

        if not Path(f"/dev/video{self.device_index}").exists():
            return {
                **base_status,
                "available": False,
                "reason": f"No USB camera was found at /dev/video{self.device_index}.",
            }

        cv2 = self._import_cv2()
        if cv2 is None:
            return {
                **base_status,
                "available": False,
                "reason": (
                    "Python camera support is not installed. Install OpenCV support to enable previews."
                ),
            }

        capture = cv2.VideoCapture(self.device_index)
        try:
            if not capture.isOpened():
                return {
                    **base_status,
                    "available": False,
                    "reason": f"Unable to open /dev/video{self.device_index}.",
                }

            capture.set(cv2.CAP_PROP_FRAME_WIDTH, float(self.width))
            capture.set(cv2.CAP_PROP_FRAME_HEIGHT, float(self.height))
            width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or self.width)
            height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or self.height)

            return {
                **base_status,
                "available": True,
                "deviceName": f"USB Camera {self.device_index}",
                "resolution": f"{width}x{height}",
            }
        finally:
            capture.release()

    @staticmethod
    def _import_cv2():
        """Load OpenCV only when camera support is actually needed."""

        try:
            import cv2  # type: ignore
        except Exception:
            return None
        return cv2

    @staticmethod
    def _mock_frame_bytes() -> bytes:
        """Return a simple inline SVG preview used for mock/testing mode."""

        return (
            b'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">'
            b'<rect width="320" height="240" fill="#eef6ff"/>'
            b'<rect x="16" y="16" width="288" height="208" rx="18" fill="#dceaf8" stroke="#7aa7cf" stroke-width="4"/>'
            b'<circle cx="160" cy="104" r="44" fill="#8fb7da"/>'
            b'<circle cx="160" cy="104" r="16" fill="#f4fbff"/>'
            b'<rect x="88" y="166" width="144" height="26" rx="8" fill="#537ea5"/>'
            b'<text x="160" y="182" text-anchor="middle" font-family="Arial" font-size="16" fill="#ffffff">Mock Camera Preview</text>'
            b'</svg>'
        )
