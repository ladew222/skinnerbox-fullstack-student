import {
  deletePreset as deletePresetApi,
  getPresets as getPresetsApi,
  savePreset as savePresetApi,
  getStoredAuthUser,
} from './api';

const LEGACY_PRESET_STORAGE_KEY = 'userPresets';
const LEGACY_PRESET_STORAGE_PREFIX = 'skinnerbox.userPresets';
const PRESET_MIGRATION_PREFIX = 'skinnerbox.presetMigration';
export const PRESET_STORAGE_EVENT = 'skinnerbox-presets-updated';
export const DEFAULT_END_CHIME_PATTERN = '523:0.12,659:0.12,784:0.24';


const slugify = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `preset-${Date.now()}`;
};


const dispatchPresetUpdate = () => {
  window.dispatchEvent(new Event(PRESET_STORAGE_EVENT));
};


const getCurrentUserEmail = () => {
  try {
    const parsedUser = getStoredAuthUser();
    return String(parsedUser?.email || '').trim().toLowerCase();
  } catch (error) {
    return '';
  }
};


const getLegacyPresetStorageKeys = () => {
  const email = getCurrentUserEmail();
  if (!email) {
    return [LEGACY_PRESET_STORAGE_KEY, LEGACY_PRESET_STORAGE_PREFIX];
  }

  return [`${LEGACY_PRESET_STORAGE_PREFIX}.${email}`, LEGACY_PRESET_STORAGE_KEY];
};


const getMigrationSessionKey = () => {
  const email = getCurrentUserEmail() || 'anonymous';
  return `${PRESET_MIGRATION_PREFIX}.${email}`;
};


const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
};


const normalizePreset = (preset) => {
  const presetName = String(preset?.name || '').trim();
  const stimulusType = String(preset?.stimulusType || 'Light').trim() || 'Light';
  const isTonePreset = stimulusType.toLowerCase() === 'tone';

  return {
    id: String(preset?.id || slugify(presetName)),
    name: presetName,
    description: String(preset?.description || '').trim(),
    testName: String(preset?.testName || '').trim(),
    subjectID: String(preset?.subjectID ?? '').trim(),
    trialDuration: String(preset?.trialDuration ?? '').trim(),
    goalForTrial: String(preset?.goalForTrial ?? '').trim(),
    goalForTest: String(preset?.goalForTest ?? '').trim(),
    RewaStimTime: String(preset?.RewaStimTime ?? '').trim(),
    StimTimeOn: String(preset?.StimTimeOn ?? '').trim(),
    cooldown: String(preset?.cooldown ?? '').trim(),
    rewardType: String(preset?.rewardType || 'Water').trim() || 'Water',
    interactionType: String(preset?.interactionType || 'Lever').trim() || 'Lever',
    stimulusType,
    lightColor: isTonePreset
      ? 'N/A'
      : String(preset?.lightColor || 'Box Light').trim() || 'Box Light',
    endChimeEnabled: normalizeBoolean(preset?.endChimeEnabled, false),
    endChimePattern: String(preset?.endChimePattern || DEFAULT_END_CHIME_PATTERN).trim()
      || DEFAULT_END_CHIME_PATTERN,
    createdAt: preset?.createdAt || new Date().toISOString(),
    updatedAt: preset?.updatedAt || new Date().toISOString(),
  };
};


const readLegacyPresets = () => {
  const presetsById = new Map();

  for (const key of getLegacyPresetStorageKeys()) {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) {
      continue;
    }

    try {
      const parsedPresets = JSON.parse(rawValue);
      if (!Array.isArray(parsedPresets)) {
        continue;
      }

      parsedPresets
        .map(normalizePreset)
        .filter((preset) => preset.name)
        .forEach((preset) => {
          presetsById.set(preset.id, preset);
        });
    } catch (error) {
      // Ignore malformed legacy localStorage values and continue with the backend source of truth.
    }
  }

  return Array.from(presetsById.values());
};


const migrateLegacyPresetsIfNeeded = async () => {
  const migrationSessionKey = getMigrationSessionKey();
  if (sessionStorage.getItem(migrationSessionKey) === 'done') {
    return;
  }

  const legacyPresets = readLegacyPresets();
  if (!legacyPresets.length) {
    sessionStorage.setItem(migrationSessionKey, 'done');
    return;
  }

  for (const legacyPreset of legacyPresets) {
    try {
      await savePresetApi(legacyPreset);
    } catch (error) {
      // Skip malformed legacy presets instead of blocking the rest of the list.
    }
  }

  sessionStorage.setItem(migrationSessionKey, 'done');
};


export const loadUserPresets = async () => {
  await migrateLegacyPresetsIfNeeded();

  const response = await getPresetsApi();
  const presets = Array.isArray(response?.presets) ? response.presets : [];
  return presets
    .map(normalizePreset)
    .filter((preset) => preset.name)
    .sort((left, right) => left.name.localeCompare(right.name));
};


export const upsertUserPreset = async (presetInput) => {
  const normalizedPreset = normalizePreset(presetInput);
  if (!normalizedPreset.name) {
    throw new Error('Preset name is required.');
  }

  const response = await savePresetApi(normalizedPreset);
  const presets = await loadUserPresets();
  dispatchPresetUpdate();

  return {
    preset: normalizePreset(response?.preset || normalizedPreset),
    presets,
    replaced: Boolean(response?.replaced),
  };
};


export const deleteUserPreset = async (presetId) => {
  await deletePresetApi(presetId);
  const presets = await loadUserPresets();
  dispatchPresetUpdate();
  return presets;
};
