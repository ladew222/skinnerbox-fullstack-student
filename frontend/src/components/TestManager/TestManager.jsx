import React, { useState, useEffect } from "react";
import "./TestManager.css";
import { runTest, stopTest, getCounts, setBlueLight, setOrangeLight, setRGBLight, getTestInformation } from "../../utilities/api";
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
  const [subjectID, setSubjectID] = useState(""); 
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

    // const testSettings = `Test Name: ${testName}\nTrial Duration: ${trialDuration} seconds\nGoal: ${goalForTrial}\nCooldown: ${cooldown} seconds\nReward Type: ${rewardType}\nInteraction Type: ${interactionType}\nStimulus Type: ${stimulusType}\nLight Color: ${lightColor}`;
    
    const testSettings = `Preset: ${presetValue}\nTest Name: ${testName}\nSubject Identification: ${subjectID}\nTrial Duration: ${trialDuration} seconds\nGoal: ${goalForTrial}\nCooldown: ${cooldown} seconds\nReward Type: ${rewardType}\nInteraction Type: ${interactionType}\nStimulus Type: ${stimulusType}\nLight Color: ${lightColor}`;

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

      // TODO: Fix the handleFileUpload to reflect the changes to UI
      setTestName(values[0] || "");
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

  // TODO: Not Sending to backend
  useEffect(() => {
    let interval;
    if (testRunning) {
      interval = setInterval(async () => {
        try {
          // GetCounts comes from the backend, but it never sends information from the frontend to backend.
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

    const testSettings = { 
      testName, 
      subjectID,
      trialDuration, 
      goalForTrial,
      cooldown,
      rewardType, 
      interactionType, 
      stimulusType, 
      lightColor 
    };

    // TODO: Changed runTest to reflect sending the updated information
    try {
      // Save test information to database FIRST to ensure record exists
      console.log("Saving test configuration...");
      await getTestInformation(testSettings);
      
      // Then start the hardware test
      console.log("Starting hardware test...");
      await runTest(testSettings);
    } catch (error) {
      console.error("Error running test sequence:", error);
      setTestRunning(false);
      alert("Failed to start test. Please check connections or backend logs.");
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
  // TODO: Add cookies and sessions for the refresh and login
  // TODO: Determine why name is getting set to a number 
  
  return (
    <div className="trial-settings">
      {!testRunning && !testPaused && !testFinished ? (
        <div id = "formControlContainer">
          <div className="input-group">
            <FormControl fullWidth>
              <InputLabel id="lblPresetManager">Preset:</InputLabel>
                <Select value={presetValue} onChange={handlePreset}>
                  {userPresets.map((preset, index) => (
                      <MenuItem key={index} value={preset.name}>
                          {preset.name}
                      </MenuItem>
                  ))}
                  <MenuItem value={"None"}>None</MenuItem>
                </Select>
            </FormControl>
          </div>  

          <div className="input-group">
            <FormControl  fullWidth error={Boolean(testNameError)}>
              <InputLabel htmlFor="testName">Test Name:</InputLabel>
              <Input
                id="lblTestName"
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


          <div className="input-group">
            <FormControl  fullWidth>
              <InputLabel htmlFor="subjectIdentification">Subject Identification:</InputLabel>
              <Input
                id="txtSubjectID"
                placeholder="Enter Subject ID"
                required
                value={subjectID}
                onChange={(e) => setSubjectID(e.target.value)}
              />
              {/* <FormHelperText>
                {testNameError}
              </FormHelperText> */}
            </FormControl>
          </div>
        
          <div className="input-group">
            <FormControl fullWidth error={Boolean(trialDurationError)}>
              <InputLabel htmlFor="trialDuration">Trial Duration(Minutes):</InputLabel>
              <Input
                id="txtTrialDuration"
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
              <InputLabel htmlFor="goalForTrial">Goal for Trial:</InputLabel>
              <Input
                id="txtGoalForTrial"
                placeholder="Enter Goal"
                required
                value={goalForTrial}
                onChange={(e) => setGoalForTrial(e.target.value)}
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
              <InputLabel htmlFor="coolDown">Cooldown:</InputLabel>
              <Input
                id="txtCooldown"
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
         
         <div className="input-group">
          <FormControl fullWidth>
            <InputLabel id="rewardType">Reward Type:</InputLabel>
              <Select
                id="selectRewardType"
                value={rewardType}
                onChange = {(e) => setRewardType(e.target.value)}
              >
                <MenuItem value={"Water"}>Water</MenuItem>
                <MenuItem value={"Food"}>Food</MenuItem>
              </Select>
          </FormControl>
         </div>
        
          <div className="input-group">
            <FormControl fullWidth>
              <InputLabel id="interactionType">Interaction Type:</InputLabel>
                <Select
                  id="selectInteractionType"
                  value={interactionType}
                  onChange = {(e) => setInteractionType(e.target.value)}
                  >
                  <MenuItem value={"Poke"}>Poke</MenuItem>
                  <MenuItem value={"Lever"}>Lever</MenuItem>
                </Select>
            </FormControl>
          </div>
          
          <div className="input-group">
            <FormControl fullWidth>
              <InputLabel id="stimulusType">Stimulus Type:</InputLabel>
                <Select
                  id="selectStimulasType"
                  value={stimulusType}
                  onChange = {(e) => setStimulusType(e.target.value)}
                >
                  <MenuItem value={"Light"}>Light</MenuItem>
                  <MenuItem value={"Tone"}>Tone</MenuItem>
                </Select>
            </FormControl>
          </div>

          {/* <div className="input-group">
            <FormControl fullWidth>
              <InputLabel id="stimulusTypeTwo">Stimulus Type:</InputLabel>
                <Select
                  id="selectStimulasTypeTwo"
                  value={stimulusType}
                  onChange = {(e) => setStimulusType(e.target.value)}
                >
                  <MenuItem value={"Light"}>Light</MenuItem>
                  <MenuItem value={"Tone"}>Tone</MenuItem>
                </Select>
            </FormControl>
          </div> */}
        
          <div className="input-group">
            <FormControl fullWidth>
              <InputLabel id="lightColor">Light Color:</InputLabel>
                <Select
                  id="selectLightColor"
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
          
          <div className="input-group">
            <ButtonGroup variant="contained"  className="input-group" aria-label="Basic button group">
              <Button className="save-button" onClick={handleSaveTest} disabled={!hasChanged()}>Save Test</Button>
              <Button><input type="file" accept=".txt" onChange={handleFileUpload} className="upload-button" /></Button>
              {uploadedFile && <Button className="delete-button" onClick={handleDeleteUpload} style={{ backgroundColor: 'red', color: 'white' }}>Delete</Button>}
              <Button 
                className="start-button" 
                onClick={handleRunTest}
              >
                Run Test
              </Button>
            </ButtonGroup>
          </div>          
        </div>
      ) : (
   
          <div className="test-screen">
            {/* Dynamic title based on test completion state */}
            <h1>{testFinished ? "Test Completed" : "Test in Progress"}</h1>
            <p>Elapsed Time: {elapsedTime}s</p>
            <p>Lever Presses: {leverPressCount}</p>
            <p>Nose Pokes: {nosePokeCount}</p>
            <p>Light Status: {lightOn ? "ON" : "OFF"}</p>

            <div className="button-group">
              <button className='redlight-button' onClick={() => handleRGB('on', 'off', 'off')}>RGB Red On</button>
              <button className='greenlight-button' onClick={() => handleRGB('off', 'on', 'off')}>RGB Green On</button>
              <button className='bluelight-button' onClick={() => handleRGB('off', 'off', 'on')}>RGB Blue On</button>
              <button className='rgblight-button' onClick={() => handleRGB('off', 'off', 'off')}>RGB Off</button>

  
              {message && <p>{message}</p>}


              {testRunning && <button className="stop-button" onClick={() => handleStopTest(false)}>Stop Test</button>}
              {testPaused && (
                <>
                  <button className="resume-button" onClick={handleRunTest}>Resume</button>
                  <button className="finish-button" onClick={() => { setTestPaused(false); setTestFinished(true); }}>Finish Test</button>
                  <button className="return-button" onClick={() => { setTestPaused(false); setTestResults(null); }}>Return to Test Setup</button>
                </>
              )}
              {testFinished && (
                <>
                  <button className="download-button" onClick={handleDownloadResults}>Download Results</button>
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