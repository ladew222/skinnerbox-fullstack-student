import os
from pathlib import Path
import sqlite3
import threading
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


class MockCameraManager:
    def __init__(self, *, available: bool):
        self.available = available
        self.capture_calls = 0

    def get_status(self):
        if not self.available:
            return {
                "available": False,
                "mode": "mock",
                "reason": "No optional camera preview is available on this box.",
                "refreshIntervalSeconds": 1.5,
                "resolution": "320x240",
            }

        return {
            "available": True,
            "mode": "mock",
            "deviceName": "Mock Camera",
            "refreshIntervalSeconds": 1.5,
            "resolution": "320x240",
        }

    def capture_frame(self):
        if not self.available:
            raise sbBackend.CameraUnavailableError(
                "No optional camera preview is available on this box."
            )
        self.capture_calls += 1
        return b"<svg></svg>", "image/svg+xml"


class SkinnerBoxApiIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_repository = sbBackend.repository
        self.original_session_repository = sbBackend.session_manager.repository
        self.original_auth_repository = sbBackend.auth_repository
        self.original_camera_manager = sbBackend.camera_manager
        self.original_startup_ip_address = sbBackend.hardware.startup_ip_address
        self.original_startup_banner_deadline = sbBackend.hardware.startup_banner_deadline

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
        sbBackend.hardware.set_stimulus_buzzer_mode("passive")
        sbBackend.hardware.startup_ip_address = ""
        sbBackend.hardware.startup_banner_deadline = time.monotonic() - 1
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
        self.operator_user_id = operator_user.user_id
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
        admin_login_payload = temp_auth_repository.login_user(
            email="admin@example.com",
            password="AdminPass123",
        )
        self.admin_headers = {
            "Authorization": f"Bearer {admin_login_payload['token']}",
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
        sbBackend.camera_manager = self.original_camera_manager
        sbBackend.hardware.startup_ip_address = self.original_startup_ip_address
        sbBackend.hardware.startup_banner_deadline = self.original_startup_banner_deadline
        self.temp_dir.cleanup()

    def test_camera_status_reports_unavailable_when_no_optional_camera_is_connected(self):
        sbBackend.camera_manager = MockCameraManager(available=False)

        response = self.client.get("/api/camera/status", headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)

        payload = response.get_json()
        self.assertFalse(payload["available"])
        self.assertEqual(payload["mode"], "mock")
        self.assertIn("No optional camera preview", payload["reason"])

    def test_camera_frame_returns_one_still_image_when_optional_camera_is_available(self):
        sbBackend.camera_manager = MockCameraManager(available=True)

        status_response = self.client.get("/api/camera/status", headers=self.auth_headers)
        self.assertEqual(status_response.status_code, 200)
        self.assertTrue(status_response.get_json()["available"])

        frame_response = self.client.get("/api/camera/frame", headers=self.auth_headers)
        self.assertEqual(frame_response.status_code, 200)
        self.assertEqual(frame_response.mimetype, "image/svg+xml")
        self.assertEqual(frame_response.data, b"<svg></svg>")

    def test_finished_trial_can_save_and_delete_an_attached_camera_snapshot(self):
        mock_camera = MockCameraManager(available=True)
        sbBackend.camera_manager = mock_camera

        payload = self._base_payload(
            testName="Camera Snapshot Trial",
            trialDuration=0.003,
            goalForTest=999,
        )

        configure_response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        self._wait_for_status(lambda current: current["testFinished"] is True, timeout_seconds=3.0)

        results_response = self.client.get("/api/results", headers=self.auth_headers)
        self.assertEqual(results_response.status_code, 200)
        results = results_response.get_json()
        self.assertEqual(len(results), 1)
        self.assertTrue(results[0]["hasCameraSnapshot"])
        self.assertEqual(mock_camera.capture_calls, 1)

        snapshot_response = self.client.get(
            f"/api/results/{results[0]['id']}/snapshot",
            headers=self.auth_headers,
        )
        self.assertEqual(snapshot_response.status_code, 200)
        self.assertEqual(snapshot_response.mimetype, "image/svg+xml")
        self.assertEqual(snapshot_response.data, b"<svg></svg>")

        delete_response = self.client.delete(
            f"/api/results/{results[0]['id']}",
            headers=self.admin_headers,
        )
        self.assertEqual(delete_response.status_code, 200)

        deleted_snapshot_response = self.client.get(
            f"/api/results/{results[0]['id']}/snapshot",
            headers=self.auth_headers,
        )
        self.assertEqual(deleted_snapshot_response.status_code, 404)

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
        self.assertEqual(status["conductedBy"]["displayName"], "Operator User")
        self.assertEqual(status["conductedBy"]["email"], "operator@example.com")

        results_response = self.client.get("/api/results", headers=self.auth_headers)
        self.assertEqual(results_response.status_code, 200)
        results = results_response.get_json()
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "Lever Count Simulation")
        self.assertEqual(results[0]["leverPressCount"], 3)
        self.assertEqual(results[0]["rewardCount"], 3)
        self.assertEqual(results[0]["stimulusType"], "Light")
        self.assertEqual(results[0]["stimulusDescription"], "Light")
        self.assertEqual(results[0]["conductedBy"]["displayName"], "Operator User")
        self.assertEqual(results[0]["conductedBy"]["email"], "operator@example.com")
        self.assertEqual(results[0]["conductedBy"]["id"], self.operator_user_id)
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

    def test_test_status_includes_active_configuration_for_resume(self):
        payload = self._base_payload(
            testName="Resume Restore Simulation",
            subjectID=12,
            trialDuration=7,
            goalForTrial=2,
            goalForTest=9,
            RewaStimTime=3,
            StimTimeOn=4,
            cooldown=5,
            interactionType="Nose Poke",
            stimulusType="Tone",
            lightColor="N/A",
            endChimeEnabled=True,
            endChimePattern="523:0.08,659:0.08",
        )

        configure_response = self.client.post(
            "/api/test/information",
            json=payload,
            headers=self.auth_headers,
        )
        self.assertEqual(configure_response.status_code, 200)

        status_response = self.client.get("/api/test/status", headers=self.auth_headers)
        self.assertEqual(status_response.status_code, 200)

        status = status_response.get_json()
        self.assertIsNotNone(status["activeTest"])
        self.assertFalse(status["testRunning"])
        self.assertFalse(status["testPaused"])
        self.assertFalse(status["testFinished"])
        self.assertEqual(status["activeTest"]["testName"], "Resume Restore Simulation")
        self.assertEqual(status["activeTest"]["subjectID"], 12)
        self.assertEqual(status["activeTest"]["trialDuration"], 7)
        self.assertEqual(status["activeTest"]["goalForTrial"], 2)
        self.assertEqual(status["activeTest"]["goalForTest"], 9)
        self.assertEqual(status["activeTest"]["RewaStimTime"], 3)
        self.assertEqual(status["activeTest"]["StimTimeOn"], 4)
        self.assertEqual(status["activeTest"]["cooldown"], 5)
        self.assertEqual(status["activeTest"]["rewardType"], "Water")
        self.assertEqual(status["activeTest"]["interactionType"], "Nose Poke")
        self.assertEqual(status["activeTest"]["stimulusType"], "Tone")
        self.assertEqual(status["activeTest"]["lightColor"], "N/A")
        self.assertTrue(status["activeTest"]["endChimeEnabled"])
        self.assertEqual(status["activeTest"]["endChimePattern"], "523:0.08,659:0.08")

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

        self._wait_for_condition(lambda: sbBackend.session_manager.stimulus_active is False)

        lever_response = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(lever_response.status_code, 200)

        status = self._wait_for_status(lambda current: current["testFinished"] is True)
        self.assertTrue(status["testFinished"])

        results = self.client.get("/api/results", headers=self.auth_headers).get_json()
        self.assertEqual(results[0]["name"], "Tone Stimulus Simulation")
        self.assertEqual(results[0]["stimulusType"], "Tone")
        self.assertEqual(results[0]["stimulusDescription"], "Tone")

    def test_combined_stimulus_is_reflected_in_saved_results(self):
        payload = self._base_payload(
            testName="Combined Stimulus Simulation",
            goalForTest=1,
            stimulusType="Light + Tone",
            lightColor="Box Light",
        )

        configure_response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        self._wait_for_condition(lambda: sbBackend.session_manager.stimulus_active is False)
        lever_response = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(lever_response.status_code, 200)

        status = self._wait_for_status(lambda current: current["testFinished"] is True)
        self.assertTrue(status["testFinished"])

        results = self.client.get("/api/results", headers=self.auth_headers).get_json()
        self.assertEqual(results[0]["name"], "Combined Stimulus Simulation")
        self.assertEqual(results[0]["stimulusType"], "Light + Tone")
        self.assertEqual(results[0]["stimulusDescription"], "Light + Tone")

    def test_combined_stimulus_activates_light_and_tone_outputs(self):
        # The visual stimulus is now driven through set_stimulus_lights (the
        # three repurposed board LEDs), not the legacy blue cue.
        original_set_stimulus_lights = sbBackend.hardware.set_stimulus_lights
        original_buzzer_play = sbBackend.hardware.buzzer.play
        observed_outputs = {
            "light": False,
            "tone": False,
        }

        def recording_set_stimulus_lights(enabled):
            if enabled:
                observed_outputs["light"] = True
            return original_set_stimulus_lights(enabled)

        def recording_buzzer_play(frequency_hz):
            observed_outputs["tone"] = True
            return original_buzzer_play(frequency_hz)

        sbBackend.hardware.set_stimulus_lights = recording_set_stimulus_lights
        sbBackend.hardware.buzzer.play = recording_buzzer_play
        try:
            sbBackend.hardware.play_stimulus(
                "Light + Tone",
                "Box Light",
                0.01,
                threading.Event(),
            )
        finally:
            sbBackend.hardware.set_stimulus_lights = original_set_stimulus_lights
            sbBackend.hardware.buzzer.play = original_buzzer_play

        self.assertTrue(observed_outputs["light"])
        self.assertTrue(observed_outputs["tone"])

    def test_active_trial_buzzer_mode_uses_gpio13_output_for_tone_stimulus(self):
        original_set_active_buzzer_output = sbBackend.hardware.set_active_buzzer_output
        original_buzzer_play = sbBackend.hardware.buzzer.play
        observed_outputs = {
            "active": False,
            "passive": False,
        }

        def recording_set_active_buzzer_output(enabled):
            if enabled:
                observed_outputs["active"] = True
            return original_set_active_buzzer_output(enabled)

        def recording_buzzer_play(frequency_hz):
            observed_outputs["passive"] = True
            return original_buzzer_play(frequency_hz)

        sbBackend.hardware.set_stimulus_buzzer_mode("active")
        sbBackend.hardware.set_active_buzzer_output = recording_set_active_buzzer_output
        sbBackend.hardware.buzzer.play = recording_buzzer_play
        try:
            sbBackend.hardware.play_stimulus(
                "Tone",
                "N/A",
                0.01,
                threading.Event(),
            )
        finally:
            sbBackend.hardware.set_active_buzzer_output = original_set_active_buzzer_output
            sbBackend.hardware.buzzer.play = original_buzzer_play
            sbBackend.hardware.set_stimulus_buzzer_mode("passive")

        self.assertTrue(observed_outputs["active"])
        self.assertFalse(observed_outputs["passive"])

    def test_oled_shows_waiting_status_after_configuration(self):
        payload = self._base_payload(
            testName="OLED Waiting Trial",
            subjectID=12,
        )

        response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)

        self.assertEqual(
            sbBackend.hardware.status_display.last_lines,
            ("SkinnerBox", "READY", "OLED Waiting Trial", "Subj 12", "IP unavailable"),
        )

    def test_invalid_goal_relationship_is_rejected_by_backend_validation(self):
        payload = self._base_payload(
            testName="Invalid Goal Trial",
            goalForTrial=5,
            goalForTest=3,
        )

        response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)

        self.assertEqual(response.status_code, 400)
        error_payload = response.get_json()["error"]
        self.assertEqual(error_payload["code"], "INVALID_TEST_CONFIGURATION")
        self.assertIn("goalForTest", error_payload["message"])

    def test_invalid_stimulus_type_is_rejected_by_backend_validation(self):
        payload = self._base_payload(
            testName="Invalid Stimulus Trial",
            stimulusType="Laser",
        )

        response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)

        self.assertEqual(response.status_code, 400)
        error_payload = response.get_json()["error"]
        self.assertEqual(error_payload["code"], "INVALID_TEST_CONFIGURATION")
        self.assertIn("stimulusType", error_payload["message"])

    def test_hardware_gpio_mapping_matches_current_box_wiring(self):
        self.assertEqual(sbBackend.SkinnerHardware.LEVER_INPUT_GPIO, 23)
        self.assertEqual(sbBackend.SkinnerHardware.NOSE_POKE_INPUT_GPIO, 16)

    def test_oled_shows_ip_address_during_startup_window(self):
        sbBackend.hardware.startup_ip_address = "192.168.1.158"
        sbBackend.hardware.startup_banner_deadline = (
            time.monotonic() + sbBackend.hardware.STARTUP_IP_DISPLAY_SECONDS
        )

        with sbBackend.session_manager.lock:
            sbBackend.session_manager.active_test = None
            sbBackend.session_manager._reset_runtime_state()
            sbBackend.session_manager._refresh_status_display_locked()

        self.assertEqual(
            sbBackend.hardware.status_display.last_lines,
            ("SkinnerBox", "READY", "IP Address", "192.168.1.158", "Press Start"),
        )

    def test_oled_shows_ip_address_on_idle_ready_screen_after_startup_window(self):
        sbBackend.hardware.startup_ip_address = "192.168.1.158"
        sbBackend.hardware.startup_banner_deadline = time.monotonic() - 1

        with sbBackend.session_manager.lock:
            sbBackend.session_manager.active_test = None
            sbBackend.session_manager._reset_runtime_state()
            sbBackend.session_manager._refresh_status_display_locked()

        self.assertEqual(
            sbBackend.hardware.status_display.last_lines,
            ("SkinnerBox", "READY", "Waiting for test", "IP 192.168.1.158"),
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

        self._wait_for_condition(lambda: sbBackend.session_manager.stimulus_active is False)

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

    def test_buzzer_test_endpoint_runs_before_a_test(self):
        response = self.client.post(
            "/api/buzzer/test",
            headers=self.auth_headers,
        )
        self.assertEqual(response.status_code, 200)

        payload = response.get_json()
        self.assertEqual(payload["message"], "Buzzer test played successfully.")
        self.assertEqual(payload["pattern"], "523:0.08,659:0.08")
        self.assertEqual(
            sbBackend.hardware.last_chime_pattern,
            ((523.0, 0.08), (659.0, 0.08)),
        )

    def test_buzzer_test_endpoint_is_blocked_while_test_is_running(self):
        payload = self._base_payload(testName="Buzzer Test Guard")

        configure_response = self.client.post("/api/test/information", json=payload, headers=self.auth_headers)
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        response = self.client.post(
            "/api/buzzer/test",
            headers=self.auth_headers,
        )
        self.assertEqual(response.status_code, 409)

        error_payload = response.get_json()["error"]
        self.assertEqual(error_payload["code"], "BUZZER_TEST_BLOCKED")

    def test_trial_buzzer_output_setting_can_be_saved_from_maintenance_page(self):
        response = self.client.post(
            "/api/maintenance/stimulus-buzzer-mode",
            json={"stimulusBuzzerMode": "active"},
            headers=self.auth_headers,
        )
        self.assertEqual(response.status_code, 200)

        payload = response.get_json()
        self.assertEqual(payload["message"], "Trial buzzer output saved successfully.")
        self.assertEqual(payload["stimulusBuzzerMode"], "active")

        status_response = self.client.get("/api/maintenance/status", headers=self.auth_headers)
        self.assertEqual(status_response.status_code, 200)
        status_payload = status_response.get_json()
        self.assertEqual(status_payload["activeStimulusBuzzerMode"], "active")

    def test_saved_results_show_dates_and_can_be_deleted_by_admin(self):
        payload = self._base_payload(
            testName="Admin Delete Trial",
            goalForTest=1,
        )

        configure_response = self.client.post(
            "/api/test/information",
            json=payload,
            headers=self.auth_headers,
        )
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        self._wait_for_condition(lambda: sbBackend.session_manager.stimulus_active is False)
        lever_response = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(lever_response.status_code, 200)

        self._wait_for_status(lambda current: current["testFinished"] is True)

        results_response = self.client.get("/api/results", headers=self.auth_headers)
        self.assertEqual(results_response.status_code, 200)
        results = results_response.get_json()
        self.assertEqual(len(results), 1)
        self.assertTrue(results[0]["createdAt"])
        self.assertTrue(results[0]["updatedAt"])
        self.assertEqual(results[0]["conductedBy"]["displayName"], "Operator User")
        self.assertEqual(results[0]["conductedBy"]["email"], "operator@example.com")

        operator_delete_response = self.client.delete(
            f"/api/results/{results[0]['id']}",
            headers=self.auth_headers,
        )
        self.assertEqual(operator_delete_response.status_code, 403)

        admin_delete_response = self.client.delete(
            f"/api/results/{results[0]['id']}",
            headers=self.admin_headers,
        )
        self.assertEqual(admin_delete_response.status_code, 200)

        final_results_response = self.client.get("/api/results", headers=self.auth_headers)
        self.assertEqual(final_results_response.status_code, 200)
        self.assertEqual(final_results_response.get_json(), [])

    def test_saved_results_can_be_deleted_in_one_admin_batch_request(self):
        first_payload = self._base_payload(
            testName="Admin Batch Delete One",
            goalForTest=1,
        )
        second_payload = self._base_payload(
            testName="Admin Batch Delete Two",
            goalForTest=1,
            testID=2000000002000,
        )

        for payload in (first_payload, second_payload):
            configure_response = self.client.post(
                "/api/test/information",
                json=payload,
                headers=self.auth_headers,
            )
            self.assertEqual(configure_response.status_code, 200)

            run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
            self.assertEqual(run_response.status_code, 200)
            self._wait_for_condition(lambda: sbBackend.session_manager.stimulus_active is False)

            interaction_endpoint = "/api/input/lever"
            if payload["interactionType"] == "Poke":
                interaction_endpoint = "/api/input/nosepoke"

            interaction_response = self.client.post(interaction_endpoint, headers=self.auth_headers)
            self.assertEqual(interaction_response.status_code, 200)
            self._wait_for_status(lambda current: current["testFinished"] is True)

        results = self.client.get("/api/results", headers=self.auth_headers).get_json()
        result_ids = [result["id"] for result in results[:2]]
        self.assertEqual(len(result_ids), 2)

        batch_delete_response = self.client.post(
            "/api/results/delete-batch",
            json={"resultIds": result_ids},
            headers=self.admin_headers,
        )
        self.assertEqual(batch_delete_response.status_code, 200)
        payload = batch_delete_response.get_json()
        self.assertEqual(payload["deletedCount"], 2)
        self.assertEqual(sorted(payload["deletedIds"]), sorted([str(result_id) for result_id in result_ids]))
        self.assertEqual(payload["missingIds"], [])

    def test_saved_results_include_event_timeline_and_operator_notes(self):
        payload = self._base_payload(
            testName="Timeline Trial",
            goalForTest=1,
        )

        configure_response = self.client.post(
            "/api/test/information",
            json=payload,
            headers=self.auth_headers,
        )
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        note_response = self.client.post(
            "/api/test/note",
            json={"noteText": "Animal hesitated before first response."},
            headers=self.auth_headers,
        )
        self.assertEqual(note_response.status_code, 200)

        self._wait_for_condition(lambda: sbBackend.session_manager.stimulus_active is False)
        lever_response = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(lever_response.status_code, 200)

        self._wait_for_status(lambda current: current["testFinished"] is True)

        results = self.client.get("/api/results", headers=self.auth_headers).get_json()
        self.assertEqual(results[0]["name"], "Timeline Trial")
        self.assertGreater(results[0]["eventCount"], 0)
        self.assertTrue(results[0]["eventTimeline"])
        self.assertEqual(results[0]["notes"][0]["detailText"], "Animal hesitated before first response.")
        event_types = [event["type"] for event in results[0]["eventTimeline"]]
        self.assertIn("configured", event_types)
        self.assertIn("started", event_types)
        self.assertIn("note", event_types)
        self.assertIn("lever_press", event_types)
        self.assertIn("reward_delivered", event_types)
        self.assertIn("finished", event_types)

    def test_results_track_valid_and_invalid_interactions_based_on_active_stimulus(self):
        payload = self._base_payload(
            testName="Validity Tracking Trial",
            goalForTest=1,
            stimulusType="Light",
            StimTimeOn=0.4,
        )

        configure_response = self.client.post(
            "/api/test/information",
            json=payload,
            headers=self.auth_headers,
        )
        self.assertEqual(configure_response.status_code, 200)

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        time.sleep(0.05)
        pause_response = self.client.post("/api/test/stop", headers=self.auth_headers)
        self.assertEqual(pause_response.status_code, 200)

        sbBackend.session_manager.hardware.set_blue(True)
        invalid_press_response = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(invalid_press_response.status_code, 200)

        sbBackend.session_manager.hardware.set_blue(False)
        valid_press_response = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(valid_press_response.status_code, 200)

        finish_response = self.client.post("/api/test/finish", headers=self.auth_headers)
        self.assertEqual(finish_response.status_code, 200)

        results = self.client.get("/api/results", headers=self.auth_headers).get_json()
        self.assertEqual(results[0]["name"], "Validity Tracking Trial")
        self.assertEqual(results[0]["leverPressCount"], 2)
        self.assertEqual(results[0]["validLeverPressCount"], 1)
        self.assertEqual(results[0]["invalidLeverPressCount"], 1)
        self.assertEqual(results[0]["validNosePokeCount"], 0)
        self.assertEqual(results[0]["invalidNosePokeCount"], 0)

        lever_events = [
            event for event in results[0]["eventTimeline"] if event["type"] == "lever_press"
        ]
        self.assertEqual(len(lever_events), 2)
        self.assertEqual(lever_events[0]["responseValidity"], "invalid")
        self.assertEqual(lever_events[0]["responseReason"], "stimulus_active")
        self.assertEqual(lever_events[1]["responseValidity"], "valid")
        self.assertEqual(lever_events[1]["responseReason"], "")

    def test_subject_tracking_can_be_left_blank(self):
        payload = self._base_payload(
            testName="No Subject Trial",
            subjectID="",
            goalForTest=1,
        )

        configure_response = self.client.post(
            "/api/test/information",
            json=payload,
            headers=self.auth_headers,
        )
        self.assertEqual(configure_response.status_code, 200)
        self.assertIsNone(
            configure_response.get_json()["received_configuration"]["subjectID"]
        )

        run_response = self.client.post("/api/test/run", json=payload, headers=self.auth_headers)
        self.assertEqual(run_response.status_code, 200)

        self._wait_for_condition(lambda: sbBackend.session_manager.stimulus_active is False)

        lever_response = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(lever_response.status_code, 200)

        self._wait_for_status(lambda current: current["testFinished"] is True)

        results = self.client.get("/api/results", headers=self.auth_headers).get_json()
        self.assertEqual(results[0]["name"], "No Subject Trial")
        self.assertIsNone(results[0]["subjectId"])
        self.assertEqual(
            results[0]["eventTimeline"][0]["detailText"],
            "No Subject Trial prepared without subject tracking.",
        )

    def test_maintenance_status_reports_latest_pump_calibration(self):
        initial_status_response = self.client.get(
            "/api/maintenance/status",
            headers=self.auth_headers,
        )
        self.assertEqual(initial_status_response.status_code, 200)
        self.assertIsNone(initial_status_response.get_json()["latestPumpCalibration"])

        calibration_response = self.client.post(
            "/api/maintenance/pump-calibration",
            json={
                "durationSeconds": 2,
                "measuredVolumeMl": 1.5,
                "noteText": "Measured after replacing the water line.",
            },
            headers=self.auth_headers,
        )
        self.assertEqual(calibration_response.status_code, 200)
        calibration_payload = calibration_response.get_json()["calibration"]
        self.assertAlmostEqual(calibration_payload["derivedRateMlPerSecond"], 0.75, places=4)
        self.assertEqual(calibration_payload["createdBy"]["displayName"], "Operator User")

        status_response = self.client.get(
            "/api/maintenance/status",
            headers=self.auth_headers,
        )
        self.assertEqual(status_response.status_code, 200)
        status_payload = status_response.get_json()
        self.assertEqual(status_payload["gpioMode"], "mock")
        self.assertEqual(
            status_payload["latestPumpCalibration"]["noteText"],
            "Measured after replacing the water line.",
        )
        self.assertEqual(status_payload["rewardPulseSeconds"], 0.03)

    def test_lever_debounce_setting_is_saved_and_reported_in_maintenance_status(self):
        debounce_response = self.client.post(
            "/api/maintenance/lever-debounce",
            json={
                "debounceMilliseconds": 300,
                "noteText": "Raised for rat lever bounce.",
            },
            headers=self.auth_headers,
        )
        self.assertEqual(debounce_response.status_code, 200)
        payload = debounce_response.get_json()["leverDebounce"]
        self.assertAlmostEqual(payload["durationSeconds"], 0.3, places=3)
        self.assertEqual(payload["noteText"], "Raised for rat lever bounce.")

        status_response = self.client.get(
            "/api/maintenance/status",
            headers=self.auth_headers,
        )
        self.assertEqual(status_response.status_code, 200)
        status_payload = status_response.get_json()
        self.assertEqual(status_payload["activeLeverDebounceMilliseconds"], 300)
        self.assertEqual(
            status_payload["latestLeverDebounce"]["noteText"],
            "Raised for rat lever bounce.",
        )
        self.assertAlmostEqual(
            sbBackend.session_manager.hardware.lever_debounce_seconds,
            0.3,
            places=3,
        )

    def test_lever_release_requirement_is_saved_and_reported_in_maintenance_status(self):
        lever_mode_response = self.client.post(
            "/api/maintenance/lever-release-requirement",
            json={
                "requireReleaseBeforeCount": True,
                "noteText": "Count only after the lever returns to rest.",
            },
            headers=self.auth_headers,
        )
        self.assertEqual(lever_mode_response.status_code, 200)
        payload = lever_mode_response.get_json()["leverReleaseRequirement"]
        self.assertEqual(payload["durationSeconds"], 1)
        self.assertEqual(payload["noteText"], "Count only after the lever returns to rest.")

        status_response = self.client.get(
            "/api/maintenance/status",
            headers=self.auth_headers,
        )
        self.assertEqual(status_response.status_code, 200)
        status_payload = status_response.get_json()
        self.assertTrue(status_payload["activeRequireLeverReleaseBeforeCount"])
        self.assertEqual(
            status_payload["latestLeverReleaseRequirement"]["noteText"],
            "Count only after the lever returns to rest.",
        )
        self.assertTrue(sbBackend.session_manager.require_lever_release_before_count)

    def test_lever_release_requirement_blocks_duplicate_counts_until_release(self):
        lever_mode_response = self.client.post(
            "/api/maintenance/lever-release-requirement",
            json={"requireReleaseBeforeCount": True},
            headers=self.auth_headers,
        )
        self.assertEqual(lever_mode_response.status_code, 200)

        first_press = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(first_press.status_code, 200)

        second_press = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(second_press.status_code, 200)

        counts_response = self.client.get("/api/counts", headers=self.auth_headers)
        self.assertEqual(counts_response.status_code, 200)
        self.assertEqual(counts_response.get_json()["lever_press_count"], 1)

        release_response = self.client.post(
            "/api/input/lever/release",
            headers=self.auth_headers,
        )
        self.assertEqual(release_response.status_code, 200)

        third_press = self.client.post("/api/input/lever", headers=self.auth_headers)
        self.assertEqual(third_press.status_code, 200)

        final_counts_response = self.client.get("/api/counts", headers=self.auth_headers)
        self.assertEqual(final_counts_response.status_code, 200)
        self.assertEqual(final_counts_response.get_json()["lever_press_count"], 2)

    def test_reward_pulse_setting_is_saved_and_reported_in_maintenance_status(self):
        reward_pulse_response = self.client.post(
            "/api/maintenance/reward-pulse",
            json={
                "rewardPulseMilliseconds": 300,
                "noteText": "Known good reward pulse for calibration runs.",
            },
            headers=self.auth_headers,
        )
        self.assertEqual(reward_pulse_response.status_code, 200)
        payload = reward_pulse_response.get_json()["rewardPulse"]
        self.assertAlmostEqual(payload["durationSeconds"], 0.3, places=4)
        self.assertEqual(payload["noteText"], "Known good reward pulse for calibration runs.")

        status_response = self.client.get(
            "/api/maintenance/status",
            headers=self.auth_headers,
        )
        self.assertEqual(status_response.status_code, 200)
        status_payload = status_response.get_json()
        self.assertEqual(status_payload["activeRewardPulseMilliseconds"], 300)
        self.assertEqual(
            status_payload["latestRewardPulse"]["noteText"],
            "Known good reward pulse for calibration runs.",
        )
        self.assertAlmostEqual(status_payload["rewardPulseSeconds"], 0.3, places=4)
        self.assertAlmostEqual(
            sbBackend.session_manager.hardware.reward_pulse_seconds,
            0.3,
            places=4,
        )

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
                "valid_lever_press",
                "invalid_lever_press",
                "valid_nose_poke",
                "invalid_nose_poke",
                "elapsed_seconds",
                "conducted_by_user_id",
                "conducted_by_email",
                "conducted_by_display_name",
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

        admin_preset_response = self.client.get("/api/presets", headers=self.admin_headers)
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
