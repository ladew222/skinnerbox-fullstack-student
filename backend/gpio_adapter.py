import os
from pathlib import Path


def _normalize_gpio_mode(raw_mode=None):
    """Return a supported GPIO mode string from env input or a direct override."""

    normalized = str(raw_mode or "auto").strip().lower()
    if normalized in {"auto", "mock", "real"}:
        return normalized
    return "auto"


def _looks_like_raspberry_pi():
    """Detect a Raspberry Pi using the common Linux model/cpuinfo files."""

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


def resolve_gpio_mode(raw_mode=None, *, detector=None):
    """Choose the GPIO mode, defaulting to auto-detection for Pi deployments."""

    requested_mode = _normalize_gpio_mode(
        os.getenv("GPIO_MODE") if raw_mode is None else raw_mode
    )
    if requested_mode != "auto":
        return requested_mode

    detector = detector or _looks_like_raspberry_pi
    return "real" if detector() else "mock"


GPIO_MODE = resolve_gpio_mode()


if GPIO_MODE == "real":
    try:
        # Real Raspberry Pi hardware
        from gpiozero import Button, LED, OutputDevice, RGBLED, TonalBuzzer
        from gpiozero.tones import Tone
    except Exception as error:
        raise RuntimeError(
            "GPIO_MODE resolved to 'real', but gpiozero hardware support could not be loaded. "
            "Install the Pi GPIO dependencies or set GPIO_MODE=mock."
        ) from error

    class PassiveBuzzer:
        def __init__(self, *args, **kwargs):
            self._buzzer = TonalBuzzer(*args, **kwargs)

        @property
        def is_active(self):
            return self._buzzer.is_active

        def play(self, frequency_hz):
            self._buzzer.play(Tone(float(frequency_hz)))

        def stop(self):
            self._buzzer.stop()

else:
    # Mock classes for laptops, CI, and Docker.
    class Button:
        def __init__(self, *args, **kwargs):
            print("[GPIO MOCK] Button initialized")
            self.when_pressed = None
            self.when_released = None
            self.bounce_time = kwargs.get("bounce_time")

    class OutputDevice:
        def __init__(self, *args, **kwargs):
            print("[GPIO MOCK] Device initialized")
            self.is_active = False

        def on(self):
            self.is_active = True
            print("[GPIO MOCK] Device ON")

        def off(self):
            self.is_active = False
            print("[GPIO MOCK] Device OFF")

    class LED:
        def __init__(self, *args, **kwargs):
            print("[GPIO MOCK] LED initialized")
            self.is_lit = False

        def on(self):
            self.is_lit = True
            print("[GPIO MOCK] LED ON")

        def off(self):
            self.is_lit = False
            print("[GPIO MOCK] LED OFF")

        def toggle(self):
            if self.is_lit:
                self.off()
            else:
                self.on()

    class RGBLED:
        def __init__(self, *args, **kwargs):
            print("[GPIO MOCK] RGB LED initialized")
            self.color = (0, 0, 0)

    class PassiveBuzzer:
        def __init__(self, *args, **kwargs):
            print("[GPIO MOCK] Passive buzzer initialized")
            self.is_active = False
            self.last_frequency = None

        def play(self, frequency_hz):
            self.is_active = True
            self.last_frequency = float(frequency_hz)
            print(f"[GPIO MOCK] Passive buzzer playing {self.last_frequency} Hz")

        def stop(self):
            self.is_active = False
            print("[GPIO MOCK] Passive buzzer stopped")
