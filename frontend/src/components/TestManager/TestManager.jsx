import React, { useState, useEffect, useRef } from "react";
import "./TestManager.css";
import {
  addTestNote,
  buildCameraFrameUrl,
  getCameraStatus,
  runTest,
  stopTest,
  finishTest,
  getCounts,
  getTestInformation,
  getTestStatus,
} from "../../utilities/api";
import { DEFAULT_END_CHIME_PATTERN, PRESET_STORAGE_EVENT, loadUserPresets, upsertUserPreset } from "../../utilities/presets";
import {
  buildEventTimelineCsv,
  formatEndChimeStatus,
  buildStimulusSummary,
  buildTraditionalCsv,
  formatSecondsForDisplay,
  normalizeLightColorForStimulus,
  normalizeStimulusType,
  SINGLE_LIGHT_LABEL,
} from "../../utilities/resultsCsv";
import { buildTestSettingsText, parseTestSettingsText } from "../../utilities/testSettingsFile";
import { playBrowserCompletionChime, primeBrowserAudio } from "../../utilities/browserAudio";
import { Alert, FormControl, Input, InputLabel, Snackbar } from '@mui/material';
import { validateTrialForm, validationFunctions } from "../../validation/test_manager";
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormHelperText from '@mui/material/FormHelperText';
import Button from '@mui/material/Button';
import { useAuth } from "../../context/AuthContext";

const DEFAULT_COOLDOWN_SECONDS = "0";
const FIXED_REWARD_TYPE = "Water";
const DEFAULT_FORM_SNAPSHOT = {
  testName: "",
  subjectID: "",
  trialDuration: "",
  goalForTrial: "",
  goalForTest: "",
  RewaStimTime: "",
  StimTimeOn: "",
  cooldown: DEFAULT_COOLDOWN_SECONDS,
  rewardType: FIXED_REWARD_TYPE,
  interactionType: "Lever",
  stimulusType: "Light",
  lightColor: SINGLE_LIGHT_LABEL,
  endChimeEnabled: false,
  endChimePattern: DEFAULT_END_CHIME_PATTERN,
};

const FIELD_HELP_TEXT = {
  testName:
    "This name appears in saved results, preset lists, CSV exports, and the backend status display while the trial is configured or running.",
  subjectID:
    "Leave this blank if you do not want to track a subject for the run. If you use it, enter the numeric animal or subject identifier you want saved with the results.",
  trialDuration:
    "This is the maximum length of the trial in minutes. The backend timer runs the test and will stop early if the test goal is reached first.",
  goalForTrial:
    "Each time the required valid interaction count reaches this number, the backend triggers one reward. Example: 3 means a reward after every 3 valid responses.",
  goalForTest:
    "This is the total number of valid interactions needed before the backend ends the trial. It must be the same as or larger than the reward goal.",
  RewaStimTime:
    "After a reward is delivered, the backend waits this many seconds before starting the next stimulus cycle.",
  StimTimeOn:
    "At the start of each cycle, the backend turns on the selected light or tone for this many seconds before waiting for the next valid interaction.",
  cooldown:
    "This value is still saved in presets and text files for compatibility, but the current backend loop does not use it during the live trial.",
  rewardType:
    "Water is the only enabled reward output right now, so this stays fixed to water.",
  interactionType:
    "This tells the backend what counts as one valid response: just a lever press, just a poke, or a required sequence of both.",
  stimulusType:
    "Choose whether each trial cycle begins with the box light, the configured trial buzzer output, or both at the same time.",
  endChimeEnabled:
    "Turn this on if you want the passive buzzer to play a short completion chime after the trial finishes.",
  endChimePattern:
    "The system uses the built-in completion chime pattern when this option is active.",
};


