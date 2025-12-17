from gpiozero import Button, LED, RGBLED
from time import sleep
from signal import pause

# Initialize buttons with pull-down resistors
button1 = Button(4, pull_up=False)
button2 = Button(18, pull_up=False)

# Initialize single-color LEDs
led1 = LED(24)
led2 = LED(5)

# Initialize RGB LED
rgb_led = RGBLED(red=12, green=16, blue=20)

# === BUTTON CALLBACK FUNCTIONS ===
def button1_pressed():
    print("[BUTTON] Button 1 Pressed! Toggling LED 1.")
    led1.toggle()

def button2_pressed():
    print("[BUTTON] Button 2 Pressed! Toggling LED 2.")
    led2.toggle()

# Assign button actions
button1.when_pressed = button1_pressed
button2.when_pressed = button2_pressed

# === LIGHT TEST FUNCTIONS ===
def test_leds():
    """Blink the single LEDs to confirm they are working."""
    print("[TEST] Blinking single LEDs...")
    for _ in range(3):
        led1.on()
        led2.on()
        sleep(0.5)
        led1.off()
        led2.off()
        sleep(0.5)
    print("[TEST] LED test complete.")

def test_rgb_led():
    """Cycle through RGB LED colors to ensure all work."""
    print("[TEST] Cycling RGB LED colors...")
    colors = {
        "Red": (1, 0, 0),
        "Green": (0, 1, 0),
        "Blue": (0, 0, 1),
        "Yellow": (1, 1, 0),
        "Cyan": (0, 1, 1),
        "Magenta": (1, 0, 1),
        "White": (1, 1, 1),
        "Off": (0, 0, 0)
    }
    
    for name, color in colors.items():
        rgb_led.color = color
        print(f"[RGB LED] {name}")
        sleep(1)
    
    print("[TEST] RGB LED test complete.")

# === RUN TESTS AT STARTUP ===
print("Starting GPIO Test Script...")

test_leds()       # Blink single LEDs
test_rgb_led()    # Cycle through RGB LED colors

print("Test complete! Press buttons to toggle LEDs.")
pause()  # Keeps script running for button events
