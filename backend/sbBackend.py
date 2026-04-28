from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
import os
import re
import sqlite3
import socket
import threading
import time

from flask import Flask, Response, g, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from auth import AuthenticatedUser, SQLiteAuthRepository
from camera_adapter import CameraManager, CameraUnavailableError
from display_adapter import StatusDisplay
from gpio_adapter import Button, LED, OutputDevice, PassiveBuzzer
from shared_errors import ApiError, ConfigurationError


# SQLite file used by the current student branch for saving active test runs.
# Tests can override this with `SKINNERBOX_DB_PATH` to avoid touching the real DB.
DATABASE_FILE = Path(
    os.getenv("SKINNERBOX_DB_PATH", str(Path(__file__).with_name("testdatabase.db")))
)
DEFAULT_END_CHIME_PATTERN = "523:0.12,659:0.12,784:0.24"
SESSION_COOKIE_NAME = os.getenv("SKINNERBOX_SESSION_COOKIE_NAME", "skinnerbox_session")
SESSION_COOKIE_SECURE = os.getenv("SKINNERBOX_SESSION_COOKIE_SECURE", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
SESSION_COOKIE_SAMESITE = os.getenv("SKINNERBOX_SESSION_COOKIE_SAMESITE", "Lax")
SESSION_COOKIE_PATH = os.getenv("SKINNERBOX_SESSION_COOKIE_PATH", "/")
SESSION_COOKIE_MAX_AGE_SECONDS = max(
    int(os.getenv("SKINNERBOX_SESSION_COOKIE_MAX_AGE_SECONDS", str(60 * 60 * 12))),
    1,
)
AUTH_COOKIE_CLEAR_ERROR_CODES = {
    "AUTH_REQUIRED",
    "INVALID_AUTH_TOKEN",
    "AUTH_TOKEN_REVOKED",
    "AUTH_TOKEN_EXPIRED",
    "ACCOUNT_DISABLED",
}


@dataclass(slots=True)
class TestConfiguration:
    """Normalized test settings received from the React Test Manager."""

    # Stable identifier used to update the same row across the life of a test.
    test_id: int
    # Human-facing metadata shown in the frontend and exported results.
    test_name: str
    subject_id: int | None
    # Duration is stored in minutes because that is how the frontend collects it.
    trial_duration_minutes: float
    # Number of valid interactions required before a reward is delivered.
    goal_for_trial: int
    # Number of valid interactions required before the whole test finishes.
    goal_for_test: int
    # Delay between reward delivery and the next stimulus presentation.
    reward_delay_seconds: int
    # Time the tone/light stimulus stays active for each cycle.
    stimulus_duration_seconds: int
    # Kept for compatibility with the current frontend payload.
    cooldown_seconds: int
    reward_type: str
    interaction_type: str
    stimulus_type: str
    light_color: str
    end_chime_enabled: bool
    end_chime_pattern: str

    @classmethod
    def from_payload(cls, payload: dict) -> "TestConfiguration":
        """Convert the frontend payload into a strongly-typed configuration object."""

        if not isinstance(payload, dict):
            raise ConfigurationError("Request body must be a JSON object.")

        stimulus_type = _normalize_stimulus_type(
            payload.get("stimulusType"),
            "stimulusType",
            default="Light",
        )
        configuration = cls(
            test_id=_coerce_int(payload.get("testID"), "testID", default=_default_test_id()),
            test_name=_coerce_text(payload.get("testName"), "testName", default="Untitled Test"),
            subject_id=_coerce_optional_int(payload.get("subjectID"), "subjectID"),
            trial_duration_minutes=_coerce_float(payload.get("trialDuration"), "trialDuration", default=0.0),
            goal_for_trial=_coerce_int(payload.get("goalForTrial"), "goalForTrial", default=1),
            goal_for_test=_coerce_int(payload.get("goalForTest"), "goalForTest", default=1),
            reward_delay_seconds=_coerce_int(payload.get("RewaStimTime"), "RewaStimTime", default=0),
            stimulus_duration_seconds=_coerce_int(payload.get("StimTimeOn"), "StimTimeOn", default=1),
            cooldown_seconds=_coerce_int(payload.get("cooldown"), "cooldown", default=0),
            reward_type=_coerce_text(payload.get("rewardType"), "rewardType", default="Water"),
            interaction_type=_coerce_text(payload.get("interactionType"), "interactionType", default="Lever"),
            stimulus_type=stimulus_type,
            light_color=_normalize_light_color_for_stimulus(
                stimulus_type,
                payload.get("lightColor"),
                "lightColor",
                default="Box Light",
            ),
            end_chime_enabled=_coerce_bool(
                payload.get("endChimeEnabled"),
                "endChimeEnabled",
                default=False,
            ),
            end_chime_pattern=_normalize_end_chime_pattern(
                payload.get("endChimePattern"),
                "endChimePattern",
                default=DEFAULT_END_CHIME_PATTERN,
            ),
        )
        configuration.validate()
        return configuration

    def validate(self) -> None:
        """Reject impossible or confusing test combinations before a run starts."""

        if not self.test_name.strip():
            raise ConfigurationError("testName is required.")
        if self.subject_id is not None and self.subject_id <= 0:
            raise ConfigurationError("subjectID must be greater than 0 when subject tracking is enabled.")
        if self.trial_duration_minutes <= 0:
            raise ConfigurationError("trialDuration must be greater than 0.")
        if self.goal_for_trial <= 0:
            raise ConfigurationError("goalForTrial must be greater than 0.")
        if self.goal_for_test <= 0:
            raise ConfigurationError("goalForTest must be greater than 0.")
        if self.goal_for_test < self.goal_for_trial:
            raise ConfigurationError("goalForTest must be greater than or equal to goalForTrial.")
        if self.reward_delay_seconds < 0:
            raise ConfigurationError("RewaStimTime cannot be negative.")
        if self.stimulus_duration_seconds < 0:
            raise ConfigurationError("StimTimeOn cannot be negative.")
        if self.cooldown_seconds < 0:
            raise ConfigurationError("cooldown cannot be negative.")
        if self.stimulus_type not in {"Light", "Tone", "Light + Tone"}:
            raise ConfigurationError("stimulusType must be Light, Tone, or Light + Tone.")

    def to_response_payload(self) -> dict[str, object]:
        """Return the normalized configuration using the frontend's expected keys."""

        return {
            "testID": self.test_id,
            "subjectID": self.subject_id,
            "testName": self.test_name,
            "rewardType": self.reward_type,
            "goalForTrial": self.goal_for_trial,
            "goalForTest": self.goal_for_test,
            "RewaStimTime": self.reward_delay_seconds,
            "StimTimeOn": self.stimulus_duration_seconds,
            "lightColor": self.light_color,
            "stimulusType": self.stimulus_type,
            "interactionType": self.interaction_type,
            "cooldown": self.cooldown_seconds,
            "trialDuration": self.trial_duration_minutes,
            "endChimeEnabled": self.end_chime_enabled,
            "endChimePattern": self.end_chime_pattern,
        }


@dataclass(slots=True)
class ConductedBySnapshot:
    """Small user snapshot stored on each saved test result for later reporting."""

    user_id: int
    email: str
    display_name: str

    @classmethod
    def from_authenticated_user(cls, user: AuthenticatedUser) -> "ConductedBySnapshot":
        """Capture the stable operator details we want to keep with a saved test."""

        return cls(
            user_id=user.user_id,
            email=user.email,
            display_name=user.display_name,
        )

    def to_response_payload(self) -> dict[str, object]:
        """Return the operator snapshot in the same shape the frontend uses elsewhere."""

        return {
            "id": self.user_id,
            "email": self.email,
            "displayName": self.display_name,
        }


@dataclass(slots=True)
class PresetConfiguration:
    """Normalized preset values saved for a signed-in user account."""

    # Stable identifier reused when a preset is edited later.
    preset_id: str
    # Human-facing preset label shown in the Trial form dropdown.
    name: str
    description: str
    # Default test values copied into the Trial form when a preset is chosen.
    test_name: str
    subject_id: int | None
    trial_duration_minutes: float
    goal_for_trial: int
    goal_for_test: int
    reward_delay_seconds: int
    stimulus_duration_seconds: int
    cooldown_seconds: int
    reward_type: str
    interaction_type: str
    stimulus_type: str
    light_color: str
    end_chime_enabled: bool
    end_chime_pattern: str

    @classmethod
    def from_payload(cls, payload: dict) -> "PresetConfiguration":
        """Convert a preset request body into a validated preset object."""

        if not isinstance(payload, dict):
            raise ConfigurationError("Request body must be a JSON object.")

        name = _coerce_text(payload.get("name"), "name", default="")
        if not name:
            raise ConfigurationError("name is required.")

        normalized_id = _coerce_text(
            payload.get("id"),
            "id",
            default=_slugify_identifier(name),
        )
        test_configuration = TestConfiguration.from_payload(payload)

        return cls(
            preset_id=normalized_id,
            name=name,
            description=_coerce_text(payload.get("description"), "description", default=""),
            test_name=test_configuration.test_name,
            subject_id=test_configuration.subject_id,
            trial_duration_minutes=test_configuration.trial_duration_minutes,
            goal_for_trial=test_configuration.goal_for_trial,
            goal_for_test=test_configuration.goal_for_test,
            reward_delay_seconds=test_configuration.reward_delay_seconds,
            stimulus_duration_seconds=test_configuration.stimulus_duration_seconds,
            cooldown_seconds=test_configuration.cooldown_seconds,
            reward_type=test_configuration.reward_type,
            interaction_type=test_configuration.interaction_type,
            stimulus_type=test_configuration.stimulus_type,
            light_color=test_configuration.light_color,
            end_chime_enabled=test_configuration.end_chime_enabled,
            end_chime_pattern=test_configuration.end_chime_pattern,
        )

    def to_response_payload(self) -> dict[str, object]:
        """Return the preset in the exact shape the React app expects."""

        return {
            "id": self.preset_id,
            "name": self.name,
            "description": self.description,
            "testName": self.test_name,
            "subjectID": self.subject_id,
            "trialDuration": self.trial_duration_minutes,
            "goalForTrial": self.goal_for_trial,
            "goalForTest": self.goal_for_test,
            "RewaStimTime": self.reward_delay_seconds,
            "StimTimeOn": self.stimulus_duration_seconds,
            "cooldown": self.cooldown_seconds,
            "rewardType": self.reward_type,
            "interactionType": self.interaction_type,
            "stimulusType": self.stimulus_type,
            "lightColor": self.light_color,
            "endChimeEnabled": self.end_chime_enabled,
            "endChimePattern": self.end_chime_pattern,
        }


class SQLiteTestRepository:
    """Handles the small amount of SQLite persistence used by the backend."""

    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.ensure_schema()

    def connect(self) -> sqlite3.Connection:
        """Open a new database connection for the current request/update."""
        try:
            connection = sqlite3.connect(self.database_path)
            connection.row_factory = sqlite3.Row
            return connection
        except sqlite3.Error as error:
            raise ApiError(
                code="DATABASE_CONNECTION_ERROR",
                message="Unable to connect to the test database.",
                status=500,
                details={"reason": str(error)},
            ) from error

    def ensure_schema(self) -> None:
        """Create the Active_Test table and add missing columns for older DB files."""

        create_table_sql = """
            CREATE TABLE IF NOT EXISTS Active_Test (
                testID INTEGER PRIMARY KEY,
                subjectID INTEGER,
                Name TEXT,
                Goal INTEGER,
                goal_for_test INTEGER,
                reward_stim_delay INTEGER,
                stimulus_duration INTEGER,
                Cooldown INTEGER,
                Reward TEXT,
                interaction TEXT,
                Stimulus TEXT,
                Light TEXT,
                testStatus TEXT,
                Duration REAL,
                nose_poke INTEGER DEFAULT 0,
                lever_press INTEGER DEFAULT 0,
                reward_count INTEGER DEFAULT 0,
                valid_lever_press INTEGER DEFAULT 0,
                invalid_lever_press INTEGER DEFAULT 0,
                valid_nose_poke INTEGER DEFAULT 0,
                invalid_nose_poke INTEGER DEFAULT 0,
                elapsed_seconds REAL DEFAULT 0,
                end_chime_enabled INTEGER DEFAULT 0,
                end_chime_pattern TEXT DEFAULT '',
                conducted_by_user_id INTEGER,
                conducted_by_email TEXT DEFAULT '',
                conducted_by_display_name TEXT DEFAULT '',
                camera_snapshot BLOB,
                camera_snapshot_mime_type TEXT DEFAULT '',
                camera_snapshot_captured_at TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        """
        # Add any columns that older student DB files may be missing so new
        # code paths can read/write results without a manual migration step.
        expected_columns = {
            "subjectID": "INTEGER",
            "Name": "TEXT",
            "Goal": "INTEGER DEFAULT 0",
            "goal_for_test": "INTEGER DEFAULT 0",
            "reward_stim_delay": "INTEGER DEFAULT 0",
            "stimulus_duration": "INTEGER DEFAULT 0",
            "Cooldown": "INTEGER DEFAULT 0",
            "Reward": "TEXT",
            "interaction": "TEXT",
            "Stimulus": "TEXT",
            "Light": "TEXT",
            "testStatus": "TEXT",
            "Duration": "REAL DEFAULT 0",
            "nose_poke": "INTEGER DEFAULT 0",
            "lever_press": "INTEGER DEFAULT 0",
            "reward_count": "INTEGER DEFAULT 0",
            "valid_lever_press": "INTEGER DEFAULT 0",
            "invalid_lever_press": "INTEGER DEFAULT 0",
            "valid_nose_poke": "INTEGER DEFAULT 0",
            "invalid_nose_poke": "INTEGER DEFAULT 0",
            "elapsed_seconds": "REAL DEFAULT 0",
            "end_chime_enabled": "INTEGER DEFAULT 0",
            "end_chime_pattern": "TEXT DEFAULT ''",
            "conducted_by_user_id": "INTEGER",
            "conducted_by_email": "TEXT DEFAULT ''",
            "conducted_by_display_name": "TEXT DEFAULT ''",
            "camera_snapshot": "BLOB",
            "camera_snapshot_mime_type": "TEXT DEFAULT ''",
            "camera_snapshot_captured_at": "TEXT",
            "created_at": "TEXT",
            "updated_at": "TEXT",
        }
        create_presets_table_sql = """
            CREATE TABLE IF NOT EXISTS user_presets (
                user_id INTEGER NOT NULL,
                preset_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                test_name TEXT DEFAULT '',
                subject_id INTEGER DEFAULT 0,
                trial_duration REAL DEFAULT 0,
                goal_for_trial INTEGER DEFAULT 1,
                goal_for_test INTEGER DEFAULT 1,
                reward_delay_seconds INTEGER DEFAULT 0,
                stimulus_duration_seconds INTEGER DEFAULT 1,
                cooldown_seconds INTEGER DEFAULT 0,
                reward_type TEXT DEFAULT 'Water',
                interaction_type TEXT DEFAULT 'Lever',
                stimulus_type TEXT DEFAULT 'Light',
                light_color TEXT DEFAULT 'Box Light',
                end_chime_enabled INTEGER DEFAULT 0,
                end_chime_pattern TEXT DEFAULT '',
                created_at TEXT,
                updated_at TEXT,
                PRIMARY KEY (user_id, preset_id)
            )
        """
        create_events_table_sql = """
            CREATE TABLE IF NOT EXISTS test_events (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                test_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                event_label TEXT DEFAULT '',
                detail_text TEXT DEFAULT '',
                response_validity TEXT DEFAULT '',
                response_reason TEXT DEFAULT '',
                detail_value REAL,
                occurred_at TEXT,
                elapsed_seconds REAL DEFAULT 0
            )
        """
        create_maintenance_table_sql = """
            CREATE TABLE IF NOT EXISTS maintenance_records (
                record_id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_type TEXT NOT NULL,
                duration_seconds REAL DEFAULT 0,
                measured_volume_ml REAL DEFAULT 0,
                derived_rate_ml_per_second REAL DEFAULT 0,
                note_text TEXT DEFAULT '',
                created_by_user_id INTEGER,
                created_by_email TEXT DEFAULT '',
                created_by_display_name TEXT DEFAULT '',
                created_at TEXT
            )
        """
        expected_preset_columns = {
            "user_id": "INTEGER NOT NULL DEFAULT 0",
            "preset_id": "TEXT NOT NULL DEFAULT ''",
            "name": "TEXT NOT NULL DEFAULT ''",
            "description": "TEXT DEFAULT ''",
            "test_name": "TEXT DEFAULT ''",
            "subject_id": "INTEGER DEFAULT 0",
            "trial_duration": "REAL DEFAULT 0",
            "goal_for_trial": "INTEGER DEFAULT 1",
            "goal_for_test": "INTEGER DEFAULT 1",
            "reward_delay_seconds": "INTEGER DEFAULT 0",
            "stimulus_duration_seconds": "INTEGER DEFAULT 1",
            "cooldown_seconds": "INTEGER DEFAULT 0",
            "reward_type": "TEXT DEFAULT 'Water'",
            "interaction_type": "TEXT DEFAULT 'Lever'",
            "stimulus_type": "TEXT DEFAULT 'Light'",
            "light_color": "TEXT DEFAULT 'Box Light'",
            "end_chime_enabled": "INTEGER DEFAULT 0",
            "end_chime_pattern": "TEXT DEFAULT ''",
            "created_at": "TEXT",
            "updated_at": "TEXT",
        }
        expected_event_columns = {
            "event_id": "INTEGER",
            "test_id": "INTEGER NOT NULL DEFAULT 0",
            "event_type": "TEXT NOT NULL DEFAULT ''",
            "event_label": "TEXT DEFAULT ''",
            "detail_text": "TEXT DEFAULT ''",
            "response_validity": "TEXT DEFAULT ''",
            "response_reason": "TEXT DEFAULT ''",
            "detail_value": "REAL",
            "occurred_at": "TEXT",
            "elapsed_seconds": "REAL DEFAULT 0",
        }
        expected_maintenance_columns = {
            "record_id": "INTEGER",
            "record_type": "TEXT NOT NULL DEFAULT ''",
            "duration_seconds": "REAL DEFAULT 0",
            "measured_volume_ml": "REAL DEFAULT 0",
            "derived_rate_ml_per_second": "REAL DEFAULT 0",
            "note_text": "TEXT DEFAULT ''",
            "created_by_user_id": "INTEGER",
            "created_by_email": "TEXT DEFAULT ''",
            "created_by_display_name": "TEXT DEFAULT ''",
            "created_at": "TEXT",
        }

        try:
            with self.connect() as connection:
                connection.execute(create_table_sql)
                connection.execute(create_presets_table_sql)
                connection.execute(create_events_table_sql)
                connection.execute(create_maintenance_table_sql)
                existing_columns = {
                    row["name"]
                    for row in connection.execute("PRAGMA table_info(Active_Test)")
                }
                for column_name, column_type in expected_columns.items():
                    if column_name in existing_columns:
                        continue
                    connection.execute(
                        f'ALTER TABLE Active_Test ADD COLUMN "{column_name}" {column_type}'
                    )

                existing_preset_columns = {
                    row["name"]
                    for row in connection.execute("PRAGMA table_info(user_presets)")
                }
                for column_name, column_type in expected_preset_columns.items():
                    if column_name in existing_preset_columns:
                        continue
                    connection.execute(
                        f'ALTER TABLE user_presets ADD COLUMN "{column_name}" {column_type}'
                    )

                existing_event_columns = {
                    row["name"]
                    for row in connection.execute("PRAGMA table_info(test_events)")
                }
                for column_name, column_type in expected_event_columns.items():
                    if column_name in existing_event_columns:
                        continue
                    connection.execute(
                        f'ALTER TABLE test_events ADD COLUMN "{column_name}" {column_type}'
                    )

                existing_maintenance_columns = {
                    row["name"]
                    for row in connection.execute("PRAGMA table_info(maintenance_records)")
                }
                for column_name, column_type in expected_maintenance_columns.items():
                    if column_name in existing_maintenance_columns:
                        continue
                    connection.execute(
                        f'ALTER TABLE maintenance_records ADD COLUMN "{column_name}" {column_type}'
                    )

                connection.execute(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_presets_user_name
                    ON user_presets(user_id, name COLLATE NOCASE)
                    """
                )
                connection.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_test_events_test_id
                    ON test_events(test_id, elapsed_seconds, event_id)
                    """
                )
                connection.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_maintenance_records_type
                    ON maintenance_records(record_type, created_at DESC, record_id DESC)
                    """
                )
                connection.commit()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="DATABASE_SCHEMA_ERROR",
                message="Unable to prepare the test database schema.",
                status=500,
                details={"reason": str(error)},
            ) from error

    def save_configuration(
        self,
        configuration: TestConfiguration,
        counts: dict[str, int],
        status: str,
        conducted_by: ConductedBySnapshot | None = None,
    ) -> None:
        """Insert or replace the current test configuration and its latest counters."""
        now = self._timestamp()
        try:
            with self.connect() as connection:
                connection.execute(
                    """
                    INSERT INTO Active_Test (
                        testID,
                        subjectID,
                        Name,
                        Goal,
                        goal_for_test,
                        reward_stim_delay,
                        stimulus_duration,
                        Cooldown,
                        Reward,
                        interaction,
                        Stimulus,
                        Light,
                        testStatus,
                        Duration,
                        nose_poke,
                        lever_press,
                        reward_count,
                        valid_lever_press,
                        invalid_lever_press,
                        valid_nose_poke,
                        invalid_nose_poke,
                        elapsed_seconds,
                        end_chime_enabled,
                        end_chime_pattern,
                        conducted_by_user_id,
                        conducted_by_email,
                        conducted_by_display_name,
                        camera_snapshot,
                        camera_snapshot_mime_type,
                        camera_snapshot_captured_at,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(testID) DO UPDATE SET
                        subjectID = excluded.subjectID,
                        Name = excluded.Name,
                        Goal = excluded.Goal,
                        goal_for_test = excluded.goal_for_test,
                        reward_stim_delay = excluded.reward_stim_delay,
                        stimulus_duration = excluded.stimulus_duration,
                        Cooldown = excluded.Cooldown,
                        Reward = excluded.Reward,
                        interaction = excluded.interaction,
                        Stimulus = excluded.Stimulus,
                        Light = excluded.Light,
                        testStatus = excluded.testStatus,
                        Duration = excluded.Duration,
                        nose_poke = excluded.nose_poke,
                        lever_press = excluded.lever_press,
                        reward_count = excluded.reward_count,
                        valid_lever_press = excluded.valid_lever_press,
                        invalid_lever_press = excluded.invalid_lever_press,
                        valid_nose_poke = excluded.valid_nose_poke,
                        invalid_nose_poke = excluded.invalid_nose_poke,
                        elapsed_seconds = excluded.elapsed_seconds,
                        end_chime_enabled = excluded.end_chime_enabled,
                        end_chime_pattern = excluded.end_chime_pattern,
                        conducted_by_user_id = excluded.conducted_by_user_id,
                        conducted_by_email = excluded.conducted_by_email,
                        conducted_by_display_name = excluded.conducted_by_display_name,
                        camera_snapshot = excluded.camera_snapshot,
                        camera_snapshot_mime_type = excluded.camera_snapshot_mime_type,
                        camera_snapshot_captured_at = excluded.camera_snapshot_captured_at,
                        updated_at = excluded.updated_at
                    """,
                    (
                        configuration.test_id,
                        configuration.subject_id,
                        configuration.test_name,
                        configuration.goal_for_trial,
                        configuration.goal_for_test,
                        configuration.reward_delay_seconds,
                        configuration.stimulus_duration_seconds,
                        configuration.cooldown_seconds,
                        configuration.reward_type,
                        configuration.interaction_type,
                        configuration.stimulus_type,
                        configuration.light_color,
                        status,
                        configuration.trial_duration_minutes,
                        counts["nose_poke_count"],
                        counts["lever_press_count"],
                        counts["reward_count"],
                        counts["valid_lever_press_count"],
                        counts["invalid_lever_press_count"],
                        counts["valid_nose_poke_count"],
                        counts["invalid_nose_poke_count"],
                        counts.get("elapsed_seconds", 0),
                        int(configuration.end_chime_enabled),
                        configuration.end_chime_pattern,
                        conducted_by.user_id if conducted_by else None,
                        conducted_by.email if conducted_by else "",
                        conducted_by.display_name if conducted_by else "",
                        None,
                        "",
                        None,
                        now,
                        now,
                    ),
                )
                connection.commit()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="DATABASE_SAVE_ERROR",
                message="Unable to save the current test configuration.",
                status=500,
                details={"reason": str(error)},
            ) from error

    def update_counts(
        self,
        test_id: int | None,
        counts: dict[str, int],
        *,
        status: str | None = None,
    ) -> None:
        """Persist the latest lever, nose poke, and reward counts for the active test."""
        if test_id is None:
            return

        try:
            with self.connect() as connection:
                if status is None:
                    connection.execute(
                        """
                        UPDATE Active_Test
                        SET nose_poke = ?,
                            lever_press = ?,
                            reward_count = ?,
                            valid_lever_press = ?,
                            invalid_lever_press = ?,
                            valid_nose_poke = ?,
                            invalid_nose_poke = ?,
                            elapsed_seconds = ?,
                            updated_at = ?
                        WHERE testID = ?
                        """,
                        (
                            counts["nose_poke_count"],
                            counts["lever_press_count"],
                            counts["reward_count"],
                            counts["valid_lever_press_count"],
                            counts["invalid_lever_press_count"],
                            counts["valid_nose_poke_count"],
                            counts["invalid_nose_poke_count"],
                            counts.get("elapsed_seconds", 0),
                            self._timestamp(),
                            test_id,
                        ),
                    )
                else:
                    connection.execute(
                        """
                        UPDATE Active_Test
                        SET nose_poke = ?,
                            lever_press = ?,
                            reward_count = ?,
                            valid_lever_press = ?,
                            invalid_lever_press = ?,
                            valid_nose_poke = ?,
                            invalid_nose_poke = ?,
                            elapsed_seconds = ?,
                            testStatus = ?,
                            updated_at = ?
                        WHERE testID = ?
                        """,
                        (
                            counts["nose_poke_count"],
                            counts["lever_press_count"],
                            counts["reward_count"],
                            counts["valid_lever_press_count"],
                            counts["invalid_lever_press_count"],
                            counts["valid_nose_poke_count"],
                            counts["invalid_nose_poke_count"],
                            counts.get("elapsed_seconds", 0),
                            status,
                            self._timestamp(),
                            test_id,
                        ),
                    )
                connection.commit()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="DATABASE_UPDATE_ERROR",
                message="Unable to update the current test counters.",
                status=500,
                details={"reason": str(error), "testID": test_id},
            ) from error

    def list_results(self) -> list[dict[str, object]]:
        """Return saved test runs in a frontend-friendly format."""

        try:
            with self.connect() as connection:
                rows = connection.execute(
                    """
                    SELECT
                        testID,
                        subjectID,
                        Name,
                        Goal,
                        goal_for_test,
                        reward_stim_delay,
                        stimulus_duration,
                        Cooldown,
                        Reward,
                        interaction,
                        Stimulus,
                        Light,
                        testStatus,
                        Duration,
                        nose_poke,
                        lever_press,
                        reward_count,
                        valid_lever_press,
                        invalid_lever_press,
                        valid_nose_poke,
                        invalid_nose_poke,
                        elapsed_seconds,
                        end_chime_enabled,
                        end_chime_pattern,
                        conducted_by_user_id,
                        conducted_by_email,
                        conducted_by_display_name,
                        CASE
                            WHEN camera_snapshot IS NOT NULL AND LENGTH(camera_snapshot) > 0 THEN 1
                            ELSE 0
                        END AS has_camera_snapshot,
                        camera_snapshot_mime_type,
                        camera_snapshot_captured_at,
                        created_at,
                        updated_at
                    FROM Active_Test
                    ORDER BY COALESCE(updated_at, created_at) DESC, testID DESC
                    """
                ).fetchall()
                result_ids = [row["testID"] for row in rows]
                event_rows = []
                if result_ids:
                    placeholders = ", ".join("?" for _ in result_ids)
                    event_rows = connection.execute(
                        f"""
                        SELECT
                            event_id,
                            test_id,
                            event_type,
                            event_label,
                            detail_text,
                            response_validity,
                            response_reason,
                            detail_value,
                            occurred_at,
                            elapsed_seconds
                        FROM test_events
                        WHERE test_id IN ({placeholders})
                        ORDER BY test_id ASC, elapsed_seconds ASC, event_id ASC
                        """,
                        tuple(result_ids),
                    ).fetchall()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="DATABASE_RESULTS_ERROR",
                message="Unable to load saved test results.",
                status=500,
                details={"reason": str(error)},
            ) from error

        events_by_test_id: dict[int, list[dict[str, object]]] = {}
        for event_row in event_rows:
            events_by_test_id.setdefault(event_row["test_id"], []).append(
                self._row_to_event(event_row)
            )

        results = []
        for row in rows:
            result = self._row_to_result(row)
            event_timeline = events_by_test_id.get(row["testID"], [])
            result["eventTimeline"] = event_timeline
            result["notes"] = [
                event
                for event in event_timeline
                if event["type"] == "note"
            ]
            result["eventCount"] = len(event_timeline)
            results.append(result)

        return results

    def save_result_snapshot(
        self,
        test_id: int,
        snapshot_bytes: bytes,
        *,
        mimetype: str,
    ) -> None:
        """Attach one optional snapshot image to the saved test row."""

        if not snapshot_bytes:
            return

        try:
            with self.connect() as connection:
                connection.execute(
                    """
                    UPDATE Active_Test
                    SET camera_snapshot = ?,
                        camera_snapshot_mime_type = ?,
                        camera_snapshot_captured_at = ?,
                        updated_at = ?
                    WHERE testID = ?
                    """,
                    (
                        sqlite3.Binary(snapshot_bytes),
                        str(mimetype or "").strip() or "image/jpeg",
                        self._timestamp(),
                        self._timestamp(),
                        test_id,
                    ),
                )
                connection.commit()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="RESULT_SNAPSHOT_SAVE_ERROR",
                message="Unable to attach the optional camera snapshot to the saved trial.",
                status=500,
                details={"reason": str(error), "testID": test_id},
            ) from error

    def get_result_snapshot(self, result_id: str) -> tuple[bytes, str]:
        """Return the optional saved snapshot image for one saved result."""

        normalized_result_id = str(result_id or "").strip()
        if not normalized_result_id:
            raise ApiError(
                code="RESULT_NOT_FOUND",
                message="The requested saved trial was not found.",
                status=404,
                details={"resultId": result_id},
            )

        try:
            with self.connect() as connection:
                row = connection.execute(
                    """
                    SELECT camera_snapshot, camera_snapshot_mime_type
                    FROM Active_Test
                    WHERE CAST(testID AS TEXT) = ?
                    """,
                    (normalized_result_id,),
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="RESULT_SNAPSHOT_READ_ERROR",
                message="Unable to load the saved camera snapshot.",
                status=500,
                details={"reason": str(error), "resultId": normalized_result_id},
            ) from error

        if row is None:
            raise ApiError(
                code="RESULT_NOT_FOUND",
                message="The requested saved trial was not found.",
                status=404,
                details={"resultId": normalized_result_id},
            )

        snapshot_bytes = row["camera_snapshot"]
        if not snapshot_bytes:
            raise ApiError(
                code="RESULT_SNAPSHOT_NOT_FOUND",
                message="No saved camera snapshot is attached to this trial.",
                status=404,
                details={"resultId": normalized_result_id},
            )

        mimetype = str(row["camera_snapshot_mime_type"] or "").strip() or "image/jpeg"
        return bytes(snapshot_bytes), mimetype

    def delete_result(self, result_id: str) -> None:
        """Delete one saved test run by its stable test identifier."""

        normalized_result_id = str(result_id or "").strip()
        if not normalized_result_id:
            raise ApiError(
                code="RESULT_NOT_FOUND",
                message="The requested saved trial was not found.",
                status=404,
                details={"resultId": result_id},
            )

        try:
            with self.connect() as connection:
                connection.execute(
                    """
                    DELETE FROM test_events
                    WHERE CAST(test_id AS TEXT) = ?
                    """,
                    (normalized_result_id,),
                )
                cursor = connection.execute(
                    """
                    DELETE FROM Active_Test
                    WHERE CAST(testID AS TEXT) = ?
                    """,
                    (normalized_result_id,),
                )
                connection.commit()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="RESULT_DELETE_ERROR",
                message="Unable to delete the selected saved trial.",
                status=500,
                details={"reason": str(error), "resultId": normalized_result_id},
            ) from error

        if cursor.rowcount == 0:
            raise ApiError(
                code="RESULT_NOT_FOUND",
                message="The requested saved trial was not found.",
                status=404,
                details={"resultId": normalized_result_id},
            )

    def delete_results(self, result_ids: list[str]) -> dict[str, object]:
        """Delete multiple saved test runs in one transaction for more reliable bulk cleanup."""

        normalized_ids: list[str] = []
        seen_ids: set[str] = set()
        for result_id in result_ids:
            normalized_result_id = str(result_id or "").strip()
            if not normalized_result_id or normalized_result_id in seen_ids:
                continue
            normalized_ids.append(normalized_result_id)
            seen_ids.add(normalized_result_id)

        if not normalized_ids:
            raise ApiError(
                code="RESULT_IDS_REQUIRED",
                message="Select at least one saved trial to delete.",
                status=400,
            )

        placeholders = ", ".join("?" for _ in normalized_ids)

        try:
            with self.connect() as connection:
                existing_rows = connection.execute(
                    f"""
                    SELECT CAST(testID AS TEXT) AS result_id
                    FROM Active_Test
                    WHERE CAST(testID AS TEXT) IN ({placeholders})
                    """,
                    tuple(normalized_ids),
                ).fetchall()
                existing_ids = [row["result_id"] for row in existing_rows]
                if existing_ids:
                    existing_placeholders = ", ".join("?" for _ in existing_ids)
                    connection.execute(
                        f"""
                        DELETE FROM test_events
                        WHERE CAST(test_id AS TEXT) IN ({existing_placeholders})
                        """,
                        tuple(existing_ids),
                    )
                    connection.execute(
                        f"""
                        DELETE FROM Active_Test
                        WHERE CAST(testID AS TEXT) IN ({existing_placeholders})
                        """,
                        tuple(existing_ids),
                    )
                connection.commit()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="RESULT_BATCH_DELETE_ERROR",
                message="Unable to delete the selected saved trials.",
                status=500,
                details={"reason": str(error), "resultIds": normalized_ids},
            ) from error

        deleted_ids = [result_id for result_id in normalized_ids if result_id in existing_ids]
        missing_ids = [result_id for result_id in normalized_ids if result_id not in existing_ids]

        return {
            "deletedIds": deleted_ids,
            "missingIds": missing_ids,
            "deletedCount": len(deleted_ids),
        }

    def clear_test_events(self, test_id: int) -> None:
        """Remove any previously saved event timeline for the selected test identifier."""

        try:
            with self.connect() as connection:
                connection.execute(
                    """
                    DELETE FROM test_events
                    WHERE test_id = ?
                    """,
                    (test_id,),
                )
                connection.commit()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="EVENT_LOG_CLEAR_ERROR",
                message="Unable to reset the event timeline for this test.",
                status=500,
                details={"reason": str(error), "testID": test_id},
            ) from error

    def log_test_event(
        self,
        test_id: int,
        event_type: str,
        event_label: str,
        *,
        detail_text: str = "",
        response_validity: str = "",
        response_reason: str = "",
        detail_value: float | None = None,
        elapsed_seconds: float = 0,
    ) -> dict[str, object]:
        """Append one timestamped event to the saved timeline for a test."""

        occurred_at = self._timestamp()
        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO test_events (
                        test_id,
                        event_type,
                        event_label,
                        detail_text,
                        response_validity,
                        response_reason,
                        detail_value,
                        occurred_at,
                        elapsed_seconds
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        test_id,
                        event_type,
                        event_label,
                        detail_text,
                        response_validity,
                        response_reason,
                        detail_value,
                        occurred_at,
                        elapsed_seconds,
                    ),
                )
                connection.commit()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="EVENT_LOG_WRITE_ERROR",
                message="Unable to save a test timeline event.",
                status=500,
                details={"reason": str(error), "testID": test_id, "eventType": event_type},
            ) from error

        return {
            "id": cursor.lastrowid,
            "testId": test_id,
            "type": event_type,
            "label": event_label,
            "detailText": detail_text,
            "responseValidity": response_validity,
            "responseReason": response_reason,
            "detailValue": detail_value,
            "occurredAt": occurred_at,
            "elapsedSeconds": round(float(elapsed_seconds or 0), 3),
        }

    def list_test_events(self, test_id: int) -> list[dict[str, object]]:
        """Return the saved event timeline for one test."""

        try:
            with self.connect() as connection:
                rows = connection.execute(
                    """
                    SELECT
                        event_id,
                        test_id,
                        event_type,
                        event_label,
                        detail_text,
                        response_validity,
                        response_reason,
                        detail_value,
                        occurred_at,
                        elapsed_seconds
                    FROM test_events
                    WHERE test_id = ?
                    ORDER BY elapsed_seconds ASC, event_id ASC
                    """,
                    (test_id,),
                ).fetchall()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="EVENT_LOG_READ_ERROR",
                message="Unable to load the saved event timeline.",
                status=500,
                details={"reason": str(error), "testID": test_id},
            ) from error

        return [self._row_to_event(row) for row in rows]

    def save_pump_calibration(
        self,
        duration_seconds: float,
        measured_volume_ml: float,
        *,
        note_text: str = "",
        conducted_by: ConductedBySnapshot | None = None,
    ) -> dict[str, object]:
        """Persist one pump-calibration measurement for later maintenance review."""

        derived_rate = measured_volume_ml / duration_seconds
        created_at = self._timestamp()

        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO maintenance_records (
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "pump_calibration",
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate,
                        note_text,
                        conducted_by.user_id if conducted_by else None,
                        conducted_by.email if conducted_by else "",
                        conducted_by.display_name if conducted_by else "",
                        created_at,
                    ),
                )
                connection.commit()

                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_id = ?
                    """,
                    (cursor.lastrowid,),
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="CALIBRATION_SAVE_ERROR",
                message="Unable to save the pump calibration measurement.",
                status=500,
                details={"reason": str(error)},
            ) from error

        return self._row_to_maintenance_record(row)

    def save_lever_debounce_setting(
        self,
        debounce_seconds: float,
        *,
        note_text: str = "",
        conducted_by: ConductedBySnapshot | None = None,
    ) -> dict[str, object]:
        """Persist one lever-debounce configuration change for maintenance tracking."""

        created_at = self._timestamp()

        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO maintenance_records (
                        record_type,
                        duration_seconds,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "lever_debounce",
                        debounce_seconds,
                        note_text,
                        conducted_by.user_id if conducted_by else None,
                        conducted_by.email if conducted_by else "",
                        conducted_by.display_name if conducted_by else "",
                        created_at,
                    ),
                )
                connection.commit()

                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_id = ?
                    """,
                    (cursor.lastrowid,),
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="LEVER_DEBOUNCE_SAVE_ERROR",
                message="Unable to save the lever debounce setting.",
                status=500,
                details={"reason": str(error)},
            ) from error

        return self._row_to_maintenance_record(row)

    def save_nose_poke_debounce_setting(
        self,
        debounce_seconds: float,
        *,
        note_text: str = "",
        conducted_by: ConductedBySnapshot | None = None,
    ) -> dict[str, object]:
        """Persist one nose-poke-debounce configuration change for maintenance tracking."""

        created_at = self._timestamp()

        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO maintenance_records (
                        record_type,
                        duration_seconds,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "nose_poke_debounce",
                        debounce_seconds,
                        note_text,
                        conducted_by.user_id if conducted_by else None,
                        conducted_by.email if conducted_by else "",
                        conducted_by.display_name if conducted_by else "",
                        created_at,
                    ),
                )
                connection.commit()

                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_id = ?
                    """,
                    (cursor.lastrowid,),
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="NOSE_POKE_DEBOUNCE_SAVE_ERROR",
                message="Unable to save the nose-poke debounce setting.",
                status=500,
                details={"reason": str(error)},
            ) from error

        return self._row_to_maintenance_record(row)

    def save_lever_release_requirement_setting(
        self,
        require_release_before_count: bool,
        *,
        note_text: str = "",
        conducted_by: ConductedBySnapshot | None = None,
    ) -> dict[str, object]:
        """Persist whether the lever must be released before a new press can count."""

        created_at = self._timestamp()
        stored_value = 1 if require_release_before_count else 0

        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO maintenance_records (
                        record_type,
                        duration_seconds,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "lever_release_requirement",
                        stored_value,
                        note_text,
                        conducted_by.user_id if conducted_by else None,
                        conducted_by.email if conducted_by else "",
                        conducted_by.display_name if conducted_by else "",
                        created_at,
                    ),
                )
                connection.commit()

                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_id = ?
                    """,
                    (cursor.lastrowid,),
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="LEVER_RELEASE_REQUIREMENT_SAVE_ERROR",
                message="Unable to save the lever release requirement.",
                status=500,
                details={"reason": str(error)},
            ) from error

        return self._row_to_maintenance_record(row)

    def save_reward_pulse_setting(
        self,
        reward_pulse_seconds: float,
        *,
        note_text: str = "",
        conducted_by: ConductedBySnapshot | None = None,
    ) -> dict[str, object]:
        """Persist one automatic reward-pulse setting for later maintenance review."""

        created_at = self._timestamp()

        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO maintenance_records (
                        record_type,
                        duration_seconds,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "reward_pulse",
                        reward_pulse_seconds,
                        note_text,
                        conducted_by.user_id if conducted_by else None,
                        conducted_by.email if conducted_by else "",
                        conducted_by.display_name if conducted_by else "",
                        created_at,
                    ),
                )
                connection.commit()

                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_id = ?
                    """,
                    (cursor.lastrowid,),
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="REWARD_PULSE_SAVE_ERROR",
                message="Unable to save the automatic reward pulse setting.",
                status=500,
                details={"reason": str(error)},
            ) from error

        return self._row_to_maintenance_record(row)

    def get_latest_pump_calibration(self) -> dict[str, object] | None:
        """Return the most recent pump calibration record, if one exists."""

        try:
            with self.connect() as connection:
                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_type = 'pump_calibration'
                    ORDER BY created_at DESC, record_id DESC
                    LIMIT 1
                    """
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="CALIBRATION_READ_ERROR",
                message="Unable to load the latest pump calibration.",
                status=500,
                details={"reason": str(error)},
            ) from error

        if row is None:
            return None
        return self._row_to_maintenance_record(row)

    def get_latest_lever_debounce_setting(self) -> dict[str, object] | None:
        """Return the most recent saved lever debounce configuration, if one exists."""

        try:
            with self.connect() as connection:
                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_type = 'lever_debounce'
                    ORDER BY created_at DESC, record_id DESC
                    LIMIT 1
                    """
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="LEVER_DEBOUNCE_READ_ERROR",
                message="Unable to load the latest lever debounce setting.",
                status=500,
                details={"reason": str(error)},
            ) from error

        if row is None:
            return None
        return self._row_to_maintenance_record(row)

    def get_latest_nose_poke_debounce_setting(self) -> dict[str, object] | None:
        """Return the most recent saved nose-poke debounce configuration, if one exists."""

        try:
            with self.connect() as connection:
                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_type = 'nose_poke_debounce'
                    ORDER BY created_at DESC, record_id DESC
                    LIMIT 1
                    """
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="NOSE_POKE_DEBOUNCE_READ_ERROR",
                message="Unable to load the latest nose-poke debounce setting.",
                status=500,
                details={"reason": str(error)},
            ) from error

        if row is None:
            return None
        return self._row_to_maintenance_record(row)

    def get_latest_reward_pulse_setting(self) -> dict[str, object] | None:
        """Return the most recent saved automatic reward pulse configuration, if one exists."""

        try:
            with self.connect() as connection:
                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_type = 'reward_pulse'
                    ORDER BY created_at DESC, record_id DESC
                    LIMIT 1
                    """
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="REWARD_PULSE_READ_ERROR",
                message="Unable to load the latest automatic reward pulse setting.",
                status=500,
                details={"reason": str(error)},
            ) from error

        if row is None:
            return None
        return self._row_to_maintenance_record(row)

    def get_latest_lever_release_requirement_setting(self) -> dict[str, object] | None:
        """Return the most recent saved lever release requirement, if one exists."""

        try:
            with self.connect() as connection:
                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_type = 'lever_release_requirement'
                    ORDER BY created_at DESC, record_id DESC
                    LIMIT 1
                    """
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="LEVER_RELEASE_REQUIREMENT_READ_ERROR",
                message="Unable to load the lever release requirement.",
                status=500,
                details={"reason": str(error)},
            ) from error

        if row is None:
            return None
        return self._row_to_maintenance_record(row)

    def save_stimulus_buzzer_mode_setting(
        self,
        stimulus_buzzer_mode: str,
        *,
        note_text: str = "",
        conducted_by: ConductedBySnapshot | None = None,
    ) -> dict[str, object]:
        """Persist whether trial tones use the passive or active buzzer path."""

        created_at = self._timestamp()
        stored_value = 1 if stimulus_buzzer_mode == "active" else 0

        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO maintenance_records (
                        record_type,
                        duration_seconds,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "stimulus_buzzer_mode",
                        stored_value,
                        note_text,
                        conducted_by.user_id if conducted_by else None,
                        conducted_by.email if conducted_by else "",
                        conducted_by.display_name if conducted_by else "",
                        created_at,
                    ),
                )
                connection.commit()

                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_id = ?
                    """,
                    (cursor.lastrowid,),
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="STIMULUS_BUZZER_MODE_SAVE_ERROR",
                message="Unable to save the trial buzzer output.",
                status=500,
                details={"reason": str(error)},
            ) from error

        return self._row_to_maintenance_record(row)

    def get_latest_stimulus_buzzer_mode_setting(self) -> dict[str, object] | None:
        """Return the most recent saved trial buzzer output choice, if one exists."""

        try:
            with self.connect() as connection:
                row = connection.execute(
                    """
                    SELECT
                        record_id,
                        record_type,
                        duration_seconds,
                        measured_volume_ml,
                        derived_rate_ml_per_second,
                        note_text,
                        created_by_user_id,
                        created_by_email,
                        created_by_display_name,
                        created_at
                    FROM maintenance_records
                    WHERE record_type = 'stimulus_buzzer_mode'
                    ORDER BY created_at DESC, record_id DESC
                    LIMIT 1
                    """
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="STIMULUS_BUZZER_MODE_READ_ERROR",
                message="Unable to load the trial buzzer output setting.",
                status=500,
                details={"reason": str(error)},
            ) from error

        if row is None:
            return None
        return self._row_to_maintenance_record(row)

    def list_presets(self, user_id: int) -> list[dict[str, object]]:
        """Return the saved presets for one authenticated user."""

        try:
            with self.connect() as connection:
                rows = connection.execute(
                    """
                    SELECT
                        preset_id,
                        name,
                        description,
                        test_name,
                        subject_id,
                        trial_duration,
                        goal_for_trial,
                        goal_for_test,
                        reward_delay_seconds,
                        stimulus_duration_seconds,
                        cooldown_seconds,
                        reward_type,
                        interaction_type,
                        stimulus_type,
                        light_color,
                        end_chime_enabled,
                        end_chime_pattern,
                        created_at,
                        updated_at
                    FROM user_presets
                    WHERE user_id = ?
                    ORDER BY name COLLATE NOCASE ASC, preset_id ASC
                    """,
                    (user_id,),
                ).fetchall()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="PRESET_LIST_ERROR",
                message="Unable to load saved presets.",
                status=500,
                details={"reason": str(error), "userId": user_id},
            ) from error

        return [self._row_to_preset(row) for row in rows]

    def save_preset(self, user_id: int, payload: dict) -> tuple[dict[str, object], bool]:
        """Create or update one preset for the authenticated user."""

        preset = PresetConfiguration.from_payload(payload)
        now = self._timestamp()

        try:
            with self.connect() as connection:
                existing_row = connection.execute(
                    """
                    SELECT *
                    FROM user_presets
                    WHERE user_id = ? AND preset_id = ?
                    """,
                    (user_id, preset.preset_id),
                ).fetchone()

                if existing_row is None:
                    existing_row = connection.execute(
                        """
                        SELECT *
                        FROM user_presets
                        WHERE user_id = ? AND LOWER(name) = LOWER(?)
                        """,
                        (user_id, preset.name),
                    ).fetchone()

                stored_preset_id = existing_row["preset_id"] if existing_row else preset.preset_id
                created_at = existing_row["created_at"] if existing_row and existing_row["created_at"] else now

                connection.execute(
                    """
                    INSERT INTO user_presets (
                        user_id,
                        preset_id,
                        name,
                        description,
                        test_name,
                        subject_id,
                        trial_duration,
                        goal_for_trial,
                        goal_for_test,
                        reward_delay_seconds,
                        stimulus_duration_seconds,
                        cooldown_seconds,
                        reward_type,
                        interaction_type,
                        stimulus_type,
                        light_color,
                        end_chime_enabled,
                        end_chime_pattern,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, preset_id) DO UPDATE SET
                        name = excluded.name,
                        description = excluded.description,
                        test_name = excluded.test_name,
                        subject_id = excluded.subject_id,
                        trial_duration = excluded.trial_duration,
                        goal_for_trial = excluded.goal_for_trial,
                        goal_for_test = excluded.goal_for_test,
                        reward_delay_seconds = excluded.reward_delay_seconds,
                        stimulus_duration_seconds = excluded.stimulus_duration_seconds,
                        cooldown_seconds = excluded.cooldown_seconds,
                        reward_type = excluded.reward_type,
                        interaction_type = excluded.interaction_type,
                        stimulus_type = excluded.stimulus_type,
                        light_color = excluded.light_color,
                        end_chime_enabled = excluded.end_chime_enabled,
                        end_chime_pattern = excluded.end_chime_pattern,
                        updated_at = excluded.updated_at
                    """,
                    (
                        user_id,
                        stored_preset_id,
                        preset.name,
                        preset.description,
                        preset.test_name,
                        preset.subject_id,
                        preset.trial_duration_minutes,
                        preset.goal_for_trial,
                        preset.goal_for_test,
                        preset.reward_delay_seconds,
                        preset.stimulus_duration_seconds,
                        preset.cooldown_seconds,
                        preset.reward_type,
                        preset.interaction_type,
                        preset.stimulus_type,
                        preset.light_color,
                        int(preset.end_chime_enabled),
                        preset.end_chime_pattern,
                        created_at,
                        now,
                    ),
                )
                connection.commit()

                saved_row = connection.execute(
                    """
                    SELECT *
                    FROM user_presets
                    WHERE user_id = ? AND preset_id = ?
                    """,
                    (user_id, stored_preset_id),
                ).fetchone()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="PRESET_SAVE_ERROR",
                message="Unable to save the selected preset.",
                status=500,
                details={"reason": str(error), "userId": user_id},
            ) from error

        return self._row_to_preset(saved_row), existing_row is not None

    def delete_preset(self, user_id: int, preset_id: str) -> None:
        """Remove one saved preset owned by the authenticated user."""

        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """
                    DELETE FROM user_presets
                    WHERE user_id = ? AND preset_id = ?
                    """,
                    (user_id, preset_id),
                )
                connection.commit()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="PRESET_DELETE_ERROR",
                message="Unable to delete the selected preset.",
                status=500,
                details={"reason": str(error), "userId": user_id, "presetId": preset_id},
            ) from error

        if cursor.rowcount == 0:
            raise ApiError(
                code="PRESET_NOT_FOUND",
                message="The requested preset was not found.",
                status=404,
                details={"userId": user_id, "presetId": preset_id},
            )

    @staticmethod
    def _row_to_result(row: sqlite3.Row) -> dict[str, object]:
        total_interactions = int((row["lever_press"] or 0) + (row["nose_poke"] or 0))
        goal_for_trial = int(row["Goal"] or 0)
        reward_count = int(row["reward_count"] or 0)
        configured_duration_seconds = float(row["Duration"] or 0) * 60
        elapsed_time_seconds = float(row["elapsed_seconds"] or 0)
        remaining_time_seconds = max(configured_duration_seconds - elapsed_time_seconds, 0)
        successful_attempts = reward_count
        unsuccessful_attempts = max(total_interactions - (successful_attempts * max(goal_for_trial, 1)), 0)

        return {
            "id": row["testID"],
            "name": row["Name"] or f"Test {row['testID']}",
            "subjectId": _normalize_subject_identifier(row["subjectID"]),
            "status": row["testStatus"] or "configured",
            "complete": (row["testStatus"] or "").lower() == "finished",
            "goalForTrial": goal_for_trial,
            "goalForTest": int(row["goal_for_test"] or 0),
            "pressesNeeded": goal_for_trial,
            "leverPressCount": int(row["lever_press"] or 0),
            "nosePokeCount": int(row["nose_poke"] or 0),
            "totalPresses": total_interactions,
            "rewardCount": reward_count,
            "validLeverPressCount": int(row["valid_lever_press"] or 0),
            "invalidLeverPressCount": int(row["invalid_lever_press"] or 0),
            "validNosePokeCount": int(row["valid_nose_poke"] or 0),
            "invalidNosePokeCount": int(row["invalid_nose_poke"] or 0),
            "successfulAttempts": successful_attempts,
            "unsuccessfulAttempts": unsuccessful_attempts,
            "configuredDurationMinutes": float(row["Duration"] or 0),
            "configuredDurationSeconds": configured_duration_seconds,
            "elapsedTimeSeconds": elapsed_time_seconds,
            "remainingTimeSeconds": remaining_time_seconds,
            "duration": _format_duration_seconds(elapsed_time_seconds),
            "rewardDelaySeconds": int(row["reward_stim_delay"] or 0),
            "stimulusDurationSeconds": int(row["stimulus_duration"] or 0),
            "cooldownSeconds": int(row["Cooldown"] or 0),
            "rewardType": row["Reward"] or "",
            "interactionType": row["interaction"] or "",
            "stimulusType": row["Stimulus"] or "",
            "lightColor": row["Light"] or "",
            "stimulusDescription": _describe_stimulus(row["Stimulus"] or "", row["Light"] or ""),
            "endChimeEnabled": bool(row["end_chime_enabled"] or 0),
            "endChimePattern": row["end_chime_pattern"] or DEFAULT_END_CHIME_PATTERN,
            "conductedBy": {
                "id": row["conducted_by_user_id"],
                "email": row["conducted_by_email"] or "",
                "displayName": row["conducted_by_display_name"] or "",
            },
            "hasCameraSnapshot": bool(row["has_camera_snapshot"]),
            "cameraSnapshotCapturedAt": row["camera_snapshot_captured_at"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    @staticmethod
    def _row_to_event(row: sqlite3.Row) -> dict[str, object]:
        """Convert one saved timeline event into the frontend's event shape."""

        return {
            "id": row["event_id"],
            "testId": row["test_id"],
            "type": row["event_type"] or "",
            "label": row["event_label"] or "",
            "detailText": row["detail_text"] or "",
            "responseValidity": row["response_validity"] or "",
            "responseReason": row["response_reason"] or "",
            "detailValue": row["detail_value"],
            "occurredAt": row["occurred_at"],
            "elapsedSeconds": round(float(row["elapsed_seconds"] or 0), 3),
        }

    @staticmethod
    def _row_to_maintenance_record(row: sqlite3.Row) -> dict[str, object]:
        """Convert a maintenance database row into the frontend's expected shape."""

        return {
            "id": row["record_id"],
            "recordType": row["record_type"] or "",
            "durationSeconds": round(float(row["duration_seconds"] or 0), 3),
            "measuredVolumeMl": round(float(row["measured_volume_ml"] or 0), 3),
            "derivedRateMlPerSecond": round(float(row["derived_rate_ml_per_second"] or 0), 4),
            "noteText": row["note_text"] or "",
            "createdBy": {
                "id": row["created_by_user_id"],
                "email": row["created_by_email"] or "",
                "displayName": row["created_by_display_name"] or "",
            },
            "createdAt": row["created_at"],
        }

    @staticmethod
    def _row_to_preset(row: sqlite3.Row) -> dict[str, object]:
        """Convert a preset database row into the frontend's preset shape."""

        return {
            "id": row["preset_id"],
            "name": row["name"] or "",
            "description": row["description"] or "",
            "testName": row["test_name"] or "",
            "subjectID": _normalize_subject_identifier(row["subject_id"]),
            "trialDuration": row["trial_duration"] or 0,
            "goalForTrial": row["goal_for_trial"] or 0,
            "goalForTest": row["goal_for_test"] or 0,
            "RewaStimTime": row["reward_delay_seconds"] or 0,
            "StimTimeOn": row["stimulus_duration_seconds"] or 0,
            "cooldown": row["cooldown_seconds"] or 0,
            "rewardType": row["reward_type"] or "Water",
            "interactionType": row["interaction_type"] or "Lever",
            "stimulusType": row["stimulus_type"] or "Light",
            "lightColor": row["light_color"] or "Box Light",
            "endChimeEnabled": bool(row["end_chime_enabled"] or 0),
            "endChimePattern": row["end_chime_pattern"] or DEFAULT_END_CHIME_PATTERN,
            "stimulusDescription": _describe_stimulus(
                row["stimulus_type"] or "",
                row["light_color"] or "",
            ),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    @staticmethod
    def _timestamp() -> str:
        """Store timestamps in UTC so updates are comparable across environments."""

        return datetime.now(timezone.utc).isoformat()


class SkinnerHardware:
    """Wrap GPIO devices so routes and test logic do not manipulate pins directly."""

    STIMULUS_TONE_FREQUENCY_HZ = 523.25
    DEFAULT_WATER_REWARD_SECONDS = 0.03
    END_CHIME_GAP_SECONDS = 0.05
    ERROR_BLINK_INTERVAL_SECONDS = 0.25
    STARTUP_IP_DISPLAY_SECONDS = 10
    DEFAULT_LEVER_DEBOUNCE_SECONDS = 0.15
    DEFAULT_NOSE_POKE_DEBOUNCE_SECONDS = 0.15
    DEFAULT_REQUIRE_LEVER_RELEASE_BEFORE_COUNT = False
    LEVER_INPUT_GPIO = 23
    NOSE_POKE_INPUT_GPIO = 16
    # GPIO pins for the three on-board LEDs that previously showed
    # running/error/program-OK status to the operator. They are now wired
    # together as the visual stimulus presented to the rat during trials.
    # Operator status info has moved to the OLED display only.
    STIMULUS_LIGHT_GPIOS = (5, 6, 26)

    def __init__(self) -> None:
        # Input devices used to detect user interactions inside the box.
        self.lever_debounce_seconds = self.DEFAULT_LEVER_DEBOUNCE_SECONDS
        self.lever_button = Button(
            self.LEVER_INPUT_GPIO,
            pull_up=False,
            bounce_time=self.lever_debounce_seconds,
        )

        # The nose-poke sensor is debounced just like the lever so a rat
        # holding its head in the poke does not generate a stream of repeat
        # events while the beam stays broken.
        self.nose_poke_debounce_seconds = self.DEFAULT_NOSE_POKE_DEBOUNCE_SECONDS
        self.nose_poke_button = Button(
            self.NOSE_POKE_INPUT_GPIO,
            pull_up=False,
            bounce_time=self.nose_poke_debounce_seconds,
        )

        # Trial hardware that affects the experiment itself.
        self.buzzer = PassiveBuzzer(27)
        # The blue cue light is no longer used during trials (the three
        # repurposed board LEDs are the visual stimulus). It remains wired
        # so the I/O test page can still exercise GPIO 25 directly.
        self.blue_led = LED(25, active_high=False)
        # Three ganged stimulus lights driven together as the rat's visual
        # cue. Order matches STIMULUS_LIGHT_GPIOS.
        self.stimulus_lights = tuple(LED(pin) for pin in self.STIMULUS_LIGHT_GPIOS)
        self.stimulus_light_on = False
        self.active_buzzer_output = OutputDevice(13)
        # The reward pump is driven through an N-channel MOSFET (Q2 on the
        # carrier board): GPIO 17 HIGH turns the MOSFET on and runs the
        # pump, GPIO 17 LOW keeps it off. So the pin is active-HIGH, and
        # the safe idle state is logical (and physical) LOW. Pair this with
        # `gpio=17=op,dl` in /boot/firmware/config.txt so the pin is held
        # low from firmware boot until gpiozero claims it.
        self.water_pump = OutputDevice(
            17,
            active_high=True,
            initial_value=False,
        )
        self.reward_pulse_seconds = self.DEFAULT_WATER_REWARD_SECONDS
        self.stimulus_buzzer_mode = "passive"

        # Box-status info (running / error / program-ok) is no longer shown
        # via dedicated LEDs (those pins are now stimulus lights). Status is
        # tracked in memory and rendered to the operator on the OLED only.
        self.status_display = StatusDisplay()

        # Cached light state is returned to the frontend in `/api/counts`.
        self.blue_on = False
        self.active_buzzer_output_on = False
        self.rgb_state = (0, 0, 0)
        self.running_on = False
        self.program_ok = False
        self.error_blinking = False
        self.last_chime_pattern: tuple[tuple[float, float], ...] = ()
        self.startup_ip_address = self._detect_local_ip_address()
        self.startup_banner_deadline = (
            time.monotonic() + self.STARTUP_IP_DISPLAY_SECONDS
        )
        self._status_refresh_callback = None

        self._error_blink_stop = threading.Event()
        self._error_blink_thread: threading.Thread | None = None
        self._startup_refresh_timer = threading.Timer(
            self.STARTUP_IP_DISPLAY_SECONDS,
            self._refresh_after_startup_banner,
        )
        self._startup_refresh_timer.daemon = True
        self._startup_refresh_timer.start()

        self.set_running_indicator(False)
        self.clear_error_state()
        self.show_waiting_status()

    def register_status_refresh(self, refresh_callback) -> None:
        """Let the session manager re-render OLED state when the startup banner expires."""

        self._status_refresh_callback = refresh_callback

    def register_callbacks(self, on_lever_press, on_lever_release, on_nose_poke) -> None:
        """Attach backend callbacks to the physical or mocked button inputs."""
        try:
            self.lever_button.when_pressed = on_lever_press
            self.lever_button.when_released = on_lever_release
            self.nose_poke_button.when_pressed = on_nose_poke
        except Exception as error:
            self._raise_hardware_error(
                code="HARDWARE_CALLBACK_ERROR",
                message="Unable to register hardware callbacks.",
                error=error,
            )

    def set_lever_debounce_seconds(self, debounce_seconds: float) -> float:
        """Apply the currently configured lever debounce to the live button input."""

        try:
            normalized_seconds = round(max(float(debounce_seconds), 0), 3)
        except (TypeError, ValueError) as error:
            raise ApiError(
                code="LEVER_DEBOUNCE_INVALID",
                message="Lever debounce must be a number of seconds.",
                status=400,
            ) from error

        try:
            self.lever_button.bounce_time = normalized_seconds
            self.lever_debounce_seconds = normalized_seconds
            return normalized_seconds
        except Exception as error:
            self._raise_hardware_error(
                code="LEVER_DEBOUNCE_APPLY_ERROR",
                message="Unable to apply the lever debounce setting.",
                error=error,
                device="lever_button",
            )

    def set_nose_poke_debounce_seconds(self, debounce_seconds: float) -> float:
        """Apply the currently configured nose-poke debounce to the live input.

        Mirrors ``set_lever_debounce_seconds`` so a rat holding its head in the
        poke does not generate repeat events while the beam stays broken.
        """

        try:
            normalized_seconds = round(max(float(debounce_seconds), 0), 3)
        except (TypeError, ValueError) as error:
            raise ApiError(
                code="NOSE_POKE_DEBOUNCE_INVALID",
                message="Nose-poke debounce must be a number of seconds.",
                status=400,
            ) from error

        try:
            self.nose_poke_button.bounce_time = normalized_seconds
            self.nose_poke_debounce_seconds = normalized_seconds
            return normalized_seconds
        except Exception as error:
            self._raise_hardware_error(
                code="NOSE_POKE_DEBOUNCE_APPLY_ERROR",
                message="Unable to apply the nose-poke debounce setting.",
                error=error,
                device="nose_poke_button",
            )

    def set_reward_pulse_seconds(self, reward_pulse_seconds: float) -> float:
        """Apply the current automatic water reward duration used during trials."""

        try:
            normalized_seconds = round(max(float(reward_pulse_seconds), 0), 4)
        except (TypeError, ValueError) as error:
            raise ApiError(
                code="REWARD_PULSE_INVALID",
                message="Reward pulse must be a number of seconds.",
                status=400,
            ) from error

        if normalized_seconds <= 0:
            raise ApiError(
                code="REWARD_PULSE_INVALID",
                message="Reward pulse must be greater than zero seconds.",
                status=400,
            )

        self.reward_pulse_seconds = normalized_seconds
        return normalized_seconds

    def set_blue(self, enabled: bool) -> None:
        """Turn the blue cue light on or off and mirror that state in memory."""
        try:
            self.blue_on = enabled
            if enabled:
                self.blue_led.on()
            else:
                self.blue_led.off()
        except Exception as error:
            self._raise_hardware_error(
                code="BLUE_LIGHT_ERROR",
                message="Unable to control the blue light.",
                error=error,
                device="blue_light",
            )

    def set_active_buzzer_output(self, enabled: bool) -> None:
        """Turn the digital active-buzzer output on or off."""
        try:
            self.active_buzzer_output_on = enabled
            if enabled:
                self.active_buzzer_output.on()
            else:
                self.active_buzzer_output.off()
        except Exception as error:
            self._raise_hardware_error(
                code="ACTIVE_BUZZER_OUTPUT_ERROR",
                message="Unable to control the active buzzer output.",
                error=error,
                device="active_buzzer_output",
            )

    def set_stimulus_buzzer_mode(self, mode: str) -> str:
        """Choose whether trial tones use the passive or active buzzer output."""

        normalized_mode = str(mode or "").strip().lower()
        if normalized_mode not in {"passive", "active"}:
            raise ApiError(
                code="INVALID_STIMULUS_BUZZER_MODE",
                message="Stimulus buzzer mode must be passive or active.",
                status=400,
            )
        self.stimulus_buzzer_mode = normalized_mode
        return normalized_mode

    def set_rgb(self, red: bool, green: bool, blue: bool) -> None:
        """Retain the legacy RGB API contract without using the repurposed status pins."""

        self.rgb_state = (int(red), int(green), int(blue))

    def set_stimulus_lights(self, enabled: bool) -> None:
        """Drive the three repurposed board LEDs together as the rat stimulus."""
        try:
            self.stimulus_light_on = bool(enabled)
            for light in self.stimulus_lights:
                if enabled:
                    light.on()
                else:
                    light.off()
        except Exception as error:
            self._raise_hardware_error(
                code="STIMULUS_LIGHT_ERROR",
                message="Unable to control the rat stimulus lights.",
                error=error,
                device="stimulus_lights",
            )

    def set_running_indicator(self, enabled: bool) -> None:
        """Track whether a test is running. Indicator is now shown on the OLED only."""

        self.running_on = bool(enabled)

    def set_program_healthy(self, enabled: bool) -> None:
        """Track program-health state. Surfaced via the OLED / status API only."""

        self.program_ok = bool(enabled)

    def clear_error_state(self) -> None:
        """Stop any active error indicator. No physical LED is driven anymore."""

        try:
            self._error_blink_stop.set()
            error_thread = self._error_blink_thread
            self._error_blink_thread = None
            if error_thread and error_thread.is_alive() and error_thread is not threading.current_thread():
                error_thread.join(timeout=1)
            self.error_blinking = False
            self.set_program_healthy(True)
        except Exception as error:
            self._raise_hardware_error(
                code="ERROR_STATE_CLEAR_ERROR",
                message="Unable to clear the error indicator.",
                error=error,
                device="status_display",
            )

    def signal_error(self, message: str | None = None) -> None:
        """Mark an error condition. Surfaced on the OLED; no LED blinks anymore."""

        try:
            self.set_program_healthy(False)
            self.show_error_status(message)
            if self.error_blinking and self._error_blink_thread and self._error_blink_thread.is_alive():
                return

            self._error_blink_stop = threading.Event()
            self.error_blinking = True
            self._error_blink_thread = threading.Thread(
                target=self._error_blink_loop,
                name="skinnerbox-error-state",
                daemon=True,
            )
            self._error_blink_thread.start()
        except ApiError:
            raise
        except Exception as error:
            self._raise_hardware_error(
                code="ERROR_STATE_ERROR",
                message="Unable to start the error indicator.",
                error=error,
                device="status_display",
            )

    def play_stimulus(
        self,
        stimulus_type: str,
        light_color: str,
        duration_seconds: float,
        stop_event: threading.Event,
    ) -> None:
        """Play one stimulus cycle using the configured light, tone, or both."""
        try:
            duration_seconds = max(duration_seconds, 0)
            stimulus_type = stimulus_type.lower()

            if stimulus_type == "tone":
                self._start_trial_buzzer()
                self._sleep(duration_seconds, stop_event)
                self._stop_trial_buzzer()
                return

            if stimulus_type == "light + tone":
                self.set_stimulus_lights(True)
                self._start_trial_buzzer()
                self._sleep(duration_seconds, stop_event)
                self._stop_trial_buzzer()
                self.set_stimulus_lights(False)
                return

            self.set_stimulus_lights(True)
            self._sleep(duration_seconds, stop_event)
            self.set_stimulus_lights(False)
        except ApiError:
            raise
        except Exception as error:
            self._raise_hardware_error(
                code="STIMULUS_OUTPUT_ERROR",
                message="Unable to play the configured stimulus.",
                error=error,
                device=stimulus_type,
            )

    def deliver_reward(self, reward_type: str, stop_event: threading.Event) -> None:
        """Deliver the configured reward without exposing GPIO details to the session."""
        try:
            if reward_type.lower() == "water":
                self.water_pump.on()
                self._sleep(self.reward_pulse_seconds, stop_event)
                self.water_pump.off()
                return

            self.set_active_buzzer_output(True)
            self._sleep(1, stop_event)
            self.set_active_buzzer_output(False)
        except ApiError:
            raise
        except Exception as error:
            self._raise_hardware_error(
                code="REWARD_OUTPUT_ERROR",
                message="Unable to deliver the configured reward.",
                error=error,
                device=reward_type.lower(),
            )

    def prime_pump(self, duration_seconds: float) -> float:
        """Run the water pump manually so the line can be primed before a test."""

        try:
            duration_seconds = max(float(duration_seconds), 0)
        except (TypeError, ValueError) as error:
            raise ApiError(
                code="INVALID_PUMP_PRIME_DURATION",
                message="Pump prime duration must be a number of seconds.",
                status=400,
                details={"reason": str(error)},
            ) from error

        if duration_seconds <= 0:
            raise ApiError(
                code="INVALID_PUMP_PRIME_DURATION",
                message="Pump prime duration must be greater than zero seconds.",
                status=400,
                details={"duration_seconds": duration_seconds},
            )

        stop_event = threading.Event()
        try:
            self.water_pump.on()
            self._sleep(duration_seconds, stop_event)
            self.water_pump.off()
            return duration_seconds
        except ApiError:
            raise
        except Exception as error:
            self._raise_hardware_error(
                code="PUMP_PRIME_ERROR",
                message="Unable to prime the water pump.",
                error=error,
                device="water_pump",
            )

    def play_end_chime(self, pattern: str) -> None:
        """Play a short custom note pattern after a test finishes."""

        note_pairs = _parse_end_chime_pattern(pattern)
        self.last_chime_pattern = note_pairs

        try:
            for index, (frequency_hz, duration_seconds) in enumerate(note_pairs):
                self.buzzer.play(frequency_hz)
                time.sleep(duration_seconds)
                self.buzzer.stop()
                if index < len(note_pairs) - 1:
                    time.sleep(self.END_CHIME_GAP_SECONDS)
        except Exception as error:
            self._raise_hardware_error(
                code="END_CHIME_ERROR",
                message="Unable to play the configured end chime.",
                error=error,
                device="passive_buzzer",
            )

    def stop_all(self) -> None:
        """Fail-safe used by stop/finish paths to leave every output off."""
        try:
            self.set_stimulus_lights(False)
            self.set_blue(False)
            self.set_active_buzzer_output(False)
            self.set_running_indicator(False)
            self.water_pump.off()
            self.buzzer.stop()
        except ApiError:
            raise
        except Exception as error:
            self._raise_hardware_error(
                code="HARDWARE_STOP_ERROR",
                message="Unable to stop all hardware outputs safely.",
                error=error,
            )

    @property
    def light_on(self) -> bool:
        """Expose whether any light output is currently active for UI display."""

        return self.stimulus_light_on or self.blue_on

    @property
    def trial_buzzer_on(self) -> bool:
        """Expose whether the trial buzzer path is currently active."""

        if self.stimulus_buzzer_mode == "active":
            return self.active_buzzer_output_on
        return bool(getattr(self.buzzer, "is_active", False))

    def _start_trial_buzzer(self) -> None:
        if self.stimulus_buzzer_mode == "active":
            self.set_active_buzzer_output(True)
            return
        self.buzzer.play(self.STIMULUS_TONE_FREQUENCY_HZ)

    def _stop_trial_buzzer(self) -> None:
        if self.stimulus_buzzer_mode == "active":
            self.set_active_buzzer_output(False)
            return
        self.buzzer.stop()

    def show_waiting_status(
        self,
        *,
        test_name: str | None = None,
        subject_id: int | None = None,
        paused: bool = False,
        finished: bool = False,
        lever_count: int | None = None,
        reward_count: int | None = None,
    ) -> None:
        """Show a simple ready/paused/finished status on the OLED displays."""

        if (
            not paused
            and not finished
            and not test_name
            and self._startup_banner_active()
        ):
            self._render_status_lines(
                [
                    "SkinnerBox",
                    "READY",
                    "IP Address",
                    self.startup_ip_address or "Not available",
                    "Press Start",
                ]
            )
            return

        header = "PAUSED" if paused else "FINISHED" if finished else "READY"
        lines = ["SkinnerBox", header]
        if test_name:
            lines.append(test_name)
        elif not paused and not finished:
            lines.append("Waiting for test")

        if paused or finished:
            if lever_count is not None:
                lines.append(f"Lever {lever_count}")
            elif subject_id is not None:
                lines.append(f"Subj {subject_id}")
            if reward_count is not None:
                lines.append(f"Reward {reward_count}")
        elif subject_id is not None:
            lines.append(f"Subj {subject_id}")
            lines.append(self._format_ready_ip_line())
        else:
            lines.append(self._format_ready_ip_line())

        self._render_status_lines(lines)

    def show_running_status(
        self,
        *,
        test_name: str,
        remaining_seconds: float,
        lever_count: int,
        reward_count: int,
    ) -> None:
        """Show the live trial countdown and main counts while the test is running."""

        lines = [
            "RUNNING",
            self._truncate_line(test_name),
            f"Left {self._format_seconds(remaining_seconds)}",
            f"Lever {lever_count}",
            f"Reward {reward_count}",
        ]
        self._render_status_lines(lines)

    def show_error_status(self, message: str | None = None) -> None:
        """Show a short error summary on the OLED displays."""

        lines = ["ERROR"]
        if message:
            message = str(message).strip()
            if len(message) <= 21:
                lines.append(message)
            else:
                lines.append(self._truncate_line(message[:21]))
                lines.append(self._truncate_line(message[21:42]))
        else:
            lines.append("Backend problem")
        self._render_status_lines(lines)

    def _render_status_lines(self, lines: list[str]) -> None:
        """Render status lines while avoiding redundant OLED redraws."""

        normalized = tuple(str(line or "").strip() for line in lines if str(line or "").strip())
        if normalized == self.status_display.last_lines:
            return
        self.status_display.render(normalized)

    @staticmethod
    def _format_seconds(total_seconds: float) -> str:
        total_seconds = max(int(round(total_seconds)), 0)
        minutes, seconds = divmod(total_seconds, 60)
        hours, minutes = divmod(minutes, 60)
        if hours:
            return f"{hours}:{minutes:02d}:{seconds:02d}"
        return f"{minutes:02d}:{seconds:02d}"

    @staticmethod
    def _truncate_line(text: str) -> str:
        normalized = str(text or "").strip()
        if len(normalized) <= 21:
            return normalized
        return normalized[:18] + "..."

    def _format_ready_ip_line(self) -> str:
        """Render a short IP summary for the standby READY screen."""

        return self._truncate_line(
            f"IP {self.startup_ip_address}" if self.startup_ip_address else "IP unavailable"
        )

    def _error_blink_loop(self) -> None:
        """Hold the error indicator until the fault is cleared.

        The dedicated error LED has been repurposed as part of the rat
        stimulus, so this loop simply keeps the in-memory flag set while the
        fault persists. Operator-facing error messaging now lives on the
        OLED status display (see ``show_error_status``).
        """

        # Wait for the clear signal; we still spin so the fault remains
        # observable through ``error_blinking`` until it is cleared.
        self._error_blink_stop.wait()
        self.error_blinking = False

    def _refresh_after_startup_banner(self) -> None:
        """Swap the initial IP-address banner out for the normal status view."""

        refresh_callback = self._status_refresh_callback
        if refresh_callback is not None:
            refresh_callback()
            return
        self.show_waiting_status()

    def _startup_banner_active(self) -> bool:
        return time.monotonic() < self.startup_banner_deadline

    @staticmethod
    def _detect_local_ip_address() -> str:
        """Best-effort lookup for the primary LAN IP shown during backend startup."""

        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe_socket:
                probe_socket.connect(("8.8.8.8", 80))
                detected_ip = probe_socket.getsockname()[0]
        except OSError:
            detected_ip = ""

        if detected_ip and not detected_ip.startswith("127."):
            return detected_ip

        try:
            host_ip = socket.gethostbyname(socket.gethostname())
        except OSError:
            return ""

        return "" if host_ip.startswith("127.") else host_ip

    @staticmethod
    def _sleep(duration_seconds: float, stop_event: threading.Event) -> None:
        """Sleep in short intervals so stop requests can interrupt long actions."""

        if duration_seconds <= 0:
            return
        deadline = time.time() + duration_seconds
        while time.time() < deadline:
            if stop_event.wait(0.05):
                break

    @staticmethod
    def _raise_hardware_error(
        *,
        code: str,
        message: str,
        error: Exception,
        device: str | None = None,
    ) -> None:
        details = {"reason": str(error)}
        if device is not None:
            details["device"] = device
        raise ApiError(code=code, message=message, status=500, details=details) from error


class TestSessionManager:
    """Owns the active test lifecycle, interaction counting, and test loop thread."""

    # Polling interval used while waiting for the next valid interaction or stop request.
    POLL_INTERVAL_SECONDS = 0.05

    def __init__(self, repository: SQLiteTestRepository, hardware: SkinnerHardware) -> None:
        self.repository = repository
        self.hardware = hardware
        self.lock = threading.Lock()

        # Thread signaling primitives for the background test loop.
        self.stop_event = threading.Event()
        self.response_event = threading.Event()
        self.worker_thread: threading.Thread | None = None

        # The current saved test configuration, if one has been prepared.
        self.active_test: TestConfiguration | None = None

        # Stores stimulus-to-response timing values for future reporting/debugging.
        self.latencies: list[float] = []
        self._reset_runtime_state()
        self._apply_saved_maintenance_settings()
        self.hardware.register_callbacks(
            self.on_lever_press,
            self.on_lever_release,
            self.on_nose_poke,
        )
        self.hardware.register_status_refresh(self._refresh_status_display)
        self._refresh_status_display()

    def _apply_saved_maintenance_settings(self) -> None:
        """Restore saved maintenance settings like lever debounce on startup."""

        latest_reward_pulse = self.repository.get_latest_reward_pulse_setting()
        if latest_reward_pulse is not None:
            self.hardware.set_reward_pulse_seconds(
                latest_reward_pulse["durationSeconds"]
            )

        latest_lever_debounce = self.repository.get_latest_lever_debounce_setting()
        if latest_lever_debounce is not None:
            self.hardware.set_lever_debounce_seconds(
                latest_lever_debounce["durationSeconds"]
            )

        latest_nose_poke_debounce = (
            self.repository.get_latest_nose_poke_debounce_setting()
        )
        if latest_nose_poke_debounce is not None:
            self.hardware.set_nose_poke_debounce_seconds(
                latest_nose_poke_debounce["durationSeconds"]
            )

        latest_lever_release_requirement = (
            self.repository.get_latest_lever_release_requirement_setting()
        )
        if latest_lever_release_requirement is not None:
            self.set_require_lever_release_before_count(
                latest_lever_release_requirement["durationSeconds"] >= 0.5
            )

        latest_stimulus_buzzer_mode = (
            self.repository.get_latest_stimulus_buzzer_mode_setting()
        )
        if latest_stimulus_buzzer_mode is not None:
            self.hardware.set_stimulus_buzzer_mode(
                "active"
                if latest_stimulus_buzzer_mode["durationSeconds"] >= 0.5
                else "passive"
            )

    def configure_test(
        self,
        payload: dict,
        current_user: AuthenticatedUser | None = None,
    ) -> TestConfiguration:
        """Save incoming test settings and reset runtime state for a fresh run."""
        try:
            configuration = TestConfiguration.from_payload(payload)
            conducted_by = (
                ConductedBySnapshot.from_authenticated_user(current_user)
                if current_user is not None
                else None
            )
            initial_lever_presses = _coerce_int(payload.get("leverPress"), "leverPress", default=0)
            initial_nose_pokes = _coerce_int(payload.get("nosePoke"), "nosePoke", default=0)

            self._halt_worker(mark_paused=False)
            self.hardware.stop_all()
            self.hardware.clear_error_state()

            with self.lock:
                self.active_test = configuration
                self.lever_press_count = initial_lever_presses
                self.nose_poke_count = initial_nose_pokes
                self.reward_count = 0
                self.valid_interaction_count = 0
                self.sequence_index = 0
                self.test_finished = False
                self.test_running = False
                self.test_paused = False
                self.stimulus_active = False
                self.lever_ready_for_press = True
                self.elapsed_before_pause = 0.0
                self.run_started_at = None
                self.last_stimulus_started_at = 0.0
                self.last_response_at = 0.0
                self.last_error = None
                self.active_conducted_by = conducted_by
                self.latencies.clear()
                counts = self._counts_locked()

            self.repository.save_configuration(
                configuration,
                counts,
                "configured",
                conducted_by,
            )
            self.repository.clear_test_events(configuration.test_id)
            configured_event = self.repository.log_test_event(
                configuration.test_id,
                "configured",
                "Test configured",
                detail_text=(
                    f"{configuration.test_name} prepared for subject {configuration.subject_id}."
                    if configuration.subject_id is not None
                    else f"{configuration.test_name} prepared without subject tracking."
                ),
                elapsed_seconds=counts.get("elapsed_seconds", 0),
            )
            with self.lock:
                self.current_event_timeline = [configured_event]
            self._refresh_status_display()
            return configuration
        except ApiError as error:
            self._remember_error(error)
            raise
        except Exception as error:
            api_error = ApiError(
                code="TEST_CONFIGURATION_ERROR",
                message="Unable to prepare the test configuration.",
                status=500,
                details={"reason": str(error)},
            )
            self._remember_error(api_error)
            raise api_error from error

    def start_test(
        self,
        payload: dict | None = None,
        current_user: AuthenticatedUser | None = None,
    ) -> None:
        """Start the background test loop after a configuration has been provided."""
        start_prepared = False
        worker_thread: threading.Thread | None = None
        try:
            if payload and self.active_test is None:
                self.configure_test(payload, current_user=current_user)

            with self.lock:
                if self.active_test is None:
                    raise ConfigurationError("No test configuration has been saved yet.")
                if self.test_running:
                    return

                if current_user is not None:
                    self.active_conducted_by = ConductedBySnapshot.from_authenticated_user(current_user)

                was_paused = self.test_paused
                self.hardware.clear_error_state()
                self.stop_event = threading.Event()
                self.response_event = threading.Event()
                self.test_running = True
                self.test_paused = False
                self.test_finished = False
                self.last_error = None
                self.run_started_at = time.time()
                worker_thread = threading.Thread(
                    target=self._run_test_loop,
                    name="skinnerbox-test-loop",
                    daemon=True,
                )
                self.worker_thread = worker_thread
                counts = self._counts_locked()
                test_id = self.active_test.test_id
                active_test = self.active_test
                active_conducted_by = self.active_conducted_by
                start_prepared = True

            self.hardware.set_running_indicator(True)
            self.repository.save_configuration(
                active_test,
                counts,
                "running",
                active_conducted_by,
            )
            self.repository.update_counts(test_id, counts, status="running")
            self._log_test_event(
                "resumed" if was_paused else "started",
                "Test resumed" if was_paused else "Test started",
                detail_text=f"{active_test.test_name} is now running.",
                elapsed_seconds=counts.get("elapsed_seconds", 0),
            )
            if worker_thread is not None:
                worker_thread.start()
            self._refresh_status_display()
        except ApiError as error:
            if start_prepared:
                self._rollback_failed_start()
            self._remember_error(error)
            raise
        except Exception as error:
            if start_prepared:
                self._rollback_failed_start()
            api_error = ApiError(
                code="TEST_START_ERROR",
                message="Unable to start the test.",
                status=500,
                details={"reason": str(error)},
            )
            self._remember_error(api_error)
            raise api_error from error

    def stop_test(self) -> None:
        """Pause a running test or leave a finished test in its completed state."""
        try:
            with self.lock:
                already_finished = self.test_finished
            self._halt_worker(mark_paused=not already_finished)
        except ApiError as error:
            self._remember_error(error)
            raise
        except Exception as error:
            api_error = ApiError(
                code="TEST_STOP_ERROR",
                message="Unable to stop the test cleanly.",
                status=500,
                details={"reason": str(error)},
            )
            self._remember_error(api_error)
            raise api_error from error

    def finish_test(self) -> None:
        """Mark the active test complete so SQLite and the UI share one source of truth."""

        try:
            with self.lock:
                if self.active_test is None:
                    raise ConfigurationError("No test configuration has been saved yet.")
                already_finished = self.test_finished

            if not already_finished:
                self._finish_test()
        except ApiError as error:
            self._remember_error(error)
            raise
        except Exception as error:
            api_error = ApiError(
                code="TEST_FINISH_ERROR",
                message="Unable to finish the test cleanly.",
                status=500,
                details={"reason": str(error)},
            )
            self._remember_error(api_error)
            raise api_error from error

    def update_counts_from_payload(self, payload: dict) -> dict[str, object]:
        """Support the legacy update endpoint by replacing cached count values."""
        try:
            with self.lock:
                self.lever_press_count = _coerce_int(
                    payload.get("leverPress"),
                    "leverPress",
                    default=self.lever_press_count,
                )
                self.nose_poke_count = _coerce_int(
                    payload.get("nosePoke"),
                    "nosePoke",
                    default=self.nose_poke_count,
                )
                counts = self._counts_locked()
                test_id = self.active_test.test_id if self.active_test else None
                status = self._status_locked()

            self.repository.update_counts(test_id, counts, status=status)
            return counts
        except ApiError as error:
            self._remember_error(error)
            raise
        except Exception as error:
            api_error = ApiError(
                code="TEST_UPDATE_ERROR",
                message="Unable to update the test counters.",
                status=500,
                details={"reason": str(error)},
            )
            self._remember_error(api_error)
            raise api_error from error

    def get_counts(self) -> dict[str, object]:
        """Return the counters and light status shown by the frontend."""

        with self.lock:
            return self._counts_locked()

    def get_status(self) -> dict[str, object]:
        """Return frontend polling flags for finished/running/paused state."""

        with self.lock:
            return {
                "testFinished": self.test_finished,
                "testRunning": self.test_running,
                "testPaused": self.test_paused,
                "activeTest": (
                    self.active_test.to_response_payload()
                    if self.active_test is not None
                    else None
                ),
                "conductedBy": self._conducted_by_payload_locked(),
                "error": self.last_error,
                "eventTimeline": list(self.current_event_timeline),
                "notes": [
                    event
                    for event in self.current_event_timeline
                    if event["type"] == "note"
                ],
                "activeTestId": self.active_test.test_id if self.active_test else None,
            }

    def prime_pump(self, payload: dict | None = None) -> dict[str, object]:
        """Prime the water line while no active test is running."""

        payload = payload or {}
        try:
            with self.lock:
                if self.test_running:
                    raise ApiError(
                        code="PUMP_PRIME_BLOCKED",
                        message="Stop the current test before priming the pump.",
                        status=409,
                        details={"testRunning": True},
                    )

            duration_seconds = _coerce_float(
                payload.get("durationSeconds"),
                "durationSeconds",
                default=1.0,
            )
            self.hardware.clear_error_state()
            primed_duration = self.hardware.prime_pump(duration_seconds)
            self._refresh_status_display()
            return {
                "message": "Pump primed successfully.",
                "durationSeconds": primed_duration,
            }
        except ApiError as error:
            self._remember_error(error)
            raise
        except Exception as error:
            api_error = ApiError(
                code="PUMP_PRIME_ERROR",
                message="Unable to prime the pump.",
                status=500,
                details={"reason": str(error)},
            )
            self._remember_error(api_error)
            raise api_error from error

    def test_buzzer(self, payload: dict | None = None) -> dict[str, object]:
        """Play a short buzzer chirp from the I/O page while no test is running."""

        payload = payload or {}
        pattern = str(payload.get("pattern") or "523:0.08,659:0.08")
        try:
            with self.lock:
                if self.test_running:
                    raise ApiError(
                        code="BUZZER_TEST_BLOCKED",
                        message="Stop the current test before playing the buzzer test.",
                        status=409,
                        details={"testRunning": True},
                    )

            self.hardware.clear_error_state()
            self.hardware.play_end_chime(pattern)
            self._refresh_status_display()
            return {
                "message": "Buzzer test played successfully.",
                "pattern": pattern,
            }
        except ApiError as error:
            self._remember_error(error)
            raise
        except Exception as error:
            api_error = ApiError(
                code="BUZZER_TEST_ERROR",
                message="Unable to play the buzzer test.",
                status=500,
                details={"reason": str(error)},
            )
            self._remember_error(api_error)
            raise api_error from error

    def add_note(
        self,
        payload: dict | None = None,
        current_user: AuthenticatedUser | None = None,
    ) -> dict[str, object]:
        """Store one operator note on the active trial timeline."""

        payload = payload or {}
        note_text = _coerce_text(payload.get("noteText"), "noteText", default="").strip()
        if not note_text:
            raise ApiError(
                code="NOTE_TEXT_REQUIRED",
                message="Enter a note before saving it to the active trial.",
                status=400,
            )
        if len(note_text) > 500:
            raise ApiError(
                code="NOTE_TOO_LONG",
                message="Trial notes must be 500 characters or fewer.",
                status=400,
            )

        try:
            with self.lock:
                if self.active_test is None or self.test_finished:
                    raise ApiError(
                        code="NOTE_NOT_ALLOWED",
                        message="Start or resume a trial before adding operator notes.",
                        status=409,
                    )
                if not self.test_running and not self.test_paused:
                    raise ApiError(
                        code="NOTE_NOT_ALLOWED",
                        message="Operator notes can only be added while a trial is running or paused.",
                        status=409,
                    )

            note_event = self._log_test_event(
                "note",
                "Operator note",
                detail_text=note_text,
            )
            return {
                "message": "Operator note saved.",
                "note": note_event,
                "eventTimeline": self.get_status()["eventTimeline"],
            }
        except ApiError:
            raise
        except Exception as error:
            api_error = ApiError(
                code="NOTE_SAVE_ERROR",
                message="Unable to save the operator note.",
                status=500,
                details={"reason": str(error)},
            )
            raise api_error from error

    def save_pump_calibration(
        self,
        payload: dict | None = None,
        current_user: AuthenticatedUser | None = None,
    ) -> dict[str, object]:
        """Store a pump calibration measurement from the maintenance page."""

        payload = payload or {}
        try:
            with self.lock:
                if self.test_running:
                    raise ApiError(
                        code="CALIBRATION_BLOCKED",
                        message="Stop the current test before saving a pump calibration.",
                        status=409,
                        details={"testRunning": True},
                    )

            duration_seconds = _coerce_float(payload.get("durationSeconds"), "durationSeconds", default=0)
            measured_volume_ml = _coerce_float(payload.get("measuredVolumeMl"), "measuredVolumeMl", default=0)
            note_text = _coerce_text(payload.get("noteText"), "noteText", default="").strip()

            if duration_seconds <= 0:
                raise ApiError(
                    code="CALIBRATION_DURATION_INVALID",
                    message="Pump calibration duration must be greater than zero seconds.",
                    status=400,
                )
            if measured_volume_ml <= 0:
                raise ApiError(
                    code="CALIBRATION_VOLUME_INVALID",
                    message="Measured pump volume must be greater than zero milliliters.",
                    status=400,
                )

            conducted_by = (
                ConductedBySnapshot.from_authenticated_user(current_user)
                if current_user is not None
                else None
            )
            calibration = self.repository.save_pump_calibration(
                duration_seconds,
                measured_volume_ml,
                note_text=note_text,
                conducted_by=conducted_by,
            )
            return {
                "message": "Pump calibration saved successfully.",
                "calibration": calibration,
            }
        except ApiError:
            raise
        except Exception as error:
            api_error = ApiError(
                code="CALIBRATION_SAVE_ERROR",
                message="Unable to save the pump calibration.",
                status=500,
                details={"reason": str(error)},
            )
            raise api_error from error

    def save_lever_debounce(
        self,
        payload: dict | None = None,
        current_user: AuthenticatedUser | None = None,
    ) -> dict[str, object]:
        """Store and apply a lever debounce value for live hardware testing."""

        payload = payload or {}
        try:
            with self.lock:
                if self.test_running:
                    raise ApiError(
                        code="LEVER_DEBOUNCE_BLOCKED",
                        message="Stop the current test before changing lever debounce.",
                        status=409,
                        details={"testRunning": True},
                    )

            debounce_milliseconds = _coerce_float(
                payload.get("debounceMilliseconds"),
                "debounceMilliseconds",
                default=0,
            )
            note_text = _coerce_text(payload.get("noteText"), "noteText", default="").strip()

            if debounce_milliseconds < 10:
                raise ApiError(
                    code="LEVER_DEBOUNCE_TOO_LOW",
                    message="Lever debounce must be at least 10 milliseconds.",
                    status=400,
                )
            if debounce_milliseconds > 2000:
                raise ApiError(
                    code="LEVER_DEBOUNCE_TOO_HIGH",
                    message="Lever debounce must be 2000 milliseconds or less.",
                    status=400,
                )

            debounce_seconds = round(debounce_milliseconds / 1000, 3)
            applied_seconds = self.hardware.set_lever_debounce_seconds(debounce_seconds)
            conducted_by = (
                ConductedBySnapshot.from_authenticated_user(current_user)
                if current_user is not None
                else None
            )
            lever_debounce = self.repository.save_lever_debounce_setting(
                applied_seconds,
                note_text=note_text,
                conducted_by=conducted_by,
            )
            return {
                "message": "Lever debounce saved successfully.",
                "leverDebounce": lever_debounce,
            }
        except ApiError:
            raise
        except Exception as error:
            api_error = ApiError(
                code="LEVER_DEBOUNCE_SAVE_ERROR",
                message="Unable to save the lever debounce setting.",
                status=500,
                details={"reason": str(error)},
            )
            raise api_error from error

    def save_nose_poke_debounce(
        self,
        payload: dict | None = None,
        current_user: AuthenticatedUser | None = None,
    ) -> dict[str, object]:
        """Store and apply a nose-poke debounce value for live hardware testing."""

        payload = payload or {}
        try:
            with self.lock:
                if self.test_running:
                    raise ApiError(
                        code="NOSE_POKE_DEBOUNCE_BLOCKED",
                        message="Stop the current test before changing nose-poke debounce.",
                        status=409,
                        details={"testRunning": True},
                    )

            debounce_milliseconds = _coerce_float(
                payload.get("debounceMilliseconds"),
                "debounceMilliseconds",
                default=0,
            )
            note_text = _coerce_text(payload.get("noteText"), "noteText", default="").strip()

            if debounce_milliseconds < 10:
                raise ApiError(
                    code="NOSE_POKE_DEBOUNCE_TOO_LOW",
                    message="Nose-poke debounce must be at least 10 milliseconds.",
                    status=400,
                )
            if debounce_milliseconds > 2000:
                raise ApiError(
                    code="NOSE_POKE_DEBOUNCE_TOO_HIGH",
                    message="Nose-poke debounce must be 2000 milliseconds or less.",
                    status=400,
                )

            debounce_seconds = round(debounce_milliseconds / 1000, 3)
            applied_seconds = self.hardware.set_nose_poke_debounce_seconds(debounce_seconds)
            conducted_by = (
                ConductedBySnapshot.from_authenticated_user(current_user)
                if current_user is not None
                else None
            )
            nose_poke_debounce = self.repository.save_nose_poke_debounce_setting(
                applied_seconds,
                note_text=note_text,
                conducted_by=conducted_by,
            )
            return {
                "message": "Nose-poke debounce saved successfully.",
                "nosePokeDebounce": nose_poke_debounce,
            }
        except ApiError:
            raise
        except Exception as error:
            api_error = ApiError(
                code="NOSE_POKE_DEBOUNCE_SAVE_ERROR",
                message="Unable to save the nose-poke debounce setting.",
                status=500,
                details={"reason": str(error)},
            )
            raise api_error from error

    def set_require_lever_release_before_count(self, required: bool) -> bool:
        """Apply whether a lever must return to rest before another press is counted."""

        with self.lock:
            self.require_lever_release_before_count = bool(required)
            self.lever_ready_for_press = True
            return self.require_lever_release_before_count

    def save_lever_release_requirement(
        self,
        payload: dict | None = None,
        current_user: AuthenticatedUser | None = None,
    ) -> dict[str, object]:
        """Store whether lever counts must wait for a release before another press."""

        payload = payload or {}
        try:
            with self.lock:
                if self.test_running:
                    raise ApiError(
                        code="LEVER_RELEASE_REQUIREMENT_BLOCKED",
                        message="Stop the current test before changing the lever count mode.",
                        status=409,
                        details={"testRunning": True},
                    )

            require_release_before_count = _coerce_bool(
                payload.get("requireReleaseBeforeCount"),
                "requireReleaseBeforeCount",
                default=False,
            )
            note_text = _coerce_text(payload.get("noteText"), "noteText", default="").strip()
            applied_value = self.set_require_lever_release_before_count(
                require_release_before_count
            )
            conducted_by = (
                ConductedBySnapshot.from_authenticated_user(current_user)
                if current_user is not None
                else None
            )
            lever_release_requirement = (
                self.repository.save_lever_release_requirement_setting(
                    applied_value,
                    note_text=note_text,
                    conducted_by=conducted_by,
                )
            )
            return {
                "message": "Lever count mode saved successfully.",
                "leverReleaseRequirement": lever_release_requirement,
            }
        except ApiError:
            raise
        except Exception as error:
            api_error = ApiError(
                code="LEVER_RELEASE_REQUIREMENT_SAVE_ERROR",
                message="Unable to save the lever count mode.",
                status=500,
                details={"reason": str(error)},
            )
            raise api_error from error

    def save_reward_pulse(
        self,
        payload: dict | None = None,
        current_user: AuthenticatedUser | None = None,
    ) -> dict[str, object]:
        """Store and apply the automatic water reward pulse used during trials."""

        payload = payload or {}
        try:
            with self.lock:
                if self.test_running:
                    raise ApiError(
                        code="REWARD_PULSE_BLOCKED",
                        message="Stop the current test before changing the automatic reward pulse.",
                        status=409,
                        details={"testRunning": True},
                    )

            reward_pulse_milliseconds = _coerce_float(
                payload.get("rewardPulseMilliseconds"),
                "rewardPulseMilliseconds",
                default=0,
            )
            note_text = _coerce_text(payload.get("noteText"), "noteText", default="").strip()

            if reward_pulse_milliseconds < 10:
                raise ApiError(
                    code="REWARD_PULSE_TOO_LOW",
                    message="Automatic reward pulse must be at least 10 milliseconds.",
                    status=400,
                )
            if reward_pulse_milliseconds > 5000:
                raise ApiError(
                    code="REWARD_PULSE_TOO_HIGH",
                    message="Automatic reward pulse must be 5000 milliseconds or less.",
                    status=400,
                )

            reward_pulse_seconds = round(reward_pulse_milliseconds / 1000, 4)
            applied_seconds = self.hardware.set_reward_pulse_seconds(reward_pulse_seconds)
            conducted_by = (
                ConductedBySnapshot.from_authenticated_user(current_user)
                if current_user is not None
                else None
            )
            reward_pulse = self.repository.save_reward_pulse_setting(
                applied_seconds,
                note_text=note_text,
                conducted_by=conducted_by,
            )
            return {
                "message": "Automatic reward pulse saved successfully.",
                "rewardPulse": reward_pulse,
            }
        except ApiError:
            raise
        except Exception as error:
            api_error = ApiError(
                code="REWARD_PULSE_SAVE_ERROR",
                message="Unable to save the automatic reward pulse.",
                status=500,
                details={"reason": str(error)},
            )
            raise api_error from error

    def save_stimulus_buzzer_mode(
        self,
        payload: dict | None = None,
        current_user: AuthenticatedUser | None = None,
    ) -> dict[str, object]:
        """Store whether trial tones should use the passive or active buzzer line."""

        payload = payload or {}
        try:
            with self.lock:
                if self.test_running:
                    raise ApiError(
                        code="STIMULUS_BUZZER_MODE_BLOCKED",
                        message="Stop the current test before changing the trial buzzer output.",
                        status=409,
                        details={"testRunning": True},
                    )

            stimulus_buzzer_mode = self.hardware.set_stimulus_buzzer_mode(
                payload.get("stimulusBuzzerMode")
            )
            note_text = _coerce_text(payload.get("noteText"), "noteText", default="").strip()
            conducted_by = (
                ConductedBySnapshot.from_authenticated_user(current_user)
                if current_user is not None
                else None
            )
            saved_mode = self.repository.save_stimulus_buzzer_mode_setting(
                stimulus_buzzer_mode,
                note_text=note_text,
                conducted_by=conducted_by,
            )
            return {
                "message": "Trial buzzer output saved successfully.",
                "stimulusBuzzerMode": stimulus_buzzer_mode,
                "record": saved_mode,
            }
        except ApiError:
            raise
        except Exception as error:
            api_error = ApiError(
                code="STIMULUS_BUZZER_MODE_SAVE_ERROR",
                message="Unable to save the trial buzzer output.",
                status=500,
                details={"reason": str(error)},
            )
            raise api_error from error

    def get_maintenance_status(self) -> dict[str, object]:
        """Return maintenance and calibration status for the Test I/O page."""

        latest_calibration = self.repository.get_latest_pump_calibration()
        latest_reward_pulse = self.repository.get_latest_reward_pulse_setting()
        latest_lever_debounce = self.repository.get_latest_lever_debounce_setting()
        latest_nose_poke_debounce = (
            self.repository.get_latest_nose_poke_debounce_setting()
        )
        latest_lever_release_requirement = (
            self.repository.get_latest_lever_release_requirement_setting()
        )
        latest_stimulus_buzzer_mode = (
            self.repository.get_latest_stimulus_buzzer_mode_setting()
        )
        reward_pulse_seconds = self.hardware.reward_pulse_seconds
        estimated_reward_volume_ml = None
        if latest_calibration is not None:
            estimated_reward_volume_ml = round(
                latest_calibration["derivedRateMlPerSecond"] * reward_pulse_seconds,
                4,
            )
        with self.lock:
            return {
                "gpioMode": os.getenv("GPIO_MODE", "auto"),
                "oledMode": os.getenv("OLED_MODE", "auto"),
                "testRunning": self.test_running,
                "testPaused": self.test_paused,
                "testFinished": self.test_finished,
                "programOk": self.hardware.program_ok,
                "runningIndicatorOn": self.hardware.running_on,
                "errorIndicatorBlinking": self.hardware.error_blinking,
                "lightOn": self.hardware.light_on,
                "latestPumpCalibration": latest_calibration,
                "latestRewardPulse": latest_reward_pulse,
                "latestLeverDebounce": latest_lever_debounce,
                "latestNosePokeDebounce": latest_nose_poke_debounce,
                "latestLeverReleaseRequirement": latest_lever_release_requirement,
                "latestStimulusBuzzerMode": latest_stimulus_buzzer_mode,
                "rewardPulseSeconds": reward_pulse_seconds,
                "defaultRewardPulseMilliseconds": int(
                    round(self.hardware.DEFAULT_WATER_REWARD_SECONDS * 1000)
                ),
                "activeRewardPulseMilliseconds": int(
                    round(self.hardware.reward_pulse_seconds * 1000)
                ),
                "estimatedRewardVolumeMl": estimated_reward_volume_ml,
                "defaultLeverDebounceMilliseconds": int(
                    round(self.hardware.DEFAULT_LEVER_DEBOUNCE_SECONDS * 1000)
                ),
                "activeLeverDebounceMilliseconds": int(
                    round(self.hardware.lever_debounce_seconds * 1000)
                ),
                "defaultNosePokeDebounceMilliseconds": int(
                    round(self.hardware.DEFAULT_NOSE_POKE_DEBOUNCE_SECONDS * 1000)
                ),
                "activeNosePokeDebounceMilliseconds": int(
                    round(self.hardware.nose_poke_debounce_seconds * 1000)
                ),
                "defaultRequireLeverReleaseBeforeCount": (
                    self.hardware.DEFAULT_REQUIRE_LEVER_RELEASE_BEFORE_COUNT
                ),
                "activeRequireLeverReleaseBeforeCount": (
                    self.require_lever_release_before_count
                ),
                "defaultStimulusBuzzerMode": "passive",
                "activeStimulusBuzzerMode": self.hardware.stimulus_buzzer_mode,
            }

    def on_lever_press(self) -> None:
        """Callback entry point for real or simulated lever presses."""

        with self.lock:
            if self.require_lever_release_before_count and not self.lever_ready_for_press:
                return
            if self.require_lever_release_before_count:
                self.lever_ready_for_press = False

        self._record_interaction("Lever")

    def on_lever_release(self) -> None:
        """Callback entry point for real or simulated lever releases."""

        with self.lock:
            self.lever_ready_for_press = True

    def on_nose_poke(self) -> None:
        """Callback entry point for real or simulated nose pokes."""

        self._record_interaction("Poke")

    def _record_interaction(self, interaction: str) -> None:
        """Count an input and decide whether it advances the test, rewards, or finishes."""

        reward_due = False
        reward_type = "Water"
        should_finish = False
        response_validity = "valid"
        response_reason = ""

        with self.lock:
            if interaction == "Lever":
                self.lever_press_count += 1
            else:
                self.nose_poke_count += 1

            self.last_response_at = time.time()
            active_test = self.active_test
            cue_active = self.hardware.light_on or self.hardware.trial_buzzer_on

            if cue_active:
                response_validity = "invalid"
                response_reason = "stimulus_active"
                if interaction == "Lever":
                    self.invalid_lever_press_count += 1
                else:
                    self.invalid_nose_poke_count += 1
            elif interaction == "Lever":
                self.valid_lever_press_count += 1
            else:
                self.valid_nose_poke_count += 1

            if active_test and self.test_running and response_validity == "valid":
                if self._advance_sequence_locked(interaction, active_test.interaction_type):
                    self.valid_interaction_count += 1
                    self.response_event.set()
                    if (
                        active_test.goal_for_trial > 0
                        and self.valid_interaction_count % active_test.goal_for_trial == 0
                    ):
                        self.reward_count += 1
                        reward_due = True
                        reward_type = active_test.reward_type
                    if (
                        active_test.goal_for_test > 0
                        and self.valid_interaction_count >= active_test.goal_for_test
                    ):
                        should_finish = True

            counts = self._counts_locked()
            test_id = active_test.test_id if active_test else None
            status = self._status_locked()

        if test_id is not None:
            self._log_test_event(
                "lever_press" if interaction == "Lever" else "nose_poke",
                "Lever press" if interaction == "Lever" else "Nose poke",
                detail_text=(
                    "Counted while no light or trial buzzer was active."
                    if response_validity == "valid"
                    else "Ignored because the light or trial buzzer was active."
                ),
                response_validity=response_validity,
                response_reason=response_reason,
                elapsed_seconds=counts.get("elapsed_seconds", 0),
            )

        if reward_due:
            self.hardware.deliver_reward(reward_type, self.stop_event)
            if test_id is not None:
                self._log_test_event(
                    "reward_delivered",
                    "Reward delivered",
                    detail_text=reward_type,
                    elapsed_seconds=counts.get("elapsed_seconds", 0),
                )
        self.repository.update_counts(test_id, counts, status=status)
        self._refresh_status_display()

        if should_finish:
            self._finish_test()

    def _run_test_loop(self) -> None:
        """Cycle stimulus -> wait for response -> delay until the test is stopped/finished."""
        last_display_remaining: int | None = None
        try:
            while not self.stop_event.is_set():
                with self.lock:
                    active_test = self.active_test
                    if active_test is None or not self.test_running:
                        return
                    duration_seconds = max(active_test.trial_duration_minutes, 0) * 60

                if duration_seconds and self._elapsed_seconds() >= duration_seconds:
                    self._finish_test()
                    return

                self.response_event.clear()
                self._play_stimulus(active_test)

                while not self.stop_event.wait(self.POLL_INTERVAL_SECONDS):
                    should_refresh_display = False
                    with self.lock:
                        if self.active_test is None or not self.test_running:
                            return

                        current_remaining = int(
                            max(duration_seconds - self._elapsed_seconds_locked(), 0)
                        )
                        if current_remaining != last_display_remaining:
                            last_display_remaining = current_remaining
                            should_refresh_display = True

                        if duration_seconds and self._elapsed_seconds_locked() >= duration_seconds:
                            should_finish = True
                            break

                        if (
                            active_test.goal_for_test > 0
                            and self.valid_interaction_count >= active_test.goal_for_test
                        ):
                            should_finish = True
                            break

                        if self.response_event.is_set():
                            should_finish = False
                            if (
                                self.last_stimulus_started_at
                                and self.last_response_at >= self.last_stimulus_started_at
                            ):
                                self.latencies.append(
                                    self.last_response_at - self.last_stimulus_started_at
                                )
                            break
                    continue
                else:
                    return

                if should_refresh_display:
                    self._refresh_status_display()

                if should_finish:
                    self._finish_test()
                    return

                if self.stop_event.wait(max(active_test.reward_delay_seconds, 0)):
                    return
        except ApiError as error:
            self._store_runtime_error(error)
        except Exception as error:
            self._store_runtime_error(
                ApiError(
                    code="TEST_RUNTIME_ERROR",
                    message="The active test stopped because the backend hit an unexpected error.",
                    status=500,
                    details={"reason": str(error)},
                )
            )

    def _play_stimulus(self, active_test: TestConfiguration) -> None:
        """Mark the stimulus as active while delegating the actual output to hardware."""

        with self.lock:
            self.stimulus_active = True
            self.last_stimulus_started_at = time.time()
        self._log_test_event(
            "stimulus_on",
            "Stimulus on",
            detail_text=_describe_stimulus(active_test.stimulus_type, active_test.light_color),
        )
        try:
            self.hardware.play_stimulus(
                active_test.stimulus_type,
                active_test.light_color,
                active_test.stimulus_duration_seconds,
                self.stop_event,
            )
        finally:
            with self.lock:
                self.stimulus_active = False
            self._log_test_event(
                "stimulus_off",
                "Stimulus off",
                detail_text=_describe_stimulus(active_test.stimulus_type, active_test.light_color),
            )

    def _halt_worker(self, *, mark_paused: bool) -> None:
        """Stop the background loop, preserve counters, and optionally mark the test paused."""

        with self.lock:
            self.stop_event.set()
            self.response_event.set()
            worker_thread = self.worker_thread
            self.worker_thread = None
            if self.test_running and self.run_started_at is not None:
                self.elapsed_before_pause = self._elapsed_seconds_locked()
            self.run_started_at = None
            self.test_running = False
            if not self.test_finished:
                self.test_paused = mark_paused
            counts = self._counts_locked()
            test_id = self.active_test.test_id if self.active_test else None
            status = self._status_locked()

        self.hardware.stop_all()
        if worker_thread and worker_thread.is_alive() and worker_thread is not threading.current_thread():
            worker_thread.join(timeout=1)
        self.repository.update_counts(test_id, counts, status=status)
        if mark_paused and test_id is not None and not self.test_finished:
            self._log_test_event(
                "paused",
                "Test paused",
                elapsed_seconds=counts.get("elapsed_seconds", 0),
            )
        self._refresh_status_display()

    def _finish_test(self) -> None:
        """End the active test because its goal or duration has been reached."""

        with self.lock:
            active_test = self.active_test
            self.stop_event.set()
            self.response_event.set()
            worker_thread = self.worker_thread
            self.worker_thread = None
            if self.run_started_at is not None:
                self.elapsed_before_pause = self._elapsed_seconds_locked()
            self.run_started_at = None
            self.test_running = False
            self.test_paused = False
            counts = self._counts_locked()
            test_id = active_test.test_id if active_test else None

        self.hardware.stop_all()
        if worker_thread and worker_thread.is_alive() and worker_thread is not threading.current_thread():
            worker_thread.join(timeout=1)
        self.repository.update_counts(test_id, counts, status="finished")
        if test_id is not None:
            self._log_test_event(
                "finished",
                "Test finished",
                elapsed_seconds=counts.get("elapsed_seconds", 0),
            )
            self._attach_optional_result_snapshot(test_id)
        with self.lock:
            self.test_finished = True
        self._refresh_status_display()

        if active_test and active_test.end_chime_enabled:
            try:
                self.hardware.play_end_chime(active_test.end_chime_pattern)
            except ApiError as error:
                self._remember_error(error)
                try:
                    self.hardware.signal_error(error.message)
                except ApiError:
                    pass

    def _reset_runtime_state(self) -> None:
        """Initialize in-memory counters and flags for a brand new session manager."""

        # Frontend-visible counters.
        self.lever_press_count = 0
        self.nose_poke_count = 0
        self.reward_count = 0
        self.valid_lever_press_count = 0
        self.invalid_lever_press_count = 0
        self.valid_nose_poke_count = 0
        self.invalid_nose_poke_count = 0

        # Interaction sequencing state for multi-step test types.
        self.valid_interaction_count = 0
        self.sequence_index = 0

        # Lifecycle flags surfaced through `/api/test/status`.
        self.test_finished = False
        self.test_running = False
        self.test_paused = False
        self.stimulus_active = False

        # Timing markers used for pause/resume and optional latency tracking.
        self.elapsed_before_pause = 0.0
        self.run_started_at = None
        self.last_stimulus_started_at = 0.0
        self.last_response_at = 0.0
        self.last_error = None
        self.active_conducted_by: ConductedBySnapshot | None = None
        self.current_event_timeline: list[dict[str, object]] = []
        self.require_lever_release_before_count = (
            self.hardware.DEFAULT_REQUIRE_LEVER_RELEASE_BEFORE_COUNT
        )
        self.lever_ready_for_press = True

    def _attach_optional_result_snapshot(self, test_id: int) -> None:
        """Best-effort camera snapshot capture that never blocks trial completion."""

        try:
            camera_status = camera_manager.get_status()
        except Exception:
            return

        if not camera_status.get("available"):
            return

        try:
            snapshot_bytes, mimetype = camera_manager.capture_frame()
            self.repository.save_result_snapshot(
                test_id,
                snapshot_bytes,
                mimetype=mimetype,
            )
        except CameraUnavailableError:
            return
        except Exception:
            return

    def _advance_sequence_locked(self, interaction: str, configured_interaction: str) -> bool:
        """Check whether the latest input completes the configured interaction pattern."""

        sequence = _interaction_sequence(configured_interaction)
        expected_interaction = sequence[self.sequence_index]

        if interaction == expected_interaction:
            self.sequence_index += 1
            if self.sequence_index == len(sequence):
                self.sequence_index = 0
                return True
            return False

        self.sequence_index = 1 if interaction == sequence[0] else 0
        return False

    def _counts_locked(self) -> dict[str, object]:
        """Return the count payload while the caller already holds the lock."""

        configured_duration_seconds = self._configured_duration_seconds_locked()

        return {
            "lever_press_count": self.lever_press_count,
            "nose_poke_count": self.nose_poke_count,
            "reward_count": self.reward_count,
            "valid_lever_press_count": self.valid_lever_press_count,
            "invalid_lever_press_count": self.invalid_lever_press_count,
            "valid_nose_poke_count": self.valid_nose_poke_count,
            "invalid_nose_poke_count": self.invalid_nose_poke_count,
            "light_on": self.hardware.light_on,
            "elapsed_seconds": round(self._elapsed_seconds_locked(), 2),
            "configured_duration_seconds": configured_duration_seconds,
            "remaining_seconds": round(max(self._remaining_seconds_locked(), 0), 2),
        }

    def _status_locked(self) -> str:
        """Translate runtime flags into a single DB-friendly status string."""

        if self.last_error:
            return "error"
        if self.test_finished:
            return "finished"
        if self.test_running:
            return "running"
        if self.test_paused:
            return "paused"
        return "configured"

    def _conducted_by_payload_locked(self) -> dict[str, object] | None:
        """Expose the current operator snapshot in the frontend's expected shape."""

        if self.active_conducted_by is None:
            return None
        return self.active_conducted_by.to_response_payload()

    def _elapsed_seconds(self) -> float:
        """Thread-safe helper for total elapsed runtime across pauses/resumes."""

        with self.lock:
            return self._elapsed_seconds_locked()

    def _elapsed_seconds_locked(self) -> float:
        """Elapsed runtime calculation used while the caller already holds the lock."""

        elapsed = self.elapsed_before_pause
        if self.test_running and self.run_started_at is not None:
            elapsed += time.time() - self.run_started_at
        return elapsed

    def _configured_duration_seconds_locked(self) -> float:
        """Return the active test duration in seconds."""

        if self.active_test is None:
            return 0
        return round(self.active_test.trial_duration_minutes * 60, 2)

    def _remaining_seconds_locked(self) -> float:
        """Return the amount of time left in the active test."""

        configured_duration_seconds = self._configured_duration_seconds_locked()
        if configured_duration_seconds <= 0:
            return 0
        return configured_duration_seconds - self._elapsed_seconds_locked()

    def _refresh_status_display(self) -> None:
        """Update the optional OLED display from the current in-memory test state."""

        with self.lock:
            self._refresh_status_display_locked()

    def _refresh_status_display_locked(self) -> None:
        """Render the current session state while the caller already holds the lock."""

        if self.last_error:
            self.hardware.show_error_status(
                self.last_error.get("message") or self.last_error.get("code")
            )
            return

        active_test = self.active_test
        if self.test_running and active_test is not None:
            self.hardware.show_running_status(
                test_name=active_test.test_name,
                remaining_seconds=max(self._remaining_seconds_locked(), 0),
                lever_count=self.lever_press_count,
                reward_count=self.reward_count,
            )
            return

        if self.test_paused and active_test is not None:
            self.hardware.show_waiting_status(
                test_name=active_test.test_name,
                subject_id=active_test.subject_id,
                paused=True,
                lever_count=self.lever_press_count,
                reward_count=self.reward_count,
            )
            return

        if self.test_finished and active_test is not None:
            self.hardware.show_waiting_status(
                test_name=active_test.test_name,
                subject_id=active_test.subject_id,
                finished=True,
                lever_count=self.lever_press_count,
                reward_count=self.reward_count,
            )
            return

        if active_test is not None:
            self.hardware.show_waiting_status(
                test_name=active_test.test_name,
                subject_id=active_test.subject_id,
            )
            return

        self.hardware.show_waiting_status()

    def _remember_error(self, error: ApiError) -> None:
        """Store the latest structured backend error for request responses and polling."""

        with self.lock:
            self.last_error = error.to_payload()["error"]
            self._refresh_status_display_locked()

    def _rollback_failed_start(self) -> None:
        """Return the session to a configured state if startup fails mid-flight."""

        with self.lock:
            self.stop_event.set()
            self.response_event.set()
            self.worker_thread = None
            self.test_running = False
            self.test_paused = False
            self.test_finished = False
            self.run_started_at = None
            counts = self._counts_locked()
            test_id = self.active_test.test_id if self.active_test else None
            status = self._status_locked()

        try:
            self.hardware.stop_all()
        except ApiError:
            pass
        try:
            self.repository.update_counts(test_id, counts, status=status)
        except ApiError:
            pass
        self._refresh_status_display()

    def _store_runtime_error(self, error: ApiError) -> None:
        """Capture errors from the background test thread so the frontend can poll them."""

        with self.lock:
            self.stop_event.set()
            self.response_event.set()
            self.worker_thread = None
            self.test_running = False
            self.test_paused = False
            self.test_finished = False
            self.last_error = error.to_payload()["error"]
            counts = self._counts_locked()
            test_id = self.active_test.test_id if self.active_test else None

        try:
            self.hardware.stop_all()
        except ApiError:
            pass
        try:
            self.hardware.signal_error(error.message)
        except ApiError:
            pass
        try:
            self.repository.update_counts(test_id, counts, status="error")
            if test_id is not None:
                self._log_test_event(
                    "error",
                    "Runtime error",
                    detail_text=error.message,
                    elapsed_seconds=counts.get("elapsed_seconds", 0),
                )
        except ApiError:
            pass
        self._refresh_status_display()

    def _log_test_event(
        self,
        event_type: str,
        event_label: str,
        *,
        detail_text: str = "",
        response_validity: str = "",
        response_reason: str = "",
        detail_value: float | None = None,
        elapsed_seconds: float | None = None,
    ) -> dict[str, object] | None:
        """Append one event to the current in-memory timeline and SQLite record."""

        with self.lock:
            if self.active_test is None:
                return None
            test_id = self.active_test.test_id
            resolved_elapsed_seconds = (
                self._elapsed_seconds_locked()
                if elapsed_seconds is None
                else elapsed_seconds
            )

        event_payload = self.repository.log_test_event(
            test_id,
            event_type,
            event_label,
            detail_text=detail_text,
            response_validity=response_validity,
            response_reason=response_reason,
            detail_value=detail_value,
            elapsed_seconds=resolved_elapsed_seconds,
        )

        with self.lock:
            self.current_event_timeline.append(event_payload)

        return event_payload


def _interaction_sequence(interaction_type: str) -> tuple[str, ...]:
    """Map the selected interaction type to the exact input sequence to expect."""

    normalized = interaction_type.strip().lower()
    if normalized == "poke":
        return ("Poke",)
    if normalized == "poke then lever":
        return ("Poke", "Lever")
    if normalized == "lever then poke":
        return ("Lever", "Poke")
    return ("Lever",)


def _default_test_id() -> int:
    """Generate a simple millisecond timestamp ID for locally-created tests."""

    return int(time.time() * 1000)


def _slugify_identifier(value: str) -> str:
    """Create a stable ASCII-safe identifier from a preset name."""

    normalized = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower())
    normalized = normalized.strip("-")
    return normalized or f"preset-{_default_test_id()}"


def _coerce_int(value, field_name: str, *, default: int) -> int:
    """Convert optional numeric request values to integers with a fallback default."""

    if value in (None, ""):
        return default
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise ConfigurationError(f"{field_name} must be an integer.") from error


def _coerce_optional_int(value, field_name: str) -> int | None:
    """Convert an optional integer field and preserve a blank value as unset."""

    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise ConfigurationError(f"{field_name} must be an integer.") from error


def _coerce_float(value, field_name: str, *, default: float) -> float:
    """Convert optional numeric request values to floats with a fallback default."""

    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError) as error:
        raise ConfigurationError(f"{field_name} must be a number.") from error


def _coerce_text(value, field_name: str, *, default: str) -> str:
    """Normalize optional text request fields while preserving clear validation errors."""

    if value in (None, ""):
        return default
    if not isinstance(value, str):
        raise ConfigurationError(f"{field_name} must be text.")
    return value.strip() or default


def _normalize_stimulus_type(value, field_name: str, *, default: str) -> str:
    """Accept only the supported stimulus modes and return a canonical label."""

    normalized = _coerce_text(value, field_name, default=default).strip().lower()
    if normalized == "tone":
        return "Tone"
    if normalized in {"light + tone", "light+tone", "light and tone", "combined"}:
        return "Light + Tone"
    if normalized == "light":
        return "Light"
    raise ConfigurationError(f"{field_name} must be Light, Tone, or Light + Tone.")


def _normalize_subject_identifier(value) -> int | None:
    """Treat blank or legacy zero subject values as an intentionally untracked subject."""

    if value in (None, "", 0, "0"):
        return None
    try:
        normalized_value = int(value)
    except (TypeError, ValueError):
        return None
    return normalized_value if normalized_value > 0 else None


def _normalize_light_color_for_stimulus(
    stimulus_type: str,
    value,
    field_name: str,
    *,
    default: str,
) -> str:
    """Keep stored light labels in sync with the chosen stimulus mode."""

    if stimulus_type == "Tone":
        return "N/A"
    return _coerce_text(value, field_name, default=default) or "Box Light"


def _coerce_bool(value, field_name: str, *, default: bool) -> bool:
    """Convert checkbox/select values into a strict boolean."""

    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return value

    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes", "on"}:
        return True
    if normalized in {"false", "0", "no", "off"}:
        return False
    raise ConfigurationError(f"{field_name} must be true or false.")


def _normalize_end_chime_pattern(value, field_name: str, *, default: str) -> str:
    """Validate and canonicalize the optional end-of-test chime string."""

    pattern = default if value in (None, "") else _coerce_text(value, field_name, default=default)
    note_pairs = _parse_end_chime_pattern(pattern, field_name)
    return ",".join(f"{frequency:g}:{duration:g}" for frequency, duration in note_pairs)


def _parse_end_chime_pattern(
    pattern: str,
    field_name: str = "endChimePattern",
) -> tuple[tuple[float, float], ...]:
    """Parse a comma-separated chime pattern into frequency/duration note pairs."""

    if not isinstance(pattern, str):
        raise ConfigurationError(f"{field_name} must be text.")

    segments = [segment.strip() for segment in pattern.split(",") if segment.strip()]
    if not segments:
        raise ConfigurationError(f"{field_name} must include at least one note.")
    if len(segments) > 16:
        raise ConfigurationError(f"{field_name} supports at most 16 notes.")

    note_pairs: list[tuple[float, float]] = []
    for segment in segments:
        if ":" not in segment:
            raise ConfigurationError(
                f"{field_name} notes must use the format frequency:seconds."
            )

        frequency_text, duration_text = [part.strip() for part in segment.split(":", 1)]
        try:
            frequency_hz = float(frequency_text)
            duration_seconds = float(duration_text)
        except (TypeError, ValueError) as error:
            raise ConfigurationError(
                f"{field_name} notes must use numeric frequency and duration values."
            ) from error

        if frequency_hz <= 0:
            raise ConfigurationError(f"{field_name} frequencies must be greater than zero.")
        if frequency_hz > 20000:
            raise ConfigurationError(f"{field_name} frequencies must stay below 20000 Hz.")
        if duration_seconds <= 0:
            raise ConfigurationError(f"{field_name} note durations must be greater than zero.")
        if duration_seconds > 10:
            raise ConfigurationError(f"{field_name} note durations must be 10 seconds or less.")

        note_pairs.append((frequency_hz, duration_seconds))

    return tuple(note_pairs)


def _normalize_action(payload: dict, key: str) -> str:
    """Accept bool-like or string-like light commands and normalize them to on/off."""

    value = payload.get(key, "off")
    if isinstance(value, bool):
        return "on" if value else "off"
    return "on" if str(value).strip().lower() in {"on", "true", "1"} else "off"


def _format_duration_seconds(total_seconds: float) -> str:
    """Return a compact human-readable duration string for the results list."""

    total_seconds = max(int(round(total_seconds)), 0)
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes}m {seconds:02d}s"


