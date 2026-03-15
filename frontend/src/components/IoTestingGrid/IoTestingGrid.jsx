import React, { useState, useEffect } from 'react';
import { getCounts, setBlueLight } from '../../utilities/api';
import './IoTestingGrid.css';

const IoTestingGrid = () => {
  const [counts, setCounts] = useState({ lever_press_count: 0, nose_poke_count: 0 });
  const [message, setMessage] = useState("");

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
      {message && <p>{message}</p>}
    </div>
  );
};

export default IoTestingGrid;
