import os
import unittest


os.environ.setdefault("GPIO_MODE", "mock")

import gpio_adapter


class GpioAdapterModeResolutionTest(unittest.TestCase):
    def test_auto_mode_uses_mock_when_not_on_raspberry_pi(self):
        self.assertEqual(
            gpio_adapter.resolve_gpio_mode("auto", detector=lambda: False),
            "mock",
        )

    def test_auto_mode_uses_real_when_raspberry_pi_is_detected(self):
        self.assertEqual(
            gpio_adapter.resolve_gpio_mode("auto", detector=lambda: True),
            "real",
        )

    def test_explicit_mock_override_is_respected(self):
        self.assertEqual(
            gpio_adapter.resolve_gpio_mode("mock", detector=lambda: True),
            "mock",
        )

    def test_explicit_real_override_is_respected(self):
        self.assertEqual(
            gpio_adapter.resolve_gpio_mode("real", detector=lambda: False),
            "real",
        )

    def test_invalid_mode_falls_back_to_auto_detection(self):
        self.assertEqual(
            gpio_adapter.resolve_gpio_mode("surprise", detector=lambda: False),
            "mock",
        )


if __name__ == "__main__":
    unittest.main()