def _describe_stimulus(stimulus_type: str, light_color: str) -> str:
    """Return a user-facing stimulus summary that distinguishes tone from light."""

    normalized_type = stimulus_type.strip().lower()
    if normalized_type == "tone":
        return "Tone"
    if normalized_type == "light + tone":
        return "Light + Tone"

    return "Light"


# Flask app and shared backend objects used by the current process.
app = Flask(__name__)
CORS(app, supports_credentials=True)

repository = SQLiteTestRepository(DATABASE_FILE)
auth_repository = SQLiteAuthRepository(DATABASE_FILE)
hardware = SkinnerHardware()
session_manager = TestSessionManager(repository, hardware)
camera_manager = CameraManager()


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    """Return structured backend errors in a consistent shape for the frontend."""

    if error.status >= 500:
        try:
            hardware.signal_error(error.message)
        except ApiError:
            pass
    response = jsonify(error.to_payload())
    if error.code in AUTH_COOKIE_CLEAR_ERROR_CODES:
        _clear_auth_session_cookie(response)
    return response, error.status


@app.errorhandler(Exception)
def handle_unexpected_error(error: Exception):
    """Catch uncaught server errors and return the same predictable error object."""

    if isinstance(error, HTTPException):
        return error

    app.logger.exception("Unhandled backend exception: %s", error)
    try:
        hardware.signal_error(str(error))
    except ApiError:
        pass
    api_error = ApiError(
        code="UNEXPECTED_BACKEND_ERROR",
        message="The backend encountered an unexpected error.",
        status=500,
        details={"reason": str(error)},
    )
    return jsonify(api_error.to_payload()), api_error.status


