import os
import unittest


os.environ.setdefault("GPIO_MODE", "mock")

import gpiotest
import run_pump


class GpioHelperScriptsTest(unittest.TestCase):
    def test_run_pump_uses_shared_gpio_adapter(self):
        self.assertEqual(run_pump.GPIO_MODE, "mock")
        self.assertTrue(callable(run_pump.main))

    def test_gpiotest_builds_mock_devices_without_real_gpio(self):
        self.assertEqual(gpiotest.GPIO_MODE, "mock")
        button_one, button_two, led_one, led_two, rgb_led = gpiotest.build_devices()

        self.assertIsNotNone(button_one)
        self.assertIsNotNone(button_two)
        self.assertTrue(hasattr(led_one, "toggle"))
        self.assertTrue(hasattr(led_two, "toggle"))
        self.assertTrue(hasattr(rgb_led, "color"))


if __name__ == "__main__":
    unittest.main()
