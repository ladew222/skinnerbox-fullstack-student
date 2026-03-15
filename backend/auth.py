from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
import hashlib
import os
import secrets
import sqlite3

from werkzeug.security import check_password_hash, generate_password_hash

from shared_errors import ApiError


DEFAULT_TOKEN_TTL_HOURS = max(int(os.getenv("SKINNERBOX_TOKEN_TTL_HOURS", "12")), 1)


@dataclass(slots=True)
class AuthenticatedUser:
    """Authenticated account details returned to Flask routes and the frontend."""

    user_id: int
    email: str
    display_name: str
    role: str
    status: str
    approved_at: str | None
    last_login_at: str | None
    created_at: str | None

    def to_response_payload(self) -> dict[str, object]:
        """Return the user in a stable shape that the React app can consume."""

        return {
            "id": self.user_id,
            "email": self.email,
            "displayName": self.display_name,
            "role": self.role,
            "status": self.status,
            "approvedAt": self.approved_at,
            "lastLoginAt": self.last_login_at,
            "createdAt": self.created_at,
        }


class SQLiteAuthRepository:
    """Persist user accounts and opaque bearer tokens in the shared SQLite DB."""

    def __init__(self, database_path: Path, token_ttl_hours: int = DEFAULT_TOKEN_TTL_HOURS) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.token_ttl_hours = token_ttl_hours
        self.ensure_schema()

    def connect(self) -> sqlite3.Connection:
        """Open a new SQLite connection for auth reads and writes."""

        try:
            connection = sqlite3.connect(self.database_path)
            connection.row_factory = sqlite3.Row
            return connection
        except sqlite3.Error as error:
            raise ApiError(
                code="DATABASE_CONNECTION_ERROR",
                message="Unable to connect to the authentication database.",
                status=500,
                details={"reason": str(error)},
            ) from error

    def ensure_schema(self) -> None:
        """Create auth tables and add missing columns when older DB files are reused."""

        create_users_sql = """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'operator',
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT,
                updated_at TEXT,
                approved_at TEXT,
                approved_by_user_id INTEGER,
                last_login_at TEXT
            )
        """
        create_tokens_sql = """
            CREATE TABLE IF NOT EXISTS auth_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                revoked_at TEXT,
                last_used_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """
        expected_user_columns = {
            "display_name": "TEXT NOT NULL DEFAULT ''",
            "password_hash": "TEXT NOT NULL DEFAULT ''",
            "role": "TEXT NOT NULL DEFAULT 'operator'",
            "status": "TEXT NOT NULL DEFAULT 'pending'",
            "created_at": "TEXT",
            "updated_at": "TEXT",
            "approved_at": "TEXT",
            "approved_by_user_id": "INTEGER",
            "last_login_at": "TEXT",
        }
        expected_token_columns = {
            "user_id": "INTEGER NOT NULL DEFAULT 0",
            "token_hash": "TEXT NOT NULL DEFAULT ''",
            "created_at": "TEXT",
            "expires_at": "TEXT",
            "revoked_at": "TEXT",
            "last_used_at": "TEXT",
        }

        try:
            with self.connect() as connection:
                connection.execute(create_users_sql)
                connection.execute(create_tokens_sql)

                existing_user_columns = {
                    row["name"] for row in connection.execute("PRAGMA table_info(users)")
                }
                for column_name, column_type in expected_user_columns.items():
                    if column_name in existing_user_columns:
                        continue
                    connection.execute(
                        f'ALTER TABLE users ADD COLUMN "{column_name}" {column_type}'
                    )

                existing_token_columns = {
                    row["name"] for row in connection.execute("PRAGMA table_info(auth_tokens)")
                }
                for column_name, column_type in expected_token_columns.items():
                    if column_name in existing_token_columns:
                        continue
                    connection.execute(
                        f'ALTER TABLE auth_tokens ADD COLUMN "{column_name}" {column_type}'
                    )

                connection.commit()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="DATABASE_SCHEMA_ERROR",
                message="Unable to prepare the authentication database schema.",
                status=500,
                details={"reason": str(error)},
            ) from error

    def register_user(
        self,
        *,
        email: str,
        password: str,
        display_name: str | None = None,
    ) -> AuthenticatedUser:
        """Store a newly registered operator account in the pending state."""

        normalized_email = _normalize_email(email)
        normalized_name = _normalize_display_name(display_name, normalized_email)
        _validate_password(password)
        now = self._timestamp()

        try:
            with self.connect() as connection:
                existing_user = connection.execute(
                    "SELECT id FROM users WHERE email = ?",
                    (normalized_email,),
                ).fetchone()
                if existing_user is not None:
                    raise ApiError(
                        code="ACCOUNT_ALREADY_EXISTS",
                        message="An account with that email already exists.",
                        status=409,
                        details={"email": normalized_email},
                    )

                cursor = connection.execute(
                    """
                    INSERT INTO users (
                        email,
                        display_name,
                        password_hash,
                        role,
                        status,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, 'operator', 'pending', ?, ?)
                    """,
                    (
                        normalized_email,
                        normalized_name,
                        generate_password_hash(password),
                        now,
                        now,
                    ),
                )
                connection.commit()
                return self._get_user_by_id(connection, cursor.lastrowid)
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="ACCOUNT_REGISTRATION_ERROR",
                message="Unable to create the requested account.",
                status=500,
                details={"reason": str(error)},
            ) from error

    def login_user(self, *, email: str, password: str) -> dict[str, object]:
        """Validate credentials, enforce approval, and issue a new bearer token."""

        normalized_email = _normalize_email(email)
        try:
            with self.connect() as connection:
                row = connection.execute(
                    "SELECT * FROM users WHERE email = ?",
                    (normalized_email,),
                ).fetchone()
                if row is None or not check_password_hash(row["password_hash"], password):
                    raise ApiError(
                        code="INVALID_CREDENTIALS",
                        message="Email or password is incorrect.",
                        status=401,
                    )

                if row["status"] == "pending":
                    raise ApiError(
                        code="ACCOUNT_PENDING_APPROVAL",
                        message="Your account is waiting for an administrator to approve it.",
                        status=403,
                    )

                if row["status"] != "approved":
                    raise ApiError(
                        code="ACCOUNT_DISABLED",
                        message="This account is not currently allowed to access the system.",
                        status=403,
                    )

                now = self._timestamp()
                token = self._issue_token(connection, row["id"], now)
                connection.execute(
                    "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?",
                    (now, now, row["id"]),
                )
                connection.commit()

                user = self._row_to_user({**dict(row), "last_login_at": now})
                return {
                    "token": token,
                    "user": user.to_response_payload(),
                }
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="LOGIN_ERROR",
                message="Unable to complete the login request.",
                status=500,
                details={"reason": str(error)},
            ) from error

    def get_user_for_token(self, token: str) -> AuthenticatedUser:
        """Resolve a bearer token to the current approved user account."""

        if not token:
            raise ApiError(
                code="AUTH_REQUIRED",
                message="Sign in to access this part of the system.",
                status=401,
            )

        token_hash = self._hash_token(token)
        now = self._timestamp()

        try:
            with self.connect() as connection:
                row = connection.execute(
                    """
                    SELECT users.*, auth_tokens.expires_at, auth_tokens.revoked_at
                    FROM auth_tokens
                    JOIN users ON users.id = auth_tokens.user_id
                    WHERE auth_tokens.token_hash = ?
                    """,
                    (token_hash,),
                ).fetchone()
                if row is None:
                    raise ApiError(
                        code="INVALID_AUTH_TOKEN",
                        message="Your session is invalid. Please sign in again.",
                        status=401,
                    )

                if row["revoked_at"] is not None:
                    raise ApiError(
                        code="AUTH_TOKEN_REVOKED",
                        message="Your session has been signed out. Please sign in again.",
                        status=401,
                    )

                if row["expires_at"] and row["expires_at"] <= now:
                    connection.execute(
                        "UPDATE auth_tokens SET revoked_at = ? WHERE token_hash = ?",
                        (now, token_hash),
                    )
                    connection.commit()
                    raise ApiError(
                        code="AUTH_TOKEN_EXPIRED",
                        message="Your session has expired. Please sign in again.",
                        status=401,
                    )

                if row["status"] != "approved":
                    raise ApiError(
                        code="ACCOUNT_DISABLED",
                        message="This account is no longer allowed to access the system.",
                        status=403,
                    )

                connection.execute(
                    "UPDATE auth_tokens SET last_used_at = ? WHERE token_hash = ?",
                    (now, token_hash),
                )
                connection.commit()
                return self._row_to_user(row)
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="AUTH_LOOKUP_ERROR",
                message="Unable to verify the current session.",
                status=500,
                details={"reason": str(error)},
            ) from error

    def revoke_token(self, token: str) -> None:
        """Invalidate the current bearer token during logout."""

        if not token:
            return

        try:
            with self.connect() as connection:
                connection.execute(
                    "UPDATE auth_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
                    (self._timestamp(), self._hash_token(token)),
                )
                connection.commit()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="LOGOUT_ERROR",
                message="Unable to sign out the current session.",
                status=500,
                details={"reason": str(error)},
            ) from error

    def list_users(self) -> list[dict[str, object]]:
        """Return all users so an admin can review pending and approved accounts."""

        try:
            with self.connect() as connection:
                rows = connection.execute(
                    """
                    SELECT
                        users.*,
                        approver.email AS approved_by_email
                    FROM users
                    LEFT JOIN users AS approver ON approver.id = users.approved_by_user_id
                    ORDER BY
                        CASE users.status
                            WHEN 'pending' THEN 0
                            WHEN 'approved' THEN 1
                            ELSE 2
                        END,
                        users.created_at DESC,
                        users.email ASC
                    """
                ).fetchall()
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="USER_LIST_ERROR",
                message="Unable to load registered users.",
                status=500,
                details={"reason": str(error)},
            ) from error

        return [self._row_to_admin_payload(row) for row in rows]

    def update_user_status(
        self,
        *,
        user_id: int,
        status: str,
        acting_admin_user_id: int,
    ) -> dict[str, object]:
        """Approve or disable a non-admin user account from the admin UI."""

        normalized_status = status.strip().lower()
        if normalized_status not in {"approved", "disabled"}:
            raise ApiError(
                code="INVALID_USER_STATUS",
                message="User status must be either approved or disabled.",
                status=400,
                details={"status": status},
            )

        now = self._timestamp()
        try:
            with self.connect() as connection:
                row = connection.execute(
                    "SELECT * FROM users WHERE id = ?",
                    (user_id,),
                ).fetchone()
                if row is None:
                    raise ApiError(
                        code="USER_NOT_FOUND",
                        message="The requested user account was not found.",
                        status=404,
                        details={"userId": user_id},
                    )

                if row["role"] == "admin":
                    raise ApiError(
                        code="ADMIN_MANAGED_LOCALLY",
                        message="Admin accounts are managed locally with the reset_admin.py script.",
                        status=400,
                    )

                approved_at = now if normalized_status == "approved" else None
                approved_by = acting_admin_user_id if normalized_status == "approved" else None
                connection.execute(
                    """
                    UPDATE users
                    SET status = ?,
                        approved_at = ?,
                        approved_by_user_id = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        normalized_status,
                        approved_at,
                        approved_by,
                        now,
                        user_id,
                    ),
                )

                if normalized_status == "disabled":
                    connection.execute(
                        """
                        UPDATE auth_tokens
                        SET revoked_at = ?
                        WHERE user_id = ? AND revoked_at IS NULL
                        """,
                        (now, user_id),
                    )

                connection.commit()
                updated_row = connection.execute(
                    """
                    SELECT
                        users.*,
                        approver.email AS approved_by_email
                    FROM users
                    LEFT JOIN users AS approver ON approver.id = users.approved_by_user_id
                    WHERE users.id = ?
                    """,
                    (user_id,),
                ).fetchone()
                return self._row_to_admin_payload(updated_row)
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="USER_STATUS_UPDATE_ERROR",
                message="Unable to update the selected user account.",
                status=500,
                details={"reason": str(error), "userId": user_id},
            ) from error

    def reset_user_password(
        self,
        *,
        user_id: int,
        password: str,
        acting_admin_user_id: int,
    ) -> dict[str, object]:
        """Allow a local admin to replace an operator password and revoke old sessions."""

        _validate_password(password)
        now = self._timestamp()

        try:
            with self.connect() as connection:
                row = connection.execute(
                    "SELECT * FROM users WHERE id = ?",
                    (user_id,),
                ).fetchone()
                if row is None:
                    raise ApiError(
                        code="USER_NOT_FOUND",
                        message="The requested user account was not found.",
                        status=404,
                        details={"userId": user_id},
                    )

                if row["role"] == "admin":
                    raise ApiError(
                        code="ADMIN_MANAGED_LOCALLY",
                        message="Admin accounts are managed locally with the reset_admin.py script.",
                        status=400,
                    )

                connection.execute(
                    """
                    UPDATE users
                    SET password_hash = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        generate_password_hash(password),
                        now,
                        user_id,
                    ),
                )
                connection.execute(
                    """
                    UPDATE auth_tokens
                    SET revoked_at = ?
                    WHERE user_id = ? AND revoked_at IS NULL
                    """,
                    (now, user_id),
                )
                connection.commit()

                updated_row = connection.execute(
                    """
                    SELECT
                        users.*,
                        approver.email AS approved_by_email
                    FROM users
                    LEFT JOIN users AS approver ON approver.id = users.approved_by_user_id
                    WHERE users.id = ?
                    """,
                    (user_id,),
                ).fetchone()
                return self._row_to_admin_payload(updated_row)
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="PASSWORD_RESET_ERROR",
                message="Unable to reset the selected user password.",
                status=500,
                details={
                    "reason": str(error),
                    "userId": user_id,
                    "actingAdminUserId": acting_admin_user_id,
                },
            ) from error

    def upsert_admin(
        self,
        *,
        email: str,
        password: str,
        display_name: str | None = None,
    ) -> AuthenticatedUser:
        """Create or reset the local admin account used to approve registrations."""

        normalized_email = _normalize_email(email)
        normalized_name = _normalize_display_name(display_name, normalized_email)
        _validate_password(password)
        now = self._timestamp()

        try:
            with self.connect() as connection:
                existing_user = connection.execute(
                    "SELECT id FROM users WHERE email = ?",
                    (normalized_email,),
                ).fetchone()
                if existing_user is None:
                    cursor = connection.execute(
                        """
                        INSERT INTO users (
                            email,
                            display_name,
                            password_hash,
                            role,
                            status,
                            created_at,
                            updated_at,
                            approved_at
                        ) VALUES (?, ?, ?, 'admin', 'approved', ?, ?, ?)
                        """,
                        (
                            normalized_email,
                            normalized_name,
                            generate_password_hash(password),
                            now,
                            now,
                            now,
                        ),
                    )
                    user_id = cursor.lastrowid
                else:
                    user_id = existing_user["id"]
                    connection.execute(
                        """
                        UPDATE users
                        SET display_name = ?,
                            password_hash = ?,
                            role = 'admin',
                            status = 'approved',
                            approved_at = COALESCE(approved_at, ?),
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            normalized_name,
                            generate_password_hash(password),
                            now,
                            now,
                            user_id,
                        ),
                    )
                    connection.execute(
                        """
                        UPDATE auth_tokens
                        SET revoked_at = ?
                        WHERE user_id = ? AND revoked_at IS NULL
                        """,
                        (now, user_id),
                    )

                connection.commit()
                return self._get_user_by_id(connection, user_id)
        except ApiError:
            raise
        except sqlite3.Error as error:
            raise ApiError(
                code="ADMIN_RESET_ERROR",
                message="Unable to create or reset the local admin account.",
                status=500,
                details={"reason": str(error)},
            ) from error

    def _issue_token(self, connection: sqlite3.Connection, user_id: int, created_at: str) -> str:
        """Create a new opaque token and save only its hash in the database."""

        plain_token = secrets.token_urlsafe(32)
        expires_at = (
            datetime.fromisoformat(created_at) + timedelta(hours=self.token_ttl_hours)
        ).isoformat()
        connection.execute(
            """
            INSERT INTO auth_tokens (
                user_id,
                token_hash,
                created_at,
                expires_at
            ) VALUES (?, ?, ?, ?)
            """,
            (
                user_id,
                self._hash_token(plain_token),
                created_at,
                expires_at,
            ),
        )
        return plain_token

    def _get_user_by_id(self, connection: sqlite3.Connection, user_id: int) -> AuthenticatedUser:
        row = connection.execute(
            "SELECT * FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if row is None:
            raise ApiError(
                code="USER_NOT_FOUND",
                message="The requested user account was not found.",
                status=404,
                details={"userId": user_id},
            )
        return self._row_to_user(row)

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _row_to_user(row: sqlite3.Row | dict[str, object]) -> AuthenticatedUser:
        return AuthenticatedUser(
            user_id=int(row["id"]),
            email=str(row["email"]),
            display_name=str(row["display_name"] or row["email"]),
            role=str(row["role"] or "operator"),
            status=str(row["status"] or "pending"),
            approved_at=row["approved_at"],
            last_login_at=row["last_login_at"],
            created_at=row["created_at"],
        )

    @staticmethod
    def _row_to_admin_payload(row: sqlite3.Row) -> dict[str, object]:
        user = SQLiteAuthRepository._row_to_user(row).to_response_payload()
        user["approvedByEmail"] = row["approved_by_email"]
        return user

    @staticmethod
    def _timestamp() -> str:
        return datetime.now(timezone.utc).isoformat()


def _normalize_email(email: str) -> str:
    """Normalize user email addresses so duplicate registrations collapse correctly."""

    if not isinstance(email, str):
        raise ApiError(
            code="INVALID_EMAIL",
            message="Email address must be text.",
            status=400,
        )

    normalized = email.strip().lower()
    if not normalized or "@" not in normalized:
        raise ApiError(
            code="INVALID_EMAIL",
            message="Please enter a valid email address.",
            status=400,
        )
    return normalized


def _normalize_display_name(display_name: str | None, email: str) -> str:
    """Use the supplied display name when present, otherwise derive one from the email."""

    if display_name is None:
        display_name = ""
    if not isinstance(display_name, str):
        raise ApiError(
            code="INVALID_DISPLAY_NAME",
            message="Display name must be text.",
            status=400,
        )

    normalized = display_name.strip()
    if normalized:
        return normalized
    return email.split("@", 1)[0]


def _validate_password(password: str) -> None:
    """Enforce a simple minimum password bar for network-facing access."""

    if not isinstance(password, str):
        raise ApiError(
            code="INVALID_PASSWORD",
            message="Password must be text.",
            status=400,
        )

    if len(password) < 8:
        raise ApiError(
            code="WEAK_PASSWORD",
            message="Password must be at least 8 characters long.",
            status=400,
        )
