#!/usr/bin/env python3
"""Run the project's basic regression suite from one entry point."""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from pathlib import Path
import shutil
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_DIR = REPO_ROOT / "frontend"


@dataclass
class Step:
    name: str
    command: list[str]
    cwd: Path
    env_updates: dict[str, str]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run the SkinnerBox regression checks. By default this runs the "
            "backend test suite, the frontend Jest smoke test, and the frontend build."
        )
    )
    parser.add_argument(
        "--backend-only",
        action="store_true",
        help="Run only the backend regression tests.",
    )
    parser.add_argument(
        "--frontend-only",
        action="store_true",
        help="Run only the frontend regression checks.",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip the frontend production build step.",
    )
    return parser


def ensure_prerequisites(args: argparse.Namespace) -> tuple[Path | None, str | None]:
    backend_python = BACKEND_DIR / ".venv" / "bin" / "python"
    npm_binary = shutil.which("npm")

    if args.frontend_only:
        if npm_binary is None:
            raise SystemExit("npm was not found on PATH. Install Node.js to run the frontend checks.")
        return None, npm_binary

    if args.backend_only:
        if not backend_python.exists():
            raise SystemExit(
                f"Backend virtual environment not found at {backend_python}. "
                "Create it first with `python3 -m venv backend/.venv` and install backend deps."
            )
        return backend_python, None

    if not backend_python.exists():
        raise SystemExit(
            f"Backend virtual environment not found at {backend_python}. "
            "Create it first with `python3 -m venv backend/.venv` and install backend deps."
        )
    if npm_binary is None:
        raise SystemExit("npm was not found on PATH. Install Node.js to run the frontend checks.")
    return backend_python, npm_binary


def build_steps(
    args: argparse.Namespace,
    backend_python: Path | None,
    npm_binary: str | None,
) -> list[Step]:
    steps: list[Step] = []

    if not args.frontend_only:
        steps.append(
            Step(
                name="Backend unittest suite",
                command=[
                    str(backend_python),
                    "-m",
                    "unittest",
                    "discover",
                    "-s",
                    "tests",
                    "-v",
                ],
                cwd=BACKEND_DIR,
                env_updates={
                    "PYTHONPYCACHEPREFIX": "/tmp",
                    "GPIO_MODE": "mock",
                    "OLED_MODE": "mock",
                },
            )
        )

    if not args.backend_only:
        steps.append(
            Step(
                name="Frontend Jest smoke tests",
                command=[npm_binary, "test", "--", "--watch=false"],
                cwd=FRONTEND_DIR,
                env_updates={"CI": "true"},
            )
        )
        if not args.skip_build:
            steps.append(
                Step(
                    name="Frontend production build",
                    command=[npm_binary, "run", "build"],
                    cwd=FRONTEND_DIR,
                    env_updates={},
                )
            )

    return steps


def run_step(step: Step) -> None:
    env = os.environ.copy()
    env.update(step.env_updates)

    print(f"\n=== {step.name} ===")
    print(f"cwd: {step.cwd}")
    print("cmd:", " ".join(step.command))

    completed = subprocess.run(step.command, cwd=step.cwd, env=env)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.backend_only and args.frontend_only:
        parser.error("Choose either --backend-only or --frontend-only, not both.")

    backend_python, npm_binary = ensure_prerequisites(args)
    steps = build_steps(args, backend_python, npm_binary)

    if not steps:
        parser.error("No regression steps were selected.")

    for step in steps:
        run_step(step)

    print("\nRegression suite passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
