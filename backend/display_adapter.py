import os
from pathlib import Path


def _looks_like_raspberry_pi():
    """Detect Raspberry Pi hardware from the standard Linux model files."""

    model_paths = (
        Path("/sys/firmware/devicetree/base/model"),
        Path("/proc/device-tree/model"),
    )
    for model_path in model_paths:
        try:
            if "raspberry pi" in model_path.read_text(errors="ignore").lower():
                return True
        except OSError:
            continue

    try:
        cpuinfo = Path("/proc/cpuinfo").read_text(errors="ignore").lower()
    except OSError:
        return False

    return "raspberry pi" in cpuinfo or "bcm27" in cpuinfo or "bcm28" in cpuinfo


def _normalize_oled_mode(raw_mode=None):
    """Normalize the requested OLED mode into auto/mock/real."""

    normalized = str(raw_mode or "auto").strip().lower()
    if normalized in {"auto", "mock", "real"}:
        return normalized
    return "auto"


def resolve_oled_mode(raw_mode=None, *, detector=None):
    """Choose OLED mode, defaulting to auto-detection for Pi deployments."""

    requested_mode = _normalize_oled_mode(
        os.getenv("OLED_MODE") if raw_mode is None else raw_mode
    )
    if requested_mode != "auto":
        return requested_mode

    detector = detector or _looks_like_raspberry_pi
    return "real" if detector() else "mock"


OLED_MODE = resolve_oled_mode()


if OLED_MODE == "real":
    try:
        from luma.core.interface.serial import i2c
        from luma.oled.device import sh1106, ssd1306
        from PIL import Image, ImageDraw, ImageFont

        _OLED_IMPORT_ERROR = None
    except Exception as error:  # pragma: no cover - only reached on Pi misconfiguration.
        i2c = None
        sh1106 = None
        ssd1306 = None
        Image = None
        ImageDraw = None
        ImageFont = None
        _OLED_IMPORT_ERROR = error
else:
    i2c = None
    sh1106 = None
    ssd1306 = None
    Image = None
    ImageDraw = None
    ImageFont = None
    _OLED_IMPORT_ERROR = None


class StatusDisplay:
    """Mirror backend status text to one or more small OLED displays when available."""

    MAX_LINE_LENGTH = 21

    def __init__(self) -> None:
        self.mode = OLED_MODE
        self.enabled = False
        self.devices = []
        self.font = None
        self.width = self._coerce_int(os.getenv("OLED_WIDTH"), default=128)
        self.height = self._coerce_int(os.getenv("OLED_HEIGHT"), default=64)
        self.rotate = self._coerce_int(os.getenv("OLED_ROTATE"), default=0)
        self.device_type = str(os.getenv("OLED_DEVICE_TYPE", "ssd1306")).strip().lower()
        self.addresses = self._parse_addresses(os.getenv("OLED_I2C_ADDRESSES", "0x3C"))
        self.last_lines: tuple[str, ...] = ()
        self.last_error = None

        if self.mode == "real":
            self._initialize_real_devices()

    def render(self, lines: list[str] | tuple[str, ...]) -> None:
        """Render a small set of text lines to every configured OLED."""

        normalized_lines = tuple(self._normalize_lines(lines))
        self.last_lines = normalized_lines

        if not self.enabled:
            return

        row_height = 12
        for device in self.devices:
            image = Image.new("1", (device.width, device.height))
            draw = ImageDraw.Draw(image)
            for index, line in enumerate(normalized_lines):
                draw.text((0, index * row_height), line, font=self.font, fill=255)
            device.display(image)

    def clear(self) -> None:
        """Clear the display content and reset the cached text."""

        self.last_lines = ()
        if not self.enabled:
            return

        for device in self.devices:
            device.clear()

    def _initialize_real_devices(self) -> None:
        """Best-effort setup for Pi OLED hardware without breaking the backend if absent."""

        if _OLED_IMPORT_ERROR is not None:
            self.last_error = str(_OLED_IMPORT_ERROR)
            return

        device_class = ssd1306 if self.device_type != "sh1106" else sh1106

        try:
            self.font = ImageFont.load_default()
            for address in self.addresses:
                serial = i2c(port=1, address=address)
                self.devices.append(
                    device_class(serial, width=self.width, height=self.height, rotate=self.rotate)
                )
        except Exception as error:
            self.devices = []
            self.last_error = str(error)
            return

        self.enabled = bool(self.devices)

    def _normalize_lines(self, lines: list[str] | tuple[str, ...]) -> list[str]:
        max_lines = max(self.height // 12, 1)
        normalized = []
        for line in lines[:max_lines]:
            text = str(line or "").strip()
            normalized.append(text[: self.MAX_LINE_LENGTH])
        return normalized

    @staticmethod
    def _coerce_int(value, *, default: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _parse_addresses(raw_addresses: str) -> list[int]:
        addresses = []
        for chunk in str(raw_addresses or "").split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            try:
                addresses.append(int(chunk, 0))
            except ValueError:
                continue
        return addresses or [0x3C]
