import os
from pathlib import Path
import tempfile
import unittest


os.environ.setdefault("GPIO_MODE", "mock")
_IMPORT_DB_DIR = tempfile.TemporaryDirectory()
os.environ.setdefault(
    "SKINNERBOX_DB_PATH",
    str(Path(_IMPORT_DB_DIR.name) / "import-auth-testdatabase.db"),
)

import sbBackend


class AuthenticationIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        temp_database_path = Path(self.temp_dir.name) / "testdatabase.db"

        self.original_repository = sbBackend.repository
        self.original_session_repository = sbBackend.session_manager.repository
        self.original_auth_repository = sbBackend.auth_repository

        temp_repository = sbBackend.SQLiteTestRepository(temp_database_path)
        temp_auth_repository = sbBackend.SQLiteAuthRepository(temp_database_path)
        sbBackend.repository = temp_repository
        sbBackend.auth_repository = temp_auth_repository
        sbBackend.session_manager.repository = temp_repository

        with sbBackend.session_manager.lock:
            sbBackend.session_manager.active_test = None
            sbBackend.session_manager._reset_runtime_state()
            sbBackend.session_manager.latencies.clear()

        sbBackend.app.config["TESTING"] = True
        self.client = sbBackend.app.test_client()
        self.auth_repository = temp_auth_repository

    def tearDown(self):
        try:
            sbBackend.session_manager.stop_test()
        except Exception:
            pass

        sbBackend.repository = self.original_repository
        sbBackend.session_manager.repository = self.original_session_repository
        sbBackend.auth_repository = self.original_auth_repository
        self.temp_dir.cleanup()

    def test_protected_results_route_requires_authentication(self):
        response = self.client.get("/api/results")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["error"]["code"], "AUTH_REQUIRED")

    def test_registered_user_must_be_approved_before_login(self):
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "student@example.com",
                "password": "StudentPass123",
                "displayName": "Student User",
            },
        )
        self.assertEqual(register_response.status_code, 201)
        self.assertEqual(register_response.get_json()["user"]["status"], "pending")

        pending_login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "student@example.com",
                "password": "StudentPass123",
            },
        )
        self.assertEqual(pending_login_response.status_code, 403)
        self.assertEqual(
            pending_login_response.get_json()["error"]["code"],
            "ACCOUNT_PENDING_APPROVAL",
        )

        admin_user = self.auth_repository.upsert_admin(
            email="admin@example.com",
            password="AdminPass123",
            display_name="Local Admin",
        )
        admin_login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "admin@example.com",
                "password": "AdminPass123",
            },
        )
        self.assertEqual(admin_login_response.status_code, 200)
        admin_headers = {
            "Authorization": f"Bearer {admin_login_response.get_json()['token']}",
        }

        users_response = self.client.get("/api/auth/admin/users", headers=admin_headers)
        self.assertEqual(users_response.status_code, 200)
        pending_user = next(
            user for user in users_response.get_json()["users"] if user["email"] == "student@example.com"
        )

        approve_response = self.client.post(
            f"/api/auth/admin/users/{pending_user['id']}/status",
            json={"status": "approved"},
            headers=admin_headers,
        )
        self.assertEqual(approve_response.status_code, 200)
        self.assertEqual(approve_response.get_json()["user"]["status"], "approved")

        approved_login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "student@example.com",
                "password": "StudentPass123",
            },
        )
        self.assertEqual(approved_login_response.status_code, 200)
        self.assertIn("token", approved_login_response.get_json())

        me_response = self.client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {approved_login_response.get_json()['token']}"},
        )
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.get_json()["user"]["email"], "student@example.com")
        self.assertEqual(admin_user.role, "admin")

    def test_logout_revokes_the_current_bearer_token(self):
        self.auth_repository.upsert_admin(
            email="admin@example.com",
            password="AdminPass123",
            display_name="Local Admin",
        )

        login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "admin@example.com",
                "password": "AdminPass123",
            },
        )
        self.assertEqual(login_response.status_code, 200)
        auth_headers = {
            "Authorization": f"Bearer {login_response.get_json()['token']}",
        }

        logout_response = self.client.post("/api/auth/logout", headers=auth_headers)
        self.assertEqual(logout_response.status_code, 200)

        me_response = self.client.get("/api/auth/me", headers=auth_headers)
        self.assertEqual(me_response.status_code, 401)
        self.assertEqual(me_response.get_json()["error"]["code"], "AUTH_TOKEN_REVOKED")

    def test_upsert_admin_creates_an_approved_admin_account(self):
        admin_user = self.auth_repository.upsert_admin(
            email="local-admin@example.com",
            password="AdminPass123",
            display_name="Local Admin",
        )

        self.assertEqual(admin_user.email, "local-admin@example.com")
        self.assertEqual(admin_user.role, "admin")
        self.assertEqual(admin_user.status, "approved")

    def test_admin_can_reset_an_operator_password_and_revoke_old_sessions(self):
        admin_user = self.auth_repository.upsert_admin(
            email="admin@example.com",
            password="AdminPass123",
            display_name="Local Admin",
        )
        operator_user = self.auth_repository.register_user(
            email="operator@example.com",
            password="OperatorPass123",
            display_name="Operator User",
        )
        self.auth_repository.update_user_status(
            user_id=operator_user.user_id,
            status="approved",
            acting_admin_user_id=admin_user.user_id,
        )

        admin_login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "admin@example.com",
                "password": "AdminPass123",
            },
        )
        self.assertEqual(admin_login_response.status_code, 200)
        admin_headers = {
            "Authorization": f"Bearer {admin_login_response.get_json()['token']}",
        }

        operator_login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "operator@example.com",
                "password": "OperatorPass123",
            },
        )
        self.assertEqual(operator_login_response.status_code, 200)
        operator_headers = {
            "Authorization": f"Bearer {operator_login_response.get_json()['token']}",
        }

        reset_response = self.client.post(
            f"/api/auth/admin/users/{operator_user.user_id}/password",
            json={"password": "OperatorPass456"},
            headers=admin_headers,
        )
        self.assertEqual(reset_response.status_code, 200)
        self.assertEqual(
            reset_response.get_json()["message"],
            "Password reset successfully. Existing sessions were signed out.",
        )

        old_password_login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "operator@example.com",
                "password": "OperatorPass123",
            },
        )
        self.assertEqual(old_password_login_response.status_code, 401)
        self.assertEqual(
            old_password_login_response.get_json()["error"]["code"],
            "INVALID_CREDENTIALS",
        )

        revoked_session_response = self.client.get("/api/auth/me", headers=operator_headers)
        self.assertEqual(revoked_session_response.status_code, 401)
        self.assertEqual(
            revoked_session_response.get_json()["error"]["code"],
            "AUTH_TOKEN_REVOKED",
        )

        new_password_login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "operator@example.com",
                "password": "OperatorPass456",
            },
        )
        self.assertEqual(new_password_login_response.status_code, 200)
        self.assertEqual(
            new_password_login_response.get_json()["user"]["email"],
            "operator@example.com",
        )

    def test_admin_can_delete_an_operator_account(self):
        admin_user = self.auth_repository.upsert_admin(
            email="admin@example.com",
            password="AdminPass123",
            display_name="Local Admin",
        )
        operator_user = self.auth_repository.register_user(
            email="operator@example.com",
            password="OperatorPass123",
            display_name="Operator User",
        )
        self.auth_repository.update_user_status(
            user_id=operator_user.user_id,
            status="approved",
            acting_admin_user_id=admin_user.user_id,
        )

        admin_login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "admin@example.com",
                "password": "AdminPass123",
            },
        )
        self.assertEqual(admin_login_response.status_code, 200)
        admin_headers = {
            "Authorization": f"Bearer {admin_login_response.get_json()['token']}",
        }

        operator_login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "operator@example.com",
                "password": "OperatorPass123",
            },
        )
        self.assertEqual(operator_login_response.status_code, 200)
        operator_headers = {
            "Authorization": f"Bearer {operator_login_response.get_json()['token']}",
        }

        delete_response = self.client.delete(
            f"/api/auth/admin/users/{operator_user.user_id}",
            headers=admin_headers,
        )
        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(
            delete_response.get_json()["message"],
            "User account deleted successfully.",
        )

        users_response = self.client.get("/api/auth/admin/users", headers=admin_headers)
        self.assertEqual(users_response.status_code, 200)
        self.assertFalse(
            any(user["email"] == "operator@example.com" for user in users_response.get_json()["users"])
        )

        deleted_user_login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "operator@example.com",
                "password": "OperatorPass123",
            },
        )
        self.assertEqual(deleted_user_login_response.status_code, 401)
        self.assertEqual(
            deleted_user_login_response.get_json()["error"]["code"],
            "INVALID_CREDENTIALS",
        )

        revoked_session_response = self.client.get("/api/auth/me", headers=operator_headers)
        self.assertEqual(revoked_session_response.status_code, 401)
        self.assertEqual(
            revoked_session_response.get_json()["error"]["code"],
            "INVALID_AUTH_TOKEN",
        )


if __name__ == "__main__":
    unittest.main()
