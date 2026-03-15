import {
  SINGLE_LIGHT_LABEL,
  buildTestSettingsText,
  parseTestSettingsText,
} from './testSettingsFile';


test('round-trips the current settings file format', () => {
  const fileText = buildTestSettingsText({
    appliedPresetName: 'Weekly Baseline',
    testName: 'Lever Trial',
    subjectID: '7',
    trialDuration: '15',
    goalForTrial: '2',
    goalForTest: '10',
    RewaStimTime: '1',
    StimTimeOn: '3',
    cooldown: '0',
    rewardType: 'Water',
    interactionType: 'Lever',
    stimulusType: 'Light',
    endChimeEnabled: true,
    endChimePattern: '523:0.10,659:0.10',
  });

  const parsed = parseTestSettingsText(fileText);

  expect(parsed.presetName).toBe('Weekly Baseline');
  expect(parsed.testName).toBe('Lever Trial');
  expect(parsed.subjectID).toBe('7');
  expect(parsed.trialDuration).toBe('15');
  expect(parsed.goalForTrial).toBe('2');
  expect(parsed.goalForTest).toBe('10');
  expect(parsed.RewaStimTime).toBe('1');
  expect(parsed.StimTimeOn).toBe('3');
  expect(parsed.cooldown).toBe('0');
  expect(parsed.stimulusType).toBe('Light');
  expect(parsed.lightColor).toBe(SINGLE_LIGHT_LABEL);
  expect(parsed.endChimeEnabled).toBe(true);
  expect(parsed.endChimePattern).toBe('523:0.10,659:0.10');
});


test('parses the older legacy settings file labels for backward compatibility', () => {
  const legacyFileText = [
    'Test Name: Legacy Trial',
    'Trial Duration: 5 minutes',
    'Goal: 4',
    'Cooldown: 0 seconds',
    'Reward Type: Water',
    'Interaction Type: Lever',
    'Stimulus Type: Light',
    'Light Color: Blue',
  ].join('\n');

  const parsed = parseTestSettingsText(legacyFileText);

  expect(parsed.testName).toBe('Legacy Trial');
  expect(parsed.trialDuration).toBe('5');
  expect(parsed.goalForTrial).toBe('4');
  expect(parsed.stimulusType).toBe('Light');
  expect(parsed.lightColor).toBe(SINGLE_LIGHT_LABEL);
});


test('normalizes tone stimulus text files to the supported tone option', () => {
  const toneFileText = [
    'Test Name: Tone Trial',
    'Trial Duration: 5 minutes',
    'Goal for Trial: 1',
    'Goal for Test: 3',
    'Stimulus Type: tone',
  ].join('\n');

  const parsed = parseTestSettingsText(toneFileText);

  expect(parsed.stimulusType).toBe('Tone');
  expect(parsed.lightColor).toBe('N/A');
});


test('normalizes combined stimulus text files to the supported combined option', () => {
  const combinedFileText = [
    'Test Name: Combined Trial',
    'Trial Duration: 5 minutes',
    'Goal for Trial: 1',
    'Goal for Test: 3',
    'Stimulus Type: light and tone',
  ].join('\n');

  const parsed = parseTestSettingsText(combinedFileText);

  expect(parsed.stimulusType).toBe('Light + Tone');
  expect(parsed.lightColor).toBe(SINGLE_LIGHT_LABEL);
});
