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
lever = Button(23, pull_up = False, bounce_time=0.15)
buzzer = OutputDevice(13)
nose_poke_button = Button(18, pull_up=False)

# Initialize LEDs
blue_led = LED(25, active_high = False) #Blue light in the box
water_pump = OutputDevice(17)
rgb_led = RGBLED(red=6, green=5, blue=26)

# Re-register callbacks to ensure they remain active
#lever.when_pressed = on_lever_press
#nose_poke_button.when_pressed = on_nose_poke

# Global counters for interactions
lever_press_count = 0
nose_poke_count = 0
current_test_goal = None
testStatus = False
testStopped = False
stimulus_active = False  # Add this with your other globals at the top
lever_press_total = 0
interaction_number = 0
reward_count = 0 
ReponseFlag = True
stimulus_active = False
TimeB = 0 
TimeA = 0
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
#     pause_test()

# ADDED: Extracted hardware stop logic into its own function so it can be
# called from both end_trial() and the pause_test() route without returning a Flask response.
def stop_hardware():
    blue_led.off()
    water_pump.off()
    rgb_led.color = (0, 0, 0)
    print("Hardware stopped (LEDs and pump off)")

# Ending trial when goal is reached, and stopping hardware.
# ADDED: Removed counter reset from here — counters are now reset when the NEXT test starts
# in get_information(). This preserves final counts so the frontend can read them after stopping.
def end_trial():
    # ADDED: global testStatus so the flag is actually updated (was a local variable bug before)
    global testStatus
    print(f"Ended Test")

    # leave the reward devices on briefly then turn them off; do NOT immediately kill them
    import threading
    def turn_off_reward_devices():
        # only turn off the pump/leds after the animal has had time to receive the reward
        blue_led.off()
        water_pump.off()
        # we optionally turn off the rgb as well if you want it reset here
        rgb_led.color = (0, 0, 0)
        print("Reward devices turned off after delay")
    reward_duration = 2  # seconds (change as needed)
    threading.Timer(reward_duration, turn_off_reward_devices).start()

    testStatus = True
    # ADDED: Call stop_hardware() instead of pause_test() route handler directly
    stop_hardware()
"""
def reset_counts():
    testStatus = False
    testStopped = False
    testPaused = False
    lever_press_count = 0
    lever_press_total = 0
    nose_poke_count = 0
    nose_poke_total = 0
    TimeA = 0
    TimeB = 0
    TimeC = 0
    TimeD = 0
    i = 0
    interaction_number = 0
"""



def stop_test(): #Getting functions primed to port all logic to backend
    try:
        if testPaused == True:
            print("Stopping test...")
            testPaused = False
            global testStopped
            testStopped = True
            return jsonify({"message": "Test stopped successfully!"}), 200
        else:
            print("Test is not paused!")
    except Exception as e:
        print("Error stopping test:", str(e))
        return jsonify({"error": "Failed to stop test"}), 500
    
def ending_test(): #Getting functions primed to port all logic to backend
    if testStopped == True:
        testStatus = False
        #Return to start page or whatever.

    #reset_counts()



def resume_test(): #Getting functions primed to port all logic to backend
    try:
        if testPaused == True:
            print("Resuming test...")
            testPaused = False
            return jsonify({"message": "Test resumed successfully!"}), 200
        else:
            print("Test is not paused!")
    except Exception as e:
        print("Error resuming test:", str(e))
        return jsonify({"error": "Failed to resume test"}), 500
    

@app.route('/api/test/stop', methods=['POST'])
def pause_test():
    try:
        global testPaused
        testPaused = True
        print("Pausing test...")
        # ADDED: Use stop_hardware() to centralize hardware shutdown logic
        stop_hardware()

        return jsonify({"message": "Test paused successfully!"}), 200
    except Exception as e:
        print("Error pausing test:", str(e))
        return jsonify({"error": "Pause to stop test"}), 500

# Callback functions to count button presses
#def on_lever_press():
    #global lever_press_count
    #global lever_press_total
    #global interaction_number
    #with counter_lock:
        #print("Lever pressed. Count:", lever_press_count)
        #global TimeB
        #TimeB = time.time()
        #try:
            #if :
                #lever_press_count += 1
                #interaction_number += 1
                #print("Lever pressed. Count:", lever_press_count)
                #time.sleep(StimDur_converted)
            #lever_press_total += 1
        #except Exception as e:
            #print(f"Error with lever press")


