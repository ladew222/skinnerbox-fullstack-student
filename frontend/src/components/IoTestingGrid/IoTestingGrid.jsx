import React, { useEffect, useState } from 'react';
import {
  getCounts,
  getMaintenanceStatus,
  primePump,
  saveLeverDebounce,
  saveLeverReleaseRequirement,
  saveRewardPulse,
  setBlueLight,
  testBuzzer,
} from '../../utilities/api';
import './IoTestingGrid.css';

const IoTestingGrid = () => {
  const [counts, setCounts] = useState({ lever_press_count: 0, nose_poke_count: 0 });
  const [maintenanceStatus, setMaintenanceStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [manualPumpMs, setManualPumpMs] = useState('');
  const [rewardPulseMs, setRewardPulseMs] = useState('');
  const [leverDebounceMs, setLeverDebounceMs] = useState('');
  const [requireLeverRelease, setRequireLeverRelease] = useState(null);
  const [pumpPrimeBusy, setPumpPrimeBusy] = useState(false);
  const [rewardPulseBusy, setRewardPulseBusy] = useState(false);
  const [leverDebounceBusy, setLeverDebounceBusy] = useState(false);
  const [leverReleaseBusy, setLeverReleaseBusy] = useState(false);
  const [buzzerBusy, setBuzzerBusy] = useState(false);
  const [leverBaselineCount, setLeverBaselineCount] = useState(0);
  const [nosePokeBaselineCount, setNosePokeBaselineCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await getCounts();
        setCounts(data);
      } catch (error) {
        console.error('Error fetching counts:', error);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const refreshMaintenanceStatus = async () => {
      try {
        const status = await getMaintenanceStatus();
        setMaintenanceStatus(status);
      } catch (error) {
        setMessage(error?.message || 'Unable to load maintenance status.');
      }
    };

    refreshMaintenanceStatus();
    const interval = setInterval(refreshMaintenanceStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!maintenanceStatus) {
      return;
    }

    const activeRewardPulseMs = String(
      maintenanceStatus.activeRewardPulseMilliseconds
        || maintenanceStatus.defaultRewardPulseMilliseconds
        || 30
    );
    const activeLeverDebounceMs = String(
      maintenanceStatus.activeLeverDebounceMilliseconds
        || maintenanceStatus.defaultLeverDebounceMilliseconds
        || 150
    );

    if (manualPumpMs === '' || Number(manualPumpMs) <= 0) {
      setManualPumpMs(activeRewardPulseMs);
    }
    if (rewardPulseMs === '' || Number(rewardPulseMs) <= 0) {
      setRewardPulseMs(activeRewardPulseMs);
    }
    if (leverDebounceMs === '' || Number(leverDebounceMs) <= 0) {
      setLeverDebounceMs(activeLeverDebounceMs);
    }
    if (requireLeverRelease === null) {
      setRequireLeverRelease(
        Boolean(maintenanceStatus.activeRequireLeverReleaseBeforeCount)
      );
    }
  }, [
    maintenanceStatus,
    leverDebounceMs,
    manualPumpMs,
    requireLeverRelease,
    rewardPulseMs,
  ]);

  const leverPressesSinceBaseline = Math.max(
    counts.lever_press_count - leverBaselineCount,
    0
  );
  const nosePokesSinceBaseline = Math.max(
    counts.nose_poke_count - nosePokeBaselineCount,
    0
  );

  const handleStimulusLight = async (action) => {
    try {
      const result = await setBlueLight(action);
      setMessage(`Stimulus light turned ${result.blue}`);
    } catch (error) {
      setMessage('Failed to control the stimulus light.');
    }
  };

  const handleTestBuzzer = async () => {
    try {
      setBuzzerBusy(true);
      const result = await testBuzzer();
      setMessage(`Buzzer test played: ${result.pattern}`);
    } catch (error) {
      setMessage(error?.message || 'Unable to play the buzzer test.');
    } finally {
      setBuzzerBusy(false);
    }
  };

  const handlePrimePump = async () => {
    const parsedManualPumpMs = Number(manualPumpMs);
    if (!Number.isFinite(parsedManualPumpMs) || parsedManualPumpMs < 10) {
      setMessage('Enter a manual pump duration of at least 10 milliseconds.');
      return;
    }

    try {
      setPumpPrimeBusy(true);
      const result = await primePump(parsedManualPumpMs);
      setMessage(`Pump ran for ${Math.round(result.durationSeconds * 1000)} ms.`);
    } catch (error) {
      setMessage(error?.message || 'Unable to run the pump.');
    } finally {
      setPumpPrimeBusy(false);
    }
  };

  const handleSaveRewardPulse = async () => {
    const parsedRewardPulseMs = Number(rewardPulseMs);
    if (!Number.isFinite(parsedRewardPulseMs) || parsedRewardPulseMs < 10) {
      setMessage('Enter a pump calibration value of at least 10 milliseconds.');
      return;
    }

    try {
      setRewardPulseBusy(true);
      const result = await saveRewardPulse({
        rewardPulseMilliseconds: parsedRewardPulseMs,
      });
      setMaintenanceStatus((currentStatus) => ({
        ...(currentStatus || {}),
        latestRewardPulse: result.rewardPulse,
        rewardPulseSeconds: result.rewardPulse.durationSeconds,
        activeRewardPulseMilliseconds: Math.round(result.rewardPulse.durationSeconds * 1000),
      }));
      setMessage(`Pump calibration saved at ${Math.round(result.rewardPulse.durationSeconds * 1000)} ms.`);
    } catch (error) {
      setMessage(error?.message || 'Unable to save the pump calibration.');
    } finally {
      setRewardPulseBusy(false);
    }
  };

  const handleSaveLeverDebounce = async () => {
    const parsedDebounceMs = Number(leverDebounceMs);
    if (!Number.isFinite(parsedDebounceMs) || parsedDebounceMs < 10) {
      setMessage('Enter a lever debounce of at least 10 milliseconds.');
      return;
    }

    try {
      setLeverDebounceBusy(true);
      const result = await saveLeverDebounce({
        debounceMilliseconds: parsedDebounceMs,
      });
      setMaintenanceStatus((currentStatus) => ({
        ...(currentStatus || {}),
        latestLeverDebounce: result.leverDebounce,
        activeLeverDebounceMilliseconds: Math.round(result.leverDebounce.durationSeconds * 1000),
      }));
      setMessage(`Lever debounce saved at ${Math.round(result.leverDebounce.durationSeconds * 1000)} ms.`);
    } catch (error) {
      setMessage(error?.message || 'Unable to save the lever debounce setting.');
    } finally {
      setLeverDebounceBusy(false);
    }
  };

  const handleSaveLeverReleaseRequirement = async () => {
    try {
      setLeverReleaseBusy(true);
      const result = await saveLeverReleaseRequirement({
        requireReleaseBeforeCount: Boolean(requireLeverRelease),
      });
      setMaintenanceStatus((currentStatus) => ({
        ...(currentStatus || {}),
        latestLeverReleaseRequirement: result.leverReleaseRequirement,
        activeRequireLeverReleaseBeforeCount: Boolean(requireLeverRelease),
      }));
      setMessage(
        `Lever count mode saved: ${
          requireLeverRelease ? 'release required before the next count' : 'debounce only'
        }.`
      );
    } catch (error) {
      setMessage(error?.message || 'Unable to save the lever count mode.');
    } finally {
      setLeverReleaseBusy(false);
    }
  };

  return (
    <div className="iotesting-settings">
      <h2>I/O Config</h2>
      <div className="counts">
        <div className="io-counts-header">
          <h3>Interaction Counts</h3>
          <div className="io-baseline-actions">
            <button
              type="button"
              className="counts-baseline-button"
              onClick={() => setLeverBaselineCount(counts.lever_press_count)}
            >
              Reset Lever Baseline
            </button>
            <button
              type="button"
              className="counts-baseline-button"
              onClick={() => setNosePokeBaselineCount(counts.nose_poke_count)}
            >
              Reset Nose Poke Baseline
            </button>
          </div>
        </div>
        <p className="io-baseline-note">
          These baseline buttons do not clear the real backend totals. They only reset the
          “since baseline” counters below so you can measure new lever or nose-poke activity
          from this point forward.
        </p>
        <p>Lever Presses: {counts.lever_press_count}</p>
        <p>Nose Pokes: {counts.nose_poke_count}</p>
        <p>Lever Presses Since Baseline: {leverPressesSinceBaseline}</p>
        <p>Nose Pokes Since Baseline: {nosePokesSinceBaseline}</p>
      </div>

      <p>The trial box uses one fixed stimulus light, so this I/O config page only needs one light control.</p>
      <div className="button-group">
        <button className="bluelight-button" onClick={() => handleStimulusLight('on')}>Stimulus Light On</button>
        <button className="bluelight-button" onClick={() => handleStimulusLight('off')}>Stimulus Light Off</button>
      </div>

      <div className="io-buzzer-panel">
        <h3>Buzzer Test</h3>
        <p>Use this real-time check to confirm the passive buzzer can be heard before a trial starts.</p>
        <button
          className="sound-button"
          onClick={handleTestBuzzer}
          disabled={buzzerBusy}
        >
          {buzzerBusy ? 'Playing...' : 'Play Buzzer Test'}
        </button>
      </div>

      <div className="io-prime-panel">
        <h3>Manual Run Pump</h3>
        <p>Run the pump right now for a one-off pulse in milliseconds.</p>
        <p className="io-prime-note">This is only a real-time pump check. It does not change the saved trial default.</p>
        <div className="prime-controls">
          <input
            type="number"
            min="10"
            step="10"
            value={manualPumpMs}
            onChange={(event) => setManualPumpMs(event.target.value)}
            aria-label="Manual Pump Milliseconds"
            placeholder="Manual pump ms"
          />
          <button
            type="button"
            className="prime-button"
            onClick={handlePrimePump}
            disabled={pumpPrimeBusy}
          >
            {pumpPrimeBusy ? 'Running...' : 'Run Pump Test'}
          </button>
        </div>
      </div>

      <div className="io-maintenance-panel">
        <h3>Maintenance Status</h3>
        <p>Use this panel to confirm the backend mode and review or change the current default hardware settings.</p>
        <div className="maintenance-status-grid">
          <p><strong>GPIO Mode:</strong> {maintenanceStatus?.gpioMode || '--'}</p>
          <p><strong>OLED Mode:</strong> {maintenanceStatus?.oledMode || '--'}</p>
          <p><strong>Program Healthy:</strong> {maintenanceStatus?.programOk ? 'Yes' : 'No'}</p>
          <p><strong>Running Indicator:</strong> {maintenanceStatus?.runningIndicatorOn ? 'On' : 'Off'}</p>
          <p><strong>Error Indicator:</strong> {maintenanceStatus?.errorIndicatorBlinking ? 'Blinking' : 'Off'}</p>
          <p><strong>Stimulus Light:</strong> {maintenanceStatus?.lightOn ? 'On' : 'Off'}</p>
          <p><strong>Current Pump Calibration:</strong> {maintenanceStatus?.activeRewardPulseMilliseconds || maintenanceStatus?.defaultRewardPulseMilliseconds || '--'} ms</p>
          <p><strong>Current Lever Debounce:</strong> {maintenanceStatus?.activeLeverDebounceMilliseconds || maintenanceStatus?.defaultLeverDebounceMilliseconds || '--'} ms</p>
          <p><strong>Require Lever Release:</strong> {maintenanceStatus?.activeRequireLeverReleaseBeforeCount ? 'Yes' : 'No'}</p>
        </div>

        <div className="io-calibration-panel">
          <h4>Current Default Values</h4>
          <p>
            These are the known default values the backend is using right now. They are shown here first so you can
            compare the live setting to the built-in baseline before changing anything.
          </p>
          <div className="maintenance-status-grid">
            <p><strong>Built-in Pump Calibration:</strong> {maintenanceStatus?.defaultRewardPulseMilliseconds || 30} ms</p>
            <p><strong>Active Pump Calibration:</strong> {maintenanceStatus?.activeRewardPulseMilliseconds || maintenanceStatus?.defaultRewardPulseMilliseconds || 30} ms</p>
            <p><strong>Built-in Lever Debounce:</strong> {maintenanceStatus?.defaultLeverDebounceMilliseconds || 150} ms</p>
            <p><strong>Active Lever Debounce:</strong> {maintenanceStatus?.activeLeverDebounceMilliseconds || maintenanceStatus?.defaultLeverDebounceMilliseconds || 150} ms</p>
            <p><strong>Built-in Lever Count Mode:</strong> {maintenanceStatus?.defaultRequireLeverReleaseBeforeCount ? 'Release required' : 'Debounce only'}</p>
            <p><strong>Active Lever Count Mode:</strong> {maintenanceStatus?.activeRequireLeverReleaseBeforeCount ? 'Release required' : 'Debounce only'}</p>
          </div>
        </div>

        <div className="io-calibration-panel">
          <h4>Pump Calibration</h4>
          <p>
            This is the saved default water pulse used during trials. It starts at the current value so you can adjust
            it from the known-good setting instead of re-entering it from scratch.
          </p>
          <div className="calibration-controls">
            <input
              type="number"
              min="10"
              step="10"
              value={rewardPulseMs}
              onChange={(event) => setRewardPulseMs(event.target.value)}
              aria-label="Pump Calibration Milliseconds"
              placeholder="Pump calibration ms"
            />
            <button
              type="button"
              className="prime-button"
              onClick={handleSaveRewardPulse}
              disabled={rewardPulseBusy}
            >
              {rewardPulseBusy ? 'Saving...' : 'Save Pump Calibration'}
            </button>
          </div>
          {maintenanceStatus?.latestRewardPulse ? (
            <p className="calibration-summary">
              Current saved default: {Math.round(maintenanceStatus.latestRewardPulse.durationSeconds * 1000)} ms
            </p>
          ) : (
            <p className="calibration-summary">
              No saved pump calibration yet. The backend is using the built-in {maintenanceStatus?.defaultRewardPulseMilliseconds || 30} ms default.
            </p>
          )}
        </div>

        <div className="io-debounce-panel">
          <h4>Lever Input Settings</h4>
          <p>
            Use this when the rat can trigger the lever more than once on a single hit. Start a new lever check,
            press the physical lever, and watch how many presses are counted above. Increase debounce if a single hit
            is being counted multiple times.
          </p>
          <p>
            Debounce filters very fast electrical bounce. Requiring a release is stricter: after one count, the lever
            must come back up before the next press can count.
          </p>
          <div className="calibration-controls">
            <input
              type="number"
              min="10"
              step="10"
              value={leverDebounceMs}
              onChange={(event) => setLeverDebounceMs(event.target.value)}
              aria-label="Lever Debounce Milliseconds"
              placeholder="Lever debounce ms"
            />
            <button
              type="button"
              className="prime-button"
              onClick={handleSaveLeverDebounce}
              disabled={leverDebounceBusy}
            >
              {leverDebounceBusy ? 'Saving...' : 'Save Lever Debounce'}
            </button>
          </div>
          {maintenanceStatus?.latestLeverDebounce ? (
            <p className="calibration-summary">
              Current saved default: {Math.round(maintenanceStatus.latestLeverDebounce.durationSeconds * 1000)} ms
            </p>
          ) : (
            <p className="calibration-summary">
              No saved lever debounce yet. The backend is using {maintenanceStatus?.defaultLeverDebounceMilliseconds || 150} ms by default.
            </p>
          )}
          <div className="calibration-controls">
            <label className="io-checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(requireLeverRelease)}
                onChange={(event) => setRequireLeverRelease(event.target.checked)}
              />
              Require lever release before a new count
            </label>
            <button
              type="button"
              className="prime-button"
              onClick={handleSaveLeverReleaseRequirement}
              disabled={leverReleaseBusy}
            >
              {leverReleaseBusy ? 'Saving...' : 'Save Lever Count Mode'}
            </button>
          </div>
          {maintenanceStatus?.latestLeverReleaseRequirement ? (
            <p className="calibration-summary">
              Current saved default:{' '}
              {maintenanceStatus.latestLeverReleaseRequirement.durationSeconds >= 0.5
                ? 'Release required'
                : 'Debounce only'}
            </p>
          ) : (
            <p className="calibration-summary">
              No saved lever count mode yet. The backend is using{' '}
              {maintenanceStatus?.defaultRequireLeverReleaseBeforeCount
                ? 'Release required'
                : 'Debounce only'}{' '}
              by default.
            </p>
          )}
        </div>
      </div>

      {message && <p>{message}</p>}
    </div>
  );
};

export default IoTestingGrid;
