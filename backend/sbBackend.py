from flask import Flask, jsonify, request
from flask_cors import CORS
from gpio_adapter import Button, LED, RGBLED
import time
import threading
import os
import sqlite3

file = "testdatabase.db"  ## for database

app = Flask(__name__)

CORS(app)  # Allow all domains for development

# Define directories (if needed)
log_directory = os.path.join(os.path.dirname(__file__), 'logs')
temp_directory = os.path.join(os.path.dirname(__file__), 'temp')

# Initialize buttons (with pull-down resistors)
lever_press_button = Button(4, pull_up=False)
nose_poke_button = Button(18, pull_up=False)

# Initialize LEDs
blue_led = LED(5)
orange_led = LED(24)
rgb_led = RGBLED(red=12, green=16, blue=20)

# Global counters for interactions
lever_press_count = 0
nose_poke_count = 0
counter_lock = threading.Lock()

# Helper function to get a new SQLite connection
def get_db_connection():
    return sqlite3.connect("testdatabase.db")

# Callback functions to count button presses
def on_lever_press():
    global lever_press_count
    with counter_lock:
        lever_press_count += 1
        print("Lever pressed. Count:", lever_press_count)

    # Use a new connection inside the callback
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE TestDB SET "Lever Presses Actual" = "Lever Presses Actual" + 1')
        conn.commit()
        print("Data updated - Lever Press") 
    except Exception as e:
        print(f"Database error on lever press: {e}")
    finally:
        conn.close()

def on_nose_poke():
    global nose_poke_count
    with counter_lock:
        nose_poke_count += 1
        print("Nose poke. Count:", nose_poke_count)

    # Use a new connection inside the callback
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE TestDB SET "Nose Poke Actual" = "Nose Poke Actual" + 1')
        conn.commit()
        print("Data updated - Nose Poke")
    except Exception as e:
        print(f"Database error on nose poke: {e}")
    finally:
        conn.close()

# Re-register callbacks to ensure they remain active
lever_press_button.when_pressed = on_lever_press
nose_poke_button.when_pressed = on_nose_poke


# Disable caching to ensure React always gets fresh data
@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/')
def index():
    return "Backend is running!"

# Endpoint to retrieve counts
@app.route('/counts', methods=['GET'])
def get_counts():
    with counter_lock:
        counts = {
            "lever_press_count": lever_press_count,
            "nose_poke_count": nose_poke_count
        }
    return jsonify(counts), 200

# Endpoint to control the Blue LED
@app.route('/light/blue', methods=['POST'])
def control_blue():
    data = request.get_json()
    action = data.get("action", "off")
    if action == "on":
        blue_led.on()
    else:
        blue_led.off()
    return jsonify({"status": "success", "blue": action}), 200

# Endpoint to control the Orange LED
@app.route('/light/orange', methods=['POST'])
def control_orange():
    data = request.get_json()
    action = data.get("action", "off")
    if action == "on":
        orange_led.on()
    else:
        orange_led.off()
    return jsonify({"status": "success", "orange": action}), 200

# Endpoint to control the RGB LED
@app.route('/light/rgb', methods=['POST'])
def control_rgb():
    data = request.get_json()
    # Expect values for red, green, blue as "on" or "off"
    red_val = 1 if data.get("red", "off") == "on" else 0
    green_val = 1 if data.get("green", "off") == "on" else 0
    blue_val = 1 if data.get("blue", "off") == "on" else 0

    # Set the overall color using a tuple (r, g, b)
    rgb_led.color = (red_val, green_val, blue_val)
    
    return jsonify({"status": "success", "rgb": {"red": data.get("red", "off"), "green": data.get("green", "off"), "blue": data.get("blue", "off")}}), 200

# Routes to run tests
@app.route('/test/run', methods=['POST'])
def run_test():
    try:
        data = request.json  # Get test settings from the request
        print("Starting test with settings:", data)

        # Perform any test logic here
        # Example: Activate LED as a placeholder for actual test execution
        blue_led.on()
        time.sleep(2)  # Simulate test running
        blue_led.off()

        return jsonify({"message": "Test started successfully!"}), 200
    except Exception as e:
        print("Error starting test:", str(e))
        return jsonify({"error": "Failed to start test"}), 500


