import { normalizeStimulusType } from '../utilities/resultsCsv';

const DISALLOWED_NAME_CHARACTERS = /[<>[\]{}\\`^;|]/;
const WHOLE_NUMBER_PATTERN = /^\d+$/;
const DECIMAL_PATTERN = /^(?:\d+|\d+\.\d*|\d*\.\d+)$/;
const CHIME_SEGMENT_PATTERN = /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/;


const stripControlCharacters = (value) =>
  Array.from(String(value ?? ""))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");


const normalizeTextInput = (value) =>
  stripControlCharacters(value)
    .replace(/\s+/g, " ")
    .trimStart();


const normalizeNumericInput = (value) =>
  String(value ?? "").replace(/\s+/g, "");


const validateRequiredName = (value) => {
  const normalizedValue = normalizeTextInput(value);

  if (!normalizedValue.trim()) {
    return {
      value: normalizedValue,
      error: "Test name is required.",
    };
  }

  if (DISALLOWED_NAME_CHARACTERS.test(normalizedValue)) {
    return {
      value: normalizedValue,
      error: "Use letters, numbers, spaces, and simple punctuation only.",
    };
  }

  return {
    value: normalizedValue,
    error: "",
  };
};


const validatePositiveInteger = (value, label) => {
  const normalizedValue = normalizeNumericInput(value);

  if (!normalizedValue) {
    return {
      value: normalizedValue,
      error: `${label} is required.`,
    };
  }

  if (!WHOLE_NUMBER_PATTERN.test(normalizedValue)) {
    return {
      value: normalizedValue,
      error: `${label} must be a whole number.`,
    };
  }

  if (Number(normalizedValue) <= 0) {
    return {
      value: normalizedValue,
      error: `${label} must be greater than 0.`,
    };
  }

  return {
    value: normalizedValue,
    error: "",
  };
};


const validateOptionalPositiveInteger = (value, label) => {
  const normalizedValue = normalizeNumericInput(value);

  if (!normalizedValue) {
    return {
      value: '',
      error: '',
    };
  }

  if (!WHOLE_NUMBER_PATTERN.test(normalizedValue)) {
    return {
      value: normalizedValue,
      error: `${label} must be a whole number.`,
    };
  }

  if (Number(normalizedValue) <= 0) {
    return {
      value: normalizedValue,
      error: `${label} must be greater than 0 when used.`,
    };
  }

  return {
    value: normalizedValue,
    error: '',
  };
};


const validateNonNegativeInteger = (value, label) => {
  const normalizedValue = normalizeNumericInput(value);

  if (normalizedValue === "") {
    return {
      value: normalizedValue,
      error: `${label} is required.`,
    };
  }

  if (!WHOLE_NUMBER_PATTERN.test(normalizedValue)) {
    return {
      value: normalizedValue,
      error: `${label} must be a whole number.`,
    };
  }

  if (Number(normalizedValue) < 0) {
    return {
      value: normalizedValue,
      error: `${label} cannot be negative.`,
    };
  }

  return {
    value: normalizedValue,
    error: "",
  };
};


const validatePositiveDecimal = (value, label) => {
  const normalizedValue = normalizeNumericInput(value);

  if (!normalizedValue) {
    return {
      value: normalizedValue,
      error: `${label} is required.`,
    };
  }

  if (!DECIMAL_PATTERN.test(normalizedValue)) {
    return {
      value: normalizedValue,
      error: `${label} must be a number.`,
    };
  }

  if (Number(normalizedValue) <= 0) {
    return {
      value: normalizedValue,
      error: `${label} must be greater than 0.`,
    };
  }

  return {
    value: normalizedValue,
    error: "",
  };
};


const validateEndChimePattern = (value, enabled) => {
  const normalizedValue = normalizeNumericInput(value);

  if (!enabled) {
    return {
      value: normalizeTextInput(value).trim(),
      error: "",
    };
  }

  if (!normalizedValue) {
    return {
      value: normalizedValue,
      error: "End chime pattern is required when the chime is enabled.",
    };
  }

  const segments = normalizedValue.split(",").map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) {
    return {
      value: normalizedValue,
      error: "End chime pattern must include at least one note.",
    };
  }

  const hasInvalidSegment = segments.some((segment) => !CHIME_SEGMENT_PATTERN.test(segment));
  if (hasInvalidSegment) {
    return {
      value: normalizedValue,
      error: "Use the format frequency:seconds,frequency:seconds.",
    };
  }

  return {
    value: normalizedValue,
    error: "",
  };
};


export const validateTrialForm = (values) => {
  const normalizedValues = {
    testName: validateRequiredName(values.testName).value,
    subjectID: validateOptionalPositiveInteger(values.subjectID, "Subject ID").value,
    trialDuration: validatePositiveDecimal(values.trialDuration, "Trial duration").value,
    goalForTrial: validatePositiveInteger(values.goalForTrial, "Goal for trial").value,
    goalForTest: validatePositiveInteger(values.goalForTest, "Goal for test").value,
    RewaStimTime: validateNonNegativeInteger(
      values.RewaStimTime,
      "Reward delay",
    ).value,
    StimTimeOn: validateNonNegativeInteger(
      values.StimTimeOn,
      "Stimulus time",
    ).value,
    cooldown: validateNonNegativeInteger(values.cooldown, "Cooldown").value,
    stimulusType: normalizeStimulusType(values.stimulusType),
    endChimePattern: validateEndChimePattern(
      values.endChimePattern,
      Boolean(values.endChimeEnabled),
    ).value,
  };

  const errors = {
    testName: validateRequiredName(normalizedValues.testName).error,
    subjectID: validateOptionalPositiveInteger(normalizedValues.subjectID, "Subject ID").error,
    trialDuration: validatePositiveDecimal(normalizedValues.trialDuration, "Trial duration").error,
    goalForTrial: validatePositiveInteger(normalizedValues.goalForTrial, "Goal for trial").error,
    goalForTest: validatePositiveInteger(normalizedValues.goalForTest, "Goal for test").error,
    RewaStimTime: validateNonNegativeInteger(
      normalizedValues.RewaStimTime,
      "Reward delay",
    ).error,
    StimTimeOn: validateNonNegativeInteger(
      normalizedValues.StimTimeOn,
      "Stimulus time",
    ).error,
    cooldown: validateNonNegativeInteger(normalizedValues.cooldown, "Cooldown").error,
    endChimePattern: validateEndChimePattern(
      normalizedValues.endChimePattern,
      Boolean(values.endChimeEnabled),
    ).error,
  };

  const goalForTrialNumber = Number(normalizedValues.goalForTrial);
  const goalForTestNumber = Number(normalizedValues.goalForTest);
  if (!errors.goalForTrial && !errors.goalForTest && goalForTestNumber < goalForTrialNumber) {
    errors.goalForTest = "Goal for test must be at least the goal for trial.";
  }

  const firstError = Object.values(errors).find(Boolean) || "";

  return {
    normalizedValues: {
      ...values,
      ...normalizedValues,
    },
    errors,
    firstError,
    isValid: !firstError,
  };
};


export const validationFunctions = {
  testNameValidation: validateRequiredName,
  testTrialDurtion: (value) => validatePositiveDecimal(value, "Trial duration"),
  testTrialGoal: (value) => validatePositiveInteger(value, "Goal"),
  testCoolDown: (value) => validateNonNegativeInteger(value, "Cooldown"),
  testSubjectID: (value) => validateOptionalPositiveInteger(value, "Subject ID"),
  testRewardDelay: (value) => validateNonNegativeInteger(value, "Reward delay"),
  testStimulusDuration: (value) => validateNonNegativeInteger(value, "Stimulus time"),
  testEndChimePattern: validateEndChimePattern,
  validateTrialForm,
};
