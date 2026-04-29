import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
const AUTH_USER_STORAGE_KEY = 'skinnerbox.authUser';
export const AUTH_INVALID_EVENT_NAME = 'skinnerbox-auth-invalid';

const getSessionStorage = () => window.sessionStorage;
const getLegacyLocalStorage = () => window.localStorage;

const migrateLegacyAuthStorageIfNeeded = () => {
  const sessionStorage = getSessionStorage();
  if (sessionStorage.getItem(AUTH_USER_STORAGE_KEY)) {
    return;
  }

  const legacyStorage = getLegacyLocalStorage();
  const legacyUser = legacyStorage.getItem(AUTH_USER_STORAGE_KEY);

  if (legacyUser) {
    sessionStorage.setItem(AUTH_USER_STORAGE_KEY, legacyUser);
    legacyStorage.removeItem(AUTH_USER_STORAGE_KEY);
  }

  sessionStorage.removeItem('skinnerbox.authToken');
  legacyStorage.removeItem('skinnerbox.authToken');
};

// Shared axios client so every request uses the same base URL and auth behavior.
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
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

export const storeAuthSession = ({ user }) => {
  const sessionStorage = getSessionStorage();
  if (user) {
    sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
  }
  getLegacyLocalStorage().removeItem(AUTH_USER_STORAGE_KEY);
  sessionStorage.removeItem('skinnerbox.authToken');
  getLegacyLocalStorage().removeItem('skinnerbox.authToken');
};

