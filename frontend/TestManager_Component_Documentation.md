# TestManager Component - Developer Documentation

**Component Location:** `src/components/TestManager/TestManager.jsx`  
**Purpose:** Configuration and execution interface for Skinner Box behavioral experiments  
**Last Updated:** November 19, 2025

---

## Table of Contents
1. [Component Overview](#component-overview)
2. [State Management](#state-management)
3. [Application Flow](#application-flow)
4. [Key Functions](#key-functions)
5. [User Interface](#user-interface)
6. [Validation System](#validation-system)
7. [Backend Communication](#backend-communication)
8. [File Operations](#file-operations)
9. [Common Issues & Solutions](#common-issues--solutions)

---

## Component Overview

### What This Component Does

The TestManager component is the main control interface for conducting behavioral psychology experiments using a Skinner Box apparatus. It provides a complete workflow:

1. **Configure** - Set up trial parameters (duration, goals, reward types)
2. **Execute** - Run experiments with real-time monitoring
3. **Monitor** - Track subject interactions (lever presses, nose pokes)
4. **Control** - Manage reward dispensing based on behavioral goals
5. **Export** - Generate CSV reports of trial results

### Technology Stack

- **React 18+** - Functional components with hooks
- **Material-UI (MUI)** - Form controls and UI elements
- **Custom API Layer** - Communication with Raspberry Pi backend
- **Pure Validation Functions** - Input sanitization and error handling

### Dependencies

```javascript
// React core
import React, { useState, useEffect } from "react";

// Backend API functions
import { 
  runTest,        // Start trial execution
  stopTest,       // Halt trial
  getCounts,      // Fetch sensor data
  setBlueLight,   // Water dispenser control
  setOrangeLight, // Food dispenser control
  setRGBLight     // Manual LED control
} from "../../utilities/api";

// Material-UI components
import { FormControl, InputLabel, Input } from '@mui/material';
import { Select, MenuItem, FormHelperText, Button, ButtonGroup } from '@mui/material';

// Validation utilities
import { validationFunctions } from "../../validation/test_manager";
```

---

## State Management

The component uses **25 state variables** organized into functional groups:

### Group 1: Test Configuration (9 variables)

These store the user's trial parameter choices:

```javascript
const [presetValue, setPresetValue] = useState("");        // Selected preset name
const [testName, setTestName] = useState("");              // Trial identifier
const [trialDuration, setTrialDuration] = useState("");    // Minutes to run
const [goalForTrial, setGoalForTrial] = useState("");      // Interactions needed for reward
const [cooldown, setCooldown] = useState("");              // Seconds between rewards
const [rewardType, setRewardType] = useState("Water");     // "Water" or "Food"
const [interactionType, setInteractionType] = useState("Lever"); // "Lever" or "Poke"
const [stimulusType, setStimulusType] = useState("Light"); // "Light" or "Tone"
const [lightColor, setLightColor] = useState("Red");       // "Red", "Green", "Blue", "Yellow"
```

**Usage:** These values are sent to the backend when starting a trial and displayed in the form.

### Group 2: Test Execution Status (8 variables)

These track what's happening during a trial:

```javascript
const [testRunning, setTestRunning] = useState(false);     // Is trial actively running?
const [testPaused, setTestPaused] = useState(false);       // Is trial paused?
const [testFinished, setTestFinished] = useState(false);   // Is trial complete?
const [testResults, setTestResults] = useState(null);      // Final counts object
const [elapsedTime, setElapsedTime] = useState(0);         // Seconds elapsed
const [leverPressCount, setLeverPressCount] = useState(0); // Current lever count
const [nosePokeCount, setNosePokeCount] = useState(0);     // Current poke count
const [lightOn, setLightOn] = useState(false);             // Stimulus light status
```

**Usage:** Updated every second during trials via polling. Control which UI view is shown.

### Group 3: File Management (2 variables)

```javascript
const [originalSettings, setOriginalSettings] = useState(null); // Snapshot at mount
const [uploadedFile, setUploadedFile] = useState(null);         // Uploaded file reference
```

**Usage:** `originalSettings` enables the "Save" button only when changes are detected. `uploadedFile` tracks whether a configuration file has been loaded.

### Group 4: Validation Errors (4 variables)

```javascript
const [testNameError, setTestNameError] = useState('');
const [trialDurationError, setTrialDurationError] = useState('');
const [trialGoalError, setTrialGoalError] = useState('');
const [coolDownError, setCoolDownError] = useState('');
```

**Usage:** Display error messages below form inputs when validation fails.

### Group 5: Reward Tracking (3 variables)

```javascript
const [lastRewardTime, setLastRewardTime] = useState(0);   // Timestamp (ms) of last reward
const [rewardCount, setRewardCount] = useState(0);         // Total rewards given
const [message, setMessage] = useState("");                // RGB LED status message
```

**Usage:** Enforce cooldown periods and track total rewards for CSV export.

---

## Application Flow

### State Transition Diagram

```
┌─────────────┐
│ Setup Form  │ ◄────────────────┐
└──────┬──────┘                  │
       │ Run Test                │
       ▼                         │
┌─────────────┐                  │
│   Running   │                  │
└──────┬──────┘                  │
       │ Stop                    │
       ▼                         │
┌─────────────┐   Finish         │
│   Paused    ├──────────┐       │
└──────┬──────┘          │       │
       │ Resume          ▼       │
       │           ┌──────────┐  │
       └──────────►│ Finished │  │
                   └────┬─────┘  │
                        │         │
                  Download/Return │
                        └─────────┘
```

### Detailed Workflow

#### 1. Initialization (Component Mount)

```javascript
useEffect(() => {
  // Take snapshot of initial form state
  setOriginalSettings({ 
    testName, trialDuration, goalForTrial, cooldown, 
    rewardType, interactionType, stimulusType, lightColor 
  });
}, []); // Empty array = run once on mount
```

This snapshot is used to detect if the user has made changes (enables the "Save" button).

#### 2. Starting a Trial

When user clicks "Run Test", `handleRunTest()` is called:

```javascript
const handleRunTest = async () => {
  // Step 1: Validate required fields
  if (!testName || !trialDuration) {
    alert("Please fill in all required fields before starting the test.");
    return;
  }

  // Step 2: If resuming from pause, just change flags
  if (testPaused) {
    setTestPaused(false);
    setTestRunning(true);
    return;
  }

  // Step 3: Reset all counters for fresh start
  setTestResults(null);
  setTestFinished(false);
  setTestPaused(false);
  setTestRunning(true);
  setElapsedTime(0);
  setLastRewardTime(0);
  setRewardCount(0);

  // Step 4: Send configuration to backend
  try {
    await runTest({ 
      testName, trialDuration, rewardType, 
      interactionType, stimulusType, lightColor 
    });
  } catch (error) {
    console.error("Error running test:", error);
  }
};
```

#### 3. Real-Time Polling Loop

When `testRunning` becomes `true`, a `useEffect` hook starts a 1-second interval:

```javascript
useEffect(() => {
  let interval;
  
  if (testRunning) {
    interval = setInterval(async () => {
      try {
        // A. Fetch current counts from hardware
        const data = await getCounts();
        setLeverPressCount(data.lever_press_count);
        setNosePokeCount(data.nose_poke_count);

        // B. Determine which interaction type to monitor
        const count = interactionType === "Lever" 
          ? data.lever_press_count 
          : data.nose_poke_count;
        
        const goal = parseInt(goalForTrial);

        // C. Check if reward should be dispensed
        if (goal > 0 && count > 0 && count % goal === 0) {
          const now = Date.now();
          
          // D. Verify cooldown period has elapsed
          if (now - lastRewardTime >= parseInt(cooldown) * 1000) {
            // E. Activate appropriate dispenser LED for 1 second
            if (rewardType === "Water") {
              setBlueLight(true);
              setTimeout(() => setBlueLight(false), 1000);
            } else {
              setOrangeLight(true);
              setTimeout(() => setOrangeLight(false), 1000);
            }
            
            setLastRewardTime(now);
            setRewardCount(prev => prev + 1);
          }
        }

        // F. Increment elapsed time
        setElapsedTime(prev => prev + 1);

        // G. Check if trial duration reached
        const durationInSeconds = parseInt(trialDuration);
        if (elapsedTime >= durationInSeconds) {
          await stopTest();
          setTestRunning(false);
          clearInterval(interval);
        }

      } catch (error) {
        console.error("Error fetching test counts:", error);
      }
    }, 1000); // Run every 1 second
  }
  
  // Cleanup function runs when component unmounts or testRunning changes
  return () => clearInterval(interval);
}, [testRunning]);
```

**Key Logic:**
- **Reward Condition:** `count % goal === 0` means reward every Nth interaction
- **Cooldown Check:** `now - lastRewardTime >= cooldown * 1000` prevents rapid rewards
- **Auto-Stop:** When `elapsedTime >= trialDuration`, trial ends automatically

#### 4. Stopping a Trial

User clicks "Stop Test", calling `handleStopTest()`:

```javascript
const handleStopTest = async (autoStop = false) => {
  try {
    // Tell backend to halt
    await stopTest();
    
    // Update UI state
    setTestRunning(false);
    
    // Capture final counts
    const finalCounts = await getCounts();
    setTestResults(finalCounts);
    
    // Set appropriate status flag
    if (autoStop) {
      setTestFinished(true);  // Auto-stop from duration
    } else {
      setTestPaused(true);    // Manual stop (can resume)
    }
  } catch (error) {
    console.error("Error stopping test:", error);
  }
};
```

**Two Paths:**
1. **Manual Stop** (`autoStop=false`) → `testPaused=true` → Shows Resume/Finish/Return buttons
2. **Auto Stop** (`autoStop=true`) → `testFinished=true` → Shows Download/Return buttons

---

## Key Functions

### Configuration Functions

#### `handleSaveTest()`
**Purpose:** Export current configuration as a `.txt` file

**Process:**
1. Validates all required fields are filled
2. Formats settings as key-value pairs
3. Creates a downloadable text file

**File Format:**
```
Test Name: ExperimentA
Trial Duration: 10 seconds
Goal: 5
Cooldown: 3 seconds
Reward Type: Water
Interaction Type: Lever
Stimulus Type: Light
Light Color: Red
```

**Code:**
```javascript
const handleSaveTest = () => {
  // Validation
  if (!testName || !trialDuration || !goalForTrial || !cooldown) {
    alert("Please fill in all required fields.");
    return;
  }

  // Format as multi-line string
  const testSettings = `Test Name: ${testName}
Trial Duration: ${trialDuration} seconds
Goal: ${goalForTrial}
Cooldown: ${cooldown} seconds
Reward Type: ${rewardType}
Interaction Type: ${interactionType}
Stimulus Type: ${stimulusType}
Light Color: ${lightColor}`;

  // Create downloadable file
  const blob = new Blob([testSettings], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${testName.replace(/\s+/g, "_")}_settings.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
```

#### `validateFileFormat(text)`
**Purpose:** Ensure uploaded files match expected structure

**Validation Rules:**
- Must have exactly 8 lines
- Each line must start with expected key + `: `
- Keys must be in specific order

**Code:**
```javascript
const validateFileFormat = (text) => {
  const lines = text.split("\n");
  const expectedKeys = [
    "Test Name", "Trial Duration", "Goal", "Cooldown",
    "Reward Type", "Interaction Type", "Stimulus Type", "Light Color"
  ];
  
  return lines.length === expectedKeys.length && 
         lines.every((line, index) => 
           line.startsWith(expectedKeys[index] + ": ")
         );
};
```

#### `handleFileUpload(event)`
**Purpose:** Load configuration from uploaded `.txt` file

**Process:**
1. Read file using FileReader API
2. Validate format
3. Parse values and populate form fields

**Code:**
```javascript
const handleFileUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const fileText = e.target.result;
    
    // Validate format
    if (!validateFileFormat(fileText)) {
      alert("Invalid file format. Please upload a properly formatted test settings file.");
      event.target.value = "";
      return;
    }

    setUploadedFile(file);
    
    // Parse values (split on ": " delimiter)
    const lines = fileText.split("\n");
    const values = lines.map((line) => line.split(": ")[1]);

    // Populate form (index 0 = Test Name is commented out)
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
```

**Note:** Test Name (line 0) is intentionally skipped (commented out in code).

#### `handleDeleteUpload()`
**Purpose:** Clear uploaded file and reset form

**Code:**
```javascript
const handleDeleteUpload = () => {
  setUploadedFile(null);
  
  // Reset all fields to defaults
  setTestName("");
  setTrialDuration("");
  setGoalForTrial("");
  setCooldown("");
  setRewardType("Water");
  setInteractionType("Lever");
  setStimulusType("Light");
  setLightColor("Red");
  
  // Clear file input element
  document.querySelector(".upload-button").value = "";
};
```

#### `handlePreset(event)`
**Purpose:** Apply predefined trial configurations

**Available Presets:**

| Preset | Duration | Cooldown | Reward | Interaction | Stimulus | Light |
|--------|----------|----------|--------|-------------|----------|-------|
| 1      | 10s      | 5s       | Food   | Poke        | Tone     | Green |
| 2      | 15s      | 10s      | Water  | Lever       | Light    | Red   |
| 3      | 20s      | 15s      | Food   | Poke        | Tone     | Blue  |
| 4      | 25s      | 20s      | Water  | Lever       | Light    | Yellow|
| None   | (clears all fields) |        |        |             |          |       |

**Code:**
```javascript
const handlePreset = (event) => {
  const value = event.target.value;
  
  try {
    setPresetValue(value);
    
    if (value === "Preset 1") {
      setTrialDuration(10);
      setCooldown(5);
      setRewardType("Food");
      setInteractionType("Poke");
      setStimulusType("Tone");
      setLightColor("Green");
    } 
    else if (value === "Preset 2") {
      setTrialDuration(15);
      setCooldown(10);
      setRewardType("Water");
      setInteractionType("Lever");
      setStimulusType("Light");
      setLightColor("Red");
    }
    // ... (Preset 3 and 4 similar)
    else if (value === "None") {
      // Clear all fields
      setTrialDuration("");
      setCooldown("");
      setRewardType("");
      setInteractionType("");
      setStimulusType("");
      setLightColor("");
    }
  } catch (e) {
    alert("Error");
  }
};
```

### Results Export

#### `handleDownloadResults()`
**Purpose:** Generate CSV file with trial results

**CSV Structure:**
```csv
Test Results
Timestamp:,11/19/2025 2:30:15 PM
Test Name:,ExperimentA
Trial Duration (seconds):,10
Goal for Trial:,5
Cooldown (seconds):,3
Reward Type:,Water
Interaction Type:,Lever
Stimulus Type:,Light
Light Color:,Red

Final Trial Data
Elapsed Time (s):,10
Lever Press Count:,25
Nose Poke Count:,3
Light Status:,OFF
Rewards Given:,5
```

**Code:**
```javascript
const handleDownloadResults = () => {
  if (!testResults) return;
  
  const timestamp = new Date().toLocaleString();
  
  // Build CSV as array of lines
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
  
  // Join with newlines and create blob
  const csvData = csvLines.join("\n");
  const blob = new Blob([csvData], { type: "text/csv" });
  
  // Trigger download
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${testName.replace(/\s+/g, "_")}_results.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
```

### Hardware Control

#### `handleRGB(red, green, blue)`
**Purpose:** Manual RGB LED control during trials

**Parameters:** Each parameter is `'on'` or `'off'`

**Examples:**
```javascript
handleRGB('on', 'off', 'off')   // Red only
handleRGB('off', 'on', 'off')   // Green only
handleRGB('off', 'off', 'on')   // Blue only
handleRGB('off', 'off', 'off')  // All off
```

**Code:**
```javascript
const handleRGB = async (red, green, blue) => {
  try {
    const result = await setRGBLight(red, green, blue);
    setMessage(`RGB LED set to R:${result.rgb.red} G:${result.rgb.green} B:${result.rgb.blue}`);
  } catch (error) {
    setMessage("Failed to control RGB LED");
  }
};
```

---

## User Interface

### Conditional Rendering

The component has **two main views** that never display simultaneously:

```javascript
return (
  <div className="trial-settings">
    {!testRunning && !testPaused && !testFinished ? (
      // VIEW 1: Setup Form
      <div id="formControlContainer">
        {/* Form inputs */}
      </div>
    ) : (
      // VIEW 2: Test Screen
      <div className="test-screen">
        {/* Metrics and controls */}
      </div>
    )}
  </div>
);
```

### View 1: Setup Form

#### Form Input Pattern (Material-UI)

Every validated input follows this structure:

```javascript
<div className="input-group">
  <FormControl fullWidth error={Boolean(fieldError)}>
    {/* Label with htmlFor matching input id */}
    <InputLabel htmlFor="fieldId">Field Label:</InputLabel>
    
    {/* Input with id matching label htmlFor */}
    <Input
      id="fieldId"
      placeholder="Enter value"
      required
      value={fieldValue}
      onChange={(e) => {
        const { value, error } = validationFunctions.fieldValidation(e.target.value);
        setFieldValue(value);
        setFieldError(error);
      }}
    />
    
    {/* Error message (only visible if error exists) */}
    <FormHelperText>{fieldError}</FormHelperText>
  </FormControl>
</div>
```

**Key Points:**
- `error={Boolean(fieldError)}` turns border red when error exists
- `htmlFor` and `id` must match for label click to focus input
- `FormHelperText` displays validation error below input
- `onChange` calls validation function and updates both value and error

#### Dropdown Pattern

Dropdowns don't need validation (user can only pick valid options):

```javascript
<div className="input-group">
  <FormControl fullWidth>
    <InputLabel id="selectLabel">Select Label:</InputLabel>
    <Select
      id="selectId"
      value={fieldValue}
      onChange={(e) => setFieldValue(e.target.value)}
    >
      <MenuItem value="Option1">Option 1</MenuItem>
      <MenuItem value="Option2">Option 2</MenuItem>
    </Select>
  </FormControl>
</div>
```

#### Button Group

```javascript
<ButtonGroup variant="contained">
  {/* Save Test - disabled if no changes */}
  <Button onClick={handleSaveTest} disabled={!hasChanged()}>
    Save Test
  </Button>
  
  {/* Upload - file input wrapped in Button for styling */}
  <Button>
    <input type="file" accept=".txt" onChange={handleFileUpload} />
  </Button>
  
  {/* Delete - only shows if file uploaded */}
  {uploadedFile && 
    <Button onClick={handleDeleteUpload} style={{backgroundColor: 'red', color: 'white'}}>
      Delete
    </Button>
  }
  
  {/* Run Test */}
  <Button onClick={handleRunTest}>Run Test</Button>
</ButtonGroup>
```

### View 2: Test Execution Screen

#### Dynamic Title
```javascript
<h1>
  {testFinished ? "Test Completed" : "Test in Progress"}
</h1>
```

#### Real-Time Metrics Display
```javascript
<p>Elapsed Time: {elapsedTime}s</p>
<p>Lever Presses: {leverPressCount}</p>
<p>Nose Pokes: {nosePokeCount}</p>
<p>Light Status: {lightOn ? "ON" : "OFF"}</p>
```

#### RGB LED Controls
```javascript
<div className="button-group">
  <button onClick={() => handleRGB('on', 'off', 'off')}>RGB Red On</button>
  <button onClick={() => handleRGB('off', 'on', 'off')}>RGB Green On</button>
  <button onClick={() => handleRGB('off', 'off', 'on')}>RGB Blue On</button>
  <button onClick={() => handleRGB('off', 'off', 'off')}>RGB Off</button>
  {message && <p>{message}</p>}
</div>
```

#### State-Based Button Visibility

**When Running:**
```javascript
{testRunning && (
  <button onClick={() => handleStopTest(false)}>Stop Test</button>
)}
```

**When Paused:**
```javascript
{testPaused && (
  <>
    <button onClick={handleRunTest}>Resume</button>
    <button onClick={() => { 
      setTestPaused(false); 
      setTestFinished(true); 
    }}>
      Finish Test
    </button>
    <button onClick={() => { 
      setTestPaused(false); 
      setTestResults(null); 
    }}>
      Return to Test Setup
    </button>
  </>
)}
```

**When Finished:**
```javascript
{testFinished && (
  <>
    <button onClick={handleDownloadResults}>Download Results</button>
    <button onClick={() => { 
      setTestFinished(false); 
      setTestResults(null); 
    }}>
      Return to Test Setup
    </button>
  </>
)}
```

---

## Validation System

### Why Pure Functions?

Validation functions are **pure** (no side effects) and live in a separate file:

```javascript
// src/validation/test_manager.jsx

export const validationFunctions = {
  testNameValidation(input) {
    // Strip restricted characters
    const restrictedCharsRegex = /[<>&"'\/\-;\\^\%\+:\(\)\{\}\[\]\s\x00-\x1F\x7F]/g;
    const converted = input.replace(restrictedCharsRegex, '');
    
    const error = converted !== input 
      ? 'Invalid characters removed' 
      : '';
    
    return { value: converted, error };
  },
  
  testTrialDuration(input) {
    // Strip non-digits
    const converted = input.replace(/[^\d]/g, '');
    
    const error = converted !== input 
      ? 'Only numbers are allowed' 
      : '';
    
    return { value: converted, error };
  },
  
  testTrialGoal(input) {
    // Same logic as duration
    const converted = input.replace(/[^\d]/g, '');
    const error = converted !== input ? 'Only numbers are allowed' : '';
    return { value: converted, error };
  },
  
  testCoolDown(input) {
    // Same logic as duration
    const converted = input.replace(/[^\d]/g, '');
    const error = converted !== input ? 'Only numbers are allowed' : '';
    return { value: converted, error };
  }
};
```

### Using Validation in onChange

**Pattern:**
```javascript
onChange={(e) => {
  // Call validation function
  const { value, error } = validationFunctions.xxxValidation(e.target.value);
  
  // Update both state variables
  setFieldValue(value);
  setFieldError(error);
}}
```

**Why This Works:**
- Validation happens on every keystroke
- Invalid characters are immediately stripped from the input
- Error message appears instantly below the field
- State always contains sanitized values

### Restricted Characters for Test Name

The following characters are stripped:
```
< > & " ' / - ; \ ^ % + : ( ) { } [ ]
Whitespace (spaces, tabs, newlines)
Control characters (0x00-0x1F, 0x7F)
```

**Reason:** Prevents injection attacks and file system issues when saving configurations.

---

## Backend Communication

### API Functions Overview

All API functions are imported from `utilities/api.js`:

```javascript
import { 
  runTest,        // Start trial
  stopTest,       // Stop trial
  getCounts,      // Get sensor data
  setBlueLight,   // Water dispenser LED
  setOrangeLight, // Food dispenser LED
  setRGBLight     // Manual RGB control
} from "../../utilities/api";
```

### Function Signatures

#### `runTest(config)`
**Purpose:** Sends trial configuration to backend and starts execution

**Parameters:**
```javascript
{
  testName: string,
  trialDuration: string,
  rewardType: string,        // "Water" or "Food"
  interactionType: string,   // "Lever" or "Poke"
  stimulusType: string,      // "Light" or "Tone"
  lightColor: string         // "Red", "Green", "Blue", "Yellow"
}
```

**Returns:** Promise (resolves when backend acknowledges)

**Backend Route:** `POST /api/run-test`

#### `stopTest()`
**Purpose:** Halts the currently running trial

**Parameters:** None

**Returns:** Promise

**Backend Route:** `POST /api/stop-test`

#### `getCounts()`
**Purpose:** Fetches current sensor readings from hardware

**Parameters:** None

**Returns:**
```javascript
{
  lever_press_count: number,
  nose_poke_count: number,
  light_on: boolean
}
```

**Backend Route:** `GET /api/counts`

**Usage:** Called every 1 second during active trials

#### `setBlueLight(state)`
**Purpose:** Controls water dispenser indicator LED

**Parameters:**
- `state` (boolean): `true` = on, `false` = off

**Returns:** Promise

**Backend Route:** `POST /api/blue-light`

#### `setOrangeLight(state)`
**Purpose:** Controls food dispenser indicator LED

**Parameters:**
- `state` (boolean): `true` = on, `false` = off

**Returns:** Promise

**Backend Route:** `POST /api/orange-light`

#### `setRGBLight(red, green, blue)`
**Purpose:** Manual RGB LED control

**Parameters:**
- `red`, `green`, `blue`: Each is `'on'` or `'off'`

**Returns:**
```javascript
{
  rgb: {
    red: string,    // 'on' or 'off'
    green: string,
    blue: string
  }
}
```

**Backend Route:** `POST /api/rgb-light`

---

## File Operations

### Configuration Files (.txt)

**Format:**
```
Test Name: ExperimentA
Trial Duration: 10 seconds
Goal: 5
Cooldown: 3 seconds
Reward Type: Water
Interaction Type: Lever
Stimulus Type: Light
Light Color: Red
```

**Rules:**
- 8 lines exactly
- Each line: `Key: Value`
- Keys must be in specific order
- Duration and cooldown must include " seconds" suffix

**Usage:**
- **Save:** `handleSaveTest()` creates this format
- **Upload:** `handleFileUpload()` parses this format
- **Validation:** `validateFileFormat()` checks structure

### Results Files (.csv)

**Format:**
```csv
Test Results
Timestamp:,11/19/2025 2:30:15 PM
Test Name:,ExperimentA
Trial Duration (seconds):,10
Goal for Trial:,5
Cooldown (seconds):,3
Reward Type:,Water
Interaction Type:,Lever
Stimulus Type:,Light
Light Color:,Red

Final Trial Data
Elapsed Time (s):,10
Lever Press Count:,25
Nose Poke Count:,3
Light Status:,OFF
Rewards Given:,5
```

**Usage:**
- **Export:** `handleDownloadResults()` generates this format
- **Analysis:** Can be imported into Excel, R, Python for statistical analysis

---

## Common Issues & Solutions

### Issue 1: "Too many renders" Error

**Symptom:** Component crashes with "Maximum update depth exceeded"

**Cause:** Calling state setter directly in JSX instead of passing function reference

**Wrong:**
```javascript
onChange={setFieldValue(e.target.value)}  // Executes immediately!
```

**Correct:**
```javascript
onChange={(e) => setFieldValue(e.target.value)}  // Function reference
```

### Issue 2: Label Click Doesn't Focus Input

**Symptom:** Clicking label text doesn't move cursor to input field

**Cause:** Missing or mismatched `htmlFor` and `id` attributes

**Wrong:**
```javascript
<InputLabel htmlFor="fieldA">Label</InputLabel>
<Input id="fieldB" />  // IDs don't match!
```

**Correct:**
```javascript
<InputLabel htmlFor="fieldName">Label</InputLabel>
<Input id="fieldName" />  // IDs match
```

### Issue 3: Validation Errors Show Immediately on Mount

**Symptom:** Red error borders appear before user types anything

**Cause:** Using state setter function as JSX value instead of state variable

**Wrong:**
```javascript
<FormHelperText>{setFieldError}</FormHelperText>  // Function, not value!
```

**Correct:**
```javascript
<FormHelperText>{fieldError}</FormHelperText>  // State variable
```

### Issue 4: Rewards Dispensing Too Frequently

**Symptom:** Multiple rewards trigger in rapid succession

**Cause:** Cooldown logic not working

**Debug:**
1. Check `lastRewardTime` is being updated after each reward
2. Verify cooldown is in seconds, but comparison is in milliseconds
3. Ensure condition is: `now - lastRewardTime >= cooldown * 1000`

### Issue 5: Trial Doesn't Stop at Duration

**Symptom:** Trial continues past specified duration

**Cause:** Bug in duration check logic

**Current Code:**
```javascript
if (setElapsedTime >= durationInSeconds) {  // WRONG! setElapsedTime is a function
```

**Should Be:**
```javascript
if (elapsedTime >= durationInSeconds) {  // Correct - using state variable
```

### Issue 6: Upload File Not Populating Form

**Symptom:** File uploads successfully but form stays empty

**Cause:** File format doesn't match expected structure

**Debug:**
1. Open `.txt` file in text editor
2. Verify exactly 8 lines
3. Check each line starts with expected key + `: `
4. Ensure no extra whitespace or blank lines

### Issue 7: CSV Download Not Working

**Symptom:** No file downloads when clicking "Download Results"

**Cause:** `testResults` is `null`

**Debug:**
1. Check that `handleStopTest()` was called before download
2. Verify `testResults` state contains data
3. Check browser console for API errors

---

## Best Practices for Modification

### Adding New Form Fields

1. **Add state variables:**
```javascript
const [newField, setNewField] = useState("");
const [newFieldError, setNewFieldError] = useState("");
```

2. **Add to originalSettings snapshot:**
```javascript
useEffect(() => {
  setOriginalSettings({ 
    testName, trialDuration, /* ... */, newField 
  });
}, []);
```

3. **Create validation function** (if needed) in `validation/test_manager.jsx`

4. **Add form control in JSX:**
```javascript
<div className="input-group">
  <FormControl fullWidth error={Boolean(newFieldError)}>
    <InputLabel htmlFor="newField">New Field:</InputLabel>
    <Input
      id="newField"
      value={newField}
      onChange={(e) => {
        const { value, error } = validationFunctions.newFieldValidation(e.target.value);
        setNewField(value);
        setNewFieldError(error);
      }}
    />
    <FormHelperText>{newFieldError}</FormHelperText>
  </FormControl>
</div>
```

5. **Update file save/load logic** in `handleSaveTest()` and `handleFileUpload()`

6. **Update CSV export** in `handleDownloadResults()`

### Adding New Presets

1. **Add new MenuItem:**
```javascript
<MenuItem value={"Preset 5"}>Preset 5</MenuItem>
```

2. **Add condition in handlePreset:**
```javascript
else if(value === "Preset 5") {
  setTrialDuration(30);
  setCooldown(25);
  setRewardType("Food");
  // ... etc
}
```

### Modifying Reward Logic

The reward logic is in the `useEffect` polling loop. Key section:

```javascript
if (goal > 0 && count > 0 && count % goal === 0) {
  const now = Date.now();
  if (now - lastRewardTime >= parseInt(cooldown) * 1000) {
    // Dispense reward here
  }
}
```

**To change when rewards trigger:**
- Modify the condition `count % goal === 0`
- Example: `count >= goal` would reward once after reaching goal

**To change reward duration:**
- Modify the timeout: `setTimeout(() => {...}, 1000)` (currently 1 second)

---

## Testing Checklist

When making changes, test these scenarios:

- [ ] Form loads with correct default values
- [ ] All validations work on keystroke
- [ ] Error messages display correctly
- [ ] Labels focus inputs when clicked
- [ ] Presets populate all fields correctly
- [ ] "None" preset clears all fields
- [ ] File upload works with valid files
- [ ] File upload rejects invalid files
- [ ] Delete button removes uploaded file
- [ ] Save button downloads correct .txt format
- [ ] Run Test validates required fields
- [ ] Trial starts and metrics update every second
- [ ] Rewards dispense at correct intervals
- [ ] Cooldown prevents rapid rewards
- [ ] Stop button pauses trial correctly
- [ ] Resume button continues from pause
- [ ] Finish button transitions to results
- [ ] Download creates correct CSV format
- [ ] Return button resets to setup form
- [ ] RGB controls work during active trial

---

## Additional Resources

### Related Files

- **Backend:** `server/sbBackend.py` - Flask API handling hardware control
- **API Layer:** `src/utilities/api.js` - Axios HTTP requests to backend
- **Validation:** `src/validation/test_manager.jsx` - Pure validation functions
- **Styles:** `src/components/TestManager/TestManager.css` - Component styling

### External Documentation

- **React Hooks:** https://react.dev/reference/react
- **Material-UI:** https://mui.com/material-ui/getting-started/
- **FileReader API:** https://developer.mozilla.org/en-US/docs/Web/API/FileReader
- **Blob API:** https://developer.mozilla.org/en-US/docs/Web/API/Blob

---

**Document Version:** 1.0  
**Last Updated:** November 19, 2025  
**Maintained By:** Capstone Project Team
