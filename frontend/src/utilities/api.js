import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
const AUTH_TOKEN_STORAGE_KEY = 'skinnerbox.authToken';
const AUTH_USER_STORAGE_KEY = 'skinnerbox.authUser';
export const AUTH_INVALID_EVENT_NAME = 'skinnerbox-auth-invalid';

const getSessionStorage = () => window.sessionStorage;
const getLegacyLocalStorage = () => window.localStorage;

const migrateLegacyAuthStorageIfNeeded = () => {
  const sessionStorage = getSessionStorage();
  if (sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || sessionStorage.getItem(AUTH_USER_STORAGE_KEY)) {
    return;
  }

  const legacyStorage = getLegacyLocalStorage();
  const legacyToken = legacyStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  const legacyUser = legacyStorage.getItem(AUTH_USER_STORAGE_KEY);

  if (legacyToken) {
    sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, legacyToken);
    legacyStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }

  if (legacyUser) {
    sessionStorage.setItem(AUTH_USER_STORAGE_KEY, legacyUser);
    legacyStorage.removeItem(AUTH_USER_STORAGE_KEY);
  }
};

// Shared axios client so every request uses the same base URL and auth behavior.
const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Attach the saved bearer token to every authenticated API request automatically.
apiClient.interceptors.request.use((config) => {
  const token = getStoredAuthToken();
  if (!token) {
    return config;
  }

  return {
    ...config,
    headers: {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    },
  };
});

const AUTH_FAILURE_CODES = new Set([
  'AUTH_REQUIRED',
  'INVALID_AUTH_TOKEN',
  'AUTH_TOKEN_REVOKED',
  'AUTH_TOKEN_EXPIRED',
  'ACCOUNT_DISABLED',
]);

const notifyAuthInvalid = () => {
  window.dispatchEvent(new Event(AUTH_INVALID_EVENT_NAME));
};

const maybeDispatchAuthInvalid = (normalizedError) => {
  if (AUTH_FAILURE_CODES.has(normalizedError.code)) {
    notifyAuthInvalid();
  }
};

export const getStoredAuthToken = () => {
  migrateLegacyAuthStorageIfNeeded();
  return getSessionStorage().getItem(AUTH_TOKEN_STORAGE_KEY) || '';
};

export const getStoredAuthUser = () => {
  migrateLegacyAuthStorageIfNeeded();
  const rawUser = getSessionStorage().getItem(AUTH_USER_STORAGE_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser);
  } catch (error) {
    clearAuthSession();
    return null;
  }
};

export const storeAuthSession = ({ token, user }) => {
  const sessionStorage = getSessionStorage();
  sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  getLegacyLocalStorage().removeItem(AUTH_TOKEN_STORAGE_KEY);
  getLegacyLocalStorage().removeItem(AUTH_USER_STORAGE_KEY);
};

export const clearAuthSession = () => {
  getSessionStorage().removeItem(AUTH_TOKEN_STORAGE_KEY);
  getSessionStorage().removeItem(AUTH_USER_STORAGE_KEY);
  getLegacyLocalStorage().removeItem(AUTH_TOKEN_STORAGE_KEY);
  getLegacyLocalStorage().removeItem(AUTH_USER_STORAGE_KEY);
};

const normalizeApiError = (error, fallbackCode, fallbackMessage) => {
  const backendError = error?.response?.data?.error;

  return {
    code: backendError?.code || fallbackCode,
    message: backendError?.message || fallbackMessage,
    details: backendError?.details || null,
    status: error?.response?.status || 500,
  };
};

const rethrowNormalizedError = (error, fallbackCode, fallbackMessage) => {
  const normalizedError = normalizeApiError(error, fallbackCode, fallbackMessage);
  maybeDispatchAuthInvalid(normalizedError);
  throw normalizedError;
};

export const registerUser = async ({ email, password, displayName }) => {
  try {
    const response = await apiClient.post('/api/auth/register', {
      email,
      password,
      displayName,
    });
    return response.data;
  } catch (error) {
    console.error('Error registering user:', error);
    rethrowNormalizedError(error, 'REGISTER_ERROR', 'Unable to submit the registration request.');
  }
};

export const loginUser = async ({ email, password }) => {
  try {
    const response = await apiClient.post('/api/auth/login', { email, password });
    return response.data;
  } catch (error) {
    console.error('Error logging in:', error);
    rethrowNormalizedError(error, 'LOGIN_ERROR', 'Unable to sign in.');
  }
};

export const logoutUser = async () => {
  try {
    const response = await apiClient.post('/api/auth/logout');
    return response.data;
  } catch (error) {
    console.error('Error logging out:', error);
    rethrowNormalizedError(error, 'LOGOUT_ERROR', 'Unable to sign out cleanly.');
  }
};

export const getCurrentUser = async () => {
  try {
    const response = await apiClient.get('/api/auth/me');
    return response.data;
  } catch (error) {
    console.error('Error restoring current user:', error);
    rethrowNormalizedError(error, 'AUTH_LOOKUP_ERROR', 'Unable to restore the current session.');
  }
};

export const getAdminUsers = async () => {
  try {
    const response = await apiClient.get('/api/auth/admin/users');
    return response.data;
  } catch (error) {
    console.error('Error loading admin users:', error);
    rethrowNormalizedError(error, 'USER_LIST_ERROR', 'Unable to load registered users.');
  }
};

export const updateAdminUserStatus = async (userId, status) => {
  try {
    const response = await apiClient.post(`/api/auth/admin/users/${userId}/status`, { status });
    return response.data;
  } catch (error) {
    console.error('Error updating user status:', error);
    rethrowNormalizedError(error, 'USER_STATUS_UPDATE_ERROR', 'Unable to update the selected user.');
  }
};

