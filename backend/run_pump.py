from time import sleep

from gpio_adapter import LED, GPIO_MODE


PUMP_GPIO = 17


def main():
    """Run a simple pump test using real GPIO on Pi and mock GPIO elsewhere."""

    # active_high=False because the relay in this setup is inverted.
    pump = LED(PUMP_GPIO, active_high=False)

    print(f"Pump test starting in GPIO mode: {GPIO_MODE}")
    print("Pump ON")
    pump.on()
    sleep(5)

    print("Pump OFF")
    pump.off()
    print("Done")


if __name__ == "__main__":
    main()
