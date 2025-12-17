import axios from 'axios';

const API_URL = 'http://192.168.1.102:5001'; // Replace if backend's URL changes

// IO Testing
export const getCounts = async () => {
  try {
    const response = await axios.get(`${API_URL}/counts`);
    return response.data;
  } catch (error) {
    console.error("Error getting counts:", error);
    throw error;
  }
};

export const setBlueLight = async (action) => {
  try {
    const response = await axios.post(`${API_URL}/light/blue`, { action });
    return response.data;
  } catch (error) {
    console.error("Error controlling blue LED:", error);
    throw error;
  }
};

export const setOrangeLight = async (action) => {
  try {
    const response = await axios.post(`${API_URL}/light/orange`, { action });
    return response.data;
  } catch (error) {
    console.error("Error controlling orange LED:", error);
    throw error;
  }
};

export const setRGBLight = async (red, green, blue) => {
  try {
    const response = await axios.post(`${API_URL}/light/rgb`, { red, green, blue });
    return response.data;
  } catch (error) {
    console.error("Error controlling RGB LED:", error);
    throw error;
  }
};

// Test Management
export const runTest = async (testSettings) => {
  try {
    const response = await axios.post(`${API_URL}/test/run`, testSettings);
    return response.data;
  } catch (error) {
    console.error("Error starting test:", error);
    throw error;
  }
};

export const stopTest = async () => {
  try {
    const response = await axios.post(`${API_URL}/test/stop`);
    return response.data;
  } catch (error) {
    console.error("Error stopping test:", error);
    throw error;
  }
};

// export const savePreset = async (presetData) => {
//   try {
//     const response = await axios.post(`${API_URL}/preset/save`, presetData);
//     return response.data;
//   } catch (error) {
//     console.error("Error saving preset:", error);
//     throw error;
//   }
// };

// export const getAllPresets = async () => {
//   try {
//     const response = await axios.get(`${API_URL}/preset/all`);
//     return response.data;
//   } catch (error) {
//     console.error("Error fetching presets:", error);
//     throw error;
//   }
// };

// export const deletePreset = async (presetName) => {
//   try {
//     const response = await axios.delete(`${API_URL}/preset/${presetName}`);
//     return response.data;
//   } catch (error) {
//     console.error("Error deleting preset:", error);
//     throw error;
//   }
// };


/*

// Start of placeholding to replace with actual python api calls when done for these
const triggerAction = async (action) => {
  try {
    const response = await axios.post(`${API_URL}/test_io`, { action });
    return response.data;
  } catch (error) {
    console.error(`${action} activation failed:`, error);
    throw error;
  }
};

export const activateSound = () => triggerAction('sound');
export const activateFeed = () => triggerAction('feed');
export const activateWater = () => triggerAction('water');
// End of what we should change

// DATA DOWNLOADING
// Function to push data (e.g., test results) to the backend
export const pushData = async (data) => {
  try {
    const response = await axios.post(`${API_URL}/push_data`, data, { withCredentials: true });
    return response.data;
  } catch (error) {
    console.error("Error pushing data:", error);
    throw error;
  }
};

// Function to pull data from the backend using query parameters
// Option 1: Using URL path parameters (if you update your endpoint as shown above)
export const pullData = async (table, condition) => {
  try {
    const response = await axios.get(`${API_URL}/pull_data/${table}/${encodeURIComponent(condition)}`);
    return response.data;
  } catch (error) {
    console.error("Error pulling data:", error);
    throw error;
  }
};

// Fetch list of log files
export const getLogFiles = async () => {
  try {
    const response = await axios.get(`${API_URL}/log-viewer`);
    return response.data; // Expect a list of log file names
  } catch (error) {
    console.error('Error fetching log files:', error);
    throw error;
  }
};

// Download raw log file
export const downloadRawLog = async (filename) => {
  try {
    const response = await axios.get(`${API_URL}/download-raw-log/${filename}`, {
      responseType: 'blob', // Ensure file download works correctly
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
  } catch (error) {
    console.error('Error downloading raw log:', error);
    throw error;
  }
};

// Download Excel log file
export const downloadExcelLog = async (filename) => {
  try {
    const response = await axios.get(`${API_URL}/download-excel-log/${filename}`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `${filename.replace('.csv', '.xlsx')}` // Ensure correct extension
    );
    document.body.appendChild(link);
    link.click();
  } catch (error) {
    console.error('Error downloading Excel log:', error);
    throw error;
  }
};

// View log file content in a readable format
export const viewLog = async (filename) => {
  try {
    const response = await axios.get(`${API_URL}/view-log/${filename}`);
    return response.data; // Expect log content in table-compatible format
  } catch (error) {
    console.error('Error viewing log:', error);
    throw error;
  }
};

*/