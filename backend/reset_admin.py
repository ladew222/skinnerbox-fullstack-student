#!/usr/bin/env python3
from __future__ import annotations

import argparse
import getpass
import os
from pathlib import Path
import sys

from auth import SQLiteAuthRepository
from shared_errors import ApiError


DEFAULT_DATABASE_PATH = Path(
    os.getenv("SKINNERBOX_DB_PATH", str(Path(__file__).with_name("testdatabase.db")))
)


def parse_args() -> argparse.Namespace:
    """Collect the local admin reset inputs from the command line."""

    parser = argparse.ArgumentParser(
        description="Create or reset the local SkinnerBox admin account.",
    )
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--name", default="Local Admin", help="Display name for the admin account")
    parser.add_argument(
        "--password",
        help="Admin password. If omitted, the script prompts securely.",
    )
    parser.add_argument(
        "--database",
        default=str(DEFAULT_DATABASE_PATH),
        help="SQLite database path to update",
    )
    return parser.parse_args()


def main() -> int:
    """Create or reset the approved admin user directly on the local machine."""

    args = parse_args()
    password = args.password or getpass.getpass("New admin password: ")
    if not password:
        print("Password cannot be empty.", file=sys.stderr)
        return 1

    repository = SQLiteAuthRepository(Path(args.database))
    try:
        user = repository.upsert_admin(
            email=args.email,
            password=password,
            display_name=args.name,
        )
    except ApiError as error:
        print(f"{error.code}: {error.message}", file=sys.stderr)
        return 1

    print(
        f"Admin account ready for {user.email} in {args.database}. "
        "Existing sessions for that admin were revoked."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