@app.route('/test/stop', methods=['POST'])
def stop_test():
    try:
        print("Stopping test...")

        # Logic to stop test (if applicable)
        blue_led.off()  # Example: turn off LED to indicate stop

        return jsonify({"message": "Test stopped successfully!"}), 200
    except Exception as e:
        print("Error stopping test:", str(e))
        return jsonify({"error": "Failed to stop test"}), 500
        

if __name__ == '__main__':
    # Run with sudo (if needed) to access GPIO and on a chosen port (e.g., 5001)
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)

"""
from flask import Flask, jsonify, request
from flask_cors import CORS
from gpiozero import Button, LED, RGBLED
import time
import threading
import os
import sqlite3

file = "testdatabase.db"  ## for database

app = Flask(__name__)

CORS(app)  # Allow all domains for development

# Define directories (if needed)
log_directory = os.path.join(os.path.dirname(__file__), 'logs')
temp_directory = os.path.join(os.path.dirname(__file__), 'temp')

# Initialize buttons (with pull-down resistors)
lever_press_button = Button(4, pull_up=False)
nose_poke_button = Button(18, pull_up=False)

# Initialize LEDs
blue_led = LED(5)
orange_led = LED(24)
rgb_led = RGBLED(red=12, green=16, blue=20)

# Global counters for interactions
lever_press_count = 0
nose_poke_count = 0
counter_lock = threading.Lock()

# Helper function to get a new SQLite connection
def get_db_connection():
    return sqlite3.connect("testdatabase.db")

# Callback functions to count button presses
def on_lever_press():
    global lever_press_count
    with counter_lock:
        lever_press_count += 1
        print("Lever pressed. Count:", lever_press_count)

    # Use a new connection inside the callback
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE TestDB SET "Lever Presses Actual" = "Lever Presses Actual" + 1')
        conn.commit()
        print("Data updated successfully")
    
    except Exception as e:
        print(f"Database error on lever press: {e}")
    finally:
        conn.close()

def on_nose_poke():
    global nose_poke_count
    with counter_lock:
        nose_poke_count += 1
        print("Nose poke. Count:", nose_poke_count)

    # Use a new connection inside the callback
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE TestDB SET "Nose Poke Actual" = "Nose Poke Actual" + 1')
        conn.commit()
    except Exception as e:
        print(f"Database error on nose poke: {e}")
    finally:
        conn.close()

# Re-register callbacks to ensure they remain active
lever_press_button.when_pressed = on_lever_press
nose_poke_button.when_pressed = on_nose_poke


# Disable caching to ensure React always gets fresh data
@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/')
def index():
    return "Backend is running!"

# Endpoint to retrieve counts
@app.route('/counts', methods=['GET'])
def get_counts():
    with counter_lock:
        counts = {
            "lever_press_count": lever_press_count,
            "nose_poke_count": nose_poke_count
        }
    return jsonify(counts), 200

# Endpoint to control the Blue LED
@app.route('/light/blue', methods=['POST'])
def control_blue():
    data = request.get_json()
    action = data.get("action", "off")
    if action == "on":
        blue_led.on()
    else:
        blue_led.off()
    return jsonify({"status": "success", "blue": action}), 200

# Endpoint to control the Orange LED
@app.route('/light/orange', methods=['POST'])
def control_orange():
    data = request.get_json()
    action = data.get("action", "off")
    if action == "on":
        orange_led.on()
    else:
        orange_led.off()
    return jsonify({"status": "success", "orange": action}), 200

# Endpoint to control the RGB LED
@app.route('/light/rgb', methods=['POST'])
def control_rgb():
    data = request.get_json()
    # Expect values for red, green, blue as "on" or "off"
    red_val = 1 if data.get("red", "off") == "on" else 0
    green_val = 1 if data.get("green", "off") == "on" else 0
    blue_val = 1 if data.get("blue", "off") == "on" else 0

    # Set the overall color using a tuple (r, g, b)
    rgb_led.color = (red_val, green_val, blue_val)
    
    return jsonify({"status": "success", "rgb": {"red": data.get("red", "off"), "green": data.get("green", "off"), "blue": data.get("blue", "off")}}), 200

if __name__ == '__main__':
    # Run with sudo (if needed) to access GPIO and on a chosen port (e.g., 5001)
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5001)

"""