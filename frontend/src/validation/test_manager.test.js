import { validateTrialForm, validationFunctions } from './test_manager';


describe('trial form validation', () => {
  test('allows readable test names with spaces and blocks disallowed characters', () => {
    expect(validationFunctions.testNameValidation('Lever Training Day 1').error).toBe('');
    expect(validationFunctions.testNameValidation('Bad<Test>Name').error).toMatch(/simple punctuation/i);
  });

  test('requires a positive decimal trial duration', () => {
    expect(validationFunctions.testTrialDurtion('0').error).toMatch(/greater than 0/i);
    expect(validationFunctions.testTrialDurtion('0.5').error).toBe('');
  });

  test('allows subject tracking to be left blank and validates it only when provided', () => {
    expect(validationFunctions.testSubjectID('').error).toBe('');
    expect(validationFunctions.testSubjectID('0').error).toMatch(/greater than 0 when used/i);
    expect(validationFunctions.testSubjectID('12').error).toBe('');
  });

  test('requires goal for test to be at least goal for trial', () => {
    const result = validateTrialForm({
      testName: 'Lever Training',
      subjectID: '7',
      trialDuration: '1.5',
      goalForTrial: '5',
      goalForTest: '3',
      RewaStimTime: '0',
      StimTimeOn: '1',
      cooldown: '0',
      endChimeEnabled: false,
      endChimePattern: '',
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.goalForTest).toMatch(/at least the goal for trial/i);
  });

  test('requires a chime pattern only when the end chime is enabled', () => {
    const result = validateTrialForm({
      testName: 'Lever Training',
      subjectID: '7',
      trialDuration: '1',
      goalForTrial: '1',
      goalForTest: '3',
      RewaStimTime: '0',
      StimTimeOn: '1',
      cooldown: '0',
      endChimeEnabled: true,
      endChimePattern: '',
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.endChimePattern).toMatch(/required/i);
  });

  test('normalizes imported stimulus values back to the supported stimulus options', () => {
    const toneResult = validateTrialForm({
      testName: 'Tone Training',
      subjectID: '7',
      trialDuration: '1',
      goalForTrial: '1',
      goalForTest: '3',
      RewaStimTime: '0',
      StimTimeOn: '1',
      cooldown: '0',
      stimulusType: 'tone',
      endChimeEnabled: false,
      endChimePattern: '',
    });

    const combinedResult = validateTrialForm({
      testName: 'Combined Training',
      subjectID: '9',
      trialDuration: '1',
      goalForTrial: '1',
      goalForTest: '3',
      RewaStimTime: '0',
      StimTimeOn: '1',
      cooldown: '0',
      stimulusType: 'light and tone',
      endChimeEnabled: false,
      endChimePattern: '',
    });

    const unknownResult = validateTrialForm({
      testName: 'Fallback Training',
      subjectID: '8',
      trialDuration: '1',
      goalForTrial: '1',
      goalForTest: '3',
      RewaStimTime: '0',
      StimTimeOn: '1',
      cooldown: '0',
      stimulusType: 'laser',
      endChimeEnabled: false,
      endChimePattern: '',
    });

    expect(toneResult.normalizedValues.stimulusType).toBe('Tone');
    expect(combinedResult.normalizedValues.stimulusType).toBe('Light + Tone');
    expect(unknownResult.normalizedValues.stimulusType).toBe('Light');
  });
});