export const resetAdminUserPassword = async (userId, password) => {
  try {
    const response = await apiClient.post(`/api/auth/admin/users/${userId}/password`, { password });
    return response.data;
  } catch (error) {
    console.error('Error resetting user password:', error);
    rethrowNormalizedError(error, 'PASSWORD_RESET_ERROR', 'Unable to reset the selected user password.');
  }
};

export const getPresets = async () => {
  try {
    const response = await apiClient.get('/api/presets');
    return response.data;
  } catch (error) {
    console.error('Error loading presets:', error);
    rethrowNormalizedError(error, 'PRESET_LIST_ERROR', 'Unable to load saved presets.');
  }
};

export const savePreset = async (preset) => {
  try {
    const response = await apiClient.post('/api/presets', preset);
    return response.data;
  } catch (error) {
    console.error('Error saving preset:', error);
    rethrowNormalizedError(error, 'PRESET_SAVE_ERROR', 'Unable to save the selected preset.');
  }
};

export const deletePreset = async (presetId) => {
  try {
    const response = await apiClient.delete(`/api/presets/${encodeURIComponent(presetId)}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting preset:', error);
    rethrowNormalizedError(error, 'PRESET_DELETE_ERROR', 'Unable to delete the selected preset.');
  }
};

// IO Testing
export const getCounts = async () => {
  try {
    const response = await apiClient.get('/api/counts');
    return response.data;
  } catch (error) {
    console.error('Error getting counts:', error);
    rethrowNormalizedError(error, 'COUNTS_FETCH_ERROR', 'Unable to fetch the current test counts.');
  }
};

export const setBlueLight = async (action) => {
  try {
    const response = await apiClient.post('/api/light/blue', { action });
    return response.data;
  } catch (error) {
    console.error('Error controlling blue LED:', error);
    rethrowNormalizedError(error, 'BLUE_LIGHT_ERROR', 'Unable to control the blue light.');
  }
};

export const setOrangeLight = async (action) => {
  try {
    const response = await apiClient.post('/api/light/orange', { action });
    return response.data;
  } catch (error) {
    console.error('Error controlling orange LED:', error);
    rethrowNormalizedError(error, 'ORANGE_LIGHT_ERROR', 'Unable to control the orange light.');
  }
};

export const setRGBLight = async (red, green, blue) => {
  try {
    const response = await apiClient.post('/api/light/rgb', { red, green, blue });
    return response.data;
  } catch (error) {
    console.error('Error controlling RGB LED:', error);
    rethrowNormalizedError(error, 'RGB_LIGHT_ERROR', 'Unable to control the RGB light.');
  }
};

export const primePump = async (durationSeconds) => {
  try {
    const response = await apiClient.post('/api/pump/prime', { durationSeconds });
    return response.data;
  } catch (error) {
    console.error('Error priming water pump:', error);
    rethrowNormalizedError(error, 'PUMP_PRIME_ERROR', 'Unable to prime the water pump.');
  }
};

export const testBuzzer = async () => {
  try {
    const response = await apiClient.post('/api/buzzer/test');
    return response.data;
  } catch (error) {
    console.error('Error testing buzzer:', error);
    rethrowNormalizedError(error, 'BUZZER_TEST_ERROR', 'Unable to play the buzzer test.');
  }
};

// Test Management
export const runTest = async (testSettings) => {
  try {
    const response = await apiClient.post('/api/test/run', testSettings);
    return response.data;
  } catch (error) {
    console.error('Error starting test:', error);
    rethrowNormalizedError(error, 'TEST_START_ERROR', 'Unable to start the test.');
  }
};

export const stopTest = async () => {
  try {
    const response = await apiClient.post('/api/test/stop');
    return response.data;
  } catch (error) {
    console.error('Error stopping test:', error);
    rethrowNormalizedError(error, 'TEST_STOP_ERROR', 'Unable to stop the test.');
  }
};

export const finishTest = async () => {
  try {
    const response = await apiClient.post('/api/test/finish');
    return response.data;
  } catch (error) {
    console.error('Error finishing test:', error);
    rethrowNormalizedError(error, 'TEST_FINISH_ERROR', 'Unable to finish the test.');
  }
};

export const getResults = async () => {
  try {
    const response = await apiClient.get('/api/results');
    return response.data;
  } catch (error) {
    console.error('Error getting saved results:', error);
    rethrowNormalizedError(error, 'RESULTS_FETCH_ERROR', 'Unable to fetch saved test results.');
  }
};

export const deleteResult = async (resultId) => {
  try {
    const response = await apiClient.delete(`/api/results/${encodeURIComponent(resultId)}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting saved result:', error);
    rethrowNormalizedError(error, 'RESULT_DELETE_ERROR', 'Unable to delete the selected saved trial.');
  }
};

export const getTestInformation = async (testSettings) => {
  try {
    const response = await apiClient.post('/api/test/information', testSettings);
    return response.data;
  } catch (error) {
    console.error('Error getting test information:', error);
    rethrowNormalizedError(error, 'TEST_CONFIGURATION_ERROR', 'Unable to save the current test configuration.');
  }
};

export const getTestStatus = async () => {
  try {
    const response = await apiClient.get('/api/test/status');
    return response.data;
  } catch (error) {
    console.error('Error getting test status:', error);
    rethrowNormalizedError(error, 'TEST_STATUS_ERROR', 'Unable to fetch the current test status.');
  }
};
