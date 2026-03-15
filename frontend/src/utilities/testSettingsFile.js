import { SINGLE_LIGHT_LABEL, normalizeLightColorForStimulus } from './resultsCsv';

const DEFAULT_END_CHIME_PATTERN = '523:0.12,659:0.12,784:0.24';


const parseKeyValueLines = (text) => {
  const entries = new Map();

  String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex < 0) {
        return;
      }

      const key = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      entries.set(key, value);
    });

  return entries;
};


const stripSuffix = (value, suffixPattern) => String(value || '').replace(suffixPattern, '').trim();


const getFirstDefined = (entries, labels) => {
  for (const label of labels) {
    if (entries.has(label)) {
      return entries.get(label);
    }
  }
  return '';
};


const normalizeEnabledValue = (value) => {
  const normalizedValue = String(value || '').trim().toLowerCase();
  return ['enabled', 'true', '1', 'yes', 'on'].includes(normalizedValue);
};


export const buildTestSettingsText = ({
  appliedPresetName = 'None',
  testName = '',
  subjectID = '',
  trialDuration = '',
  goalForTrial = '',
  goalForTest = '',
  RewaStimTime = '',
  StimTimeOn = '',
  cooldown = '0',
  rewardType = 'Water',
  interactionType = 'Lever',
  stimulusType = 'Light',
  endChimeEnabled = false,
  endChimePattern = DEFAULT_END_CHIME_PATTERN,
}) => {
  const resolvedLightColor = normalizeLightColorForStimulus(stimulusType);

  return [
    `Preset: ${appliedPresetName || 'None'}`,
    `Test Name: ${testName}`,
    `Subject Identification: ${subjectID}`,
    `Trial Duration: ${trialDuration} minutes`,
    `Goal for Trial: ${goalForTrial}`,
    `Goal for Test: ${goalForTest}`,
    `Time Between Reward and New Stimulus: ${RewaStimTime} seconds`,
    `Time Stimulus Active: ${StimTimeOn} seconds`,
    `Cooldown: ${cooldown || '0'} seconds`,
    `Reward Type: ${rewardType}`,
    `Interaction Type: ${interactionType}`,
    `Stimulus Type: ${stimulusType}`,
    `Stimulus Light: ${resolvedLightColor}`,
    `End Chime: ${endChimeEnabled ? 'Enabled' : 'Disabled'}`,
    `End Chime Pattern: ${endChimePattern || DEFAULT_END_CHIME_PATTERN}`,
  ].join('\n');
};


export const parseTestSettingsText = (text) => {
  const entries = parseKeyValueLines(text);

  const testName = getFirstDefined(entries, ['test name']);
  const trialDuration = stripSuffix(
    getFirstDefined(entries, ['trial duration']),
    /\s*minutes?$/i,
  );

  if (!testName || !trialDuration) {
    throw new Error('The uploaded file does not contain the required test name and trial duration fields.');
  }

  const stimulusType = getFirstDefined(entries, ['stimulus type']) || 'Light';

  return {
    presetName: getFirstDefined(entries, ['preset']),
    testName,
    subjectID: getFirstDefined(entries, ['subject identification', 'subject id']),
    trialDuration,
    goalForTrial: getFirstDefined(entries, ['goal for trial', 'goal']),
    goalForTest: getFirstDefined(entries, ['goal for test']),
    RewaStimTime: stripSuffix(
      getFirstDefined(
        entries,
        ['time between reward and new stimulus', 'time between reward given and stimulus activated'],
      ),
      /\s*seconds?$/i,
    ),
    StimTimeOn: stripSuffix(
      getFirstDefined(entries, ['time stimulus active', 'time stimulus is on']),
      /\s*seconds?$/i,
    ),
    cooldown: stripSuffix(getFirstDefined(entries, ['cooldown']), /\s*seconds?$/i) || '0',
    rewardType: getFirstDefined(entries, ['reward type']) || 'Water',
    interactionType: getFirstDefined(entries, ['interaction type']) || 'Lever',
    stimulusType,
    lightColor: normalizeLightColorForStimulus(stimulusType),
    endChimeEnabled: normalizeEnabledValue(getFirstDefined(entries, ['end chime'])),
    endChimePattern: getFirstDefined(entries, ['end chime pattern']) || DEFAULT_END_CHIME_PATTERN,
  };
};


export { SINGLE_LIGHT_LABEL };
