// Importing the necessary resources needed within this page:
import React, { useState, useEffect, useRef } from "react";
// Backend API helpers - hardware control and persistence endpoints
import { runTest, stopTest, getCounts, setBlueLight, setOrangeLight, setRGBLight, getTestInformation, getTestStatus } from "../../utilities/api";

// Input validation helpers and component styles
import { validationFunctions } from "../../validation/test_manager";
import "./TestManager.css";

// Importing MUI Components:
import ButtonGroup from '@mui/material/ButtonGroup';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormHelperText from '@mui/material/FormHelperText';
import Button from '@mui/material/Button';
import { FormControl, InputLabel, Input} from '@mui/material';
import { PresentToAll } from "@mui/icons-material";


// Component state: form fields, operational flags, counters, timers, and error messages
const TestManager = () => {
  // Preset selection (string name)
  const [presetValue, setPresetValue] = useState("");
  // Subject / test identifiers and human-readable name
  const [subjectID, setSubjectID] = useState(""); 
  const [testName, setTestName] = useState("");
  // Trial parameters (numeric strings or numbers depending on input handling)
  const [trialDuration, setTrialDuration] = useState("");
  const [goalForTrial, setGoalForTrial] = useState("");
  const [cooldown, setCooldown] = useState("");
  const [rewardType, setRewardType] = useState("Water");
  const [interactionType, setInteractionType] = useState("Lever");
  const [stimulusType, setStimulusType] = useState("Light");
  const [lightColor, setLightColor] = useState("Red");
  const [userPresets, setUserPresets] = useState([]);
  // Runtime flags
  const [testRunning, setTestRunning] = useState(false);
  const [testPaused, setTestPaused] = useState(false);
  const [testFinished, setTestFinished] = useState(false);
  // Results and counters
  const [testResults, setTestResults] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const elapsedTimeRef = useRef(0);
  const [leverPressCount, setLeverPressCount] = useState(0);
  const [nosePokeCount, setNosePokeCount] = useState(0);
  const [lightOn, setLightOn] = useState(false);
  // Snapshot used to detect unsaved changes
  const [originalSettings, setOriginalSettings] = useState(null);
  // File upload state for importing preset-like settings
  const [uploadedFile, setUploadedFile] = useState(null);
  // Reward cooldown enforcement (timestamp) + a simple boolean that indicates reward was given
  const [lastRewardTime, setLastRewardTime] = useState(0);
  // const [isRewaredGiven, setRewardGiven] = useState(false); 
  // Generic status or feedback message shown to user
  const [message, setMessage] = useState("");
  // Validation errors for form fields
  const [testNameError, setTestNameError] = useState('');
  const [trialDurationError, setTrialDurationError] = useState('');
  const [trialGoalError, setTrialGoalError] = useState('');
  const [coolDownError, setCoolDownError] = useState('');
  const [subjectIDError, setSubjectIDError] = useState('');


  // Creating a function that handles the presets in the front-end:
  useEffect(() => {
    setOriginalSettings({ testName, trialDuration, goalForTrial, cooldown, rewardType, interactionType, stimulusType, lightColor });
  
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

  // Change detector: compares current form values to the original snapshot
  // Returns true when the form has unsaved changes (used to enable Save button)
  const hasChanged = () => {
    return JSON.stringify(originalSettings) !== JSON.stringify({ testName, trialDuration, goalForTrial, cooldown, rewardType, interactionType, stimulusType, lightColor });
  };

  // Creating a function called handleSaveTest, that is responsible for handling the logice of saving the current test:
  const handleSaveTest = () => {

    // Checking to see if any of these fields are empty, if so alert the user to please fill these elements in.
    if (!testName || !trialDuration || !goalForTrial || !cooldown) {
      alert("Please fill in all required fields.");
      return;
    }

    // Creating a variable called testSettings that is responsible for storing the test information.
    const testSettings = `Preset: ${presetValue}\nTest Name: ${testName}\nSubject Identification: ${subjectID}\nTrial Duration: ${trialDuration} minutes\nGoal: ${goalForTrial}\nCooldown: ${cooldown} seconds\nReward Type: ${rewardType}\nInteraction Type: ${interactionType}\nStimulus Type: ${stimulusType}\nLight Color: ${lightColor}`;

    // Logic that will be used in the handling and creation of the csv file:
    const blob = new Blob([testSettings], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${testName.replace(/\s+/g, "_")}_settings.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Validate an uploaded settings text file. Expects one key per line in a fixed order.
  // Returns true when the file matches the required template used by the importer.
  const validateFileFormat = (text) => {
    const lines = text.split("\n");
    const expectedKeys = [
      "Test Name", "Trial Duration", "Goal", "Cooldown",
      "Reward Type", "Interaction Type", "Stimulus Type", "Light Color"
    ];
    return lines.length === expectedKeys.length && lines.every((line, index) => line.startsWith(expectedKeys[index] + ": "));
  };

  // Handle user-uploaded settings files: parse, validate, and populate form fields.
  // NOTE: Mapping is positional (line index) — see TODOs if you need a more robust parser.
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

      setTestName(values[0] || "");
      setSubjectID(values[1] || "")
      setTrialDuration(values[1] ? values[1].replace(" minutes", "") : "");
      setGoalForTrial(values[2] || "");
      setCooldown(values[3] ? values[3].replace(" seconds", "") : "");
      setRewardType(values[4] || "Water");
      setInteractionType(values[5] || "Lever");
      setStimulusType(values[6] || "Light");
      setLightColor(values[7] || "Red");
    };
    reader.readAsText(file);
  };

  // Creating a function called handleDeleteUploade that is resposible for handling the deletion of a file from the skinnerbox application:
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
          // GetCounts comes from the backend, but it never sends information from the frontend to backend.
          const data = await getCounts();
          setLeverPressCount(data.lever_press_count);
          setNosePokeCount(data.nose_poke_count);

          // ADDED: Poll the backend to check if the test was stopped because the goal was reached
          const status = await getTestStatus();
          if (status.testFinished) {
            handleStopTest(true); // Auto-stop the frontend UI
            return;
          }

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
              // setRewardGiven(true);
            }
          }

          // Track elapsed time using ref to avoid stale closure issues
          elapsedTimeRef.current += 1;
          setElapsedTime(elapsedTimeRef.current);

          // Check if the trial duration has been met (trialDuration is in minutes)
          const durationInSeconds = parseInt(trialDuration) * 60;
          if (elapsedTimeRef.current >= durationInSeconds) {
            handleStopTest(true);
            return;
          }

          // Update backend with current counts every 5 seconds
          if (elapsedTimeRef.current > 0 && elapsedTimeRef.current % 5 === 0) {
            const currentSettings = {
              nosePoke: data.nose_poke_count,
              leverPress: data.lever_press_count
            };
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
    elapsedTimeRef.current = 0;
    setLastRewardTime(0);
    // setRewardGiven(false);

    const testSettings = { 
      testName, 
      subjectID,
      trialDuration, 
      goalForTrial,
      cooldown,
      rewardType, 
      interactionType, 
      stimulusType, 
      lightColor,
      leverPress: leverPressCount,
      nosePoke: nosePokeCount
    };

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
    // ADDED: Included Preset and Subject Identification fields in CSV to match handleSaveTest output
    const csvLines = [
      "Test Results",
      `Timestamp:${timestamp}`,
      `Preset:${presetValue}`,
      `Test Name:${testName}`,
      `Subject Identification:${subjectID}`,
      `Trial Duration (minutes):${trialDuration}`,
      `Goal for Trial:${goalForTrial}`,
      `Cooldown (seconds):${cooldown}`,
      `Reward Type:${rewardType}`,
      `Interaction Type:${interactionType}`,
      `Stimulus Type:${stimulusType}`,
      `Light Color:${lightColor}`,
      "",
      "Final Trial Data",
      `Elapsed Time (s):${elapsedTime}`,
      `Lever Press Count:${testResults.lever_press_count}`,
      `Nose Poke Count:${testResults.nose_poke_count}`,
      `Light Status:${testResults.light_on ? "ON" : "OFF"}`,
      // `Reward Given:${rewardGiven ? "Yes" : "No"}`
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

const handlePreset = (event) => {
    const value = event.target.value;
    
    try {
        setPresetValue(value);
        
        if (value === "Preset 1") {
            setTestName("Preset 1 Test")        
            setTrialDuration(1)         
            setGoalForTrial(5)          
            setCooldown(2)              
            setRewardType("Food")
            setInteractionType("Lever")
            setStimulusType("Light")
            setLightColor("Green")
        }

        else if (value === "None") {
            setTestName("")             
            setTrialDuration("")
            setSubjectID("")
            setGoalForTrial("")
            setCooldown("")
            setRewardType("")            
            setInteractionType("")       
            setStimulusType("")          
            setLightColor("")            
        }

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
  
  // Render: shows either the setup form or the live test screen depending on runtime flags
  return (
    <div className="trial-settings">
      {!testRunning && !testPaused && !testFinished ? (
        <div id = "formControlContainer">
          <div className="input-group">
            {/* Preset selector: choose a saved preset or "None" to clear fields */}
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
            {/* Test name: user-provided label for this trial (validated) */}
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
            {/* Subject ID: numeric identifier for the animal/subject (validated) */}
            <FormControl  fullWidth error={Boolean(subjectIDError)}>
              <InputLabel htmlFor="subjectIdentification">Subject Identification:</InputLabel>
              <Input
                id="txtSubjectID"
                placeholder="Enter Subject ID (numeric)"
                required
                value={subjectID}
                onChange={(e) => {
                  const { value, error } = validationFunctions.testSubjectID(e.target.value);
                  setSubjectID(value);
                  setSubjectIDError(error);
                }}
              />
              <FormHelperText>
                {subjectIDError}
              </FormHelperText>
            </FormControl>
          </div>
        
          <div className="input-group">
            {/* Trial duration: length of trial in minutes (numeric, validated) */}
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
          {/* Reward type: controls which dispenser/light is used when goal is reached */}
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
            {/* Interaction type: which input the hardware reports (Poke or Lever) */}
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
            {/* Stimulus type: visual or auditory cue during trials */}
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
          
          <div className="input-group">
            {/* Light color: selects the color used for visual stimulus */}
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
            {/* Action buttons: save config, upload settings file, delete upload, start test */}
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
            {/* Live test screen: shows status, counters, and runtime controls */}
            <h1>{testFinished ? "Test Completed" : "Test in Progress"}</h1>
            {/* Runtime metrics displayed to the user */}
            <p>Elapsed Time: {elapsedTime}s</p>
            <p>Lever Presses: {leverPressCount}</p>
            <p>Nose Pokes: {nosePokeCount}</p>
            <p>Light Status: {lightOn ? "ON" : "OFF"}</p>

            <div className="button-group">
              {/* Manual RGB controls for debugging or manual stimulus */}
              <button className='redlight-button' onClick={() => handleRGB('on', 'off', 'off')}>RGB Red On</button>
              <button className='greenlight-button' onClick={() => handleRGB('off', 'on', 'off')}>RGB Green On</button>
              <button className='bluelight-button' onClick={() => handleRGB('off', 'off', 'on')}>RGB Blue On</button>
              <button className='rgblight-button' onClick={() => handleRGB('off', 'off', 'off')}>RGB Off</button>

              {/* Status/message area */}
              {message && <p>{message}</p>}

              {/* Runtime control buttons vary by test state */}
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
                  {/* Export or return to setup after trial completion */}
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