const TestManager = () => {
  const { user } = useAuth();
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
  const [cooldown, setCooldown] = useState(DEFAULT_COOLDOWN_SECONDS);
  const [rewardType, setRewardType] = useState(FIXED_REWARD_TYPE);
  const [interactionType, setInteractionType] = useState("Lever");
  const [stimulusType, setStimulusType] = useState("Light");
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

  const [originalSettings] = useState(DEFAULT_FORM_SNAPSHOT);
  const [uploadedFile, setUploadedFile] = useState(null);

  const [rewardCount, setRewardCount] = useState(0);
  const [presetSaveMessage, setPresetSaveMessage] = useState("");
  const [eventTimeline, setEventTimeline] = useState([]);
  const [operatorNote, setOperatorNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteFeedback, setNoteFeedback] = useState("");
  const [cameraStatus, setCameraStatus] = useState({
    checked: false,
    available: false,
    reason: "",
    resolution: "",
    refreshIntervalSeconds: 1.5,
    deviceName: "",
  });
  const [showCameraPreview, setShowCameraPreview] = useState(false);
  const [cameraFrameUrl, setCameraFrameUrl] = useState("");
  const [cameraPreviewError, setCameraPreviewError] = useState("");

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
  const previousFinishedRef = useRef(false);

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

  const refreshCameraAvailability = async () => {
    try {
      const status = await getCameraStatus();
      setCameraStatus({
        checked: true,
        available: Boolean(status.available),
        reason: status.reason || "",
        resolution: status.resolution || "",
        refreshIntervalSeconds: Number(status.refreshIntervalSeconds || 1.5),
        deviceName: status.deviceName || "",
      });
      if (!status.available) {
        setShowCameraPreview(false);
        setCameraFrameUrl("");
        setCameraPreviewError("");
      }
    } catch (error) {
      setCameraStatus({
        checked: true,
        available: false,
        reason: error?.message || "Unable to load the optional camera preview status.",
        resolution: "",
        refreshIntervalSeconds: 1.5,
        deviceName: "",
      });
      setShowCameraPreview(false);
      setCameraFrameUrl("");
      setCameraPreviewError("");
    }
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

  const effectiveLightColor = normalizeLightColorForStimulus(stimulusType);
  const stimulusSummary = buildStimulusSummary(stimulusType, effectiveLightColor);
  const chimeSummary = formatEndChimeStatus(endChimeEnabled);
  const remainingTimeSeconds = configuredDurationSeconds > 0
    ? Math.max(configuredDurationSeconds - elapsedTime, 0)
    : 0;
  const appliedPresetName = selectedPreset?.name || "None";

  useEffect(() => {
    let isMounted = true;

    const refreshPresets = async (showError = false) => {
      try {
        const presets = await loadUserPresets();
        if (isMounted) {
          setUserPresets(presets);
        }
      } catch (error) {
        if (showError && isMounted) {
          showUiError(error, "Unable to load saved presets.");
        }
      }
    };

    refreshPresets();

    const handlePresetStorageUpdate = () => {
      refreshPresets();
    };

    window.addEventListener(PRESET_STORAGE_EVENT, handlePresetStorageUpdate);
    window.addEventListener('storage', handlePresetStorageUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener(PRESET_STORAGE_EVENT, handlePresetStorageUpdate);
      window.removeEventListener('storage', handlePresetStorageUpdate);
    };
  }, []); // Empty dependency array = run once on component mount

  useEffect(() => {
    refreshCameraAvailability();
  }, []);

  useEffect(() => {
    if (testFinished && !previousFinishedRef.current) {
      playBrowserCompletionChime().catch(() => {
        // Ignore browser-audio errors so test completion UI still updates normally.
      });
    }

    previousFinishedRef.current = testFinished;
  }, [testFinished]);

  useEffect(() => {
    const canShowCamera = cameraStatus.available && showCameraPreview && !testFinished;
    if (!canShowCamera) {
      setCameraFrameUrl("");
      setCameraPreviewError("");
      return undefined;
    }

    const refreshFrame = () => {
      setCameraFrameUrl(buildCameraFrameUrl(Date.now()));
    };

    refreshFrame();
    const interval = window.setInterval(
      refreshFrame,
      Math.max(Number(cameraStatus.refreshIntervalSeconds || 1.5) * 1000, 750),
    );

    return () => window.clearInterval(interval);
  }, [
    cameraStatus.available,
    cameraStatus.refreshIntervalSeconds,
    showCameraPreview,
    testFinished,
  ]);

  const buildCurrentFormSnapshot = (overrides = {}) => ({
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
    ...overrides,
  });

  const syncValidationErrors = (errors) => {
    setTestNameError(errors.testName || "");
    setSubjectIDError(errors.subjectID || "");
    setTrialDurationError(errors.trialDuration || "");
    setTrialGoalError(errors.goalForTrial || "");
    setTestGoalError(errors.goalForTest || "");
    setRewaStimTimeError(errors.RewaStimTime || "");
    setStimTimeOnError(errors.StimTimeOn || "");
    setCoolDownError(errors.cooldown || "");
  };

  const clearValidationErrors = () => {
    syncValidationErrors({});
  };

  const validateCurrentTrialForm = (overrides = {}) => {
    const validation = validateTrialForm(buildCurrentFormSnapshot(overrides));
    syncValidationErrors(validation.errors);
    return validation;
  };

  const hasChanged = () => {
    return JSON.stringify(originalSettings) !== JSON.stringify({
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
  };


  const handleSaveTest = () => {
    const validation = validateCurrentTrialForm();
    if (!validation.isValid) {
      showUiError(
        { code: "VALIDATION_ERROR", message: validation.firstError || "Please correct the highlighted trial settings before saving." },
      );
      return;
    }

    const normalizedValues = validation.normalizedValues;

    const testSettings = buildTestSettingsText({
      appliedPresetName,
      testName: normalizedValues.testName,
      subjectID: normalizedValues.subjectID,
      trialDuration: normalizedValues.trialDuration,
      goalForTrial: normalizedValues.goalForTrial,
      goalForTest: normalizedValues.goalForTest,
      RewaStimTime: normalizedValues.RewaStimTime,
      StimTimeOn: normalizedValues.StimTimeOn,
      cooldown: normalizedValues.cooldown,
      rewardType,
      interactionType,
      stimulusType,
      endChimeEnabled,
      endChimePattern: normalizedValues.endChimePattern,
    });

    const blob = new Blob([testSettings], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${testName.replace(/\s+/g, "_")}_settings.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileText = e.target.result;
      try {
        const parsedSettings = parseTestSettingsText(fileText);
        const validation = validateTrialForm({
          ...buildCurrentFormSnapshot(),
          ...parsedSettings,
          cooldown: parsedSettings.cooldown || DEFAULT_COOLDOWN_SECONDS,
        });
        setUploadedFile(file);
        setPresetName(parsedSettings.presetName || "");
        setTestName(validation.normalizedValues.testName || "");
        setSubjectID(validation.normalizedValues.subjectID || "");
        setTrialDuration(validation.normalizedValues.trialDuration || "");
        setGoalForTrial(validation.normalizedValues.goalForTrial || "");
        setGoalForTest(validation.normalizedValues.goalForTest || "");
        setRewaStimTime(validation.normalizedValues.RewaStimTime || "");
        setStimTimeOn(validation.normalizedValues.StimTimeOn || "");
        setCooldown(validation.normalizedValues.cooldown || DEFAULT_COOLDOWN_SECONDS);
        setRewardType(FIXED_REWARD_TYPE);
        setInteractionType(parsedSettings.interactionType || "Lever");
        setStimulusType(normalizeStimulusType(parsedSettings.stimulusType));
        setEndChimeEnabled(Boolean(parsedSettings.endChimeEnabled));
        setEndChimePattern(validation.normalizedValues.endChimePattern || DEFAULT_END_CHIME_PATTERN);
        syncValidationErrors(validation.errors);
        setPresetSaveMessage("");
      } catch (error) {
        showUiError(
          { code: "INVALID_FILE_FORMAT", message: error.message || "Please upload a properly formatted test settings file." },
        );
        event.target.value = "";
      }
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
    setCooldown(DEFAULT_COOLDOWN_SECONDS);
    setRewardType(FIXED_REWARD_TYPE);
    setInteractionType("Lever");
    setStimulusType("Light");
    setSubjectID("");
    setEndChimeEnabled(false);
    setEndChimePattern(DEFAULT_END_CHIME_PATTERN);
    clearValidationErrors();
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
          setEventTimeline(Array.isArray(status.eventTimeline) ? status.eventTimeline : []);
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
        const status = await getTestStatus();
        setEventTimeline(Array.isArray(status.eventTimeline) ? status.eventTimeline : []);
    } catch (error) {
        console.error("Error resuming test:", error);
        setTestRunning(false);
        setTestPaused(true);
        showUiError(error, "Unable to resume the test.");
    }
};


  const handleRunTest = async () => {
    const validation = validateCurrentTrialForm();
    if (!validation.isValid) {
      showUiError(
        { code: "VALIDATION_ERROR", message: validation.firstError || "Please correct the highlighted trial settings before starting the test." },
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
    setEventTimeline([]);
    setOperatorNote("");
    setNoteFeedback("");

    const normalizedValues = validation.normalizedValues;
    const testSettings = { 
      testName: normalizedValues.testName,
      subjectID: normalizedValues.subjectID,
      trialDuration: normalizedValues.trialDuration,
      goalForTrial: normalizedValues.goalForTrial,
      goalForTest: normalizedValues.goalForTest,
      RewaStimTime: normalizedValues.RewaStimTime,
      StimTimeOn: normalizedValues.StimTimeOn,
      cooldown: normalizedValues.cooldown,
      rewardType, 
      interactionType, 
      stimulusType, 
      lightColor: effectiveLightColor,
      endChimeEnabled,
      endChimePattern: normalizedValues.endChimePattern,
      leverPress: 0,
      nosePoke: 0
    };

    try {
      await primeBrowserAudio();

      // Save test information to the backend first so the DB row exists before the run begins.
      console.log("Saving test configuration...");
      await getTestInformation(testSettings);
      
      // Then start the hardware test and only flip the UI into running mode after success.
      console.log("Starting hardware test...");
      await runTest(testSettings);
      const status = await getTestStatus();
      setEventTimeline(Array.isArray(status.eventTimeline) ? status.eventTimeline : []);
      setTestRunning(true);
    } catch (error) {
      console.error("Error running test sequence:", error);
      setTestRunning(false);
      showUiError(error, "Failed to start the test.");
    }
  };

  const handleToggleCameraPreview = () => {
    if (!cameraStatus.available) {
      return;
    }

    setCameraPreviewError("");
    setShowCameraPreview((currentValue) => !currentValue);
  };

  const handleStopTest = async () => {
    try {
      await stopTest();
      const finalCounts = await getCounts();
      const status = await getTestStatus();
      applyCountsToUi(finalCounts);
      setEventTimeline(Array.isArray(status.eventTimeline) ? status.eventTimeline : []);
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
      const status = await getTestStatus();
      applyCountsToUi(finalCounts);
      setEventTimeline(Array.isArray(status.eventTimeline) ? status.eventTimeline : []);
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
      conductedByDisplayName: user?.displayName || "",
      conductedByEmail: user?.email || "",
      conductedByUserId: user?.id || "",
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
      endChimeEnabled: formatEndChimeStatus(endChimeEnabled),
      endChimePattern: "",
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

  const handleSaveOperatorNote = async () => {
    const trimmedNote = operatorNote.trim();
    if (!trimmedNote) {
      showUiError(
        { code: "NOTE_TEXT_REQUIRED", message: "Enter a note before saving it to the active trial." },
      );
      return;
    }

    try {
      setNoteBusy(true);
      const response = await addTestNote(trimmedNote);
      setOperatorNote("");
      setNoteFeedback(response.message || "Operator note saved.");
      if (Array.isArray(response.eventTimeline)) {
        setEventTimeline(response.eventTimeline);
      }
    } catch (error) {
      showUiError(error, "Unable to save the operator note.");
    } finally {
      setNoteBusy(false);
    }
  };

  const handleDownloadTimeline = () => {
    const timelineCsv = buildEventTimelineCsv({
      testName,
      subjectId: subjectID,
      conductedByDisplayName: user?.displayName || "",
      conductedByEmail: user?.email || "",
      events: eventTimeline,
    });
    const blob = new Blob([timelineCsv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${testName.replace(/\s+/g, "_")}_timeline.csv`;
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

    const validation = validateCurrentTrialForm();
    if (!validation.isValid) {
      showUiError(
        { code: "PRESET_VALUES_REQUIRED", message: validation.firstError || "Fill in valid trial values before saving a preset." },
      );
      return;
    }

    try {
      const normalizedValues = validation.normalizedValues;
      const shouldReuseSelectedPresetId = Boolean(
        selectedPreset && selectedPreset.name.trim().toLowerCase() === presetName.trim().toLowerCase()
      );
      const resolvedResult = await upsertUserPreset({
        id: shouldReuseSelectedPresetId ? selectedPreset.id : undefined,
        name: presetName,
        description: presetDescription,
        testName: normalizedValues.testName,
        subjectID: normalizedValues.subjectID,
        trialDuration: normalizedValues.trialDuration,
        goalForTrial: normalizedValues.goalForTrial,
        goalForTest: normalizedValues.goalForTest,
        RewaStimTime: normalizedValues.RewaStimTime,
        StimTimeOn: normalizedValues.StimTimeOn,
        cooldown: normalizedValues.cooldown,
        rewardType: FIXED_REWARD_TYPE,
        interactionType,
        stimulusType,
        lightColor: effectiveLightColor,
        endChimeEnabled,
        endChimePattern: normalizedValues.endChimePattern,
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
            setCooldown(DEFAULT_COOLDOWN_SECONDS);
            setRewardType(FIXED_REWARD_TYPE);
        setInteractionType("Lever");
        setStimulusType("Light");
        setEndChimeEnabled(false);
        setEndChimePattern(DEFAULT_END_CHIME_PATTERN);
        setPresetSaveMessage("");
        clearValidationErrors();
        return;
      }

        const userPreset = userPresets.find((preset) => preset.id === value);
        if (!userPreset) {
          return;
        }

        setPresetName(userPreset.name);
        setPresetDescription(userPreset.description || "");
        const validation = validateTrialForm({
          ...buildCurrentFormSnapshot(),
          ...userPreset,
          cooldown: userPreset.cooldown || DEFAULT_COOLDOWN_SECONDS,
        });
        setTestName(validation.normalizedValues.testName || "");
        setSubjectID(validation.normalizedValues.subjectID || "");
        setTrialDuration(validation.normalizedValues.trialDuration || "");
        setGoalForTrial(validation.normalizedValues.goalForTrial || "");
        setGoalForTest(validation.normalizedValues.goalForTest || "");
        setRewaStimTime(validation.normalizedValues.RewaStimTime || "");
        setStimTimeOn(validation.normalizedValues.StimTimeOn || "");
        setCooldown(validation.normalizedValues.cooldown || DEFAULT_COOLDOWN_SECONDS);
        setRewardType(FIXED_REWARD_TYPE);
        setInteractionType(userPreset.interactionType || "Lever");
        setStimulusType(normalizeStimulusType(userPreset.stimulusType));
        setEndChimeEnabled(Boolean(userPreset.endChimeEnabled));
        setEndChimePattern(validation.normalizedValues.endChimePattern || DEFAULT_END_CHIME_PATTERN);
        syncValidationErrors(validation.errors);
        setPresetSaveMessage(`Preset "${userPreset.name}" loaded into the test form.`);
    } catch(e) {
        showUiError(
          { code: "PRESET_LOAD_ERROR", message: "Unable to load the selected preset." },
        );
    }
};
  // TODO: Determine why name is getting set to a number 
  
  return (
    <div className="trial-settings">
      {!testRunning && !testPaused && !testFinished ? (
        <div id="formControlContainer">
          <div className="trial-form-intro">
            <h2>Configure a Trial</h2>
            <p>
              Enter the trial settings you want to use, or load a saved preset to fill them in faster.
              Check the values, then start the trial when everything looks right.
            </p>
          </div>

          <div className="trial-section-card">
            <h3>Workflow</h3>
            <p>
              Choose a preset or fill out the fields below, then press <strong>Run Test</strong>.
              While the test is active, the backend controls the timer, counts valid interactions,
              delivers rewards, and decides when the run should finish.
            </p>
          </div>

          <div className="trial-section-card">
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
                  <FormHelperText>
                    Load a saved preset to auto-fill the form, then adjust any fields you want before starting.
                  </FormHelperText>
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
          </div>

          <div className="trial-section-card">
            <h3>Trial Identity</h3>
            <div className="trial-form-grid">
              <div className="input-group">
                <FormControl fullWidth error={Boolean(testNameError)}>
                  <InputLabel htmlFor="testName">Test Name:</InputLabel>
                  <Input
                    id="lblTestName"
                    placeholder="Enter test name"
                    required
                    value={testName}
                    onChange={(e) => {
                      const { value, error } = validationFunctions.testNameValidation(e.target.value);
                      setTestName(value);
                      const validation = validateCurrentTrialForm({ testName: value });
                      setTestNameError(error || validation.errors.testName || "");
                    }}
                  />
                  <FormHelperText>
                    {testNameError || FIELD_HELP_TEXT.testName}
                  </FormHelperText>
                </FormControl>
              </div>

              <div className="input-group">
                <FormControl fullWidth error={Boolean(subjectIDError)}>
                  <InputLabel htmlFor="subjectIdentification">Subject Identification:</InputLabel>
                  <Input
                    id="txtSubjectID"
                    placeholder="Enter Subject ID (optional numeric)"
                    required
                    value={subjectID}
                    onChange={(e) => {
                      const { value, error } = validationFunctions.testSubjectID(e.target.value);
                      setSubjectID(value);
                      const validation = validateCurrentTrialForm({ subjectID: value });
                      setSubjectIDError(error || validation.errors.subjectID || "");
                    }}
                  />
                  <FormHelperText>
                    {subjectIDError || FIELD_HELP_TEXT.subjectID}
                  </FormHelperText>
                </FormControl>
              </div>
            </div>
          </div>

          <div className="trial-section-card">
            <h3>Timing And Goals</h3>
            <p className="trial-section-note">
              These values tell the backend how long the test can run, when to give rewards,
              and when to stop automatically.
            </p>
            <div className="trial-form-grid">
              <div className="input-group">
                <FormControl fullWidth error={Boolean(trialDurationError)}>
                  <InputLabel htmlFor="trialDuration">Trial Duration (Minutes):</InputLabel>
                  <Input
                    id="txtTrialDuration"
                    placeholder="Enter Trial Duration"
                    required
                    min="0"
                    value={trialDuration}
                    onChange={(e) => {
                      const { value, error } = validationFunctions.testTrialDurtion(e.target.value);
                      setTrialDuration(value);
                      const validation = validateCurrentTrialForm({ trialDuration: value });
                      setTrialDurationError(error || validation.errors.trialDuration || "");
                    }}
                  />
                  <FormHelperText>
                    {trialDurationError || FIELD_HELP_TEXT.trialDuration}
                  </FormHelperText>
                </FormControl>
              </div>

              <div className="input-group">
                <FormControl fullWidth error={Boolean(trialGoalError)}>
                  <InputLabel htmlFor="goalForTrial">Responses Needed For Each Reward:</InputLabel>
                  <Input
                    id="txtGoalForTrial"
                    placeholder="Enter Goal"
                    required
                    value={goalForTrial}
                    onChange={(e) => {
                      const { value, error } = validationFunctions.testTrialGoal(e.target.value);
                      setGoalForTrial(value);
                      const validation = validateCurrentTrialForm({ goalForTrial: value });
                      setTrialGoalError(error || validation.errors.goalForTrial || "");
                    }}
                  />
                  <FormHelperText>
                    {trialGoalError || FIELD_HELP_TEXT.goalForTrial}
                  </FormHelperText>
                </FormControl>
              </div>

              <div className="input-group">
                <FormControl fullWidth error={Boolean(testGoalError)}>
                  <InputLabel htmlFor="goalForTest">Total Valid Responses Before Finish:</InputLabel>
                  <Input
                    id="txtGoalForTest"
                    placeholder="Enter Goal"
                    required
                    value={goalForTest}
                    onChange={(e) => {
                      const { value, error } = validationFunctions.testTrialGoal(e.target.value);
                      setGoalForTest(value);
                      const validation = validateCurrentTrialForm({ goalForTest: value });
                      setTestGoalError(error || validation.errors.goalForTest || "");
                    }}
                    />
                    <FormHelperText>
                      {testGoalError || FIELD_HELP_TEXT.goalForTest}
                    </FormHelperText>
                </FormControl>
              </div>

              <div className="input-group">
                <FormControl fullWidth error={Boolean(RewaStimTimeError)}>
                  <InputLabel htmlFor="RewaStimTime">Delay After Reward Before Next Cycle (s):</InputLabel>
                  <Input
                    id="txtRewaStimTime"
                    placeholder="Enter Time (s)"
                    required
                    value={RewaStimTime}
                    onChange={(e) => {
                      const { value, error } = validationFunctions.testRewardDelay(e.target.value);
                      setRewaStimTime(value);
                      const validation = validateCurrentTrialForm({ RewaStimTime: value });
                      setRewaStimTimeError(error || validation.errors.RewaStimTime || "");
                    }}
                    />
                    <FormHelperText>
                      {RewaStimTimeError || FIELD_HELP_TEXT.RewaStimTime}
                    </FormHelperText>
                </FormControl>
              </div>

              <div className="input-group">
                <FormControl fullWidth error={Boolean(StimTimeOnError)}>
                  <InputLabel htmlFor="StimTimeOn">Stimulus On Time (s):</InputLabel>
                  <Input
                    id="txtStimTimeOn"
                    placeholder="Enter Time (s)"
                    required
                    value={StimTimeOn}
                    onChange={(e) => {
                      const { value, error } = validationFunctions.testStimulusDuration(e.target.value);
                      setStimTimeOn(value);
                      const validation = validateCurrentTrialForm({ StimTimeOn: value });
                      setStimTimeOnError(error || validation.errors.StimTimeOn || "");
                    }}
                    />
                    <FormHelperText>
                      {StimTimeOnError || FIELD_HELP_TEXT.StimTimeOn}
                    </FormHelperText>
                </FormControl>
              </div>

              <div className="input-group">
                <FormControl fullWidth error={Boolean(coolDownError)}>
                  <InputLabel htmlFor="coolDown">Cooldown (Stored Only):</InputLabel>
                  <Input
                    id="txtCooldown"
                    placeholder="0"
                    inputProps={{ readOnly: true }}
                    min="0"
                    value={cooldown}
                    onChange={(e) => {
                      const { value, error } = validationFunctions.testCoolDown(e.target.value);
                      setCooldown(value);
                      const validation = validateCurrentTrialForm({ cooldown: value });
                      setCoolDownError(error || validation.errors.cooldown || "");
                    }}
                  />
                  <FormHelperText>
                    {coolDownError || FIELD_HELP_TEXT.cooldown}
                  </FormHelperText>
                </FormControl>
              </div>
            </div>
          </div>

          <div className="trial-section-card">
            <h3>Responses And Outputs</h3>
            <p className="trial-section-note">
              These settings choose what counts as a valid response and which hardware outputs the backend uses during each cycle.
            </p>
            <div className="trial-form-grid">
              <div className="input-group">
                <FormControl fullWidth>
                  <InputLabel id="rewardType">Reward Type:</InputLabel>
                    <Select
                      id="selectRewardType"
                      value={rewardType}
                      disabled
                    >
                      <MenuItem value={FIXED_REWARD_TYPE}>{FIXED_REWARD_TYPE}</MenuItem>
                    </Select>
                    <FormHelperText>{FIELD_HELP_TEXT.rewardType}</FormHelperText>
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
                    <FormHelperText>{FIELD_HELP_TEXT.interactionType}</FormHelperText>
                </FormControl>
              </div>

              <div className="input-group">
                <FormControl fullWidth>
                  <InputLabel id="stimulusType">Stimulus Type:</InputLabel>
                    <Select
                      id="selectStimulusType"
                      value={stimulusType}
                      onChange = {(e) => setStimulusType(normalizeStimulusType(e.target.value))}
                    >
                      <MenuItem value={"Light"}>Light</MenuItem>
                      <MenuItem value={"Tone"}>Tone</MenuItem>
                      <MenuItem value={"Light + Tone"}>Light + Tone</MenuItem>
                    </Select>
                    <FormHelperText>{FIELD_HELP_TEXT.stimulusType}</FormHelperText>
                </FormControl>
              </div>
            </div>

            {stimulusType === "Light" ? (
              <div className="stimulus-note">
                Light stimulus selected. The backend will use the single box light on each cycle, so there is no separate color option to configure.
              </div>
            ) : stimulusType === "Tone" ? (
              <div className="stimulus-note">
                Tone stimulus selected. The backend will use the saved trial buzzer output on each cycle instead of the trial light.
              </div>
            ) : (
              <div className="stimulus-note">
                Light + Tone selected. The backend will turn on the box light and play the saved trial buzzer output together on each stimulus cycle.
              </div>
            )}
          </div>

          <div className="trial-section-card">
            <h3>Finish Chime And File Actions</h3>
            <div className="trial-form-grid">
              <div className="input-group">
                <FormControl fullWidth>
                  <InputLabel id="endChimeEnabled">End-of-Test Chime:</InputLabel>
                  <Select
                    id="selectEndChimeEnabled"
                    value={endChimeEnabled ? "active" : "inactive"}
                    onChange={(e) => {
                      const nextEnabled = e.target.value === "active";
                      setEndChimeEnabled(nextEnabled);
                      setEndChimePattern(DEFAULT_END_CHIME_PATTERN);
                      validateCurrentTrialForm({ endChimeEnabled: nextEnabled });
                    }}
                  >
                    <MenuItem value={"inactive"}>Inactive</MenuItem>
                    <MenuItem value={"active"}>Active</MenuItem>
                  </Select>
                  <FormHelperText>{FIELD_HELP_TEXT.endChimeEnabled}</FormHelperText>
                </FormControl>
              </div>

              <div className="stimulus-note">
                {endChimeEnabled
                  ? "Active means the box will play the built-in completion chime when the trial finishes."
                  : "Leave this inactive if you want the trial to end silently."}
              </div>
            </div>

            <div className="trial-action-panel">
              <p className="trial-section-note">
                Save a settings file for later reuse, load a saved file into the form, or start the configured trial immediately.
              </p>
              <div className="trial-action-row" aria-label="Trial form actions">
                <Button className="save-button" onClick={handleSaveTest} disabled={!hasChanged()}>
                  Save Test
                </Button>
                <label className="upload-action-button">
                  <input type="file" accept=".txt" onChange={handleFileUpload} className="upload-button" />
                  <span>{uploadedFile ? "Replace Test File" : "Upload Test File"}</span>
                </label>
                {uploadedFile && (
                  <Button className="delete-button" onClick={handleDeleteUpload}>
                    Clear Loaded File
                  </Button>
                )}
                <Button
                  className="start-button"
                  onClick={handleRunTest}
                >
                  Run Test
                </Button>
              </div>
              {uploadedFile && (
                <p className="upload-file-name">
                  Loaded file: {uploadedFile.name}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
   
          <div className="test-screen">
            {/* Dynamic title based on test completion state */}
            <h1>{testFinished ? "Test Completed" : "Test in Progress"}</h1>
            <div className="test-screen-layout">
              <div className="test-screen-summary">
                <p>Time Remaining: {formatSecondsForDisplay(remainingTimeSeconds)}</p>
                <p>Elapsed Time: {formatSecondsForDisplay(elapsedTime)}</p>
                <p>Configured Duration: {formatSecondsForDisplay(configuredDurationSeconds)}</p>
                <p>Lever Presses: {leverPressCount}</p>
                <p>Nose Pokes: {nosePokeCount}</p>
                <p>Rewards Given: {rewardCount}</p>
                <p>Stimulus: {stimulusSummary}</p>
                <p>End Chime: {chimeSummary}</p>
                <p>Light Status: {lightOn ? "ON" : "OFF"}</p>
                <p>Browser Alert: This page will play a short completion chime when the run finishes.</p>
              </div>

              <div className="test-screen-sidebar">
                {cameraStatus.available && !testFinished && (
                  <div className="camera-preview-panel">
                    <div className="camera-preview-header">
                      <div>
                        <h3>Live Camera Preview</h3>
                        <p>
                          Optional low-bandwidth still preview from the USB camera on this box.
                          It only refreshes while this panel is open.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="camera-toggle-button"
                        onClick={handleToggleCameraPreview}
                      >
                        {showCameraPreview ? "Hide Camera" : "Show Camera"}
                      </button>
                    </div>
                    <p className="camera-preview-meta">
                      {cameraStatus.deviceName || "USB Camera"}
                      {cameraStatus.resolution ? ` • ${cameraStatus.resolution}` : ""}
                    </p>
                    {showCameraPreview ? (
                      <>
                        <img
                          className="camera-preview-image"
                          src={cameraFrameUrl}
                          alt="Live trial camera preview"
                          onLoad={() => setCameraPreviewError("")}
                          onError={() => {
                            setCameraPreviewError(
                              "The camera preview could not be refreshed. Check the USB camera connection and try again."
                            );
                          }}
                        />
                        {cameraPreviewError && <p className="camera-preview-error">{cameraPreviewError}</p>}
                      </>
                    ) : (
                      <p className="camera-preview-empty">
                        Camera preview is off to reduce network traffic during the trial.
                      </p>
                    )}
                  </div>
                )}

                {!testFinished && (
                  <div className="trial-note-panel">
                    <h3>Operator Notes</h3>
                    <p>Add a short note to the saved timeline while the trial is running or paused.</p>
                    <textarea
                      value={operatorNote}
                      onChange={(event) => setOperatorNote(event.target.value)}
                      placeholder="Example: adjusted nose-poke sensor at 2:10."
                      rows={4}
                    />
                    <button
                      type="button"
                      className="note-button"
                      onClick={handleSaveOperatorNote}
                      disabled={noteBusy}
                    >
                      {noteBusy ? "Saving..." : "Save Note"}
                    </button>
                    {noteFeedback && <p className="trial-note-feedback">{noteFeedback}</p>}
                  </div>
                )}

                <div className="timeline-panel">
                  <div className="timeline-panel-header">
                    <h3>Event Timeline</h3>
                    <button
                      type="button"
                      className="timeline-download-button"
                      onClick={handleDownloadTimeline}
                      disabled={!eventTimeline.length}
                    >
                      Download Timeline CSV
                    </button>
                  </div>
                  {eventTimeline.length ? (
                    <ul className="timeline-list">
                      {eventTimeline.slice().reverse().map((event) => (
                        <li key={event.id} className="timeline-item">
                          <div className="timeline-item-meta">
                            <strong>{event.label}</strong>
                            <span>{formatSecondsForDisplay(event.elapsedSeconds)}</span>
                          </div>
                          {event.detailText && <p>{event.detailText}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="timeline-empty">No saved events yet. The timeline will fill as the backend records trial activity.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="button-group">
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
                  <button className="download-button" onClick={handleDownloadTimeline} disabled={!eventTimeline.length}>
                    Download Timeline
                  </button>
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
