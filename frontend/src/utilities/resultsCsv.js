const CSV_COLUMNS = [
  { key: 'exportedAt', label: 'exported_at' },
  { key: 'testName', label: 'test_name' },
  { key: 'subjectId', label: 'subject_id' },
  { key: 'status', label: 'status' },
  { key: 'complete', label: 'complete' },
  { key: 'preset', label: 'preset' },
  { key: 'configuredDurationMinutes', label: 'configured_duration_minutes' },
  { key: 'configuredDurationSeconds', label: 'configured_duration_seconds' },
  { key: 'elapsedTimeSeconds', label: 'elapsed_time_seconds' },
  { key: 'remainingTimeSeconds', label: 'remaining_time_seconds' },
  { key: 'goalForTrial', label: 'goal_for_trial' },
  { key: 'goalForTest', label: 'goal_for_test' },
  { key: 'rewardDelaySeconds', label: 'reward_delay_seconds' },
  { key: 'stimulusDurationSeconds', label: 'stimulus_duration_seconds' },
  { key: 'cooldownSeconds', label: 'cooldown_seconds' },
  { key: 'rewardType', label: 'reward_type' },
  { key: 'interactionType', label: 'interaction_type' },
  { key: 'stimulusType', label: 'stimulus_type' },
  { key: 'stimulusDescription', label: 'stimulus_description' },
  { key: 'lightColor', label: 'light_color' },
  { key: 'endChimeEnabled', label: 'end_chime_enabled' },
  { key: 'endChimePattern', label: 'end_chime_pattern' },
  { key: 'leverPressCount', label: 'lever_press_count' },
  { key: 'nosePokeCount', label: 'nose_poke_count' },
  { key: 'totalInteractions', label: 'total_interactions' },
  { key: 'rewardCount', label: 'reward_count' },
  { key: 'createdAt', label: 'created_at' },
  { key: 'updatedAt', label: 'updated_at' },
];


const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  const normalized = String(value);
  if (normalized.includes(',') || normalized.includes('"') || normalized.includes('\n')) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};


export const buildStimulusSummary = (stimulusType, lightColor) => {
  const normalizedType = (stimulusType || '').trim().toLowerCase();
  if (normalizedType === 'tone') {
    return 'Tone';
  }

  const normalizedColor = (lightColor || '').trim();
  if (normalizedColor && normalizedColor.toLowerCase() !== 'n/a') {
    return `Light (${normalizedColor})`;
  }
  return 'Light';
};


export const buildTraditionalCsv = (record) => {
  const headers = CSV_COLUMNS.map((column) => escapeCsvValue(column.label)).join(',');
  const row = CSV_COLUMNS.map((column) => escapeCsvValue(record[column.key])).join(',');
  return `${headers}\n${row}\n`;
};


export const formatSecondsForDisplay = (totalSeconds) => {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(Number(totalSeconds))) {
    return '--';
  }

  const roundedSeconds = Math.max(Math.round(Number(totalSeconds)), 0);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
};
