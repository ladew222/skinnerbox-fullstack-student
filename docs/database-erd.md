# Database ERD

This diagram shows the main SQLite tables used by SkinnerBox for auth, trial runtime/history, presets, and maintenance settings.

Notes:
- `Active_Test` is the project's historical name for the main trial/results table. It stores both the currently configured run and completed runs.
- `maintenance_records.record_type` distinguishes saved pump calibration, reward pulse, lever debounce, lever release requirement, and trial buzzer output records.
- `user_presets` uses a composite primary key of `user_id + preset_id`.

```mermaid
erDiagram
    users {
        INTEGER id PK
        TEXT email
        TEXT display_name
        TEXT password_hash
        TEXT role
        TEXT status
        TEXT approved_at
        INTEGER approved_by_user_id FK
        TEXT last_login_at
        TEXT created_at
        TEXT updated_at
    }

    auth_tokens {
        INTEGER id PK
        INTEGER user_id FK
        TEXT token_hash
        TEXT created_at
        TEXT expires_at
        TEXT revoked_at
        TEXT last_used_at
    }

    Active_Test {
        INTEGER testID PK
        INTEGER subjectID
        TEXT Name
        INTEGER Goal
        INTEGER goal_for_test
        INTEGER reward_stim_delay
        INTEGER stimulus_duration
        INTEGER Cooldown
        TEXT Reward
        TEXT interaction
        TEXT Stimulus
        TEXT Light
        TEXT testStatus
        REAL Duration
        INTEGER nose_poke
        INTEGER lever_press
        INTEGER reward_count
        REAL elapsed_seconds
        INTEGER end_chime_enabled
        TEXT end_chime_pattern
        INTEGER conducted_by_user_id FK
        TEXT conducted_by_email
        TEXT conducted_by_display_name
        BLOB camera_snapshot
        TEXT camera_snapshot_mime_type
        TEXT camera_snapshot_captured_at
        TEXT created_at
        TEXT updated_at
    }

    test_events {
        INTEGER event_id PK
        INTEGER test_id FK
        TEXT event_type
        TEXT event_label
        TEXT detail_text
        REAL detail_value
        TEXT occurred_at
        REAL elapsed_seconds
    }

    user_presets {
        INTEGER user_id PK, FK
        TEXT preset_id PK
        TEXT name
        TEXT description
        TEXT test_name
        INTEGER subject_id
        REAL trial_duration
        INTEGER goal_for_trial
        INTEGER goal_for_test
        INTEGER reward_delay_seconds
        INTEGER stimulus_duration_seconds
        INTEGER cooldown_seconds
        TEXT reward_type
        TEXT interaction_type
        TEXT stimulus_type
        TEXT light_color
        INTEGER end_chime_enabled
        TEXT end_chime_pattern
        TEXT created_at
        TEXT updated_at
    }

    maintenance_records {
        INTEGER record_id PK
        TEXT record_type
        REAL duration_seconds
        REAL measured_volume_ml
        REAL derived_rate_ml_per_second
        TEXT note_text
        INTEGER created_by_user_id FK
        TEXT created_by_email
        TEXT created_by_display_name
        TEXT created_at
    }

    users ||--o{ auth_tokens : issues
    users ||--o{ user_presets : owns
    users ||--o{ maintenance_records : records
    users ||--o{ Active_Test : conducts
    users ||--o{ users : approves
    Active_Test ||--o{ test_events : logs
```
