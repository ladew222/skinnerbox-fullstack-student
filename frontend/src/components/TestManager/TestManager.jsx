import React, { useState, useEffect } from "react";
import "./TestManager.css";
import { runTest, stopTest, getCounts, setBlueLight, setOrangeLight, setRGBLight } from "../../utilities/api";
import { FormControl, InputLabel, Input} from '@mui/material';
import { validationFunctions } from "../../validation/test_manager";
import ButtonGroup from '@mui/material/ButtonGroup';
// CHANGE HISTORY: Originally added getAllPresets API import for backend preset loading
// UPDATED: Removed getAllPresets import - now using localStorage directly instead of backend API
// Reason: Backend preset endpoints (/preset/save, /preset/all) are not yet implemented in sbBackend.py
// Using browser's localStorage as temporary solution until backend is ready

import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormHelperText from '@mui/material/FormHelperText';
import Button from '@mui/material/Button';
import { PresentToAll } from "@mui/icons-material";


const TestManager = () => {
  const [presetValue, setPresetValue] = useState("");
  const [testName, setTestName] = useState("");
  const [trialDuration, setTrialDuration] = useState("");
  const [goalForTrial, setGoalForTrial] = useState("");
  const [cooldown, setCooldown] = useState("");
  const [rewardType, setRewardType] = useState("Water");
  const [interactionType, setInteractionType] = useState("Lever");
  const [stimulusType, setStimulusType] = useState("Light");
  const [lightColor, setLightColor] = useState("Red");
  // CHANGE: Added userPresets state to store custom preset configurations
  // Purpose: Enables dynamic loading and display of user-created presets from PresetManager
  // Data Structure: Array of preset objects with format:
  //   [{ name, trialDuration, goalForTrial, cooldown, rewardType, interactionType, stimulusType, lightColor }, ...]
  // Loaded from: localStorage key 'userPresets' on component mount
  // Used in: Preset dropdown (renders as MenuItems) and handlePreset (applies selected preset)
  const [userPresets, setUserPresets] = useState([]);

  const [testRunning, setTestRunning] = useState(false);
  const [testPaused, setTestPaused] = useState(false);
  const [testFinished, setTestFinished] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [leverPressCount, setLeverPressCount] = useState(0);
  const [nosePokeCount, setNosePokeCount] = useState(0);
  const [lightOn, setLightOn] = useState(false);

  const [originalSettings, setOriginalSettings] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);

  const [lastRewardTime, setLastRewardTime] = useState(0);
  const [rewardCount, setRewardCount] = useState(0);

  const [message, setMessage] = useState("");


  const [testNameError, setTestNameError] = useState('');
  const [trialDurationError, setTrialDurationError] = useState('');
  const [trialGoalError, setTrialGoalError] = useState('');
  const [coolDownError, setCoolDownError] = useState('');

  
  // CHANGE: Enhanced initialization useEffect to include preset loading functionality
  // IMPLEMENTATION: Using localStorage instead of backend API (backend endpoints not implemented yet)
  // This effect now performs TWO initialization tasks on component mount:
  useEffect(() => {
    // Task 1: Capture initial form state for change detection (existing functionality)
    setOriginalSettings({ testName, trialDuration, goalForTrial, cooldown, rewardType, interactionType, stimulusType, lightColor });
    
    // Task 2: Load user-created presets from localStorage (NEW functionality)
    // CHANGE DETAILS:
    // - Reads from localStorage key 'userPresets' (saved by PresetManager component)
    // - Parses JSON string to array of preset objects
    // - Updates userPresets state which populates the preset dropdown
    // - Includes try/catch for error handling (malformed JSON, storage issues)
    // - Console log for debugging preset loading issues
    try {
        // Get presets from localStorage (defaults to empty array if not found)
        const savedPresets = JSON.parse(localStorage.getItem('userPresets') || '[]');
        // Update state with fetched presets - these will appear in preset dropdown
        setUserPresets(savedPresets);
        console.log('Loaded presets:', savedPresets); // CHANGE: Added debug log to verify preset loading
    } catch (error) {
        // Log error but don't block component rendering if preset loading fails
        console.error("Error loading presets:", error);
        setUserPresets([]); // Set to empty array on error to prevent crashes
    }
  }, []); // Empty dependency array = run once on component mount

  const hasChanged = () => {
    return JSON.stringify(originalSettings) !== JSON.stringify({ testName, trialDuration, goalForTrial, cooldown, rewardType, interactionType, stimulusType, lightColor });
  };


  const handleSaveTest = () => {
    if (!testName || !trialDuration || !goalForTrial || !cooldown) {
      alert("Please fill in all required fields.");
      return;
    }

    const testSettings = `Test Name: ${testName}\nTrial Duration: ${trialDuration} seconds\nGoal: ${goalForTrial}\nCooldown: ${cooldown} seconds\nReward Type: ${rewardType}\nInteraction Type: ${interactionType}\nStimulus Type: ${stimulusType}\nLight Color: ${lightColor}`;

    const blob = new Blob([testSettings], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${testName.replace(/\s+/g, "_")}_settings.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const validateFileFormat = (text) => {
    const lines = text.split("\n");
    const expectedKeys = [
      "Test Name", "Trial Duration", "Goal", "Cooldown",
      "Reward Type", "Interaction Type", "Stimulus Type", "Light Color"
    ];
    return lines.length === expectedKeys.length && lines.every((line, index) => line.startsWith(expectedKeys[index] + ": "));
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileText = e.target.result;
      if (!validateFileFormat(fileText)) {
        alert("Invalid file format. Please upload a properly formatted test settings file.");
        event.target.value = "";
        return;
      }

      setUploadedFile(file);
      const lines = fileText.split("\n");
      const values = lines.map((line) => line.split(": ")[1]);

      // setTestName(values[0] || "");
      setTrialDuration(values[1] ? values[1].replace(" seconds", "") : "");
      setGoalForTrial(values[2] || "");
      setCooldown(values[3] ? values[3].replace(" seconds", "") : "");
      setRewardType(values[4] || "Water");
      setInteractionType(values[5] || "Lever");
      setStimulusType(values[6] || "Light");
      setLightColor(values[7] || "Red");
    };
    reader.readAsText(file);
  };

  const handleDeleteUpload = () => {
    setUploadedFile(null);
    setTestName("");
    setTrialDuration("");
    setGoalForTrial("");
    setCooldown("");
    setRewardType("Water");
    setInteractionType("Lever");
    setStimulusType("Light");
    setLightColor("Red");
    document.querySelector(".upload-button").value = "";
  };

  useEffect(() => {
    let interval;
    if (testRunning) {
      interval = setInterval(async () => {
        try {
          const data = await getCounts();
          setLeverPressCount(data.lever_press_count);
          setNosePokeCount(data.nose_poke_count);

          const count = interactionType === "Lever" ? data.lever_press_count : data.nose_poke_count;
          const goal = parseInt(goalForTrial);

          if (goal > 0 && count > 0 && count % goal === 0) {
            const now = Date.now();
            if (now - lastRewardTime >= parseInt(cooldown) * 1000) {
              rewardType === "Water" ? setBlueLight(true) : setOrangeLight(true);
              setTimeout(() => {
                rewardType === "Water" ? setBlueLight(false) : setOrangeLight(false);
              }, 1000);
              setLastRewardTime(now);
              setRewardCount(prev => prev + 1);
            }
          }

          setElapsedTime(prev => prev + 1);

          // Check if the trial duration has been met
          const durationInSeconds = parseInt(trialDuration);
          if (setElapsedTime >= durationInSeconds) {
            stopTest();
            setTestRunning(false);
            return () => clearInterval(interval);
          }

        } catch (error) {
          console.error("Error fetching test counts:", error);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [testRunning]);

  const handleRunTest = async () => {
    if (!testName || !trialDuration) {
      alert("Please fill in all required fields before starting the test.");
      return;
    }

    if (testPaused) {
      setTestPaused(false);
      setTestRunning(true);
      return;
    }

    setTestResults(null);
    setTestFinished(false);
    setTestPaused(false);
    setTestRunning(true);
    setElapsedTime(0);
    setLastRewardTime(0);
    setRewardCount(0);

    try {
      await runTest({ testName, trialDuration, rewardType, interactionType, stimulusType, lightColor });
    } catch (error) {
      console.error("Error running test:", error);
    }
  };

  const handleStopTest = async (autoStop = false) => {
    try {
      await stopTest();
      setTestRunning(false);
      const finalCounts = await getCounts();
      setTestResults(finalCounts);
      if (autoStop) {
        setTestFinished(true);
      } else {
        setTestPaused(true);
      }
    } catch (error) {
      console.error("Error stopping test:", error);
    }
  };

  const handleDownloadResults = () => {
    if (!testResults) return;
    const timestamp = new Date().toLocaleString();
    const csvLines = [
      "Test Results",
      `Timestamp:,${timestamp}`,
      `Test Name:,${testName}`,
      `Trial Duration (seconds):,${trialDuration}`,
      `Goal for Trial:,${goalForTrial}`,
      `Cooldown (seconds):,${cooldown}`,
      `Reward Type:,${rewardType}`,
      `Interaction Type:,${interactionType}`,
      `Stimulus Type:,${stimulusType}`,
      `Light Color:,${lightColor}`,
      "",
      "Final Trial Data",
      `Elapsed Time (s):,${elapsedTime}`,
      `Lever Press Count:,${testResults.lever_press_count}`,
      `Nose Poke Count:,${testResults.nose_poke_count}`,
      `Light Status:,${testResults.light_on ? "ON" : "OFF"}`,
      `Rewards Given:,${rewardCount}`
    ];
    const csvData = csvLines.join("\n");
    const blob = new Blob([csvData], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${testName.replace(/\s+/g, "_")}_results.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRGB = async (red, green, blue) => {
    try {
      const result = await setRGBLight(red, green, blue);
      setMessage(`RGB LED set to R:${result.rgb.red} G:${result.rgb.green} B:${result.rgb.blue}`);
    } catch (error) {
      setMessage("Failed to control RGB LED");
    }
  };

// CHANGE: Completely rewrote handlePreset to support user-created presets from localStorage
// Previous version: Only handled hardcoded Preset 1-4
// New version: Handles Preset 1, "None", AND dynamically-loaded user presets
const handlePreset = (event) => {
    const value = event.target.value;
    
    try {
        setPresetValue(value);
        
        // CHANGE: Simplified Preset 1 (removed Preset 2-4 for now)
        // NOTE: These values look like test data - you may want to restore proper preset values
        if (value === "Preset 1") {
            setTestName(5)              // CHANGE: Setting to number instead of string
            setTrialDuration(1)         // CHANGE: 1 minute duration
            setGoalForTrial("Test")     // CHANGE: Non-numeric goal value
            setCooldown(2)              // CHANGE: 2 second cooldown
            setRewardType("Food")
            setInteractionType("Lever")
            setStimulusType("Light")
            setLightColor("Green")
        }
        // CHANGE: Simplified "None" option - now clears ALL fields including testName
        // Previous version only cleared some fields
        else if (value === "None") {
            setTestName("")             // CHANGE: Now clears test name
            setTrialDuration("")
            setGoalForTrial("")
            setCooldown("")
            setRewardType("")            // CHANGE: Now clears to empty instead of default "Water"
            setInteractionType("")       // CHANGE: Now clears to empty instead of default "Lever"
            setStimulusType("")          // CHANGE: Now clears to empty instead of default "Light"
            setLightColor("")            // CHANGE: Now clears to empty instead of default "Red"
        }
        // CHANGE: NEW - Added else block to handle user-created presets
        // This enables dynamic preset loading from PresetManager-created configurations
        else {
            // Search userPresets array for matching preset name
            const userPreset = userPresets.find(p => p.name === value);
            if (userPreset) {
                // Apply all preset values to form fields
                setTrialDuration(userPreset.trialDuration);
                setCooldown(userPreset.cooldown);
                setRewardType(userPreset.rewardType);
                setInteractionType(userPreset.interactionType);
                setStimulusType(userPreset.stimulusType);
                setLightColor(userPreset.lightColor);
                setGoalForTrial(userPreset.goalForTrial);
                // NOTE: testName is NOT set from preset (intentional - user should provide unique name per trial)
            }
        }
    } catch(e) {
        alert("Error loading preset");
    }
};

  return (
    /* Main Component Return - Conditional Rendering
     * This component has two main UI states:
     * 1. Test Setup Form (!testRunning && !testPaused && !testFinished)
     * 2. Test Execution/Results Screen (testRunning || testPaused || testFinished)
     * The ternary operator below switches between these states based on test status.
     */
    <div className="trial-settings">
      {/* Conditional rendering: Show form configuration when no test is active */}
      {!testRunning && !testPaused && !testFinished ? (

        /* TEST SETUP FORM CONTAINER
         * Contains all input controls for configuring a Skinner Box trial.
         * Uses Material-UI FormControl components with validation.
         */
        <div id = "formControlContainer">

          {/* PRESET SELECTOR
           * Allows quick loading of predefined test configurations.
           * Calling handlePreset() populates all form fields with preset values.
           * Select "None" to clear all fields and create a custom configuration.
           * 
           * CHANGE: IMPLEMENTED dynamic user preset rendering!
           * Now displays user-created presets from PresetManager component.
           * Hardcoded presets (Preset 1-4) have been removed except Preset 1.
           * 
           * HOW IT WORKS:
           * 1. userPresets.map() iterates through all saved presets from localStorage
           * 2. Each preset renders as a MenuItem with its custom name
           * 3. When selected, handlePreset() applies that preset's configuration
           * 4. "None" option clears all fields for manual configuration
           * 
           * PRESET FLOW:
           * PresetManager (save to localStorage) → TestManager (load on mount) → Dropdown (render) → handlePreset (apply)
           */}
          <div className="input-group">
            <FormControl fullWidth>
              <InputLabel id="lightColorLabel">Preset:</InputLabel>
                <Select
                    value={presetValue}
                    onChange={handlePreset}
                >
                    {/* CHANGE: Added dynamic rendering of user-created presets */}
                    {/* Maps through userPresets array loaded from localStorage */}
                    {/* Each preset appears as a selectable option with its custom name */}
                    {userPresets.map((preset, index) => (
                        <MenuItem key={index} value={preset.name}>
                            {preset.name}
                        </MenuItem>
                    ))}
                    {/* CHANGE: Moved "None" to end of list (after user presets) */}
                    <MenuItem value={"None"}>None</MenuItem>
                </Select>
            </FormControl>
          </div>  

          {/* TEST NAME INPUT (Required, Validated)
           * User-defined identifier for this trial configuration.
           * Validation removes restricted characters: < > & " ' / - ; \ ^ % + : ( ) { } [ ] and whitespace.
           * Error state shown in red with helper text if validation fails.
           * Validation occurs on every keystroke via validationFunctions.testNameValidation().
           */}
          <div className="input-group">
            <FormControl  fullWidth error={Boolean(testNameError)}>
              <InputLabel htmlFor="testNameLabel">Test Name:</InputLabel>
              <Input
                id="testName"
                placeholder="Enter test name"
                required
                value={testName}
                onChange={(e) => {
                  const { value, error } = validationFunctions.testNameValidation(e.target.value);
                  setTestName(value);
                  setTestNameError(error);
                }}
              />
              <FormHelperText>
                {testNameError}
              </FormHelperText>
            </FormControl>
          </div>
          
          {/* TRIAL DURATION INPUT (Required, Numeric Only)
           * Specifies how long the trial will run in minutes.
           * Validation strips all non-digit characters.
           * Shows "Only numbers are allowed" error if user enters non-numeric input.
           * Used in useEffect polling loop to determine when trial should end.
           */}
          <div className="input-group">
            <FormControl fullWidth error={Boolean(trialDurationError)}>
              <InputLabel htmlFor="trialDurationLabel">Trial Duration(Minutes):</InputLabel>
              <Input
                id="trialDuration"
                placeholder="Enter Trial Duration"
                required
                min = "0"
                value={trialDuration}
                onChange={(e) => {
                  const { value, error } = validationFunctions.testTrialDurtion(e.target.value);
                  setTrialDuration(value);
                  setTrialDurationError(error);
                }}
              />
              <FormHelperText>
                {trialDurationError}
              </FormHelperText>
            </FormControl>
          </div>
          
          {/* GOAL FOR TRIAL INPUT (Required, Numeric Only)
           * Target number of interactions (lever presses or nose pokes) needed to trigger a reward.
           * Example: If goal is 5, reward is given every 5th interaction.
           * Validation ensures only numeric input.
           * Used in reward logic: if (count % goal === 0) -> trigger reward
           */}
          <div className="input-group">
            <FormControl fullWidth error={Boolean(trialGoalError)}>
              <InputLabel htmlFor="goalForTrialLabel">Goal for Trial:</InputLabel>
              <Input
                id="goalForTrial"
                placeholder="Enter Goal"
                required
                value={goalForTrial}
                onChange={(e) => {
                  const { value, error } = validationFunctions.testTrialGoal(e.target.value);
                  setGoalForTrial(value);
                  setTrialGoalError(error);
                }}
              />
              <FormHelperText>
                {trialGoalError}
              </FormHelperText>
            </FormControl>
          </div>
          

          {/* COOLDOWN INPUT (Required, Numeric Only, Seconds)
           * Minimum time (in seconds) that must elapse between rewards.
           * Prevents rapid-fire reward dispensing even if goal is met multiple times quickly.
           * Checked in reward logic: if (now - lastRewardTime >= cooldown * 1000)
           * Validation ensures only numeric input.
           */}
          <div className="input-group">
             <FormControl fullWidth error={Boolean(coolDownError)}>
              <InputLabel htmlFor="cooldownLabel">Cooldown:</InputLabel>
              <Input
                id="cooldown"
                placeholder="Enter Cooldown"
                required
                min = "0"
                value={cooldown}
                onChange={(e) => {
                  const { value, error } = validationFunctions.testCoolDown(e.target.value);
                  setCooldown(value);
                  setCoolDownError(error);
                }}
              />
              <FormHelperText>
                {coolDownError}
              </FormHelperText>
            </FormControl>
          </div>
         

         {/* REWARD TYPE SELECTOR
          * Determines which reward dispenser activates when goal is met.
          * "Water" -> triggers blue light via setBlueLight()
          * "Food" -> triggers orange light via setOrangeLight()
          * No validation needed (dropdown ensures valid selection).
          */}
         <div className="input-group">
          <FormControl fullWidth>
            <InputLabel id="rewardTypeLabel">Reward Type:</InputLabel>
              <Select
                id="rewardType"
                value={rewardType}
                onChange = {(e) => setRewardType(e.target.value)}
              >
                <MenuItem value={"Water"}>Water</MenuItem>
                <MenuItem value={"Food"}>Food</MenuItem>
              </Select>
          </FormControl>
         </div>
          

          {/* INTERACTION TYPE SELECTOR
           * Defines which subject behavior is tracked/counted.
           * "Lever" -> counts lever presses from getCounts().lever_press_count
           * "Poke" -> counts nose pokes from getCounts().nose_poke_count
           * Selected type determines which count is compared against goalForTrial.
           */}
          <div className="input-group">
            <FormControl fullWidth>
              <InputLabel id="interactionTypeLabel">Interaction Type:</InputLabel>
                <Select
                  id="interactionType"
                  value={interactionType}
                  onChange = {(e) => setInteractionType(e.target.value)}
                  >
                  <MenuItem value={"Poke"}>Poke</MenuItem>
                  <MenuItem value={"Lever"}>Lever</MenuItem>
                </Select>
            </FormControl>
          </div>
          
          {/* STIMULUS TYPE SELECTOR
           * Specifies what type of stimulus is presented during trials.
           * "Light" -> visual stimulus
           * "Tone" -> auditory stimulus
           * Note: Actual stimulus delivery logic may be in backend (sbBackend.py).
           */}
          <div className="input-group">
            <FormControl fullWidth>
              <InputLabel id="stimulusTypeLabel">Stimulus Type:</InputLabel>
                <Select
                  id="stimulasType"
                  value={stimulusType}
                  onChange = {(e) => setStimulusType(e.target.value)}
                >
                  <MenuItem value={"Light"}>Light</MenuItem>
                  <MenuItem value={"Tone"}>Tone</MenuItem>
                </Select>
            </FormControl>
          </div>
          

          {/* LIGHT COLOR SELECTOR
           * Determines the color of the visual indicator light.
           * Used to provide visual feedback during trials.
           * RGB control buttons in test execution screen can override this during runtime.
           */}
          <div className="input-group">
            <FormControl fullWidth>
              <InputLabel id="lightColorLabel">Light Color:</InputLabel>
                <Select
                  id="lightColor"
                  value={lightColor}
                  onChange = {(e) => setLightColor(e.target.value)}
                >
                  <MenuItem value={"Red"}>Red</MenuItem>
                  <MenuItem value={"Green"}>Green</MenuItem>
                  <MenuItem value={"Blue"}>Blue</MenuItem>
                  <MenuItem value={"Yellow"}>Yellow</MenuItem>
                </Select>
            </FormControl>
          </div>  
          

          {/* ACTION BUTTON GROUP
           * Primary controls for managing test configurations and execution.
           */}
          <div className="input-group">
            <ButtonGroup variant="contained"  className="input-group" aria-label="Basic button group">

              {/* Save Test Button
               * Downloads current configuration as a .txt file.
               * Disabled if form hasn't changed from originalSettings (prevents redundant saves).
               * Calls handleSaveTest() which creates a blob and triggers browser download.
               */}
              <Button className="save-button" onClick={handleSaveTest} disabled={!hasChanged()}>Save Test</Button>
              
              {/* Upload Test Configuration Button
               * File input wrapped in Button for styling consistency.
               * Accepts .txt files with expected format (validated by validateFileFormat()).
               * Calls handleFileUpload() to parse and populate form fields.
               */}
              <Button><input type="file" accept=".txt" onChange={handleFileUpload} className="upload-button" /></Button>
              
              {/* Delete Uploaded File Button (Conditional)
               * Only renders if uploadedFile state is not null.
               * Clears the uploaded file and resets all form fields to empty/default values.
               * Red styling indicates destructive action.
               */}
              {uploadedFile && <Button className="delete-button" onClick={handleDeleteUpload} style={{ backgroundColor: 'red', color: 'white' }}>Delete</Button>}
              
              {/* Run Test Button
               * Initiates test execution.
               * Validates that testName and trialDuration are filled before starting.
               * Calls handleRunTest() which sets testRunning=true and triggers the useEffect polling loop.
               * Sends configuration to backend via runTest() API call.
               */}
              <Button className="start-button" onClick={handleRunTest}>Run Test</Button>
            </ButtonGroup>
          </div>          
        </div>
      ) : (
          /* TEST EXECUTION/RESULTS SCREEN
           * Rendered when test is running, paused, or finished.
           * Displays real-time metrics and control buttons based on test state.
           */
          <div className="test-screen">
            {/* Dynamic title based on test completion state */}
            <h1>{testFinished ? "Test Completed" : "Test in Progress"}</h1>
            
            {/* REAL-TIME METRICS
             * Updated every second by useEffect polling loop when testRunning=true.
             * elapsedTime increments each second.
             * leverPressCount and nosePokeCount come from getCounts() API.
             * lightOn reflects current stimulus light state from backend.
             */}
            <p>Elapsed Time: {elapsedTime}s</p>
            <p>Lever Presses: {leverPressCount}</p>
            <p>Nose Pokes: {nosePokeCount}</p>
            <p>Light Status: {lightOn ? "ON" : "OFF"}</p>
            
            {/* RGB LIGHT MANUAL CONTROLS
             * Allow experimenter to manually control RGB LED during trial.
             * Each button calls handleRGB() with different color combinations.
             * handleRGB() calls setRGBLight() API and displays result in message state.
             */}
            <div className="button-group">
              <button className='redlight-button' onClick={() => handleRGB('on', 'off', 'off')}>RGB Red On</button>
              <button className='greenlight-button' onClick={() => handleRGB('off', 'on', 'off')}>RGB Green On</button>
              <button className='bluelight-button' onClick={() => handleRGB('off', 'off', 'on')}>RGB Blue On</button>
              <button className='rgblight-button' onClick={() => handleRGB('off', 'off', 'off')}>RGB Off</button>

              {/* Status message from RGB control attempts (success or error) */}
              {message && <p>{message}</p>}

              {/* STOP BUTTON (Conditional - Only when test is actively running)
               * Pauses the test by calling handleStopTest(false).
               * Sets testRunning=false and testPaused=true.
               * Fetches final counts from backend and stores in testResults.
               * Test can be resumed from paused state.
               */}
              {testRunning && <button className="stop-button" onClick={() => handleStopTest(false)}>Stop Test</button>}

              {/* PAUSED STATE CONTROLS (Conditional - Only when testPaused=true)
               * Provides three options after stopping a test:
               */}
              {testPaused && (
                <>
                  {/* Resume: Continues the test from where it was paused.
                   * Calls handleRunTest() which sets testPaused=false and testRunning=true.
                   * Polling loop resumes updating metrics.
                   */}
                  <button className="resume-button" onClick={handleRunTest}>Resume</button>
                  
                  {/* Finish Test: Ends the test permanently without resuming.
                   * Sets testPaused=false and testFinished=true.
                   * Transitions to finished state for result download.
                   */}
                  <button className="finish-button" onClick={() => { setTestPaused(false); setTestFinished(true); }}>Finish Test</button>
                  
                  {/* Return to Test Setup: Abandons current test and returns to form.
                   * Clears testPaused flag and testResults.
                   * Form retains previous configuration for easy restart.
                   */}
                  <button className="return-button" onClick={() => { setTestPaused(false); setTestResults(null); }}>Return to Test Setup</button>
                </>
              )}

              {/* FINISHED STATE CONTROLS (Conditional - Only when testFinished=true)
               * Test has completed - provide result download and return options.
               */}
              {testFinished && (
                <>
                  {/* Download Results: Exports test data as CSV file.
                   * Calls handleDownloadResults() which formats data and triggers browser download.
                   * CSV includes: timestamp, all configuration params, final counts, elapsed time, rewards given.
                   */}
                  <button className="download-button" onClick={handleDownloadResults}>Download Results</button>
                  
                  {/* Return to Test Setup: Go back to configuration form.
                   * Clears finished state and results to allow starting a new test.
                   */}
                  <button className="return-button" onClick={() => { setTestFinished(false); setTestResults(null); }}>Return to Test Setup</button>
                </>
              )}

            </div>
          </div>
      )}
    </div>
  );
}

export default TestManager;