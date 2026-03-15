import React, { useState, useEffect } from 'react';
import { getCounts, primePump, setBlueLight, testBuzzer } from '../../utilities/api';
import './IoTestingGrid.css';

const IoTestingGrid = () => {
  const [counts, setCounts] = useState({ lever_press_count: 0, nose_poke_count: 0 });
  const [message, setMessage] = useState("");
  const [pumpPrimeSeconds, setPumpPrimeSeconds] = useState("1");
  const [pumpPrimeBusy, setPumpPrimeBusy] = useState(false);
  const [buzzerBusy, setBuzzerBusy] = useState(false);

  // Poll counts every 0.1 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await getCounts();
        setCounts(data);
      } catch (error) {
        console.error("Error fetching counts:", error);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleStimulusLight = async (action) => {
    try {
      const result = await setBlueLight(action);
      setMessage(`Stimulus light turned ${result.blue}`);
    } catch (error) {
      setMessage('Failed to control the stimulus light');
    }
  };

  const handlePrimePump = async () => {
    const parsedSeconds = Number(pumpPrimeSeconds);
    if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0) {
      setMessage('Enter a pump-prime duration greater than zero seconds.');
      return;
    }

    try {
      setPumpPrimeBusy(true);
      const result = await primePump(parsedSeconds);
      setMessage(`Pump primed for ${result.durationSeconds} second${result.durationSeconds === 1 ? '' : 's'}.`);
    } catch (error) {
      setMessage(error?.message || 'Unable to prime the pump.');
    } finally {
      setPumpPrimeBusy(false);
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

  return (
    <div className="iotesting-settings">
      <h2>I/O Testing</h2>
      <div className="counts">
        <h3>Interaction Counts</h3>
        <p>Lever Presses: {counts.lever_press_count}</p>
        <p>Nose Pokes: {counts.nose_poke_count}</p>
      </div>
      <p>The trial box uses one fixed stimulus light, so the I/O test only needs one light control.</p>
      <div className="button-group">
        <button className='bluelight-button' onClick={() => handleStimulusLight('on')}>Stimulus Light On</button>
        <button className='bluelight-button' onClick={() => handleStimulusLight('off')}>Stimulus Light Off</button>
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
        <h3>Manual Pump Prime</h3>
        <p>Use this real-time control before a trial to fill the water line.</p>
        <p className="io-prime-note">This does not start, queue, or change a test. It only runs the pump right now.</p>
        <div className="prime-controls">
          <input
            type="number"
            min="0"
            step="0.1"
            value={pumpPrimeSeconds}
            onChange={(event) => setPumpPrimeSeconds(event.target.value)}
            aria-label="Prime Duration Seconds"
          />
          <button
            className="prime-button"
            onClick={handlePrimePump}
            disabled={pumpPrimeBusy}
          >
            {pumpPrimeBusy ? 'Priming...' : 'Prime Now'}
          </button>
        </div>
      </div>
      {message && <p>{message}</p>}
    </div>
  );
};

export default IoTestingGrid;