export const clearAuthSession = () => {
  getSessionStorage().removeItem(AUTH_USER_STORAGE_KEY);
  getSessionStorage().removeItem('skinnerbox.authToken');
  getLegacyLocalStorage().removeItem(AUTH_USER_STORAGE_KEY);
  getLegacyLocalStorage().removeItem('skinnerbox.authToken');
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

export const deleteAdminUser = async (userId) => {
  try {
    const response = await apiClient.delete(`/api/auth/admin/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting user account:', error);
    rethrowNormalizedError(error, 'USER_DELETE_ERROR', 'Unable to delete the selected user account.');
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

export const setStimulusLight = async (action, lightColor) => {
  try {
    const response = await apiClient.post('/api/light/stimulus', { action, lightColor });
    return response.data;
  } catch (error) {
    console.error('Error controlling stimulus light:', error);
    rethrowNormalizedError(error, 'STIMULUS_LIGHT_ERROR', 'Unable to control the stimulus light.');
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

export const primePump = async (durationMilliseconds) => {
  try {
    const response = await apiClient.post('/api/pump/prime', {
      durationSeconds: Number(durationMilliseconds) / 1000,
    });
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

export const getMaintenanceStatus = async () => {
  try {
    const response = await apiClient.get('/api/maintenance/status');
    return response.data;
  } catch (error) {
    console.error('Error loading maintenance status:', error);
    rethrowNormalizedError(error, 'MAINTENANCE_STATUS_ERROR', 'Unable to load the maintenance status.');
  }
};

export const getCameraStatus = async () => {
  try {
    const response = await apiClient.get('/api/camera/status');
    return response.data;
  } catch (error) {
    console.error('Error loading camera status:', error);
    rethrowNormalizedError(error, 'CAMERA_STATUS_ERROR', 'Unable to load the optional camera preview status.');
  }
};

export const buildCameraFrameUrl = (cacheBust = Date.now()) => {
  const framePath = `/api/camera/frame?ts=${encodeURIComponent(String(cacheBust))}`;
  return API_BASE_URL ? `${API_BASE_URL}${framePath}` : framePath;
};

export const buildResultSnapshotUrl = (resultId, cacheBust = Date.now()) => {
  const normalizedResultId = encodeURIComponent(String(resultId ?? "").trim());
  const snapshotPath = `/api/results/${normalizedResultId}/snapshot?ts=${encodeURIComponent(String(cacheBust))}`;
  return API_BASE_URL ? `${API_BASE_URL}${snapshotPath}` : snapshotPath;
};

export const savePumpCalibration = async ({ durationMilliseconds, measuredVolumeMl }) => {
  try {
    const response = await apiClient.post('/api/maintenance/pump-calibration', {
      durationSeconds: Number(durationMilliseconds) / 1000,
      measuredVolumeMl,
    });
    return response.data;
  } catch (error) {
    console.error('Error saving pump calibration:', error);
    rethrowNormalizedError(error, 'CALIBRATION_SAVE_ERROR', 'Unable to save the pump calibration.');
  }
};

export const saveLeverDebounce = async ({ debounceMilliseconds }) => {
  try {
    const response = await apiClient.post('/api/maintenance/lever-debounce', {
      debounceMilliseconds,
    });
    return response.data;
  } catch (error) {
    console.error('Error saving lever debounce:', error);
    rethrowNormalizedError(error, 'LEVER_DEBOUNCE_SAVE_ERROR', 'Unable to save the lever debounce setting.');
  }
};

export const saveLeverReleaseRequirement = async ({ requireReleaseBeforeCount }) => {
  try {
    const response = await apiClient.post('/api/maintenance/lever-release-requirement', {
      requireReleaseBeforeCount,
    });
    return response.data;
  } catch (error) {
    console.error('Error saving lever count mode:', error);
    rethrowNormalizedError(
      error,
      'LEVER_RELEASE_REQUIREMENT_SAVE_ERROR',
      'Unable to save the lever count mode.'
    );
  }
};

export const saveStimulusBuzzerMode = async ({ stimulusBuzzerMode }) => {
  try {
    const response = await apiClient.post('/api/maintenance/stimulus-buzzer-mode', {
      stimulusBuzzerMode,
    });
    return response.data;
  } catch (error) {
    console.error('Error saving trial buzzer output:', error);
    rethrowNormalizedError(
      error,
      'STIMULUS_BUZZER_MODE_SAVE_ERROR',
      'Unable to save the trial buzzer output.'
    );
  }
};

export const saveRewardPulse = async ({ rewardPulseMilliseconds }) => {
  try {
    const response = await apiClient.post('/api/maintenance/reward-pulse', {
      rewardPulseMilliseconds,
    });
    return response.data;
  } catch (error) {
    console.error('Error saving automatic reward pulse:', error);
    rethrowNormalizedError(error, 'REWARD_PULSE_SAVE_ERROR', 'Unable to save the automatic reward pulse.');
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

export const addTestNote = async (noteText) => {
  try {
    const response = await apiClient.post('/api/test/note', { noteText });
    return response.data;
  } catch (error) {
    console.error('Error saving trial note:', error);
    rethrowNormalizedError(error, 'NOTE_SAVE_ERROR', 'Unable to save the operator note.');
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

const deleteResultsIndividually = async (resultIds) => {
  const normalizedIds = [...new Set(
    (Array.isArray(resultIds) ? resultIds : [])
      .map((resultId) => String(resultId || '').trim())
      .filter(Boolean)
  )];

  const settledResults = await Promise.all(
    normalizedIds.map(async (resultId) => {
      try {
        await apiClient.delete(`/api/results/${encodeURIComponent(resultId)}`);
        return { resultId, outcome: 'deleted' };
      } catch (error) {
        const normalizedError = normalizeApiError(
          error,
          'RESULT_DELETE_ERROR',
          'Unable to delete the selected saved trial.'
        );
        maybeDispatchAuthInvalid(normalizedError);

        if (normalizedError.status === 404 || normalizedError.code === 'RESULT_NOT_FOUND') {
          return { resultId, outcome: 'missing' };
        }

        return {
          resultId,
          outcome: 'failed',
          error: normalizedError,
        };
      }
    })
  );

  const deletedIds = settledResults
    .filter((result) => result.outcome === 'deleted')
    .map((result) => result.resultId);
  const missingIds = settledResults
    .filter((result) => result.outcome === 'missing')
    .map((result) => result.resultId);
  const failedIds = settledResults
    .filter((result) => result.outcome === 'failed')
    .map((result) => result.resultId);
  const firstFailure = settledResults.find((result) => result.outcome === 'failed');

  if (!deletedIds.length && !missingIds.length && firstFailure?.error) {
    throw firstFailure.error;
  }

  return {
    message: (
      `Deleted ${deletedIds.length} saved trial${deletedIds.length === 1 ? '' : 's'}`
      + (missingIds.length ? `. ${missingIds.length} already missing.` : '')
      + (failedIds.length ? ` ${failedIds.length} could not be deleted.` : '')
    ),
    deletedIds,
    missingIds,
    failedIds,
    deletedCount: deletedIds.length,
    fallbackUsed: true,
  };
};

export const deleteResults = async (resultIds) => {
  try {
    const response = await apiClient.post('/api/results/delete-batch', {
      resultIds,
    });
    return response.data;
  } catch (error) {
    const normalizedError = normalizeApiError(
      error,
      'RESULT_BATCH_DELETE_ERROR',
      'Unable to delete the selected saved trials.'
    );
    console.error('Error deleting saved results:', error);

    if (AUTH_FAILURE_CODES.has(normalizedError.code)) {
      maybeDispatchAuthInvalid(normalizedError);
      throw normalizedError;
    }

    return deleteResultsIndividually(resultIds);
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
