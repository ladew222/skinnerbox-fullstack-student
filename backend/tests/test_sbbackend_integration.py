import os
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest


os.environ.setdefault("GPIO_MODE", "mock")
_IMPORT_DB_DIR = tempfile.TemporaryDirectory()
os.environ.setdefault(
    "SKINNERBOX_DB_PATH",
    str(Path(_IMPORT_DB_DIR.name) / "import-testdatabase.db"),
)

import sbBackend


class SkinnerBoxApiIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_repository = sbBackend.repository
        self.original_session_repository = sbBackend.session_manager.repository
        self.original_auth_repository = sbBackend.auth_repository

        temp_repository = sbBackend.SQLiteTestRepository(
            Path(self.temp_dir.name) / "testdatabase.db"
        )
        temp_auth_repository = sbBackend.SQLiteAuthRepository(
            Path(self.temp_dir.name) / "testdatabase.db"
        )
        sbBackend.repository = temp_repository
        sbBackend.auth_repository = temp_auth_repository
        sbBackend.session_manager.repository = temp_repository
        sbBackend.hardware.stop_all()
        sbBackend.hardware.clear_error_state()
        sbBackend.hardware.last_chime_pattern = ()
        sbBackend.hardware.status_display.clear()

        with sbBackend.session_manager.lock:
            sbBackend.session_manager.active_test = None
            sbBackend.session_manager._reset_runtime_state()
            sbBackend.session_manager.latencies.clear()
            sbBackend.session_manager._refresh_status_display_locked()

        admin_user = temp_auth_repository.upsert_admin(
            email="admin@example.com",
            password="AdminPass123",
            display_name="Local Admin",
        )
        operator_user = temp_auth_repository.register_user(
            email="operator@example.com",
            password="OperatorPass123",
            display_name="Operator User",
        )
        temp_auth_repository.update_user_status(
            user_id=operator_user.user_id,
            status="approved",
            acting_admin_user_id=admin_user.user_id,
        )
        login_payload = temp_auth_repository.login_user(
            email="operator@example.com",
            password="OperatorPass123",
        )
        self.auth_headers = {
            "Authorization": f"Bearer {login_payload['token']}",
        }

        sbBackend.app.config["TESTING"] = True
        self.client = sbBackend.app.test_client()

    def tearDown(self):
        try:
            sbBackend.session_manager.stop_test()
        except Exception:
            pass

        sbBackend.repository = self.original_repository
        sbBackend.session_manager.repository = self.original_session_repository
        sbBackend.auth_repository = self.original_auth_repository
        self.temp_dir.cleanup()

    def test_simulated_lever_presses_are_reported_by_counts_endpoint(self):
        payload = self._base_payload(
            testName="Lever Count Simulation",
            goalForTest=3,
        )

        configure_response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        for _ in range(3):
            time.sleep(0.05)
            lever_response = self.client.post("/api/input/lever", headers=self.auth_headers)
            self.assertEqual(lever_response.status_code, 200)

        counts = self._wait_for_counts(expected_presses=3)
        self.assertEqual(counts["lever_press_count"], 3)
        self.assertEqual(counts["nose_poke_count"], 0)
        self.assertGreaterEqual(counts["elapsed_seconds"], 0)
        self.assertIn("remaining_seconds", counts)

        status = self._wait_for_status(lambda current: current["testFinished"] is True)
        self.assertTrue(status["testFinished"])
        self.assertIsNone(status["error"])

        results_response = self.client.get("/api/results", headers=self.auth_headers)
        self.assertEqual(results_response.status_code, 200)
        results = results_response.get_json()
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "Lever Count Simulation")
        self.assertEqual(results[0]["leverPressCount"], 3)
        self.assertEqual(results[0]["rewardCount"], 3)
        self.assertEqual(results[0]["stimulusType"], "Light")
        self.assertEqual(results[0]["stimulusDescription"], "Light")
        self.assertTrue(results[0]["complete"])

    def test_backend_timer_finishes_test_without_frontend_timekeeping(self):
        payload = self._base_payload(
            testName="Backend Timer Simulation",
            trialDuration=0.003,
            goalForTest=999,
        )

        configure_response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        status = self._wait_for_status(lambda current: current["testFinished"] is True, timeout_seconds=3.0)
        self.assertTrue(status["testFinished"])
        self.assertIsNone(status["error"])

        counts_response = self.client.get("/api/counts", headers=self.auth_headers)
        self.assertEqual(counts_response.status_code, 200)
        counts = counts_response.get_json()
        self.assertGreater(counts["elapsed_seconds"], 0)
        self.assertGreaterEqual(counts["configured_duration_seconds"], 0.18)

        results = self.client.get("/api/results", headers=self.auth_headers).get_json()
        self.assertEqual(results[0]["name"], "Backend Timer Simulation")
        self.assertTrue(results[0]["complete"])
        self.assertGreater(results[0]["elapsedTimeSeconds"], 0)

    def test_finish_endpoint_marks_a_paused_test_complete_in_database(self):
        payload = self._base_payload(
            testName="Manual Finish Simulation",
            goalForTest=999,
        )

        configure_response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        time.sleep(0.05)
        pause_response = self.client.post("/api/test/stop", headers=self.auth_headers)
        self.assertEqual(pause_response.status_code, 200)

        finish_response = self.client.post("/api/test/finish", headers=self.auth_headers)
        self.assertEqual(finish_response.status_code, 200)

        status_response = self.client.get("/api/test/status", headers=self.auth_headers)
        self.assertEqual(status_response.status_code, 200)
        status = status_response.get_json()
        self.assertTrue(status["testFinished"])
        self.assertFalse(status["testPaused"])
        self.assertIsNone(status["error"])

        results = self.client.get("/api/results", headers=self.auth_headers).get_json()
        self.assertEqual(results[0]["name"], "Manual Finish Simulation")
        self.assertEqual(results[0]["status"], "finished")
        self.assertTrue(results[0]["complete"])

    def test_tone_stimulus_is_reflected_in_saved_results(self):
        payload = self._base_payload(
            testName="Tone Stimulus Simulation",
            goalForTest=1,
            stimulusType="Tone",
            lightColor="N/A",
        )

        configure_response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        lever_response = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(lever_response.status_code, 200)

        status = self._wait_for_status(lambda current: current["testFinished"] is True)
        self.assertTrue(status["testFinished"])

        results = self.client.get("/api/results", headers=self.auth_headers).get_json()
        self.assertEqual(results[0]["name"], "Tone Stimulus Simulation")
        self.assertEqual(results[0]["stimulusType"], "Tone")
        self.assertEqual(results[0]["stimulusDescription"], "Tone")

    def test_oled_shows_waiting_status_after_configuration(self):
        payload = self._base_payload(
            testName="OLED Waiting Trial",
            subjectID=12,
        )

        response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)

        self.assertEqual(
            sbBackend.hardware.status_display.last_lines,
            ("SkinnerBox", "READY", "OLED Waiting Trial", "Subj 12", "Press Start"),
        )

    def test_oled_shows_remaining_time_and_lever_count_while_running(self):
        payload = self._base_payload(
            testName="OLED Running Trial",
            goalForTrial=2,
            goalForTest=5,
            trialDuration=1,
        )

        configure_response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)
        self.assertEqual(sbBackend.hardware.status_display.last_lines[0], "RUNNING")

        lever_response = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(lever_response.status_code, 200)

        self._wait_for_condition(
            lambda: any(line == "Lever 1" for line in sbBackend.hardware.status_display.last_lines)
        )
        self.assertTrue(
            any(line.startswith("Left ") for line in sbBackend.hardware.status_display.last_lines)
        )

        self.client.post("/api/test/stop", headers=self.auth_headers)

    def test_running_indicator_turns_off_and_end_chime_runs_when_enabled(self):
        payload = self._base_payload(
            testName="End Chime Simulation",
            goalForTest=1,
            endChimeEnabled=True,
            endChimePattern="523:0.01,659:0.01",
        )

        configure_response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(configure_response.status_code, 200)
        self.assertTrue(sbBackend.hardware.program_ok)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)
        self.assertTrue(sbBackend.hardware.running_on)

        lever_response = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(lever_response.status_code, 200)

        status = self._wait_for_status(lambda current: current["testFinished"] is True)
        self.assertTrue(status["testFinished"])
        self.assertFalse(sbBackend.hardware.running_on)
        self.assertEqual(
            sbBackend.hardware.last_chime_pattern,
            ((523.0, 0.01), (659.0, 0.01)),
        )

        results = self.client.get("/api/results", headers=self.auth_headers).get_json()
        self.assertEqual(results[0]["name"], "End Chime Simulation")
        self.assertTrue(results[0]["endChimeEnabled"])
        self.assertEqual(results[0]["endChimePattern"], "523:0.01,659:0.01")

    def test_runtime_error_blinks_error_led_until_next_successful_configuration(self):
        payload = self._base_payload(testName="Runtime Error Simulation")

        configure_response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(configure_response.status_code, 200)

        original_play_stimulus = sbBackend.hardware.play_stimulus

        def failing_play_stimulus(*args, **kwargs):
            raise sbBackend.ApiError(
                code="SIMULATED_STIMULUS_FAILURE",
                message="Stimulus output failed during the test.",
                status=500,
            )

        sbBackend.hardware.play_stimulus = failing_play_stimulus
        try:
            run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
            self.assertEqual(run_response.status_code, 200)

            status = self._wait_for_status(
                lambda current: current["error"] is not None,
                timeout_seconds=3.0,
            )
            self.assertEqual(status["error"]["code"], "SIMULATED_STIMULUS_FAILURE")
            self.assertFalse(status["testRunning"])
            self.assertFalse(status["testFinished"])

            self._wait_for_condition(lambda: sbBackend.hardware.error_blinking)
            self.assertFalse(sbBackend.hardware.running_on)
            self.assertFalse(sbBackend.hardware.program_ok)
            self.assertEqual(sbBackend.hardware.status_display.last_lines[0], "ERROR")
        finally:
            sbBackend.hardware.play_stimulus = original_play_stimulus

        recovery_response = self.client.post(
            "/api/test/information",
            json=self._base_payload(testName="Recovered Configuration"),
            headers=self.auth_headers,
        )
        self.assertEqual(recovery_response.status_code, 200)
        self.assertFalse(sbBackend.hardware.error_blinking)
        self.assertTrue(sbBackend.hardware.program_ok)

    def test_pump_prime_endpoint_runs_before_a_test(self):
        response = self.client.post(
            "/api/pump/prime",
            json={"durationSeconds": 0.01},
            headers=self.auth_headers,
        )
        self.assertEqual(response.status_code, 200)

        payload = response.get_json()
        self.assertEqual(payload["message"], "Pump primed successfully.")
        self.assertAlmostEqual(payload["durationSeconds"], 0.01, places=2)

    def test_pump_prime_endpoint_is_blocked_while_test_is_running(self):
        payload = self._base_payload(testName="Pump Prime Guard")

        configure_response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        response = self.client.post(
            "/api/pump/prime",
            json={"durationSeconds": 0.01},
            headers=self.auth_headers,
        )
        self.assertEqual(response.status_code, 409)

        error_payload = response.get_json()["error"]
        self.assertEqual(error_payload["code"], "PUMP_PRIME_BLOCKED")

    def test_repository_migrates_legacy_active_test_schema(self):
        legacy_database_path = Path(self.temp_dir.name) / "legacy-testdatabase.db"

        with sqlite3.connect(legacy_database_path) as connection:
            connection.execute(
                """
                CREATE TABLE Active_Test (
                    testID INTEGER PRIMARY KEY,
                    subjectID INTEGER,
                    Name TEXT
                )
                """
            )
            connection.commit()

        migrated_repository = sbBackend.SQLiteTestRepository(legacy_database_path)
        with migrated_repository.connect() as connection:
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(Active_Test)")
            }

        self.assertTrue(
            {
                "Goal",
                "goal_for_test",
                "reward_stim_delay",
                "stimulus_duration",
                "Cooldown",
                "Reward",
                "interaction",
                "Stimulus",
                "Light",
                "testStatus",
                "Duration",
                "nose_poke",
                "lever_press",
                "reward_count",
                "elapsed_seconds",
                "created_at",
                "updated_at",
            }.issubset(columns)
        )

    def test_presets_can_be_saved_listed_updated_and_deleted_per_user(self):
        payload = {
            "id": "lever-light-baseline",
            "name": "Lever Light Baseline",
            "description": "Saved preset for quick operator startup.",
            **self._base_payload(
                testName="Preset Trial",
                subjectID=9,
                goalForTest=4,
                stimulusType="Light",
                lightColor="Box Light",
            ),
        }

        save_response = self.client.post("/api/presets", json=payload, headers=self.auth_headers)
        self.assertEqual(save_response.status_code, 200)
        saved_payload = save_response.get_json()
        self.assertFalse(saved_payload["replaced"])
        self.assertEqual(saved_payload["preset"]["name"], "Lever Light Baseline")
        self.assertEqual(saved_payload["preset"]["testName"], "Preset Trial")

        list_response = self.client.get("/api/presets", headers=self.auth_headers)
        self.assertEqual(list_response.status_code, 200)
        presets = list_response.get_json()["presets"]
        self.assertEqual(len(presets), 1)
        self.assertEqual(presets[0]["stimulusDescription"], "Light")

        update_response = self.client.post(
            "/api/presets",
            json={**payload, "goalForTest": 8, "description": "Updated target count."},
            headers=self.auth_headers,
        )
        self.assertEqual(update_response.status_code, 200)
        updated_payload = update_response.get_json()
        self.assertTrue(updated_payload["replaced"])
        self.assertEqual(updated_payload["preset"]["goalForTest"], 8)

        admin_login_payload = sbBackend.auth_repository.login_user(
            email="admin@example.com",
            password="AdminPass123",
        )
        admin_headers = {
            "Authorization": f"Bearer {admin_login_payload['token']}",
        }
        admin_preset_response = self.client.get("/api/presets", headers=admin_headers)
        self.assertEqual(admin_preset_response.status_code, 200)
        self.assertEqual(admin_preset_response.get_json()["presets"], [])

        delete_response = self.client.delete(
            f"/api/presets/{saved_payload['preset']['id']}",
            headers=self.auth_headers,
        )
        self.assertEqual(delete_response.status_code, 200)

        final_list_response = self.client.get("/api/presets", headers=self.auth_headers)
        self.assertEqual(final_list_response.status_code, 200)
        self.assertEqual(final_list_response.get_json()["presets"], [])

    def _wait_for_counts(self, expected_presses: int, timeout_seconds: float = 2.0):
        deadline = time.time() + timeout_seconds
        latest_counts = None

        while time.time() < deadline:
            response = self.client.get("/api/counts", headers=self.auth_headers)
            self.assertEqual(response.status_code, 200)
            latest_counts = response.get_json()
            if latest_counts["lever_press_count"] >= expected_presses:
                return latest_counts
            time.sleep(0.05)

        self.fail(f"Lever press count never reached {expected_presses}: {latest_counts}")

    def _wait_for_status(self, predicate, timeout_seconds: float = 2.0):
        deadline = time.time() + timeout_seconds
        latest_status = None

        while time.time() < deadline:
            response = self.client.get("/api/test/status", headers=self.auth_headers)
            self.assertEqual(response.status_code, 200)
            latest_status = response.get_json()
            if predicate(latest_status):
                return latest_status
            time.sleep(0.05)

        self.fail(f"Status condition was not met: {latest_status}")

    def _wait_for_condition(self, predicate, timeout_seconds: float = 2.0):
        deadline = time.time() + timeout_seconds

        while time.time() < deadline:
            if predicate():
                return
            time.sleep(0.05)

        self.fail("Condition was not met before the timeout elapsed.")

    @staticmethod
    def _base_payload(**overrides):
        payload = {
            "testName": "SkinnerBox Simulation",
            "subjectID": 1,
            "trialDuration": 1,
            "goalForTrial": 1,
            "goalForTest": 3,
            "RewaStimTime": 0,
            "StimTimeOn": 0,
            "cooldown": 0,
            "rewardType": "Water",
            "interactionType": "Lever",
            "stimulusType": "Light",
            "lightColor": "Box Light",
            "leverPress": 0,
            "nosePoke": 0,
        }
        payload.update(overrides)
        return payload


if __name__ == "__main__":
    unittest.main()
