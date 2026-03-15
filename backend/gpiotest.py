from signal import pause
from time import sleep

from gpio_adapter import Button, LED, RGBLED, GPIO_MODE


BUTTON_ONE_GPIO = 4
BUTTON_TWO_GPIO = 18
LED_ONE_GPIO = 24
LED_TWO_GPIO = 5
RGB_RED_GPIO = 12
RGB_GREEN_GPIO = 16
RGB_BLUE_GPIO = 20


def build_devices():
    """Create the button and light devices through the shared GPIO adapter."""

    button_one = Button(BUTTON_ONE_GPIO, pull_up=False)
    button_two = Button(BUTTON_TWO_GPIO, pull_up=False)
    led_one = LED(LED_ONE_GPIO)
    led_two = LED(LED_TWO_GPIO)
    rgb_led = RGBLED(red=RGB_RED_GPIO, green=RGB_GREEN_GPIO, blue=RGB_BLUE_GPIO)
    return button_one, button_two, led_one, led_two, rgb_led


def bind_callbacks(button_one, button_two, led_one, led_two):
    """Wire button presses to LED toggles for a quick interactive smoke test."""

    def button_one_pressed():
        print("[BUTTON] Button 1 Pressed! Toggling LED 1.")
        led_one.toggle()

    def button_two_pressed():
        print("[BUTTON] Button 2 Pressed! Toggling LED 2.")
        led_two.toggle()

    button_one.when_pressed = button_one_pressed
    button_two.when_pressed = button_two_pressed


def test_leds(led_one, led_two):
    """Blink the single LEDs to confirm they are working."""

    print("[TEST] Blinking single LEDs...")
    for _ in range(3):
        led_one.on()
        led_two.on()
        sleep(0.5)
        led_one.off()
        led_two.off()
        sleep(0.5)
    print("[TEST] LED test complete.")


def test_rgb_led(rgb_led):
    """Cycle through RGB LED colors to ensure all channels work."""

    print("[TEST] Cycling RGB LED colors...")
    colors = {
        "Red": (1, 0, 0),
        "Green": (0, 1, 0),
        "Blue": (0, 0, 1),
        "Yellow": (1, 1, 0),
        "Cyan": (0, 1, 1),
        "Magenta": (1, 0, 1),
        "White": (1, 1, 1),
        "Off": (0, 0, 0),
    }

    for name, color in colors.items():
        rgb_led.color = color
        print(f"[RGB LED] {name}")
        sleep(1)

    print("[TEST] RGB LED test complete.")


def main():
    """Run the standalone GPIO smoke test through the same adapter as the backend."""

    print(f"Starting GPIO Test Script in GPIO mode: {GPIO_MODE}")

    button_one, button_two, led_one, led_two, rgb_led = build_devices()
    bind_callbacks(button_one, button_two, led_one, led_two)

    test_leds(led_one, led_two)
    test_rgb_led(rgb_led)

    print("Test complete! Press buttons to toggle LEDs.")
    pause()


if __name__ == "__main__":
    main()
