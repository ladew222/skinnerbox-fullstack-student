from flask import Flask, jsonify, request
from flask_cors import CORS
from gpio_adapter import Button, LED, RGBLED, OutputDevice
import time
import threading
import os
import sqlite3
import uuid

# File that is storing the database name
file = "testdatabase.db"  ## for database

app = Flask(__name__)

# Allow all domains for development
CORS(app) 


# Define directories (if needed)
log_directory = os.path.join(os.path.dirname(__file__), 'logs')
temp_directory = os.path.join(os.path.dirname(__file__), 'temp')


# Initialize buttons (with pull-down resistors)
lever = Button(23)
nose_poke_button = Button(18, pull_up=False)

# Initialize LEDs
blue_led = LED(5) #Blue light in the box
water_pump = OutputDevice(17)
rgb_led = RGBLED(red=6, green=5, blue=26)

# Global counters for interactions
lever_press_count = 0
nose_poke_count = 0
current_test_goal = None
testStatus = False
# ADDED: Track which interaction type ("Lever" or "Poke") should be checked against the goal
current_interaction_type = None
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
    

# Ending trial, resetting nose and lever count, and booting back to the menu.
# def end_trial():
#     global lever_press_count
#     print(f"Ended Test")
#     global nose_poke_count
#     lever_press_count = 0
#     nose_poke_count = 0
#     # TODO: Set up boolean to determine when test is done 
#     testStatus = True
#     stop_test()

# ADDED: Extracted hardware stop logic into its own function so it can be
# called from both end_trial() and the stop_test() route without returning a Flask response.
def _stop_hardware():
    blue_led.off()
    rgb_led.color = (0, 0, 0)
    print("Hardware stopped (LEDs off)")

# Ending trial when goal is reached, and stopping hardware.
# ADDED: Removed counter reset from here — counters are now reset when the NEXT test starts
# in get_information(). This preserves final counts so the frontend can read them after stopping.
def end_trial():
    # ADDED: global testStatus so the flag is actually updated (was a local variable bug before)
    global testStatus
    print(f"Ended Test")
    testStatus = True
    # ADDED: Call _stop_hardware() instead of stop_test() route handler directly
    _stop_hardware()

# Callback functions to count button presses
# TODO: Unit test to see if end_trial function is called when goal is reach.
def on_lever_press():
    global lever_press_count
    with counter_lock:
        lever_press_count += 1
        print("Lever pressed. Count:", lever_press_count)
        try:
            # ADDED: Only check goal if the selected interaction type is "Lever"
            if current_interaction_type == "Lever" and current_test_goal is not None and lever_press_count >= current_test_goal:
                blue_led.on()
                end_trial()
        except Exception as e:
            print(f"Error checking trial goal on lever press: {e}")

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
        
# TODO: Unit test to see if end_trial function is called when goal is reach.
def on_nose_poke():
    global nose_poke_count
    with counter_lock:
        nose_poke_count += 1
        print("Nose poke. Count:", nose_poke_count)
        
        try:
            # ADDED: Only check goal if the selected interaction type is "Poke"
            if current_interaction_type == "Poke" and current_test_goal is not None and nose_poke_count >= current_test_goal:
                blue_led.on()
                end_trial()
        except Exception as e:
            print(f"Error checking trial goal on nose poke: {e}")


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
lever.when_pressed = on_lever_press
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
        # Example: Test logic placeholder (blue LED now only comes on when goal is reached)

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

        # ADDED: Use _stop_hardware() to centralize hardware shutdown logic
        _stop_hardware()

        return jsonify({"message": "Test stopped successfully!"}), 200
    except Exception as e:
        print("Error stopping test:", str(e))
        return jsonify({"error": "Failed to stop test"}), 500


# ADDED: Endpoint so the frontend can poll whether the backend has ended the test (e.g., goal reached)
@app.route('/api/test/status', methods=['GET'])
def get_test_status():
    return jsonify({"testFinished": testStatus}), 200
    

