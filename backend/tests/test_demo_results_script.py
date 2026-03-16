from __future__ import annotations

from pathlib import Path
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "generate_demo_results.py"


class DemoResultsScriptTest(unittest.TestCase):
    def test_script_generates_demo_trials_and_timelines(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "demo-testdatabase.db"
            env = os.environ.copy()
            env["GPIO_MODE"] = "mock"
            env["OLED_MODE"] = "mock"
            env["PYTHONPYCACHEPREFIX"] = "/tmp"

            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--database",
                    str(database_path),
                    "--count",
                    "5",
                    "--seed",
                    "42",
                    "--reset-demo",
                ],
                cwd=REPO_ROOT,
                env=env,
                capture_output=True,
                text=True,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr or completed.stdout)
            self.assertIn("Seeded 5 demo trial(s) and 1 demo preset", completed.stdout)

            connection = sqlite3.connect(database_path)
            connection.row_factory = sqlite3.Row

            active_test_count = connection.execute(
                "SELECT COUNT(*) AS count FROM Active_Test"
            ).fetchone()["count"]
            event_count = connection.execute(
                "SELECT COUNT(*) AS count FROM test_events"
            ).fetchone()["count"]
            average_total_interactions = connection.execute(
                """
                SELECT AVG(COALESCE(lever_press, 0) + COALESCE(nose_poke, 0)) AS average_total
                FROM Active_Test
                """
            ).fetchone()["average_total"]
            note_count = connection.execute(
                "SELECT COUNT(*) AS count FROM test_events WHERE event_type = 'note'"
            ).fetchone()["count"]
            operator_count = connection.execute(
                "SELECT COUNT(*) AS count FROM users WHERE email LIKE 'demo.operator%@example.com'"
            ).fetchone()["count"]
            validation_admin_count = connection.execute(
                "SELECT COUNT(*) AS count FROM users WHERE email = 'admin@example.com' AND role = 'admin'"
            ).fetchone()["count"]
            legacy_demo_admin_count = connection.execute(
                "SELECT COUNT(*) AS count FROM users WHERE email = 'demo.admin@example.com'"
            ).fetchone()["count"]
            preset_count = connection.execute(
                "SELECT COUNT(*) AS count FROM user_presets"
            ).fetchone()["count"]
            preset_row = connection.execute(
                """
                SELECT name, test_name, stimulus_type, reward_type
                FROM user_presets
                WHERE name = 'Demo Preset - Training'
                """
            ).fetchone()
            max_trial_event_count = connection.execute(
                """
                SELECT MAX(events_per_trial) AS max_count
                FROM (
                    SELECT COUNT(*) AS events_per_trial
                    FROM test_events
                    GROUP BY test_id
                )
                """
            ).fetchone()["max_count"]

            self.assertEqual(active_test_count, 5)
            self.assertGreater(event_count, 5)
            self.assertGreaterEqual(average_total_interactions, 11)
            self.assertLessEqual(average_total_interactions, 19)
            self.assertGreaterEqual(note_count, 1)
            self.assertGreaterEqual(operator_count, 1)
            self.assertEqual(validation_admin_count, 1)
            self.assertEqual(legacy_demo_admin_count, 0)
            self.assertEqual(preset_count, 1)
            self.assertIsNotNone(preset_row)
            self.assertEqual(preset_row["test_name"], "Demo Training Run")
            self.assertEqual(preset_row["stimulus_type"], "Light + Tone")
            self.assertEqual(preset_row["reward_type"], "Water")
            self.assertGreaterEqual(max_trial_event_count, 12)

    def test_script_can_clear_all_saved_results_without_reseeding(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "demo-testdatabase.db"
            env = os.environ.copy()
            env["GPIO_MODE"] = "mock"
            env["OLED_MODE"] = "mock"
            env["PYTHONPYCACHEPREFIX"] = "/tmp"

            seed_completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--database",
                    str(database_path),
                    "--count",
                    "4",
                    "--seed",
                    "7",
                ],
                cwd=REPO_ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(seed_completed.returncode, 0, seed_completed.stderr or seed_completed.stdout)

            clear_completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--database",
                    str(database_path),
                    "--clear-all-results",
                    "--clear-only",
                ],
                cwd=REPO_ROOT,
                env=env,
                capture_output=True,
                text=True,
            )

            self.assertEqual(clear_completed.returncode, 0, clear_completed.stderr or clear_completed.stdout)
            self.assertIn("Removed 4 saved trial(s)", clear_completed.stdout)

            connection = sqlite3.connect(database_path)
            connection.row_factory = sqlite3.Row
            active_test_count = connection.execute(
                "SELECT COUNT(*) AS count FROM Active_Test"
            ).fetchone()["count"]
            event_count = connection.execute(
                "SELECT COUNT(*) AS count FROM test_events"
            ).fetchone()["count"]

            self.assertEqual(active_test_count, 0)
            self.assertEqual(event_count, 0)


if __name__ == "__main__":
    unittest.main()