@app.after_request
def add_header(response):
    """Disable caching so the polling UI always sees fresh test state."""

    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.route("/")
@app.route("/api/")
def index():
    """Basic health check for local development and service monitoring."""

    return "Backend is running!"


def _set_auth_session_cookie(response, token: str) -> None:
    """Store the opaque auth token in an HttpOnly cookie."""

    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=SESSION_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        path=SESSION_COOKIE_PATH,
    )


def _clear_auth_session_cookie(response) -> None:
    """Remove the current auth cookie from the browser."""

    response.set_cookie(
        SESSION_COOKIE_NAME,
        "",
        max_age=0,
        expires=0,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        path=SESSION_COOKIE_PATH,
    )


def _extract_auth_token() -> str:
    """Read the current session token from the Authorization header or auth cookie."""

    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        token = request.cookies.get(SESSION_COOKIE_NAME, "").strip()
        if token:
            return token
        raise ApiError(
            code="AUTH_REQUIRED",
            message="Sign in to access this part of the system.",
            status=401,
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise ApiError(
            code="AUTH_REQUIRED",
            message="Sign in to access this part of the system.",
            status=401,
        )
    return token


def require_authenticated_user(*, admin_only: bool = False):
    """Protect a Flask route by requiring a valid session token and optional admin role."""

    def decorator(view_function):
        @wraps(view_function)
        def wrapped(*args, **kwargs):
            token = _extract_auth_token()
            current_user = auth_repository.get_user_for_token(token)

            if admin_only and current_user.role != "admin":
                raise ApiError(
                    code="ADMIN_REQUIRED",
                    message="Administrator access is required for this action.",
                    status=403,
                )

            g.auth_token = token
            g.current_user = current_user
            return view_function(*args, **kwargs)

        return wrapped

    return decorator


@app.route("/api/auth/register", methods=["POST"])
def register_user():
    """Create a pending user account that must be approved by a local admin."""

    payload = request.get_json(silent=True) or {}
    user = auth_repository.register_user(
        email=_coerce_text(payload.get("email"), "email", default=""),
        password=_coerce_text(payload.get("password"), "password", default=""),
        display_name=_coerce_text(payload.get("displayName"), "displayName", default=""),
    )
    return jsonify(
        {
            "message": "Registration submitted. An administrator must approve the account before login.",
            "user": user.to_response_payload(),
        }
    ), 201


@app.route("/api/auth/login", methods=["POST"])
def login_user():
    """Validate credentials and set an HttpOnly session cookie for the browser."""

    payload = request.get_json(silent=True) or {}
    result = auth_repository.login_user(
        email=_coerce_text(payload.get("email"), "email", default=""),
        password=_coerce_text(payload.get("password"), "password", default=""),
    )
    response = jsonify(
        {
            "message": "Login successful.",
            "user": result["user"],
        }
    )
    _set_auth_session_cookie(response, result["token"])
    return response, 200


@app.route("/api/auth/logout", methods=["POST"])
@require_authenticated_user()
def logout_user():
    """Revoke the current session token and clear the browser cookie."""

    auth_repository.revoke_token(g.auth_token)
    response = jsonify({"message": "Logged out successfully."})
    _clear_auth_session_cookie(response)
    return response, 200


@app.route("/api/auth/me", methods=["GET"])
@require_authenticated_user()
def get_current_user():
    """Return the authenticated user so the frontend can restore state on refresh."""

    return jsonify({"user": g.current_user.to_response_payload()}), 200


@app.route("/api/auth/admin/users", methods=["GET"])
@require_authenticated_user(admin_only=True)
def get_admin_users():
    """Return registered accounts so an admin can approve or disable access."""

    return jsonify({"users": auth_repository.list_users()}), 200


@app.route("/api/auth/admin/users/<int:user_id>/status", methods=["POST"])
@require_authenticated_user(admin_only=True)
def update_admin_user_status(user_id: int):
    """Approve or disable a non-admin user account from the admin console."""

    payload = request.get_json(silent=True) or {}
    updated_user = auth_repository.update_user_status(
        user_id=user_id,
        status=_coerce_text(payload.get("status"), "status", default=""),
        acting_admin_user_id=g.current_user.user_id,
    )
    return jsonify(
        {
            "message": "User access updated successfully.",
            "user": updated_user,
        }
    ), 200


@app.route("/api/auth/admin/users/<int:user_id>/password", methods=["POST"])
@require_authenticated_user(admin_only=True)
def reset_admin_user_password(user_id: int):
    """Allow a signed-in admin to set a new password for a non-admin user."""

    payload = request.get_json(silent=True) or {}
    updated_user = auth_repository.reset_user_password(
        user_id=user_id,
        password=str(payload.get("password") or ""),
        acting_admin_user_id=g.current_user.user_id,
    )
    return jsonify(
        {
            "message": "Password reset successfully. Existing sessions were signed out.",
            "user": updated_user,
        }
    ), 200


@app.route("/api/auth/admin/users/<int:user_id>", methods=["DELETE"])
@require_authenticated_user(admin_only=True)
def delete_admin_user(user_id: int):
    """Allow a signed-in admin to permanently remove a non-admin user account."""

    deleted_user = auth_repository.delete_user(
        user_id=user_id,
        acting_admin_user_id=g.current_user.user_id,
    )
    return jsonify(
        {
            "message": "User account deleted successfully.",
            "user": deleted_user,
        }
    ), 200


@app.route("/api/presets", methods=["GET"])
@require_authenticated_user()
def get_presets():
    """Return the saved presets for the current authenticated user."""

    return jsonify({"presets": repository.list_presets(g.current_user.user_id)}), 200


@app.route("/api/presets", methods=["POST"])
@require_authenticated_user()
def save_preset():
    """Create or update one preset for the current authenticated user."""

    preset, replaced = repository.save_preset(
        g.current_user.user_id,
        request.get_json(silent=True) or {},
    )
    return jsonify(
        {
            "message": "Preset updated successfully." if replaced else "Preset saved successfully.",
            "preset": preset,
            "replaced": replaced,
        }
    ), 200


@app.route("/api/presets/<preset_id>", methods=["DELETE"])
@require_authenticated_user()
def delete_preset(preset_id: str):
    """Delete one saved preset owned by the current authenticated user."""

    repository.delete_preset(g.current_user.user_id, preset_id)
    return jsonify({"message": "Preset deleted successfully.", "presetId": preset_id}), 200


@app.route("/api/counts", methods=["GET"])
@require_authenticated_user()
def get_counts():
    """Return the current interaction counters and whether a light is active."""

    return jsonify(session_manager.get_counts()), 200


@app.route("/api/results", methods=["GET"])
@require_authenticated_user()
def get_results():
    """Return saved test runs so the Results page can load from SQLite."""

    return jsonify(repository.list_results()), 200


@app.route("/api/maintenance/status", methods=["GET"])
@require_authenticated_user()
def get_maintenance_status():
    """Return backend mode and calibration information for the Test I/O page."""

    return jsonify(session_manager.get_maintenance_status()), 200


@app.route("/api/camera/status", methods=["GET"])
@require_authenticated_user()
def get_camera_status():
    """Report whether an optional camera preview is available for this box."""

    return jsonify(camera_manager.get_status()), 200


@app.route("/api/camera/frame", methods=["GET"])
@require_authenticated_user()
def get_camera_frame():
    """Return one low-bandwidth still frame from the optional box camera."""

    try:
        frame_bytes, mimetype = camera_manager.capture_frame()
    except CameraUnavailableError as error:
        raise ApiError(
            code="CAMERA_UNAVAILABLE",
            message=str(error),
            status=404,
        ) from error

    return Response(frame_bytes, mimetype=mimetype)


@app.route("/api/results/<result_id>/snapshot", methods=["GET"])
@require_authenticated_user()
def get_result_snapshot(result_id: str):
    """Return the optional saved camera snapshot attached to one saved trial."""

    snapshot_bytes, mimetype = repository.get_result_snapshot(result_id)
    return Response(snapshot_bytes, mimetype=mimetype)


@app.route("/api/results/<result_id>", methods=["DELETE"])
@require_authenticated_user(admin_only=True)
def delete_result(result_id: str):
    """Allow administrators to remove saved trial records from SQLite."""

    repository.delete_result(result_id)
    return (
        jsonify(
            {
                "message": "Saved trial deleted successfully.",
                "resultId": result_id,
            }
        ),
        200,
    )


@app.route("/api/results/delete-batch", methods=["POST"])
@require_authenticated_user(admin_only=True)
def delete_results_batch():
    """Delete multiple saved trial records in one request for admin cleanup workflows."""

    payload = request.get_json(silent=True) or {}
    result_ids = payload.get("resultIds")
    if not isinstance(result_ids, list):
        raise ApiError(
            code="RESULT_IDS_REQUIRED",
            message="A list of saved trial IDs is required for bulk deletion.",
            status=400,
        )

    result = repository.delete_results(result_ids)
    return (
        jsonify(
            {
                "message": (
                    f"Deleted {result['deletedCount']} saved trial"
                    f"{'' if result['deletedCount'] == 1 else 's'}."
                ),
                **result,
            }
        ),
        200,
    )


@app.route("/api/light/blue", methods=["POST"])
@require_authenticated_user()
def control_blue():
    """Allow the frontend I/O test page to toggle the blue light directly."""

    payload = request.get_json(silent=True) or {}
    action = _normalize_action(payload, "action")
    hardware.set_blue(action == "on")
    return jsonify({"status": "success", "blue": action}), 200


@app.route("/api/light/orange", methods=["POST"])
@require_authenticated_user()
def control_orange():
    """Allow the frontend I/O test page to toggle the GPIO 13 auxiliary output directly."""

    payload = request.get_json(silent=True) or {}
    action = _normalize_action(payload, "action")
    hardware.set_active_buzzer_output(action == "on")
    return jsonify({"status": "success", "orange": action}), 200


@app.route("/api/light/rgb", methods=["POST"])
@require_authenticated_user()
def control_rgb():
    """Allow the frontend I/O test page to set the RGB LED channels directly."""

    payload = request.get_json(silent=True) or {}
    red = _normalize_action(payload, "red")
    green = _normalize_action(payload, "green")
    blue = _normalize_action(payload, "blue")
    hardware.set_rgb(red == "on", green == "on", blue == "on")
    return jsonify({"status": "success", "rgb": {"red": red, "green": green, "blue": blue}}), 200


@app.route("/api/pump/prime", methods=["POST"])
@require_authenticated_user()
def prime_pump():
    """Run the water pump manually so the operator can fill the line before a test."""

    result = session_manager.prime_pump(request.get_json(silent=True) or {})
    return jsonify(result), 200


@app.route("/api/buzzer/test", methods=["POST"])
@require_authenticated_user()
def test_buzzer():
    """Play a short buzzer chirp so the operator can verify the passive buzzer."""

    result = session_manager.test_buzzer(request.get_json(silent=True) or {})
    return jsonify(result), 200


@app.route("/api/maintenance/pump-calibration", methods=["POST"])
@require_authenticated_user()
def save_pump_calibration():
    """Save a measured pump calibration value from the maintenance page."""

    result = session_manager.save_pump_calibration(
        request.get_json(silent=True) or {},
        current_user=g.current_user,
    )
    return jsonify(result), 200


@app.route("/api/maintenance/lever-debounce", methods=["POST"])
@require_authenticated_user()
def save_lever_debounce():
    """Save and apply the lever debounce setting from the maintenance page."""

    result = session_manager.save_lever_debounce(
        request.get_json(silent=True) or {},
        current_user=g.current_user,
    )
    return jsonify(result), 200


@app.route("/api/maintenance/nose-poke-debounce", methods=["POST"])
@require_authenticated_user()
def save_nose_poke_debounce():
    """Save and apply the nose-poke debounce setting from the maintenance page."""

    result = session_manager.save_nose_poke_debounce(
        request.get_json(silent=True) or {},
        current_user=g.current_user,
    )
    return jsonify(result), 200


@app.route("/api/maintenance/lever-release-requirement", methods=["POST"])
@require_authenticated_user()
def save_lever_release_requirement():
    """Save whether the lever must be released before another press can count."""

    result = session_manager.save_lever_release_requirement(
        request.get_json(silent=True) or {},
        current_user=g.current_user,
    )
    return jsonify(result), 200


@app.route("/api/maintenance/reward-pulse", methods=["POST"])
@require_authenticated_user()
def save_reward_pulse():
    """Save and apply the automatic water reward pulse from the maintenance page."""

    result = session_manager.save_reward_pulse(
        request.get_json(silent=True) or {},
        current_user=g.current_user,
    )
    return jsonify(result), 200


@app.route("/api/maintenance/stimulus-buzzer-mode", methods=["POST"])
@require_authenticated_user()
def save_stimulus_buzzer_mode():
    """Save whether trial tones use the passive or active buzzer output."""

    result = session_manager.save_stimulus_buzzer_mode(
        request.get_json(silent=True) or {},
        current_user=g.current_user,
    )
    return jsonify(result), 200


@app.route("/api/test/information", methods=["POST"])
@require_authenticated_user()
def get_information():
    """Save the current test settings before the user starts the run."""
    configuration = session_manager.configure_test(
        request.get_json(silent=True) or {},
        current_user=g.current_user,
    )

    return jsonify({
        "message": "Start Test Successfully!",
        "received_configuration": configuration.to_response_payload(),
    }), 200


@app.route("/api/test/run", methods=["POST"])
@require_authenticated_user()
def run_test():
    """Start the active test session and background stimulus loop."""
    payload = request.get_json(silent=True)
    session_manager.start_test(
        payload if isinstance(payload, dict) else None,
        current_user=g.current_user,
    )

    return jsonify({"message": "Test started successfully!"}), 200


@app.route("/api/test/stop", methods=["POST"])
@require_authenticated_user()
def stop_test():
    """Pause the test and stop all hardware outputs immediately."""

    session_manager.stop_test()
    return jsonify({"message": "Test paused successfully!"}), 200


@app.route("/api/test/finish", methods=["POST"])
@require_authenticated_user()
def finish_test():
    """Finish the active test and persist that final state in SQLite."""

    session_manager.finish_test()
    return jsonify({"message": "Test finished successfully!"}), 200


@app.route("/api/test/note", methods=["POST"])
@require_authenticated_user()
def add_test_note():
    """Attach an operator note to the active trial timeline."""

    result = session_manager.add_note(
        request.get_json(silent=True) or {},
        current_user=g.current_user,
    )
    return jsonify(result), 200


@app.route("/api/test/status", methods=["GET"])
@require_authenticated_user()
def get_test_status():
    """Support frontend polling for whether the test is running, paused, or finished."""

    return jsonify(session_manager.get_status()), 200


@app.route("/api/test/update/information", methods=["PUT"])
@require_authenticated_user()
def update_information():
    """Keep the legacy count-update endpoint available for the current frontend."""
    counts = session_manager.update_counts_from_payload(request.get_json(silent=True) or {})

    return jsonify({
        "message": "Test information updated successfully!",
        "nose_poke": counts["nose_poke_count"],
        "lever_press": counts["lever_press_count"],
    }), 200


@app.route("/api/input/lever", methods=["POST"])
@require_authenticated_user()
def simulate_lever_press():
    """Simulate a lever press so the backend can be tested without real hardware."""

    session_manager.on_lever_press()
    return jsonify({"status": "simulated lever press"}), 200


@app.route("/api/input/lever/release", methods=["POST"])
@require_authenticated_user()
def simulate_lever_release():
    """Simulate a lever release so release-latch counting can be tested."""

    session_manager.on_lever_release()
    return jsonify({"status": "simulated lever release"}), 200


@app.route("/api/input/nosepoke", methods=["POST"])
@require_authenticated_user()
def simulate_nose_poke():
    """Simulate a nose poke so the backend can be tested without real hardware."""

    session_manager.on_nose_poke()
    return jsonify({"status": "simulated nose poke"}), 200


if __name__ == "__main__":
    app.run(
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
        use_reloader=False,
        host="0.0.0.0",
        port=5000,
        
    )
