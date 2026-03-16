import React, { useEffect, useState } from 'react';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Button from '@mui/material/Button';
import { Alert, FormControl, FormHelperText, Input, InputLabel, Stack } from '@mui/material';
import './main.css';
import '../TestManager/TestManager.css';

import {
  DEFAULT_END_CHIME_PATTERN,
  PRESET_STORAGE_EVENT,
  deleteUserPreset,
  loadUserPresets,
  upsertUserPreset,
} from '../../utilities/presets';
import {
  formatEndChimeStatus,
  SINGLE_LIGHT_LABEL,
  normalizeLightColorForStimulus,
  normalizeStimulusType,
} from '../../utilities/resultsCsv';

const FIXED_REWARD_TYPE = 'Water';

const DEFAULT_PRESET_FORM = {
  id: '',
  name: '',
  description: '',
  testName: '',
  subjectID: '',
  trialDuration: '',
  goalForTrial: '',
  goalForTest: '',
  RewaStimTime: '',
  StimTimeOn: '',
  cooldown: '',
  rewardType: FIXED_REWARD_TYPE,
  interactionType: 'Lever',
  stimulusType: 'Light',
  lightColor: SINGLE_LIGHT_LABEL,
  endChimeEnabled: false,
  endChimePattern: DEFAULT_END_CHIME_PATTERN,
};


