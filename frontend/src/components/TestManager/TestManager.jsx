import React, { useState, useEffect } from "react";
import "./TestManager.css";
import { runTest, stopTest, finishTest, getCounts, setRGBLight, primePump, getTestInformation, getTestStatus } from "../../utilities/api";
import { DEFAULT_END_CHIME_PATTERN, PRESET_STORAGE_EVENT, loadUserPresets, upsertUserPreset } from "../../utilities/presets";
import { buildStimulusSummary, buildTraditionalCsv, formatSecondsForDisplay } from "../../utilities/resultsCsv";
import { Alert, FormControl, Input, InputLabel, Snackbar } from '@mui/material';
import { validationFunctions } from "../../validation/test_manager";
import ButtonGroup from '@mui/material/ButtonGroup';

import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormHelperText from '@mui/material/FormHelperText';
import Button from '@mui/material/Button';


const TestManager = () => {
  const [presetValue, setPresetValue] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [subjectID, setSubjectID] = useState(""); 
  const [testName, setTestName] = useState("");
  const [trialDuration, setTrialDuration] = useState("");
  const [goalForTrial, setGoalForTrial] = useState("");
  const [goalForTest, setGoalForTest] = useState("");
  const [RewaStimTime, setRewaStimTime] = useState("");
  const [StimTimeOn, setStimTimeOn] = useState("");
  const [cooldown, setCooldown] = useState("");
  const [rewardType, setRewardType] = useState("Water");
  const [interactionType, setInteractionType] = useState("Lever");
  const [stimulusType, setStimulusType] = useState("Light");
  const [lightColor, setLightColor] = useState("Red");
  const [endChimeEnabled, setEndChimeEnabled] = useState(false);
  const [endChimePattern, setEndChimePattern] = useState(DEFAULT_END_CHIME_PATTERN);
  const [userPresets, setUserPresets] = useState([]);
  const [testRunning, setTestRunning] = useState(false);
  const [testPaused, setTestPaused] = useState(false);
  const [testFinished, setTestFinished] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [configuredDurationSeconds, setConfiguredDurationSeconds] = useState(0);
  const [leverPressCount, setLeverPressCount] = useState(0);
  const [nosePokeCount, setNosePokeCount] = useState(0);
  const [lightOn, setLightOn] = useState(false);

  const [originalSettings, setOriginalSettings] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);

  const [rewardCount, setRewardCount] = useState(0);
  const [pumpPrimeSeconds, setPumpPrimeSeconds] = useState("1");
  const [pumpPrimeBusy, setPumpPrimeBusy] = useState(false);
  const [pumpPrimeMessage, setPumpPrimeMessage] = useState("");
  const [presetSaveMessage, setPresetSaveMessage] = useState("");

  const [message, setMessage] = useState("");
  const [uiError, setUiError] = useState({
    open: false,
    code: "",
    message: "",
  });


  const [testNameError, setTestNameError] = useState('');
  const [trialDurationError, setTrialDurationError] = useState('');
  const [trialGoalError, setTrialGoalError] = useState('');
  const [testGoalError, setTestGoalError] = useState('');
  const [RewaStimTimeError, setRewaStimTimeError] = useState('');
  const [StimTimeOnError, setStimTimeOnError] = useState('');
  const [coolDownError, setCoolDownError] = useState('');
  const [subjectIDError, setSubjectIDError] = useState('');

  const selectedPreset = userPresets.find((preset) => preset.id === presetValue) || null;

  const showUiError = (error, fallbackMessage = "An unexpected error occurred.") => {
    setUiError({
      open: true,
      code: error?.code || "UNEXPECTED_FRONTEND_ERROR",
      message: error?.message || fallbackMessage,
    });
  };

  const closeUiError = (_, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setUiError((currentError) => ({ ...currentError, open: false }));
  };

  const applyCountsToUi = (counts) => {
    if (!counts) {
      return;
    }

    setTestResults(counts);
    setLeverPressCount(Number(counts.lever_press_count || 0));
    setNosePokeCount(Number(counts.nose_poke_count || 0));
    setLightOn(Boolean(counts.light_on));
    setElapsedTime(Number(counts.elapsed_seconds || 0));
    setConfiguredDurationSeconds(Number(counts.configured_duration_seconds || 0));
    setRewardCount(Number(counts.reward_count || 0));
  };

  const effectiveLightColor = stimulusType === "Light" ? lightColor : "N/A";
  const stimulusSummary = buildStimulusSummary(stimulusType, effectiveLightColor);
  const chimeSummary = endChimeEnabled ? endChimePattern : "Disabled";
  const remainingTimeSeconds = configuredDurationSeconds > 0
    ? Math.max(configuredDurationSeconds - elapsedTime, 0)
    : 0;
  const appliedPresetName = selectedPreset?.name || "None";

  const refreshPresets = async (showError = false) => {
    try {
      setUserPresets(await loadUserPresets());
    } catch (error) {
      if (showError) {
        showUiError(error, "Unable to load saved presets.");
      }
    }
  };


  useEffect(() => {
    setOriginalSettings({
      testName,
      trialDuration,
      goalForTrial,
      goalForTest,
      RewaStimTime,
      StimTimeOn,
      cooldown,
      rewardType,
      interactionType,
      stimulusType,
      lightColor,
      endChimeEnabled,
      endChimePattern,
    });

    refreshPresets();

    const handlePresetStorageUpdate = () => {
      refreshPresets();
    };

    window.addEventListener(PRESET_STORAGE_EVENT, handlePresetStorageUpdate);
    window.addEventListener('storage', handlePresetStorageUpdate);

    return () => {
      window.removeEventListener(PRESET_STORAGE_EVENT, handlePresetStorageUpdate);
      window.removeEventListener('storage', handlePresetStorageUpdate);
    };
  }, []); // Empty dependency array = run once on component mount

  const hasChanged = () => {
    return JSON.stringify(originalSettings) !== JSON.stringify({
      testName,
      trialDuration,
      goalForTrial,
      goalForTest,
      RewaStimTime,
      StimTimeOn,
      cooldown,
      rewardType,
      interactionType,
      stimulusType,
      lightColor,
      endChimeEnabled,
      endChimePattern,
    });
  };


  const handleSaveTest = () => {
    if (!testName || !trialDuration || !goalForTrial || !cooldown || !goalForTest || !RewaStimTime || !StimTimeOn) {
      showUiError(
        { code: "VALIDATION_ERROR", message: "Please fill in all required fields before saving the test." },
      );
      return;
    }

    // const testSettings = `Test Name: ${testName}\nTrial Duration: ${trialDuration} seconds\nGoal: ${goalForTrial}\nCooldown: ${cooldown} seconds\nReward Type: ${rewardType}\nInteraction Type: ${interactionType}\nStimulus Type: ${stimulusType}\nLight Color: ${lightColor}`;
    
    const testSettings = `Preset: ${appliedPresetName}
    Test Name: ${testName}
    Subject Identification: ${subjectID}
    Trial Duration: ${trialDuration} minutes
    Goal for Trial: ${goalForTrial}
    Goal for Test: ${goalForTest}
    Time Between Reward and New Stimulus: ${RewaStimTime}
    Time Stimulus Active: ${StimTimeOn}
    Cooldown: ${cooldown} seconds
    Reward Type: ${rewardType}
    Interaction Type: ${interactionType}
    Stimulus Type: ${stimulusType}
    Light Color: ${effectiveLightColor}`;

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
        showUiError(
          { code: "INVALID_FILE_FORMAT", message: "Please upload a properly formatted test settings file." },
        );
        event.target.value = "";
        return;
      }

      setUploadedFile(file);
      const lines = fileText.split("\n");
      const values = lines.map((line) => line.split(": ")[1]);

      // TODO: TASK, the handleFileUpload to reflect the changes to UI
      setTestName(values[0] || "");
      setSubjectID(values[1] || "")
      setTrialDuration(values[1] ? values[1].replace(" minutes", "") : "");
      setGoalForTrial(values[2] || "");
      setGoalForTest(values[3] || "");
      setRewaStimTime(values[4] || "");
      setStimTimeOn(values[5] || "");
      setCooldown(values[6] ? values[6].replace(" seconds", "") : "");
      setRewardType(values[7] || "Water");
      setInteractionType(values[8] || "Lever");
      setStimulusType(values[9] || "Light");
      setLightColor(values[10] || "Red");
    };
    reader.readAsText(file);
  };

  const handleDeleteUpload = () => {
    setUploadedFile(null);
    setTestName("");
    setTrialDuration("");
    setGoalForTrial("");
    setGoalForTest("");
    setRewaStimTime("");
    setStimTimeOn("");
    setCooldown("");
    setRewardType("Water");
    setInteractionType("Lever");
    setStimulusType("Light");
    setLightColor("Red");
    document.querySelector(".upload-button").value = "";
  };

  // TODO: Task, change logic to send it to the back-end

  useEffect(() => {
    let interval;
    if (testRunning) {
      interval = setInterval(async () => {
        try {
          // GetCounts comes from the backend, but it never sends information from the frontend to backend.
          const data = await getCounts();
          setLeverPressCount(data.lever_press_count);
          setNosePokeCount(data.nose_poke_count);
          setLightOn(Boolean(data.light_on));
          setElapsedTime(Number(data.elapsed_seconds || 0));
          setConfiguredDurationSeconds(Number(data.configured_duration_seconds || 0));

          // ADDED: Poll the backend to check if the test was stopped because the goal was reached
          const status = await getTestStatus();
          if (status.error) {
            setTestRunning(false);
            setTestPaused(false);
            showUiError(status.error, "The backend reported a test runtime error.");
            return;
          }
          if (status.testFinished) {
            applyCountsToUi(data);
            setTestRunning(false);
            setTestPaused(false);
            setTestFinished(true);
            return;
          }

          setRewardCount(data.reward_count);

        } catch (error) {
          console.error("Error fetching test counts:", error);
          setTestRunning(false);
          showUiError(error, "Unable to fetch the current test state.");
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [testRunning]);
  
  const handleResumeTest = async () => {
    try {
        // Just restart the polling, don't reset anything.
        await runTest({
            testName,
            subjectID,
            trialDuration,
            goalForTrial,
            goalForTest,
            RewaStimTime,
            StimTimeOn,
            cooldown,
            rewardType,
            interactionType,
            stimulusType,
            lightColor: effectiveLightColor,
            endChimeEnabled,
            endChimePattern,
            leverPress: leverPressCount,
            nosePoke: nosePokeCount
        });
        setTestPaused(false);
        setTestRunning(true);
    } catch (error) {
        console.error("Error resuming test:", error);
        setTestRunning(false);
        setTestPaused(true);
        showUiError(error, "Unable to resume the test.");
    }
};


  const handleRunTest = async () => {
    if (!testName || !trialDuration) {
      showUiError(
        { code: "VALIDATION_ERROR", message: "Please fill in all required fields before starting the test." },
      );
      return;
    }

    if (testPaused) {
      await handleResumeTest();
      return;
    }

    setTestResults(null);
    setTestFinished(false);
    setTestPaused(false);
    setElapsedTime(0);
    setConfiguredDurationSeconds(Math.max(Number(trialDuration || 0) * 60, 0));
    setLeverPressCount(0);
    setNosePokeCount(0);
    setLightOn(false);
    setRewardCount(0);

    const testSettings = { 
      testName, 
      subjectID,
      trialDuration, 
      goalForTrial,
      goalForTest,
      RewaStimTime,
      StimTimeOn,
      cooldown,
      rewardType, 
      interactionType, 
      stimulusType, 
      lightColor: effectiveLightColor,
      endChimeEnabled,
      endChimePattern,
      leverPress: 0,
      nosePoke: 0
    };

    try {
      // Save test information to the backend first so the DB row exists before the run begins.
      console.log("Saving test configuration...");
      await getTestInformation(testSettings);
      
      // Then start the hardware test and only flip the UI into running mode after success.
      console.log("Starting hardware test...");
      await runTest(testSettings);
      setTestRunning(true);
    } catch (error) {
      console.error("Error running test sequence:", error);
      setTestRunning(false);
      showUiError(error, "Failed to start the test.");
    }
  };

  const handleStopTest = async () => {
    try {
      await stopTest();
      const finalCounts = await getCounts();
      applyCountsToUi(finalCounts);
      setTestRunning(false);
      setTestPaused(true);
      setTestFinished(false);
    } catch (error) {
      console.error("Error stopping test:", error);
      showUiError(error, "Unable to stop the test.");
    }
  };

  const handleFinishTest = async () => {
    try {
      await finishTest();
      const finalCounts = await getCounts();
      applyCountsToUi(finalCounts);
      setTestRunning(false);
      setTestPaused(false);
      setTestFinished(true);
    } catch (error) {
      console.error("Error finishing test:", error);
      showUiError(error, "Unable to finish the test.");
    }
  };

  const handleDownloadResults = () => {
    if (!testResults) return;
    const csvData = buildTraditionalCsv({
      exportedAt: new Date().toISOString(),
      testName,
      subjectId: subjectID,
      status: testFinished ? "finished" : testPaused ? "paused" : "running",
      complete: testFinished,
      preset: appliedPresetName,
      configuredDurationMinutes: Number(trialDuration || 0),
      configuredDurationSeconds,
      elapsedTimeSeconds: elapsedTime,
      remainingTimeSeconds,
      goalForTrial: Number(goalForTrial || 0),
      goalForTest: Number(goalForTest || 0),
      rewardDelaySeconds: Number(RewaStimTime || 0),
      stimulusDurationSeconds: Number(StimTimeOn || 0),
      cooldownSeconds: Number(cooldown || 0),
      rewardType,
      interactionType,
      stimulusType,
      stimulusDescription: stimulusSummary,
      lightColor: effectiveLightColor,
      endChimeEnabled,
      endChimePattern,
      leverPressCount: Number(testResults.lever_press_count || 0),
      nosePokeCount: Number(testResults.nose_poke_count || 0),
      totalInteractions: Number(testResults.lever_press_count || 0) + Number(testResults.nose_poke_count || 0),
      rewardCount: Number(testResults.reward_count || 0),
      createdAt: "",
      updatedAt: "",
    });
    const blob = new Blob([csvData], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${testName.replace(/\s+/g, "_")}_results.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSaveCurrentAsPreset = async () => {
    if (!presetName.trim()) {
      showUiError(
        { code: "PRESET_NAME_REQUIRED", message: "Enter a preset name before saving the current settings." },
      );
      return;
    }

    if (!trialDuration || !goalForTrial || !goalForTest) {
      showUiError(
        { code: "PRESET_VALUES_REQUIRED", message: "Fill in the core trial values before saving a preset." },
      );
      return;
    }

    try {
      const shouldReuseSelectedPresetId = Boolean(
        selectedPreset && selectedPreset.name.trim().toLowerCase() === presetName.trim().toLowerCase()
      );
      const resolvedResult = await upsertUserPreset({
        id: shouldReuseSelectedPresetId ? selectedPreset.id : undefined,
        name: presetName,
        description: presetDescription,
        testName,
        subjectID,
        trialDuration,
        goalForTrial,
        goalForTest,
        RewaStimTime,
        StimTimeOn,
        cooldown,
        rewardType,
        interactionType,
        stimulusType,
        lightColor: effectiveLightColor,
        endChimeEnabled,
        endChimePattern,
      });

      setUserPresets(resolvedResult.presets);
      setPresetValue(resolvedResult.preset.id);
      setPresetName(resolvedResult.preset.name);
      setPresetDescription(resolvedResult.preset.description || "");
      setPresetSaveMessage(
        resolvedResult.replaced
          ? `Preset "${resolvedResult.preset.name}" updated.`
          : `Preset "${resolvedResult.preset.name}" saved.`
      );
    } catch (error) {
      showUiError(
        { code: "PRESET_SAVE_ERROR", message: error.message || "Unable to save the current preset." },
      );
    }
  };

  const handleRGB = async (red, green, blue) => {
    try {
      const result = await setRGBLight(red, green, blue);
      setMessage(`RGB LED set to R:${result.rgb.red} G:${result.rgb.green} B:${result.rgb.blue}`);
    } catch (error) {
      setMessage("Failed to control RGB LED");
      showUiError(error, "Unable to control the RGB LED.");
    }
  };

  const handlePrimePump = async () => {
    const parsedSeconds = Number(pumpPrimeSeconds);
    if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0) {
      showUiError(
        { code: "INVALID_PUMP_PRIME_DURATION", message: "Enter a pump-prime duration greater than zero seconds." },
      );
      return;
    }

    try {
      setPumpPrimeBusy(true);
      setPumpPrimeMessage("");
      const result = await primePump(parsedSeconds);
      setPumpPrimeMessage(`Pump primed for ${result.durationSeconds} second${result.durationSeconds === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error("Error priming pump:", error);
      showUiError(error, "Unable to prime the pump.");
    } finally {
      setPumpPrimeBusy(false);
    }
  };

const handlePreset = (event) => {
    const value = event.target.value;
    
    try {
        setPresetValue(value);

        if (value === "None") {
            setPresetName("");
            setPresetDescription("");
            setTestName("");
            setTrialDuration("");
            setSubjectID("");
            setGoalForTrial("");
            setGoalForTest("");
            setRewaStimTime("");
            setStimTimeOn("");
            setCooldown("");
            setRewardType("Water");
            setInteractionType("Lever");
            setStimulusType("Light");
            setLightColor("Red");
            setEndChimeEnabled(false);
            setEndChimePattern(DEFAULT_END_CHIME_PATTERN);
            setPresetSaveMessage("");
            return;
        }

        const userPreset = userPresets.find((preset) => preset.id === value);
        if (!userPreset) {
          return;
        }

        setPresetName(userPreset.name);
        setPresetDescription(userPreset.description || "");
        setTestName(userPreset.testName || "");
        setSubjectID(userPreset.subjectID || "");
        setTrialDuration(userPreset.trialDuration || "");
        setGoalForTrial(userPreset.goalForTrial || "");
        setGoalForTest(userPreset.goalForTest || "");
        setRewaStimTime(userPreset.RewaStimTime || "");
        setStimTimeOn(userPreset.StimTimeOn || "");
        setCooldown(userPreset.cooldown || "");
        setRewardType(userPreset.rewardType || "Water");
        setInteractionType(userPreset.interactionType || "Lever");
        setStimulusType(userPreset.stimulusType || "Light");
        setLightColor(
          userPreset.stimulusType === "Tone"
            ? "Red"
            : (userPreset.lightColor || "Red")
        );
        setEndChimeEnabled(Boolean(userPreset.endChimeEnabled));
        setEndChimePattern(userPreset.endChimePattern || DEFAULT_END_CHIME_PATTERN);
        setPresetSaveMessage(`Preset "${userPreset.name}" loaded into the test form.`);
    } catch(e) {
        showUiError(
          { code: "PRESET_LOAD_ERROR", message: "Unable to load the selected preset." },
        );
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
                      <MenuItem key={preset.id || index} value={preset.id}>
                          {preset.name}
                      </MenuItem>
                  ))}
                  <MenuItem value={"None"}>None</MenuItem>
                </Select>
            </FormControl>
          </div>  

          <div className="preset-save-panel">
            <h3>Save Current Settings As Preset</h3>
            <p>Save this form as a reusable preset so you can auto-fill it later.</p>
            <div className="preset-save-grid">
              <FormControl fullWidth>
                <InputLabel htmlFor="presetName">Preset Name:</InputLabel>
                <Input
                  id="presetName"
                  placeholder="Enter preset name"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
              </FormControl>
              <FormControl fullWidth>
                <InputLabel htmlFor="presetDescription">Preset Description:</InputLabel>
                <Input
                  id="presetDescription"
                  placeholder="Optional description"
                  value={presetDescription}
                  onChange={(e) => setPresetDescription(e.target.value)}
                />
              </FormControl>
            </div>
            <Button variant="contained" className="save-preset-button" onClick={handleSaveCurrentAsPreset}>
              Save Current As Preset
            </Button>
            {presetSaveMessage && <p className="preset-save-message">{presetSaveMessage}</p>}
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
              <InputLabel htmlFor="goalForTrial">Number of presses until reward:</InputLabel>
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
          
          <div>
            <FormControl fullWidth error={Boolean(testGoalError)}>
              <InputLabel htmlFor="goalForTest">Goal for Test:</InputLabel>
              <Input
                id="txtGoalForTest"
                placeholder="Enter Goal"
                required
                value={goalForTest}
                onChange={(e) => setGoalForTest(e.target.value)}
                />
                <FormHelperText>
                  {testGoalError}
                </FormHelperText>
            </FormControl>
          </div>

          <div>
            <FormControl fullWidth error={Boolean(RewaStimTimeError)}>
              <InputLabel htmlFor="RewaStimTime">Time between reward given and stimulus activated (s):</InputLabel>
              <Input
                id="txtRewaStimTime"
                placeholder="Enter Time (s)"
                required
                value={RewaStimTime}
                onChange={(e) => setRewaStimTime(e.target.value)}
                />
                <FormHelperText>
                  {RewaStimTimeError}
                </FormHelperText>
            </FormControl>
          </div>
          
          <div>
            <FormControl fullWidth error={Boolean(StimTimeOnError)}>
              <InputLabel htmlFor="StimTimeOn">Time stimulus is on (s):</InputLabel>
              <Input
                id="txtStimTimeOn"
                placeholder="Enter Time (s)"
                required
                value={StimTimeOn}
                onChange={(e) => setStimTimeOn(e.target.value)}
                />
                <FormHelperText>
                  {StimTimeOnError}
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
              <InputLabel htmlFor="coolDown">Cooldown(Do Not Not To Fill Out):</InputLabel>
              <Input
                id="txtCooldown"
                placeholder="Enter Cooldown"
                inputProps={{ readOnly: true }}
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
                  <MenuItem value={"Poke Then Lever"}>Poke then Lever</MenuItem>
                  <MenuItem value={"Lever then Poke"}>Lever then Poke</MenuItem>
                </Select>
            </FormControl>
          </div>
          
          <div className="input-group">
            <FormControl fullWidth>
              <InputLabel id="stimulusType">Stimulus Type:</InputLabel>
                <Select
                  id="selectStimulusType"
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
                  id="selectStimulusTypeTwo"
                  value={stimulusType}
                  onChange = {(e) => setStimulusType(e.target.value)}
                >
                  <MenuItem value={"Light"}>Light</MenuItem>
                  <MenuItem value={"Tone"}>Tone</MenuItem>
                </Select>
            </FormControl>
          </div> */}
        
          {stimulusType === "Light" ? (
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
          ) : (
            <div className="stimulus-note">
              Tone stimulus selected. Light color does not apply to this test.
            </div>
          )}

          <div className="pump-prime-panel">
            <h3>Prime Water Line</h3>
            <p>Run the water pump before a test so the line is full.</p>
            <div className="pump-prime-controls">
              <FormControl fullWidth>
                <InputLabel htmlFor="pumpPrimeSeconds">Prime Duration (s):</InputLabel>
                <Input
                  id="pumpPrimeSeconds"
                  placeholder="Enter seconds"
                  value={pumpPrimeSeconds}
                  onChange={(e) => setPumpPrimeSeconds(e.target.value)}
                  inputProps={{ inputMode: "decimal", min: "0", step: "0.1" }}
                />
              </FormControl>
              <Button
                className="prime-button"
                variant="contained"
                onClick={handlePrimePump}
                disabled={pumpPrimeBusy}
              >
                {pumpPrimeBusy ? "Priming..." : "Prime Pump"}
              </Button>
            </div>
            {pumpPrimeMessage && <p className="pump-prime-message">{pumpPrimeMessage}</p>}
          </div>

          <div className="input-group">
            <FormControl fullWidth>
              <InputLabel id="endChimeEnabled">End-of-Test Chime:</InputLabel>
              <Select
                id="selectEndChimeEnabled"
                value={endChimeEnabled ? "enabled" : "disabled"}
                onChange={(e) => setEndChimeEnabled(e.target.value === "enabled")}
              >
                <MenuItem value={"disabled"}>Disabled</MenuItem>
                <MenuItem value={"enabled"}>Enabled</MenuItem>
              </Select>
            </FormControl>
          </div>

          {endChimeEnabled ? (
            <div className="input-group">
              <FormControl fullWidth>
                <InputLabel htmlFor="endChimePattern">End Chime Pattern:</InputLabel>
                <Input
                  id="txtEndChimePattern"
                  placeholder="523:0.12,659:0.12,784:0.24"
                  value={endChimePattern}
                  onChange={(e) => setEndChimePattern(e.target.value)}
                />
              </FormControl>
            </div>
          ) : (
            <div className="stimulus-note">
              Enable this option if you want the passive buzzer on GPIO 27 to play a short custom chime when the test finishes.
            </div>
          )}
          
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
            <p>Time Remaining: {formatSecondsForDisplay(remainingTimeSeconds)}</p>
            <p>Elapsed Time: {formatSecondsForDisplay(elapsedTime)}</p>
            <p>Configured Duration: {formatSecondsForDisplay(configuredDurationSeconds)}</p>
            <p>Lever Presses: {leverPressCount}</p>
            <p>Nose Pokes: {nosePokeCount}</p>
            <p>Rewards Given: {rewardCount}</p>
            <p>Stimulus: {stimulusSummary}</p>
            <p>End Chime: {chimeSummary}</p>
            <p>Light Status: {lightOn ? "ON" : "OFF"}</p>

            <div className="button-group">
              <button className='redlight-button' onClick={() => handleRGB('on', 'off', 'off')}>RGB Red On</button>
              <button className='greenlight-button' onClick={() => handleRGB('off', 'on', 'off')}>RGB Green On</button>
              <button className='bluelight-button' onClick={() => handleRGB('off', 'off', 'on')}>RGB Blue On</button>
              <button className='rgblight-button' onClick={() => handleRGB('off', 'off', 'off')}>RGB Off</button>

  
              {message && <p>{message}</p>}


              {testRunning && <button className="stop-button" onClick={handleStopTest}>Stop Test</button>}
              {testPaused && (
                <>
                  {/*<button className="resume-button" onClick={handleRunTest}>Resume</button>  */}
                  <button className="resume-button" onClick={handleResumeTest}>Resume</button>
                  <button className="finish-button" onClick={handleFinishTest}>Finish Test</button>
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
      <Snackbar
        open={uiError.open}
        autoHideDuration={7000}
        onClose={closeUiError}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert onClose={closeUiError} severity="error" variant="filled" sx={{ width: '100%' }}>
          <strong>{uiError.code}</strong>: {uiError.message}
        </Alert>
      </Snackbar>
    </div>
  );
}

export default TestManager;
