#!/usr/bin/env python3
"""Seed demo trial data so the Results page has realistic charts and comparisons."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import random
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
DEFAULT_DATABASE_PATH = BACKEND_DIR / "testdatabase.db"


# Force mock hardware when this utility imports the backend module.
os.environ.setdefault("GPIO_MODE", "mock")
os.environ.setdefault("OLED_MODE", "mock")
sys.path.insert(0, str(BACKEND_DIR))


STIMULUS_TYPES = ("Light", "Tone", "Light + Tone")
INTERACTION_TYPES = ("Lever", "Poke", "Lever then Poke", "Poke then Lever")
TRIAL_NAME_PREFIX = "Demo Trial"
DEMO_PRESET_ID = "demo-training-preset"
DEMO_PRESET_NAME = "Demo Preset - Training"
DEMO_OPERATOR_PREFIX = "demo.operator"
PRIMARY_ADMIN_EMAIL = "admin@example.com"
PRIMARY_ADMIN_NAME = "Validation Admin"
PRIMARY_ADMIN_PASSWORD = "AdminPass123"
LEGACY_DEMO_ADMIN_EMAIL = "demo.admin@example.com"
DEMO_NOTE_OPTIONS = (
    "Animal paused near the lever before the final response.",
    "Nose-poke sensor needed a quick visual check during setup.",
    "Reward delivery looked clean and consistent on this run.",
    "Trial completed smoothly with no observed hardware issues.",
)
AVERAGE_TOTAL_INTERACTIONS = 15
TOTAL_INTERACTIONS_STDDEV = 4
MIN_TOTAL_INTERACTIONS = 7
MAX_TOTAL_INTERACTIONS = 24


def occurs_during_stimulus(time_point: float, windows: list[tuple[float, float]]) -> bool:
    """Return whether one interaction lands while the stimulus is active."""

    return any(start <= time_point <= end for start, end in windows)


def inject_invalid_interaction_times(
    *,
    interaction_times: list[float],
    stimulus_windows: list[tuple[float, float]],
    elapsed_seconds: float,
    rng: random.Random,
) -> list[float]:
    """Shift some demo interactions into active-stimulus windows so invalid examples appear."""

    if not interaction_times or not stimulus_windows:
        return sorted(interaction_times)

    updated_times = list(interaction_times)
    invalid_target = min(len(updated_times), max(1, round(len(updated_times) * 0.2)))
    selected_indexes = list(range(len(updated_times)))
    rng.shuffle(selected_indexes)

    for interaction_index in selected_indexes[:invalid_target]:
        window_start, window_end = rng.choice(stimulus_windows)
        if window_end <= window_start:
            updated_times[interaction_index] = round(window_start, 1)
            continue

        shifted_time = round(rng.uniform(window_start, window_end), 1)
        updated_times[interaction_index] = max(0.0, min(elapsed_seconds, shifted_time))

    updated_times.sort()
    return updated_times


def build_interaction_event_rows(
    *,
    lever_times: list[float],
    nose_times: list[float],
    stimulus_windows: list[tuple[float, float]],
) -> tuple[list[tuple[float, str, str, str, str, str]], dict[str, int]]:
    """Build event rows and saved summary counts for valid and invalid demo interactions."""

    event_rows: list[tuple[float, str, str, str, str, str]] = []
    summary_counts = {
        "valid_lever_press_count": 0,
        "invalid_lever_press_count": 0,
        "valid_nose_poke_count": 0,
        "invalid_nose_poke_count": 0,
    }

    for time_point in lever_times:
        is_invalid = occurs_during_stimulus(time_point, stimulus_windows)
        response_validity = "invalid" if is_invalid else "valid"
        response_reason = "stimulus_active" if is_invalid else ""
        if is_invalid:
            summary_counts["invalid_lever_press_count"] += 1
        else:
            summary_counts["valid_lever_press_count"] += 1
        event_rows.append(
            (
                time_point,
                "lever_press",
                "Lever press",
                (
                    "Ignored because the light or trial buzzer was active."
                    if is_invalid
                    else "Counted while no light or trial buzzer was active."
                ),
                response_validity,
                response_reason,
            )
        )

    for time_point in nose_times:
        is_invalid = occurs_during_stimulus(time_point, stimulus_windows)
        response_validity = "invalid" if is_invalid else "valid"
        response_reason = "stimulus_active" if is_invalid else ""
        if is_invalid:
            summary_counts["invalid_nose_poke_count"] += 1
        else:
            summary_counts["valid_nose_poke_count"] += 1
        event_rows.append(
            (
                time_point,
                "nose_poke",
                "Nose poke",
                (
                    "Ignored because the light or trial buzzer was active."
                    if is_invalid
                    else "Counted while no light or trial buzzer was active."
                ),
                response_validity,
                response_reason,
            )
        )

    return event_rows, summary_counts


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Generate fake trial rows, notes, and event timelines for demoing the "
            "Results page. This only writes local SQLite data."
        )
    )
    parser.add_argument(
        "--count",
        type=int,
        default=18,
        help="How many demo trials to create. Default: 18.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=123,
        help="Random seed so demo data is repeatable. Default: 123.",
    )
    parser.add_argument(
        "--database",
        type=Path,
        default=DEFAULT_DATABASE_PATH,
        help=f"SQLite database to write. Default: {DEFAULT_DATABASE_PATH}",
    )
    parser.add_argument(
        "--reset-demo",
        action="store_true",
        help="Delete previously generated demo trials before creating new ones.",
    )
    parser.add_argument(
        "--clear-all-results",
        action="store_true",
        help="Delete every saved trial and timeline from the target database before optionally seeding demo data.",
    )
    parser.add_argument(
        "--clear-only",
        action="store_true",
        help="Only clear saved results and exit without generating new demo trials.",
    )
    parser.add_argument(
        "--operators",
        type=int,
        default=4,
        help="How many demo operators to rotate through. Default: 4.",
    )
    return parser


def remove_legacy_demo_admin(auth_repo: SQLiteAuthRepository) -> bool:
    """Delete the old demo-only admin account so the Admin page stays uncluttered."""

    with auth_repo.connect() as connection:
        row = connection.execute(
            "SELECT id FROM users WHERE email = ?",
            (LEGACY_DEMO_ADMIN_EMAIL,),
        ).fetchone()
        if row is None:
            return False

        legacy_user_id = row["id"]
        connection.execute(
            "UPDATE users SET approved_by_user_id = NULL WHERE approved_by_user_id = ?",
            (legacy_user_id,),
        )
        connection.execute(
            "DELETE FROM auth_tokens WHERE user_id = ?",
            (legacy_user_id,),
        )
        connection.execute(
            "DELETE FROM users WHERE id = ?",
            (legacy_user_id,),
        )
        connection.commit()
        return True


def ensure_demo_admin(auth_repo: SQLiteAuthRepository) -> ConductedBySnapshot:
    from sbBackend import ConductedBySnapshot

    with auth_repo.connect() as connection:
        row = connection.execute(
            "SELECT id, email, display_name FROM users WHERE email = ?",
            (PRIMARY_ADMIN_EMAIL,),
        ).fetchone()

    if row is None:
        admin_user = auth_repo.upsert_admin(
            email=PRIMARY_ADMIN_EMAIL,
            password=PRIMARY_ADMIN_PASSWORD,
            display_name=PRIMARY_ADMIN_NAME,
        )
        return ConductedBySnapshot(
            user_id=admin_user.user_id,
            email=admin_user.email,
            display_name=admin_user.display_name,
        )

    return ConductedBySnapshot(
        user_id=row["id"],
        email=row["email"],
        display_name=row["display_name"],
    )


def ensure_demo_operator(
    auth_repo: SQLiteAuthRepository,
    *,
    email: str,
    display_name: str,
    acting_admin_user_id: int,
) -> ConductedBySnapshot:
    from sbBackend import ConductedBySnapshot

    with auth_repo.connect() as connection:
        row = connection.execute(
            "SELECT id, email, display_name, status, role FROM users WHERE email = ?",
            (email,),
        ).fetchone()

    if row is None:
        registered_user = auth_repo.register_user(
            email=email,
            password="DemoOperator123",
            display_name=display_name,
        )
        auth_repo.update_user_status(
            user_id=registered_user.user_id,
            status="approved",
            acting_admin_user_id=acting_admin_user_id,
        )
        return ConductedBySnapshot(
            user_id=registered_user.user_id,
            email=registered_user.email,
            display_name=registered_user.display_name,
        )

    if row["role"] != "admin" and row["status"] != "approved":
        auth_repo.update_user_status(
            user_id=row["id"],
            status="approved",
            acting_admin_user_id=acting_admin_user_id,
        )

    return ConductedBySnapshot(
        user_id=row["id"],
        email=row["email"],
        display_name=row["display_name"],
    )


def clear_existing_demo_trials(repository: SQLiteTestRepository) -> int:
    with repository.connect() as connection:
        rows = connection.execute(
            """
            SELECT testID
            FROM Active_Test
            WHERE Name LIKE ?
               OR conducted_by_email LIKE ?
            """,
            (f"{TRIAL_NAME_PREFIX}%", f"{DEMO_OPERATOR_PREFIX}%"),
        ).fetchall()
        demo_test_ids = [row["testID"] for row in rows]

        if not demo_test_ids:
            return 0

        placeholders = ", ".join("?" for _ in demo_test_ids)
        connection.execute(
            f"DELETE FROM test_events WHERE test_id IN ({placeholders})",
            tuple(demo_test_ids),
        )
        connection.execute(
            f"DELETE FROM Active_Test WHERE testID IN ({placeholders})",
            tuple(demo_test_ids),
        )
        connection.commit()
        return len(demo_test_ids)


def clear_all_saved_results(repository: SQLiteTestRepository) -> int:
    with repository.connect() as connection:
        count = connection.execute(
            "SELECT COUNT(*) AS count FROM Active_Test"
        ).fetchone()["count"]
        connection.execute("DELETE FROM test_events")
        connection.execute("DELETE FROM Active_Test")
        connection.commit()
        return count


def seed_demo_preset(
    repository: SQLiteTestRepository,
    *,
    admin_user_id: int,
) -> bool:
    """Create or update one stable preset for the main validation admin account."""

    preset_payload = {
        "id": DEMO_PRESET_ID,
        "name": DEMO_PRESET_NAME,
        "description": "Generated by the demo-data seeder for Trial and Preset Manager walkthroughs.",
        "testName": "Demo Training Run",
        "subjectID": None,
        "trialDuration": 10,
        "goalForTrial": 3,
        "goalForTest": 15,
        "RewaStimTime": 1,
        "StimTimeOn": 1,
        "cooldown": 0,
        "rewardType": "Water",
        "interactionType": "Lever",
        "stimulusType": "Light + Tone",
        "lightColor": "Box Light",
        "endChimeEnabled": True,
        "endChimePattern": "523:0.08,659:0.08,784:0.12",
    }
    _, replaced = repository.save_preset(admin_user_id, preset_payload)
    return replaced


def bounded_gaussian_int(
    rng: random.Random,
    *,
    mean: float,
    stddev: float,
    minimum: int,
    maximum: int,
) -> int:
    """Return a rounded Gaussian sample clamped to a practical demo-data range."""

    return max(minimum, min(maximum, int(round(rng.gauss(mean, stddev)))))


def calculate_demo_counts(
    *,
    interaction_type: str,
    goal_for_trial: int,
    status: str,
    rng: random.Random,
) -> tuple[int, int, int, int]:
    """Build realistic response totals centered around about fifteen interactions."""

    target_total_interactions = bounded_gaussian_int(
        rng,
        mean=AVERAGE_TOTAL_INTERACTIONS,
        stddev=TOTAL_INTERACTIONS_STDDEV,
        minimum=MIN_TOTAL_INTERACTIONS,
        maximum=MAX_TOTAL_INTERACTIONS,
    )

    if interaction_type in {"Lever", "Poke"}:
        incidental_count = rng.randint(0, 2)
        actual_primary_count = max(goal_for_trial, target_total_interactions - incidental_count)
        completed_reward_count = max(1, actual_primary_count // goal_for_trial)

        if status == "finished":
            goal_for_test = completed_reward_count * goal_for_trial
            actual_primary_count = goal_for_test
            reward_count = completed_reward_count
        else:
            goal_for_test = actual_primary_count + rng.randint(1, goal_for_trial + 3)
            reward_count = completed_reward_count

        if interaction_type == "Lever":
            return actual_primary_count, incidental_count, reward_count, goal_for_test
        return incidental_count, actual_primary_count, reward_count, goal_for_test

    target_sequences = max(goal_for_trial, int(round(target_total_interactions / 2)))
    completed_reward_count = max(1, target_sequences // goal_for_trial)

    if status == "finished":
        goal_for_test = completed_reward_count * goal_for_trial
        paired_count = goal_for_test
        reward_count = completed_reward_count
    else:
        paired_count = max(goal_for_trial, target_sequences)
        goal_for_test = paired_count + rng.randint(1, goal_for_trial + 3)
        reward_count = completed_reward_count

    if rng.random() < 0.35:
        paired_count = max(goal_for_trial, paired_count + rng.choice((-1, 1)))

    return paired_count, paired_count, reward_count, goal_for_test


def build_event_times(
    *,
    count: int,
    elapsed_seconds: float,
    start_ratio: float,
    end_ratio: float,
    rng: random.Random,
) -> list[float]:
    """Spread repeated events across the trial so timeline charts show believable trends."""

    if count <= 0:
        return []

    if count == 1:
        midpoint = max(start_ratio, min(end_ratio, (start_ratio + end_ratio) / 2))
        return [round(elapsed_seconds * midpoint, 1)]

    span = max(end_ratio - start_ratio, 0.05)
    times: list[float] = []
    for index in range(count):
        base_ratio = start_ratio + (span * ((index + 1) / (count + 1)))
        jitter_window = min(0.015, span / max(count * 4, 8))
        jitter = rng.uniform(-jitter_window, jitter_window)
        adjusted_ratio = max(start_ratio, min(end_ratio, base_ratio + jitter))
        times.append(round(elapsed_seconds * adjusted_ratio, 1))

    times.sort()
    return times


def build_reward_times(
    *,
    interaction_times: list[float],
    goal_for_trial: int,
    reward_count: int,
    elapsed_seconds: float,
) -> list[float]:
    """Place reward deliveries just after completed successful interaction blocks."""

    reward_times: list[float] = []
    for reward_index in range(reward_count):
        interaction_index = min(
            len(interaction_times) - 1,
            ((reward_index + 1) * goal_for_trial) - 1,
        )
        if interaction_index < 0:
            break
        reward_time = min(elapsed_seconds, interaction_times[interaction_index] + 0.3)
        reward_times.append(round(reward_time, 1))

    return reward_times


def build_demo_configuration(
    *,
    test_id: int,
    rng: random.Random,
    index: int,
) -> tuple[TestConfiguration, str, float, int, int, int]:
    from sbBackend import DEFAULT_END_CHIME_PATTERN, TestConfiguration

    interaction_type = rng.choice(INTERACTION_TYPES)
    stimulus_type = rng.choice(STIMULUS_TYPES)
    duration_minutes = rng.choice((5, 10, 12, 15, 20))
    goal_for_trial = rng.choice((1, 2, 3))
    status = "finished" if rng.random() < 0.78 else "paused"
    (
        lever_press_count,
        nose_poke_count,
        reward_count,
        goal_for_test,
    ) = calculate_demo_counts(
        interaction_type=interaction_type,
        goal_for_trial=goal_for_trial,
        status=status,
        rng=rng,
    )

    elapsed_seconds = round(duration_minutes * 60 * rng.uniform(0.45, 0.96), 1)
    if status == "finished":
        elapsed_seconds = min(elapsed_seconds, duration_minutes * 60)

    subject_id = None if rng.random() < 0.28 else rng.randint(101, 160)
    end_chime_enabled = rng.random() < 0.35

    configuration = TestConfiguration(
        test_id=test_id,
        test_name=f"{TRIAL_NAME_PREFIX} {index + 1}",
        subject_id=subject_id,
        trial_duration_minutes=float(duration_minutes),
        goal_for_trial=goal_for_trial,
        goal_for_test=goal_for_test,
        reward_delay_seconds=rng.choice((0, 1, 2)),
        stimulus_duration_seconds=rng.choice((0, 1, 2)),
        cooldown_seconds=0,
        reward_type="Water",
        interaction_type=interaction_type,
        stimulus_type=stimulus_type,
        light_color="N/A" if stimulus_type == "Tone" else "Box Light",
        end_chime_enabled=end_chime_enabled,
        end_chime_pattern=DEFAULT_END_CHIME_PATTERN,
    )
    configuration.validate()

    return (
        configuration,
        status,
        elapsed_seconds,
        lever_press_count,
        nose_poke_count,
        reward_count,
    )


def log_demo_timeline(
    repository: SQLiteTestRepository,
    configuration: TestConfiguration,
    *,
    status: str,
    elapsed_seconds: float,
    lever_press_count: int,
    nose_poke_count: int,
    reward_count: int,
    rng: random.Random,
) -> dict[str, int]:
    repository.clear_test_events(configuration.test_id)
    detail_text = (
        f"{configuration.test_name} prepared for subject {configuration.subject_id}."
        if configuration.subject_id is not None
        else f"{configuration.test_name} prepared without subject tracking."
    )
    repository.log_test_event(
        configuration.test_id,
        "configured",
        "Test configured",
        detail_text=detail_text,
        elapsed_seconds=0,
    )
    repository.log_test_event(
        configuration.test_id,
        "started",
        "Test started",
        detail_text=f"{configuration.test_name} is now running.",
        elapsed_seconds=0,
    )

    lever_times: list[float] = []
    nose_times: list[float] = []

    if configuration.interaction_type == "Lever":
        lever_times = build_event_times(
            count=lever_press_count,
            elapsed_seconds=elapsed_seconds,
            start_ratio=0.12,
            end_ratio=0.88,
            rng=rng,
        )
        nose_times = build_event_times(
            count=nose_poke_count,
            elapsed_seconds=elapsed_seconds,
            start_ratio=0.2,
            end_ratio=0.82,
            rng=rng,
        )
    elif configuration.interaction_type == "Poke":
        nose_times = build_event_times(
            count=nose_poke_count,
            elapsed_seconds=elapsed_seconds,
            start_ratio=0.12,
            end_ratio=0.88,
            rng=rng,
        )
        lever_times = build_event_times(
            count=lever_press_count,
            elapsed_seconds=elapsed_seconds,
            start_ratio=0.2,
            end_ratio=0.82,
            rng=rng,
        )
    else:
        sequence_count = max(lever_press_count, nose_poke_count)
        base_times = build_event_times(
            count=sequence_count,
            elapsed_seconds=elapsed_seconds,
            start_ratio=0.12,
            end_ratio=0.84,
            rng=rng,
        )
        if configuration.interaction_type == "Lever then Poke":
            lever_times = base_times[:lever_press_count]
            nose_times = [
                round(min(elapsed_seconds, time_point + 0.5), 1)
                for time_point in base_times[:nose_poke_count]
            ]
        else:
            nose_times = base_times[:nose_poke_count]
            lever_times = [
                round(min(elapsed_seconds, time_point + 0.5), 1)
                for time_point in base_times[:lever_press_count]
            ]

    relevant_times = (
        lever_times
        if configuration.interaction_type == "Lever"
        else nose_times
        if configuration.interaction_type == "Poke"
        else nose_times
        if configuration.interaction_type == "Lever then Poke"
        else lever_times
    )
    reward_times = build_reward_times(
        interaction_times=relevant_times,
        goal_for_trial=configuration.goal_for_trial,
        reward_count=reward_count,
        elapsed_seconds=elapsed_seconds,
    )
    stimulus_cycle_count = max(1, reward_count) if elapsed_seconds > 0 else 0
    stimulus_on_times = build_event_times(
        count=stimulus_cycle_count,
        elapsed_seconds=elapsed_seconds,
        start_ratio=0.08,
        end_ratio=0.8,
        rng=rng,
    )
    stimulus_off_times = [
        round(
            min(
                elapsed_seconds,
                time_point + max(configuration.stimulus_duration_seconds, 0.4),
            ),
            1,
        )
        for time_point in stimulus_on_times
    ]
    stimulus_windows = list(zip(stimulus_on_times, stimulus_off_times))

    lever_times = inject_invalid_interaction_times(
        interaction_times=lever_times,
        stimulus_windows=stimulus_windows,
        elapsed_seconds=elapsed_seconds,
        rng=rng,
    )
    nose_times = inject_invalid_interaction_times(
        interaction_times=nose_times,
        stimulus_windows=stimulus_windows,
        elapsed_seconds=elapsed_seconds,
        rng=rng,
    )
    interaction_event_rows, validity_counts = build_interaction_event_rows(
        lever_times=lever_times,
        nose_times=nose_times,
        stimulus_windows=stimulus_windows,
    )

    timeline_events: list[tuple[float, str, str, str, str, str]] = []
    timeline_events.extend(
        (time_point, "stimulus_on", "Stimulus on", configuration.stimulus_type, "", "")
        for time_point in stimulus_on_times
    )
    timeline_events.extend(
        (time_point, "stimulus_off", "Stimulus off", configuration.stimulus_type, "", "")
        for time_point in stimulus_off_times
    )
    timeline_events.extend(interaction_event_rows)
    timeline_events.extend(
        (time_point, "reward_delivered", "Reward delivered", "Water", "", "")
        for time_point in reward_times
    )

    if rng.random() < 0.55:
        note_time = build_event_times(
            count=1,
            elapsed_seconds=elapsed_seconds,
            start_ratio=0.58,
            end_ratio=0.86,
            rng=rng,
        )[0]
        timeline_events.append(
            (note_time, "note", "Operator note", rng.choice(DEMO_NOTE_OPTIONS), "", "")
        )

    timeline_events.sort(key=lambda item: (item[0], item[1]))
    for time_point, event_type, event_label, detail_text, response_validity, response_reason in timeline_events:
        repository.log_test_event(
            configuration.test_id,
            event_type,
            event_label,
            detail_text=detail_text,
            response_validity=response_validity,
            response_reason=response_reason,
            elapsed_seconds=time_point,
        )

    if status == "finished":
        repository.log_test_event(
            configuration.test_id,
            "finished",
            "Test finished",
            detail_text="",
            elapsed_seconds=elapsed_seconds,
        )
    else:
        repository.log_test_event(
            configuration.test_id,
            "paused",
            "Test paused",
            detail_text="Paused before reaching the test goal.",
            elapsed_seconds=elapsed_seconds,
        )

    return validity_counts


def backdate_trial(
    repository: SQLiteTestRepository,
    *,
    test_id: int,
    status: str,
    elapsed_seconds: float,
    rng: random.Random,
) -> None:
    start_time = datetime.now(timezone.utc) - timedelta(
        days=rng.randint(0, 45),
        hours=rng.randint(0, 22),
        minutes=rng.randint(0, 58),
    )
    updated_at = start_time + timedelta(seconds=elapsed_seconds)

    with repository.connect() as connection:
        connection.execute(
            """
            UPDATE Active_Test
            SET created_at = ?, updated_at = ?, testStatus = ?, elapsed_seconds = ?
            WHERE testID = ?
            """,
            (
                start_time.isoformat(),
                updated_at.isoformat(),
                status,
                elapsed_seconds,
                test_id,
            ),
        )

        event_rows = connection.execute(
            """
            SELECT event_id, elapsed_seconds
            FROM test_events
            WHERE test_id = ?
            ORDER BY event_id ASC
            """,
            (test_id,),
        ).fetchall()
        for row in event_rows:
            occurred_at = start_time + timedelta(seconds=float(row["elapsed_seconds"] or 0))
            connection.execute(
                "UPDATE test_events SET occurred_at = ? WHERE event_id = ?",
                (occurred_at.isoformat(), row["event_id"]),
            )
        connection.commit()


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.count <= 0:
        parser.error("--count must be greater than 0.")
    if args.operators <= 0:
        parser.error("--operators must be greater than 0.")
    if args.clear_only and not args.clear_all_results and not args.reset_demo:
        parser.error("--clear-only must be paired with --clear-all-results or --reset-demo.")

    database_path = args.database.resolve()
    rng = random.Random(args.seed)
    os.environ["SKINNERBOX_DB_PATH"] = str(database_path)

    from auth import SQLiteAuthRepository
    from sbBackend import ConductedBySnapshot, SQLiteTestRepository

    repository = SQLiteTestRepository(database_path)
    auth_repository = SQLiteAuthRepository(database_path)
    removed_legacy_demo_admin = remove_legacy_demo_admin(auth_repository)

    cleared_all_count = 0
    cleared_demo_count = 0
    if args.clear_all_results:
        cleared_all_count = clear_all_saved_results(repository)
    elif args.reset_demo:
        cleared_demo_count = clear_existing_demo_trials(repository)

    if args.clear_only:
        if args.clear_all_results:
            print(f"Removed {cleared_all_count} saved trial(s) from {database_path}")
        else:
            print(f"Removed {cleared_demo_count} demo trial(s) from {database_path}")
        return 0

    demo_admin = ensure_demo_admin(auth_repository)
    demo_preset_replaced = seed_demo_preset(
        repository,
        admin_user_id=demo_admin.user_id,
    )
    operators: list[ConductedBySnapshot] = []
    for index in range(args.operators):
        operators.append(
            ensure_demo_operator(
                auth_repo=auth_repository,
                email=f"{DEMO_OPERATOR_PREFIX}{index + 1}@example.com",
                display_name=f"Demo Operator {index + 1}",
                acting_admin_user_id=demo_admin.user_id,
            )
        )

    base_test_id = int(datetime.now(timezone.utc).timestamp() * 1000)
    status_counts = {"finished": 0, "paused": 0}

    for index in range(args.count):
        (
            configuration,
            status,
            elapsed_seconds,
            lever_press_count,
            nose_poke_count,
            reward_count,
        ) = build_demo_configuration(
            test_id=base_test_id + index,
            rng=rng,
            index=index,
        )
        conducted_by = rng.choice(operators)
        counts = {
            "lever_press_count": lever_press_count,
            "nose_poke_count": nose_poke_count,
            "reward_count": reward_count,
            "valid_lever_press_count": 0,
            "invalid_lever_press_count": 0,
            "valid_nose_poke_count": 0,
            "invalid_nose_poke_count": 0,
            "elapsed_seconds": elapsed_seconds,
        }

        repository.save_configuration(
            configuration,
            counts,
            status,
            conducted_by,
        )
        validity_counts = log_demo_timeline(
            repository,
            configuration,
            status=status,
            elapsed_seconds=elapsed_seconds,
            lever_press_count=lever_press_count,
            nose_poke_count=nose_poke_count,
            reward_count=reward_count,
            rng=rng,
        )
        counts.update(validity_counts)
        repository.update_counts(configuration.test_id, counts, status=status)
        backdate_trial(
            repository,
            test_id=configuration.test_id,
            status=status,
            elapsed_seconds=elapsed_seconds,
            rng=rng,
        )
        status_counts[status] += 1

    print(
        f"Seeded {args.count} demo trial(s) and 1 demo preset into {database_path}"
    )
    if args.clear_all_results:
        print(f"Removed {cleared_all_count} existing saved trial(s) first.")
    elif args.reset_demo:
        print(f"Removed {cleared_demo_count} existing demo trial(s) first.")
    print(
        f"Created {status_counts['finished']} finished and {status_counts['paused']} paused demo runs "
        f"across {len(operators)} demo operator account(s)."
    )
    print(
        f"{'Updated' if demo_preset_replaced else 'Created'} the demo preset "
        f"'{DEMO_PRESET_NAME}' for {PRIMARY_ADMIN_EMAIL}."
    )
    if removed_legacy_demo_admin:
        print(
            f"Removed the legacy demo admin account ({LEGACY_DEMO_ADMIN_EMAIL}) and reused "
            f"{PRIMARY_ADMIN_EMAIL} for approvals."
        )
    print("You can now open the Results page and use search, checkboxes, charts, and comparison view.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
