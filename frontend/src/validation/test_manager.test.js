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
});
