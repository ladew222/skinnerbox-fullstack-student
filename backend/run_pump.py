from gpiozero import LED
from time import sleep

PUMP_GPIO = 17

# active_high=False because your relay is inverted
pump = LED(PUMP_GPIO, active_high=False)

print("Pump ON")
pump.on()
sleep(5)

print("Pump OFF")
pump.off()

print("Done")
