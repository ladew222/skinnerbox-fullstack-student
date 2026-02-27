import os

GPIO_MODE = os.getenv("GPIO_MODE", "mock")

if GPIO_MODE == "real":
    # Real Raspberry Pi hardware
    from gpiozero import Button, LED, RGBLED, OutputDevice

else:
    # Mock classes for Docker / laptops
    class Button:
        def __init__(self, *args, **kwargs):
            print("[GPIO MOCK] Button initialized")

        def when_pressed(self, fn):
            print("[GPIO MOCK] Button press handler set")
            
    class OutputDevice:
        def __init__(self, *args, **kwargs ):
            print("[GPIO MOCK] Device initialized")

        def on(self):
            print("[GPIO MOCK] Device ON")

        def off(self):
            print("[GPIO MOCK] Device OFF")
        

    class LED:
        def __init__(self, *args, **kwargs):
            print("[GPIO MOCK] LED initialized")

        def on(self):
            print("[GPIO MOCK] LED ON")

        def off(self):
            print("[GPIO MOCK] LED OFF")

    class RGBLED:
        def __init__(self, *args, **kwargs):
            print("[GPIO MOCK] RGBLED initialized")

        def color(self, value):
            print(f"[GPIO MOCK] RGBLED color set to {value}")
