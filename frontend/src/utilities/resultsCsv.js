export const SINGLE_LIGHT_LABEL = 'Box Light';


export const normalizeStimulusType = (stimulusType) => {
  const normalizedType = String(stimulusType || '').trim().toLowerCase();
  if (
    normalizedType === 'light + tone'
    || normalizedType === 'light+tone'
    || normalizedType === 'light and tone'
    || normalizedType === 'combined'
  ) {
    return 'Light + Tone';
  }
  return normalizedType === 'tone' ? 'Tone' : 'Light';
};


export const normalizeLightColorForStimulus = (stimulusType) => {
  return normalizeStimulusType(stimulusType) === 'Tone' ? 'N/A' : SINGLE_LIGHT_LABEL;
};


const CSV_COLUMNS = [
  { key: 'exportedAt', label: 'exported_at' },
  { key: 'testName', label: 'test_name' },
  { key: 'subjectId', label: 'subject_id' },
  { key: 'conductedByDisplayName', label: 'conducted_by_display_name' },
  { key: 'conductedByEmail', label: 'conducted_by_email' },
  { key: 'conductedByUserId', label: 'conducted_by_user_id' },
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

const EVENT_TIMELINE_COLUMNS = [
  { key: 'exportedAt', label: 'exported_at' },
  { key: 'testName', label: 'test_name' },
  { key: 'subjectId', label: 'subject_id' },
  { key: 'conductedByDisplayName', label: 'conducted_by_display_name' },
  { key: 'conductedByEmail', label: 'conducted_by_email' },
  { key: 'eventIndex', label: 'event_index' },
  { key: 'eventType', label: 'event_type' },
  { key: 'eventLabel', label: 'event_label' },
  { key: 'detailText', label: 'detail_text' },
  { key: 'detailValue', label: 'detail_value' },
  { key: 'occurredAt', label: 'occurred_at' },
  { key: 'elapsedSeconds', label: 'elapsed_seconds' },
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


export const buildStimulusSummary = (stimulusType) => {
  return normalizeStimulusType(stimulusType);
};


export const formatEndChimeStatus = (endChimeEnabled) => {
  return endChimeEnabled ? 'Active' : 'Inactive';
};


export const buildTraditionalCsv = (record) => {
  const headers = CSV_COLUMNS.map((column) => escapeCsvValue(column.label)).join(',');
  const row = CSV_COLUMNS.map((column) => escapeCsvValue(record[column.key])).join(',');
  return `${headers}\n${row}\n`;
};


export const buildTraditionalCsvRows = (records) => {
  const normalizedRecords = Array.isArray(records) ? records : [];
  const headers = CSV_COLUMNS.map((column) => escapeCsvValue(column.label)).join(',');
  const rows = normalizedRecords.map((record) =>
    CSV_COLUMNS.map((column) => escapeCsvValue(record?.[column.key])).join(',')
  );
  return `${headers}\n${rows.join('\n')}${rows.length ? '\n' : ''}`;
};


export const buildEventTimelineCsv = ({
  exportedAt = new Date().toISOString(),
  testName = '',
  subjectId = '',
  conductedByDisplayName = '',
  conductedByEmail = '',
  events = [],
}) => {
  const headers = EVENT_TIMELINE_COLUMNS.map((column) => escapeCsvValue(column.label)).join(',');
  const normalizedEvents = Array.isArray(events) ? events : [];
  const rows = normalizedEvents.map((event, index) =>
    EVENT_TIMELINE_COLUMNS.map((column) => {
      const record = {
        exportedAt,
        testName,
        subjectId,
        conductedByDisplayName,
        conductedByEmail,
        eventIndex: index + 1,
        eventType: event?.type || '',
        eventLabel: event?.label || '',
        detailText: event?.detailText || '',
        detailValue: event?.detailValue ?? '',
        occurredAt: event?.occurredAt || '',
        elapsedSeconds: event?.elapsedSeconds ?? '',
      };
      return escapeCsvValue(record[column.key]);
    }).join(',')
  );
  return `${headers}\n${rows.join('\n')}${rows.length ? '\n' : ''}`;
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
