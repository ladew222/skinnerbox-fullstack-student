from flask import Flask, jsonify, request
from flask_cors import CORS
from gpio_adapter import Button, LED, RGBLED
import time
import threading
import os
import sqlite3
import uuid
# TODO LIST:
    # 1. Secure/Build Parts:
        #DB Connection 
        #End Points 



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
#TODO: Added a a try catch to the get_db_connection
def get_db_connection():
    try:
        if len(file) != 0:
             conn = sqlite3.connect(file)
             print(f"Successfully connected to database: {file}")
             return conn
        else:
            raise ValueError("Connection Failed: Unable to connect to the Database.")
    except Exception as e: 
        print(f"Error connecting to database: {e}")
        return None
    
    
        

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

@app.route('/api/')
def index():
    return "Backend is running!"

# Endpoint to retrieve counts
@app.route('/api/counts', methods=['GET'])
def get_counts():
    with counter_lock:
        counts = {
            "lever_press_count": lever_press_count,
            "nose_poke_count": nose_poke_count
        }
    return jsonify(counts), 200

# Endpoint to control the Blue LED
@app.route('/api/light/blue', methods=['POST'])
def control_blue():
    data = request.get_json()
    action = data.get("action", "off")
    if action == "on":
        blue_led.on()
    else:
        blue_led.off()
    return jsonify({"status": "success", "blue": action}), 200

# Endpoint to control the Orange LED
@app.route('/api/light/orange', methods=['POST'])
def control_orange():
    data = request.get_json()
    action = data.get("action", "off")
    if action == "on":
        orange_led.on()
    else:
        orange_led.off()
    return jsonify({"status": "success", "orange": action}), 200

# Endpoint to control the RGB LED
@app.route('/api/light/rgb', methods=['POST'])
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
@app.route('/api/test/run', methods=['POST'])
def run_test():
    try:
        data = request.json  # Get test settings from the request
        print("Starting test with settings:", data)
        
        # Perform any test logic here
        # Example: Activate LED as a placeholder for actual test execution
        blue_led.on()
        time.sleep(2)  # Simulate test running
        blue_led.off()

        return jsonify({
            "message": "Test started successfully!"
        }), 200
    except Exception as e:
        print("Error starting test:", str(e))
        return jsonify({"error": "Failed to start test"}), 500

@app.route("/api/input/lever", methods=["POST"])
def simulate_lever_press():
    on_lever_press()
    return jsonify({"status": "simulated lever press"}), 200


@app.route("/api/input/nosepoke", methods=["POST"])
def simulate_nose_poke():
    on_nose_poke()
    return jsonify({"status": "simulated nose poke"}), 200


@app.route('/api/test/stop', methods=['POST'])
def stop_test():
    try:
        print("Stopping test...")

        # Logic to stop test (if applicable)
        blue_led.off()  # Example: turn off LED to indicate stop

        return jsonify({"message": "Test stopped successfully!"}), 200
    except Exception as e:
        print("Error stopping test:", str(e))
        return jsonify({"error": "Failed to stop test"}), 500
    

# TODO: Added Endpoint to send the test manager information to the database.
@app.route('/api/test/information', methods = ['POST'])
def get_information():
    
    # Creating a variable named conn that is used for the connection to the database.  
    conn = None
    try:
        print("Received test information request") # Debug log
        # Using a variable called data to get the information for the test manager.
        data = request.json  # Get test settings from the request
        
        # Generate a unique ID for the test (convert to string for storage/JSON)
        unique_id_time_based = str(uuid.uuid1())
        
        # Open a new connection for this request
        conn = get_db_connection()
        if conn is None:
            raise Exception("Failed to connect to database")
            
        cursor = conn.cursor()
    
        # Grabbing the information from the front-end:
        test_identification = unique_id_time_based
        test_name = data.get("testName")
        subject_id = data.get("subjectID")
        duration = data.get("trialDuration")
        goal = data.get("goalForTrial")
        cooldown = data.get("cooldown")
        reward_type = data.get("rewardType")
        interaction_type = data.get("interactionType")
        stimulus_type = data.get("stimulusType")
        light_color = data.get("lightColor")
        # TODO: Change this based on the actual test statues 
        test_status = True; 
        
        # Use parameterized queries to safely insert variables
        # This assumes your table has exactly 9 columns in this order
        # Note: 'test_name' is currently not being inserted, replaced by 'test_identification'
        sql_command = "INSERT INTO Active_Test VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        cursor.execute(sql_command, (test_identification, subject_id, duration, goal, cooldown, reward_type, interaction_type, stimulus_type, light_color, test_status))
        conn.commit()
        
        return jsonify({
            "message": "Start Test Successfully!",
            "received_configuration": {
                "testID": test_identification, 
                "testName": test_name,
                "subjectID": subject_id,
                "trialDuration": duration,
                "goalForTrial": goal,
                "cooldown": cooldown,
                "rewardType": reward_type,
                "interactionType": interaction_type,
                "stimulusType": stimulus_type,
                "lightColor": light_color,
                "testStatus": True
            }
        }), 200
    
    except Exception as e:
        print("Error Getting Information:", str(e))
        return jsonify({"error": "Failed to Get Information"}), 500
    finally:
        if conn:
            conn.close()
    
    # except Exception as e:
    #     print("Error Getting Information:", str(e))
    #     return jsonify({"error": "Failed to Get Information"}), 500
    # finally:
    #     # Always close the connection
    #     if conn:
    #         conn.close()
    
        
        

if __name__ == '__main__':
    #TODO: Added the connection to the database to happen as soon as the application begins.
    conn = get_db_connection();

    
    # Run with sudo (if needed) to access GPIO and on a chosen port (e.g., 5001)
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)