const PresetManager = () => {
  // Editable preset form that mirrors the important Trial configuration fields.
  const [form, setForm] = useState(DEFAULT_PRESET_FORM);
  // Per-user preset list loaded from the authenticated backend for the signed-in account.
  const [savedPresets, setSavedPresets] = useState([]);
  // Friendly success/error banner after save/delete/load actions.
  const [feedback, setFeedback] = useState(null);

  const refreshPresets = async (showError = false) => {
    try {
      setSavedPresets(await loadUserPresets());
    } catch (error) {
      if (showError) {
        setFeedback({
          severity: 'error',
          message: error.message || 'Unable to load your saved presets.',
        });
      }
    }
  };

  useEffect(() => {
    refreshPresets(true);

    const handlePresetStorageUpdate = () => {
      refreshPresets();
    };

    window.addEventListener(PRESET_STORAGE_EVENT, handlePresetStorageUpdate);
    window.addEventListener('storage', handlePresetStorageUpdate);

    return () => {
      window.removeEventListener(PRESET_STORAGE_EVENT, handlePresetStorageUpdate);
      window.removeEventListener('storage', handlePresetStorageUpdate);
    };
  }, []);

  const updateFormField = (fieldName, value) => {
    const resolvedValue = fieldName === 'stimulusType'
      ? normalizeStimulusType(value)
      : value;

    setForm((currentForm) => ({
      ...currentForm,
      [fieldName]: resolvedValue,
      lightColor:
        fieldName === 'stimulusType'
          ? normalizeLightColorForStimulus(resolvedValue)
          : currentForm.lightColor,
    }));
  };

  const resetForm = () => {
    setForm(DEFAULT_PRESET_FORM);
  };

  const handlePresetSave = async () => {
    if (!form.name.trim()) {
      setFeedback({ severity: 'error', message: 'Preset name is required.' });
      return;
    }

    if (!form.trialDuration || !form.goalForTrial || !form.goalForTest) {
      setFeedback({
        severity: 'error',
        message: 'Fill in trial duration, goal for trial, and goal for test before saving a preset.',
      });
      return;
    }

    try {
      const loadedPreset = savedPresets.find((preset) => preset.id === form.id);
      const shouldReusePresetId = Boolean(
        loadedPreset && loadedPreset.name.trim().toLowerCase() === form.name.trim().toLowerCase()
      );

      const result = await upsertUserPreset({
        ...form,
        id: shouldReusePresetId ? form.id : undefined,
        rewardType: FIXED_REWARD_TYPE,
        lightColor: normalizeLightColorForStimulus(form.stimulusType),
      });

      setSavedPresets(result.presets);
      setForm({
        ...result.preset,
        rewardType: FIXED_REWARD_TYPE,
        stimulusType: normalizeStimulusType(result.preset.stimulusType),
        lightColor: normalizeLightColorForStimulus(result.preset.stimulusType),
      });
      setFeedback({
        severity: 'success',
        message: result.replaced
          ? `Preset "${result.preset.name}" updated.`
          : `Preset "${result.preset.name}" saved.`,
      });
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: error.message || 'Unable to save the preset.',
      });
    }
  };

  const handlePresetLoad = (preset) => {
    setForm({
      ...preset,
      rewardType: FIXED_REWARD_TYPE,
      stimulusType: normalizeStimulusType(preset.stimulusType),
      lightColor: normalizeLightColorForStimulus(preset.stimulusType),
    });
    setFeedback({
      severity: 'success',
      message: `Preset "${preset.name}" loaded for editing.`,
    });
  };

  const handlePresetDelete = async (presetId) => {
    try {
      const deletedPreset = savedPresets.find((preset) => preset.id === presetId);
      const nextPresets = await deleteUserPreset(presetId);
      setSavedPresets(nextPresets);

      if (form.id === presetId) {
        resetForm();
      }

      setFeedback({
        severity: 'success',
        message: deletedPreset
          ? `Preset "${deletedPreset.name}" deleted.`
          : 'Preset deleted.',
      });
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: error.message || 'Unable to delete the selected preset.',
      });
    }
  };

  return (
    <div className="preset-manager-page">
      <div className="trial-settings preset-manager-card">
        <div className="preset-manager-header">
          <h2>Preset Manager</h2>
          <p>Save reusable trial values here, then pick them from the Trial page to auto-fill the form.</p>
          <div className="preset-manager-note">
            Presets are now saved to your signed-in account, so they stay available the next time you log in.
          </div>
        </div>

        {feedback && (
          <Alert severity={feedback.severity} sx={{ mb: 2 }}>
            {feedback.message}
          </Alert>
        )}

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel htmlFor="presetNameLabel">Preset Name:</InputLabel>
            <Input
              id="presetName"
              placeholder="Enter preset name"
              required
              value={form.name}
              onChange={(e) => updateFormField('name', e.target.value)}
            />
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel htmlFor="presetDescriptionLabel">Description:</InputLabel>
            <Input
              id="presetDescription"
              placeholder="Optional description"
              value={form.description}
              onChange={(e) => updateFormField('description', e.target.value)}
            />
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel htmlFor="presetTestNameLabel">Default Test Name:</InputLabel>
            <Input
              id="presetTestName"
              placeholder="Optional default test name"
              value={form.testName}
              onChange={(e) => updateFormField('testName', e.target.value)}
            />
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel htmlFor="presetSubjectIDLabel">Default Subject ID:</InputLabel>
            <Input
              id="presetSubjectID"
              placeholder="Optional default subject ID"
              value={form.subjectID}
              onChange={(e) => updateFormField('subjectID', e.target.value)}
            />
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel htmlFor="presetTrialDurationLabel">Trial Duration (Minutes):</InputLabel>
            <Input
              id="trialDuration"
              placeholder="Enter preset trial duration"
              required
              value={form.trialDuration}
              onChange={(e) => updateFormField('trialDuration', e.target.value)}
            />
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel htmlFor="goalForTrialLabel">Goal for Trial:</InputLabel>
            <Input
              id="goalForTrial"
              placeholder="Enter goal for trial"
              required
              value={form.goalForTrial}
              onChange={(e) => updateFormField('goalForTrial', e.target.value)}
            />
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel htmlFor="goalForTestLabel">Goal for Test:</InputLabel>
            <Input
              id="goalForTest"
              placeholder="Enter goal for test"
              required
              value={form.goalForTest}
              onChange={(e) => updateFormField('goalForTest', e.target.value)}
            />
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel htmlFor="rewardDelayLabel">Reward Delay (s):</InputLabel>
            <Input
              id="rewardDelay"
              placeholder="Time between reward and new stimulus"
              value={form.RewaStimTime}
              onChange={(e) => updateFormField('RewaStimTime', e.target.value)}
            />
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel htmlFor="stimulusDurationLabel">Stimulus Duration (s):</InputLabel>
            <Input
              id="stimulusDuration"
              placeholder="How long the stimulus stays active"
              value={form.StimTimeOn}
              onChange={(e) => updateFormField('StimTimeOn', e.target.value)}
            />
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel htmlFor="cooldownLabel">Cooldown (s):</InputLabel>
            <Input
              id="cooldown"
              placeholder="Enter cooldown"
              value={form.cooldown}
              onChange={(e) => updateFormField('cooldown', e.target.value)}
            />
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel id="rewardTypeLabel">Reward Type:</InputLabel>
            <Select
              id="rewardType"
              value={form.rewardType}
              disabled
            >
              <MenuItem value={FIXED_REWARD_TYPE}>{FIXED_REWARD_TYPE}</MenuItem>
            </Select>
            <FormHelperText>Water is the only enabled reward type right now.</FormHelperText>
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel id="interactionTypeLabel">Interaction Type:</InputLabel>
            <Select
              id="interactionType"
              value={form.interactionType}
              onChange={(e) => updateFormField('interactionType', e.target.value)}
            >
              <MenuItem value="Poke">Poke</MenuItem>
              <MenuItem value="Lever">Lever</MenuItem>
              <MenuItem value="Poke Then Lever">Poke then Lever</MenuItem>
              <MenuItem value="Lever then Poke">Lever then Poke</MenuItem>
            </Select>
          </FormControl>
        </div>

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel id="stimulusTypeLabel">Stimulus Type:</InputLabel>
            <Select
              id="stimulusType"
              value={form.stimulusType}
              onChange={(e) => updateFormField('stimulusType', e.target.value)}
            >
              <MenuItem value="Light">Light</MenuItem>
              <MenuItem value="Tone">Tone</MenuItem>
              <MenuItem value="Light + Tone">Light + Tone</MenuItem>
            </Select>
            <FormHelperText>
              Choose whether the saved preset uses the box light, the buzzer tone, or both together.
            </FormHelperText>
          </FormControl>
        </div>

        {form.stimulusType === 'Light' ? (
          <div className="stimulus-note">
            Light stimulus selected. The box uses one fixed stimulus light, so there is no color choice to save in this preset.
          </div>
        ) : form.stimulusType === 'Tone' ? (
          <div className="stimulus-note">
            Tone stimulus selected. Light color does not apply to this preset.
          </div>
        ) : (
          <div className="stimulus-note">
            Light + Tone selected. This preset will use the box light and the passive buzzer together.
          </div>
        )}

        <div className="input-group">
          <FormControl fullWidth>
            <InputLabel id="endChimeEnabledLabel">End-of-Test Chime:</InputLabel>
            <Select
              id="endChimeEnabled"
              value={form.endChimeEnabled ? 'active' : 'inactive'}
              onChange={(e) => {
                const nextEnabled = e.target.value === 'active';
                updateFormField('endChimeEnabled', nextEnabled);
                updateFormField('endChimePattern', DEFAULT_END_CHIME_PATTERN);
              }}
            >
              <MenuItem value="inactive">Inactive</MenuItem>
              <MenuItem value="active">Active</MenuItem>
            </Select>
          </FormControl>
        </div>

        <div className="stimulus-note">
          {form.endChimeEnabled
            ? 'Active means this preset will use the built-in completion chime.'
            : 'Leave this inactive if runs using this preset should end silently.'}
        </div>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <Button className="save-button" variant="contained" onClick={handlePresetSave}>
            Save Preset
          </Button>
          <Button variant="outlined" onClick={resetForm}>
            Clear Form
          </Button>
        </Stack>

        <div className="preset-library">
          <h3>Saved Presets</h3>
          {savedPresets.length === 0 ? (
            <p>No presets saved for this account yet.</p>
          ) : (
            <div className="preset-library-list">
              {savedPresets.map((preset) => (
                <div key={preset.id} className="preset-library-item">
                  <div className="preset-library-copy">
                    <strong>{preset.name}</strong>
                    <p>{preset.description || 'No description provided.'}</p>
                    <p>
                      {preset.interactionType} / {preset.stimulusType}
                    </p>
                    <p>
                      End chime: {formatEndChimeStatus(preset.endChimeEnabled)}
                    </p>
                  </div>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button variant="contained" onClick={() => handlePresetLoad(preset)}>
                      Load
                    </Button>
                    <Button variant="outlined" color="error" onClick={() => handlePresetDelete(preset.id)}>
                      Delete
                    </Button>
                  </Stack>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default PresetManager;