def on_lever_press():
    global lever_press_count, lever_press_total, interaction_number, TimeB, ResponseFlag

    if stimulus_active:  # ADD THIS - ignore presses while light is on
        print("Lever pressed during stimulus - ignored")
        return

    with counter_lock:
        lever_press_count += 1
        print("Lever pressed. Count:", lever_press_count)
        TimeB = time.time()
        if ResponseFlag == False:
            interaction_number += 1
            print("Interaction number:", interaction_number)
        ResponseFlag = True
        lever_press_total += 1


"""
def on_lever_press():
    global lever_press_count, lever_press_total, interaction_number, TimeB, ResponseFlag
    TimeB = time.time()
    try:
        lever_press_count += 1
        interaction_number += 1
        lever_press_total += 1
        ResponseFlag = True
        print("Lever pressed. Count:", lever_press_count)
        print("Lever Interaction Number. Count:", interaction_number)
    except Exception as e:
        print(f"Error with lever press: {e}")
        """
"""
def on_lever_press():
    global lever_press_count, lever_press_total, interaction_number, TimeB, ResponseFlag
    if stimulus_active == False:  # Only count if stimulus is off
        return
    TimeB = time.time()
    try:
        lever_press_count += 1
        interaction_number += 1
        lever_press_total += 1
        ResponseFlag = True
        print("Lever pressed. Count:", lever_press_count)
        print("Lever Interaction Number. Count:", interaction_number)
    except Exception as e:
        print(f"Error with lever press: {e}")
        """

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
    global nose_poke_total
    global interaction_number
    with counter_lock:
        global TimeB
        TimeB = time.time()
        if ResponseFlag == False:
            nose_poke_count += 1
            interaction_number += 1
            print("Nose poke. Count:", nose_poke_count)
            time.sleep(StimDur_converted)
        nose_poke_total += 1 

        
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
            "nose_poke_count": nose_poke_count,
            "reward_count": reward_count
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
        
        global stimulus_type, interaction_type, reward_type, test_goal_converted, RewardStim_converted, duration, StimDur_converted, trial_goal_converted
    
        # Grabbing the information from the front-end:
        test_identification = unique_id_time_based
        test_name = data.get("testName")
        subject_id = data.get("subjectID")
        duration = data.get("trialDuration")
        goal = data.get("goalForTrial")
        test_goal = data.get("goalForTest")
        RewardStim = data.get("RewaStimTime")
        StimDur = data.get("StimTimeOn")
        cooldown = data.get("cooldown")
        reward_type = data.get("rewardType")
        interaction_type = data.get("interactionType")
        stimulus_type = data.get("stimulusType")
        light_color = data.get("lightColor")
        nose_poke_val = data.get("nosePoke")
        lever_press_val = data.get("leverPress")
        
        # TODO:  Convert  trial_goal_converted, test_goal_converted, StimDur_converted, RewardStim_converted to float. Logic change is needed
        subject_id_converted = int(subject_id)
        trial_goal_converted = int(goal)
        test_goal_converted = int(test_goal)
        StimDur_converted = int(StimDur)
        RewardStim_converted = int(RewardStim)
        nose_poke_val = int(nose_poke_val)
        lever_press_val_converted = int(lever_press_val)
        nose_poke_val_converted = int(nose_poke_val)
        duration_converted = float(duration) * 60
        
        
        
        # ADDED: Reset testStatus to False when a new test starts so stale "finished" state is cleared
        global  current_test_goal, testStatus, current_interaction_type, lever_press_count, nose_poke_count, reward_count
        testStatus = False
        # ADDED: Reset counters here (at the start of a new test) instead of in end_trial(),
        # so the previous test's final counts are still available for the frontend to read.
        lever_press_count = 0
        nose_poke_count = 0
        reward_count = 0
        # make sure reward devices are off at the beginning of a run
        water_pump.off()
        blue_led.off()
        # ADDED: Store the interaction type globally so callbacks know which input to check against the goal
        current_interaction_type = interaction_type
        
        collectedTimes = []   
        """
        def running_test_one_stimulus():
            global interaction_number, TimeB, TimeD, ResponseFlag, TimeA
            print(trial_goal_converted)
            TimeC = 0
            TimeC = time.time()
            duration_converted = float(duration)
            test = 0
            ResponseFlag = True
            print(type(TimeC))
            print(TimeC)
            print("running")
            while interaction_number < trial_goal_converted:
                # Check if duration has been exceeded
                if time.time() - TimeC >= duration_converted:
                    print("Duration exceeded, ending test")
                    ending_test()
                    break
                    
                time.sleep(RewardStim_converted)
                
                if stimulus_type == "Tone" and ResponseFlag == True:
                    buzzer.on()
                    TimeA = time.time()
                    time.sleep(StimDur_converted)
                    buzzer.off()
                    ResponseFlag = False
                elif stimulus_type == "Light" and ResponseFlag == True:
                    blue_led.on()
                    TimeA = time.time()
                    time.sleep(StimDur_converted)
                    blue_led.off()
                    ResponseFlag = False
                    
                # REMOVED: manual calls to on_lever_press and on_nose_poke
                
                TimeBetween = TimeB - TimeA
                if TimeB > 0:
                    TimeBetween = TimeB - TimeA
                    collectedTimes.append(TimeBetween)
                
                if reward_type == "Water" and trial_goal_converted <= interaction_number:
                    print("Pump Running")
                    water_pump.on()
                    time.sleep(0.5)
                    water_pump.off()
                    interaction_number = 0
                    ResponseFlag = True
                    if(ResponseFlag == True):
                        if stimulus_type == "Tone" and ResponseFlag == True:
                            buzzer.on()
                            TimeA = time.time()
                            time.sleep(StimDur_converted)
                            buzzer.off()
                            ResponseFlag = False
                            
                        elif stimulus_type == "Light" and ResponseFlag == True:
                            blue_led.on()
                            TimeA = time.time()
                            time.sleep(StimDur_converted)
                            blue_led.off()
                            ResponseFlag = False
                        
                    if reward_type == "Water" and trial_goal_converted <= interaction_number:
                        print("Pump Running")
                        water_pump.on()
                        time.sleep(0.5)
                        water_pump.off()
                        interaction_number = 0
                        ResponseFlag = True
                    
                if lever_press_count >= test_goal_converted:
                    TimeD = time.time() - TimeC
                    print("Temp")
                    end_trial()
                    break

        threading.Thread(target=running_test_one_stimulus).start()
        """
        """
        def running_test_one_stimulus():
            global interaction_number, TimeB, TimeD, ResponseFlag, TimeA
            TimeC = time.time()
            duration_converted = float(duration) * 60  # convert minutes to seconds
            print("running")
            
            while interaction_number < test_goal_converted:
                # Check if duration has been exceeded
                if time.time() - TimeC >= duration_converted:
                    print("Duration exceeded, ending test")
                    ending_test()
                    break
                    
                time.sleep(RewardStim_converted)
                
                # Stimulus runs every iteration
                if stimulus_type == "Tone":
                    buzzer.on()
                    TimeA = time.time()
                    time.sleep(StimDur_converted)
                    buzzer.off()
                    ResponseFlag = False
                elif stimulus_type == "Light":
                    blue_led.on()
                    TimeA = time.time()
                    time.sleep(StimDur_converted)
                    blue_led.off()
                    ResponseFlag = False
                
                if TimeB > 0:
                    TimeBetween = TimeB - TimeA
                    collectedTimes.append(TimeBetween)
                
                # Pump only turns on when trial_goal_converted is reached
                if reward_type == "Water" and interaction_number >= trial_goal_converted:
                    print("Pump Running")
                    water_pump.on()
                    time.sleep(0.5)
                    water_pump.off()
                    interaction_number = 0
                    ResponseFlag = True
                    
                if lever_press_count >= test_goal_converted:
                    TimeD = time.time() - TimeC
                    print("Temp")
                    end_trial()
                    break

        threading.Thread(target=running_test_one_stimulus).start()
        try:
             current_test_goal = int(trial_goal_converted) if trial_goal_converted is not None else None
             print(current_test_goal)
        except ValueError:
             current_test_goal = None
        """

        
        def running_test_one_stimulus():
            global interaction_number, TimeB, TimeD, ResponseFlag, TimeA, stimulus_active,TimeC, ReponseFlag, reward_count
            TimeC = time.time()
            duration_converted = float(duration) * 60
            print("running")
            
            # Turn on stimulus at the beginning
            if stimulus_type == "Tone":
               stimulus_active = True   # ADD
               buzzer.on()
               TimeA = time.time()
               time.sleep(StimDur_converted)
               buzzer.off()
               stimulus_active = False  # ADD
            elif stimulus_type == "Light":
               stimulus_active = True   # ADD before light turns on
               blue_led.on()
               TimeA = time.time()
               time.sleep(StimDur_converted)
               blue_led.off()
               stimulus_active = False  # ADD after light turns off
            ResponseFlag = False
               #blue_led.on()
               #TimeA = time.time()
               #time.sleep(StimDur_converted)
               #blue_led.off()
               #ResponseFlag = False
            #elif stimulus_type == "Light":
                #stimulus_active = True
                #blue_led.on()
                #TimeA = time.time()
                #time.sleep(StimDur_converted)
                #blue_led.off()
                #stimulus_active = False  # Now lever press will count
                #ResponseFlag = False
            
            while lever_press_count < test_goal_converted:
                # Check if duration has been exceeded
                if time.time() - TimeC >= duration_converted:
                    print("Duration exceeded, ending test")
                    ending_test()
                    break
                
                # Wait here until lever is pressed
                while ResponseFlag == False:
                    time.sleep(RewardStim_converted)
                
                if TimeB > 0:
                    TimeBetween = TimeB - TimeA
                    collectedTimes.append(TimeBetween)
                    TimeB = 0
                
                # Pump only turns on when trial_goal_converted is reached
                if reward_type == "Water" and interaction_number >= trial_goal_converted:
                    print("Pump Running")
                    water_pump.on()
                    time.sleep(0.0275438596491)
                    #time.sleep(1)
                    water_pump.off()
                    interaction_number = 0
                    reward_count += 1
                    print(reward_count)
                        
                    
                if lever_press_count >= test_goal_converted:
                    TimeD = time.time() - TimeC
                    print("Temp")
                    end_trial()
                    break
                
                time.sleep(RewardStim_converted)
                
                # Turn on stimulus again after lever press
                if stimulus_type == "Tone":
                    stimulus_active = True   # ADD
                    buzzer.on()
                    TimeA = time.time()
                    time.sleep(StimDur_converted)
                    buzzer.off()
                    stimulus_active = False  # ADD
                    #buzzer.on()
                    #TimeA = time.time()
                    #time.sleep(StimDur_converted)
                    #buzzer.off()
                  
                elif stimulus_type == "Light":
                     stimulus_active = True   # ADD before light turns on
                     blue_led.on()
                     TimeA = time.time()
                     time.sleep(StimDur_converted)
                     blue_led.off()
                     stimulus_active = False
                   # blue_led.on()
                   # TimeA = time.time()
                   # time.sleep(StimDur_converted)
                   # blue_led.off()
                ResponseFlag = False
        threading.Thread(target=running_test_one_stimulus).start()
        try:
             current_test_goal = int(trial_goal_converted)	 if trial_goal_converted is not None else None
             print(current_test_goal)
        except ValueError:
             current_test_goal = None
            
        """
        def running_test_one_stimulus():
         global interaction_number, TimeB, TimeD, ResponseFlag, TimeA,TimeC

         TimeC = time.time()
         duration_converted = float(duration) * 60
         interaction_number = 0
         print("Test running")

    	 # Play stimulus before the loop starts
         if stimulus_type == "Tone":
           buzzer.on()
           TimeA = time.time()
           time.sleep(StimDur_converted)
           buzzer.off()
         elif stimulus_type == "Light":
           blue_led.on()
           TimeA = time.time()
           time.sleep(StimDur_converted)
           blue_led.off()
         ResponseFlag = False

        while lever_press_count < test_goal_converted:

         # Check duration
         if time.time() - TimeC >= duration_converted:
            print("Duration exceeded, ending test")
            end_trial()
            break

         # Log latency if a response happened
         if TimeB > 0:
            TimeBetween = TimeB - TimeA
            collectedTimes.append(TimeBetween)
            TimeB = 0  # Reset so it doesn't log again next iteration

         # Check reward condition
         if reward_type == "Water" and interaction_number >= trial_goal_converted:
            print("Pump running")
            water_pump.on()
            time.sleep(0.0275438596491)
            water_pump.off()
            interaction_number = 0

         # Check if test goal reached
         if lever_press_count >= test_goal_converted:
            TimeD = time.time() - TimeC
            print("Test goal reached")
            end_trial()
            break

         # Wait between reward and next stimulus
         time.sleep(RewardStim_converted)

         # Play stimulus again
         if stimulus_type == "Tone":
            buzzer.on()
            TimeA = time.time()
            time.sleep(StimDur_converted)
            buzzer.off()
         elif stimulus_type == "Light":
            blue_led.on()
            TimeA = time.time()
            time.sleep(StimDur_converted)
            blue_led.off()
         ResponseFlag = False

        threading.Thread(target=running_test_one_stimulus).start()
        try:
             current_test_goal = int(trial_goal_converted) if trial_goal_converted is not None else None
             print(current_test_goal)
        except ValueError:
             current_test_goal = None
         """


        # sql_command = """
        #     INSERT INTO Active_Test (
        #         testID, subjectID, Name, Trial Goal, Test Goal, Duration Between Reward and Stimulus, Duration of Stimulus, Reward Type, 
        #         Light, Stimulus, Interaction, Cooldown, Duration, Nose Poke Amount, Lever Press Amount
        #     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?)
        # """
        # cursor.execute(sql_command, (
        #     test_identification, 
        #     subject_id_converted,  
        #     trial_goal_converted, 
        #     test_goal_converted,
        #     RewardStim_converted,
        #     StimDur_converted,
        #     reward_type, 
        #     light_color, 
        #     stimulus_type, 
        #     interaction_type, 
        #     cooldown, 
        #     duration,
        #     nose_poke_val_converted,
        #     lever_press_val_converted,
        # ))
        # conn.commit()
        
        # Start light sequence at test start
        def start_light_sequence():
            if stimulus_type == "Tone":
                buzzer.on()
                time.sleep(2)  # 2 seconds / replace '2' with an input from the frontend
                buzzer.off()
            elif stimulus_type == "Light":
                blue_led.on()
                time.sleep(2)
                blue_led.off()
            else:
                print("Error with stimulus type.")
                exit
        
       # threading.Thread(target=start_light_sequence).start()
        #threading.Thread(target=start_light_sequence).start() something Jared added. Gonna be honest, don't know what this does
        
        return jsonify({
            "message": "Start Test Successfully!",
            "received_configuration": {
                "testID": test_identification, 
                "subjectID": subject_id_converted,
                "testName": test_name,
                "rewardType": reward_type,
                "goalForTrial": trial_goal_converted,
                "goalForTest": test_goal_converted,
                "RewaStimTime": RewardStim_converted,
                "StimTimeOn": StimDur_converted,
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
    # finally:
    #     if conn:
    #         conn.close()


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

# Test stimuli
def test_stimuli():
    if stimulus_type == "Tone":
        buzzer.on()
        time.sleep(2)  # 2 seconds / replace '2' with an input from the frontend
        buzzer.off()
    elif stimulus_type == "Light":
        blue_led.on()
        time.sleep(2)
        blue_led.off()
    else:
        print("Error with stimulus type.")
        exit
        
# Test response/interaction
def test_interaction():
    if interaction_type == "Lever":
        simulate_lever_press()
    elif interaction_type == "Poke":
        simulate_nose_poke()
    else:
        print("Error with interaction type.")
        exit
        
#Test reward
def test_reward():
    if reward_type == "Food":
        blue_led.on()
        time.sleep(2)
        blue_led.off()
    elif reward_type == "Water":
        water_pump.on()
        time.sleep(2)
        water_pump.off()
    else:
        print("Error with reward type.")
        exit
    


if __name__ == '__main__':
    #TODO: Added the connection to the database to happen as soon as the application begins.
    conn = get_db_connection()

    
    # Run with sudo (if needed) to access GPIO and on a chosen port (e.g., 5001)
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)