# TODO: Added Endpoint to send the test manager information to the database.
@app.route('/api/test/information', methods = ['POST'])
def get_information():
    
    # Creating a variable named conn that is used for the connection to the database.  
    conn = None
    try:
        print("Received test information request") # Debug log
        # Using the variables called data to get the information from the test manager on the front end.
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
        nose_poke_val = data.get("nosePoke")
        lever_press_val = data.get("leverPress")
        
        # TODO: Used the int function to convert the string values to integers. 
        subject_id_converted = int(subject_id)
        goal_converted = int(goal)
        nose_poke_val = int(nose_poke_val)
        lever_press_val_converted = int(lever_press_val)
        nose_poke_val_converted = int(nose_poke_val)
        
        
        # ADDED: Reset testStatus to False when a new test starts so stale "finished" state is cleared
        global current_test_goal, testStatus, current_interaction_type, lever_press_count, nose_poke_count
        testStatus = False
        # ADDED: Reset counters here (at the start of a new test) instead of in end_trial(),
        # so the previous test's final counts are still available for the frontend to read.
        lever_press_count = 0
        nose_poke_count = 0
        # ADDED: Store the interaction type globally so callbacks know which input to check against the goal
        current_interaction_type = interaction_type
         # Update global goal
        try:
             current_test_goal = int(goal_converted) if goal_converted is not None else None
             print(current_test_goal)
        except ValueError:
             current_test_goal = None

        sql_command = """
            INSERT INTO Active_Test (
                testID, subjectID, Name, Goal, Reward, 
                Light, Stimulus, Interaction, Cooldown, Duration,nose_poke, lever_press
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        cursor.execute(sql_command, (
            test_identification, 
            subject_id_converted, 
            test_name, 
            goal_converted, 
            reward_type, 
            light_color, 
            stimulus_type, 
            interaction_type, 
            cooldown, 
            duration,
            nose_poke_val_converted,
            lever_press_val_converted,
        ))
        conn.commit()
        
        return jsonify({
            "message": "Start Test Successfully!",
            "received_configuration": {
                "testID": test_identification, 
                "subjectID": subject_id_converted,
                "testName": test_name,
                "rewardType": reward_type,
                "goalForTrial": goal_converted,
                "lightColor": light_color,
                "stimulusType": stimulus_type,
                "interactionType": interaction_type,
                "cooldown": cooldown,
                "trialDuration": duration,
                "nose_poke": nose_poke_val_converted,
                "lever_press": lever_press_val_converted
            }
        }), 200
    
    except Exception as e:
        print("Error Getting Information:", str(e))
        return jsonify({"error": "Failed to Get Information"}), 500
    finally:
        if conn:
            conn.close()


# TODO: TASK, look into this logic to see if it would work.
# Endpoint to update the latest test record with current counts
@app.route('/api/test/update/information', methods=['PUT'])
def update_information():
    conn = None
    try:
        data = request.json
        nose_poke_val = int(data.get("nosePoke", 0))
        lever_press_val = int(data.get("leverPress", 0))

        conn = get_db_connection()
        if conn is None:
            raise Exception("Failed to connect to database")

        cursor = conn.cursor()

        # Update the most recent test record with current counts
        sql_command = """
            UPDATE Active_Test
            SET nose_poke = ?, lever_press = ?
            WHERE testID = (SELECT MAX(testID) FROM TEST)
        """
        cursor.execute(sql_command, (nose_poke_val, lever_press_val))
        conn.commit()

        return jsonify({
            "message": "Test information updated successfully!",
            "nose_poke": nose_poke_val,
            "lever_press": lever_press_val
        }), 200

    except Exception as e:
        print(f"Error updating test information: {e}")
        return jsonify({"error": "Failed to update test information"}), 500
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    #TODO: Added the connection to the database to happen as soon as the application begins.
    conn = get_db_connection()

    
    # Run with sudo (if needed) to access GPIO and on a chosen port (e.g., 5001)
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)