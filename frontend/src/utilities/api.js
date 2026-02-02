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


// TODO: Added function to pull the information from the test manager. 
export const getTestInformation = async (testSettings) => {
  try{
    const response = await axios.post(`${API_URL}/test/information`, testSettings);
    return response.data;
  }catch (error){
    console.error("Error Getting Information:", error);
    throw error; 
  }
}

