import React, { useState, useEffect } from 'react';
import { getCounts, setBlueLight, setOrangeLight, setRGBLight } from '../../utilities/api';
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

  const handleBlue = async (action) => {
    try {
      const result = await setBlueLight(action);
      setMessage(`Blue LED turned ${result.blue}`);
    } catch (error) {
      setMessage("Failed to control blue LED");
    }
  };

  const handleOrange = async (action) => {
    try {
      const result = await setOrangeLight(action);
      setMessage(`Orange LED turned ${result.orange}`);
    } catch (error) {
      setMessage("Failed to control orange LED");
    }
  };

  const handleRGB = async (red, green, blue) => {
    try {
      const result = await setRGBLight(red, green, blue);
      setMessage(`RGB LED set to R:${result.rgb.red} G:${result.rgb.green} B:${result.rgb.blue}`);
    } catch (error) {
      setMessage("Failed to control RGB LED");
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
      <div className="button-group">
        <button className='bluelight-button' onClick={() => handleBlue('on')}>Blue LED On</button>
        <button className='bluelight-button' onClick={() => handleBlue('off')}>Blue LED Off</button>
        <button className='orangelight-button' onClick={() => handleOrange('on')}>Orange LED On</button>
        <button className='orangelight-button' onClick={() => handleOrange('off')}>Orange LED Off</button>
      </div>
      <div className="button-group">
        <button className='redlight-button' onClick={() => handleRGB('on', 'off', 'off')}>RGB Red On</button>
        <button className='greenlight-button' onClick={() => handleRGB('off', 'on', 'off')}>RGB Green On</button>
        <button className='bluelight-button' onClick={() => handleRGB('off', 'off', 'on')}>RGB Blue On</button>
        <button className='rgblight-button' onClick={() => handleRGB('off', 'off', 'off')}>RGB Off</button>
      </div>
      {message && <p>{message}</p>}
    </div>
  );
};

export default IoTestingGrid;