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
DEMO_OPERATOR_PREFIX = "demo.operator"
DEMO_NOTE_OPTIONS = (
    "Animal paused near the lever before the final response.",
    "Nose-poke sensor needed a quick visual check during setup.",
    "Reward delivery looked clean and consistent on this run.",
    "Trial completed smoothly with no observed hardware issues.",
)


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


def ensure_demo_admin(auth_repo: SQLiteAuthRepository) -> ConductedBySnapshot:
    from sbBackend import ConductedBySnapshot

    admin_user = auth_repo.upsert_admin(
        email="demo.admin@example.com",
        password="DemoAdmin123",
        display_name="Demo Admin",
    )
    return ConductedBySnapshot(
        user_id=admin_user.user_id,
        email=admin_user.email,
        display_name=admin_user.display_name,
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
    reward_count = rng.randint(2, 7)
    status = "finished" if rng.random() < 0.78 else "paused"
    if status == "finished":
        goal_for_test = goal_for_trial * reward_count
    else:
        goal_for_test = goal_for_trial * reward_count + rng.randint(2, 5)

    if interaction_type == "Lever":
        lever_press_count = goal_for_test + rng.randint(0, 4)
        nose_poke_count = rng.randint(0, 2)
    elif interaction_type == "Poke":
        lever_press_count = rng.randint(0, 2)
        nose_poke_count = goal_for_test + rng.randint(0, 4)
    else:
        lever_press_count = goal_for_test + rng.randint(0, 3)
        nose_poke_count = goal_for_test + rng.randint(0, 3)

    if status != "finished":
        reward_count = max(reward_count - 1, 0)

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
) -> None:
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

    sample_points = sorted(
        {
            round(elapsed_seconds * ratio, 1)
            for ratio in (0.12, 0.22, 0.38, 0.56, 0.74)
        }
    )

    if sample_points:
        repository.log_test_event(
            configuration.test_id,
            "stimulus_on",
            "Stimulus on",
            detail_text=configuration.stimulus_type,
            elapsed_seconds=sample_points[0],
        )
    if len(sample_points) > 1:
        repository.log_test_event(
            configuration.test_id,
            "stimulus_off",
            "Stimulus off",
            detail_text=configuration.stimulus_type,
            elapsed_seconds=sample_points[1],
        )

    if lever_press_count:
        repository.log_test_event(
            configuration.test_id,
            "lever_press",
            "Lever press",
            detail_text="",
            elapsed_seconds=sample_points[2] if len(sample_points) > 2 else elapsed_seconds * 0.4,
        )
    if nose_poke_count:
        repository.log_test_event(
            configuration.test_id,
            "nose_poke",
            "Nose poke",
            detail_text="",
            elapsed_seconds=sample_points[3] if len(sample_points) > 3 else elapsed_seconds * 0.6,
        )
    if reward_count:
        repository.log_test_event(
            configuration.test_id,
            "reward_delivered",
            "Reward delivered",
            detail_text="Water",
            elapsed_seconds=sample_points[3] if len(sample_points) > 3 else elapsed_seconds * 0.65,
        )
    if rng.random() < 0.55:
        repository.log_test_event(
            configuration.test_id,
            "note",
            "Operator note",
            detail_text=rng.choice(DEMO_NOTE_OPTIONS),
            elapsed_seconds=sample_points[4] if len(sample_points) > 4 else elapsed_seconds * 0.82,
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
            "elapsed_seconds": elapsed_seconds,
        }

        repository.save_configuration(
            configuration,
            counts,
            status,
            conducted_by,
        )
        log_demo_timeline(
            repository,
            configuration,
            status=status,
            elapsed_seconds=elapsed_seconds,
            lever_press_count=lever_press_count,
            nose_poke_count=nose_poke_count,
            reward_count=reward_count,
            rng=rng,
        )
        backdate_trial(
            repository,
            test_id=configuration.test_id,
            status=status,
            elapsed_seconds=elapsed_seconds,
            rng=rng,
        )
        status_counts[status] += 1

    print(f"Seeded {args.count} demo trial(s) into {database_path}")
    if args.clear_all_results:
        print(f"Removed {cleared_all_count} existing saved trial(s) first.")
    elif args.reset_demo:
        print(f"Removed {cleared_demo_count} existing demo trial(s) first.")
    print(
        f"Created {status_counts['finished']} finished and {status_counts['paused']} paused demo runs "
        f"across {len(operators)} demo operator account(s)."
    )
    print("You can now open the Results page and use search, checkboxes, charts, and comparison view.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
