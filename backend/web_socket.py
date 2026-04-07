from __future__ import annotations

from threading import Lock, Timer
from time import time
from typing import Any

from flask import request
from flask_socketio import SocketIO


# Tunable: how long to wait before treating disconnect as a real leave.
DISCONNECT_GRACE_SECONDS = 8

# Presence memory
_presence_lock = Lock()
_clients: dict[str, dict[str, Any]] = {}  # client_id -> {"connected": bool, "timer": Timer|None, "last_seen": float}
_sid_to_client_id: dict[str, str] = {}

# This gets injected from sbBackend.py so this module can stop a running trial.
_session_manager = None

def _mark_online(client_id: str) -> None:
    with _presence_lock:
        row = _clients.get(client_id, {"connected": False, "timer": None, "last_seen": 0.0})
        existing_timer = row.get("timer")
        if existing_timer is not None:
            existing_timer.cancel()
        row["connected"] = True
        row["timer"] = None
        row["last_seen"] = time()
        _clients[client_id] = row

def _finalize_offline(client_id: str) -> None:
    with _presence_lock:
        row = _clients.get(client_id)
        if not row:
            return 
        row["connected"] = False
        row["timer"] = None 
        row["last_seen"] = time()
        _clients[client_id] = row
    
    if _session_manager is None:
        return 
    status = _session_manager.get_status()
    if status.get("testRunning") and not status.get("testFinished"):
        _session_manager.stop_test()

def _schedule_offline(client_id: str) -> None:
    if not client_id:
        return 
    with _presence_lock:
        row = _clients.get(client_id, {"connected": False, "timer": None, "last_seen": 0.0})
        existing_timer = row.get("timer")
        if existing_timer is not None:
            existing_timer.cancel()
        timer = Timer(DISCONNECT_GRACE_SECONDS, _finalize_offline, args=(client_id,))
        row["timer"] = timer
        _clients[client_id] = row
        timer.start()

def init_socket(app, session_manager) -> SocketIO:
    global _session_manager
    _session_manager = session_manager

    socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

    @socketio.on("connect")
    def handle_connect(auth=None):
        auth_payload = auth or {}
        client_id = str(auth_payload.get("clientId", "")).strip()
        if not client_id:
            return False
        _sid_to_client_id[request.sid] = client_id
        _mark_online(client_id)

    @socketio.on("disconnect")
    def handle_disconnect():
        client_id = _sid_to_client_id.pop(request.sid, "")
        if client_id:
            _schedule_offline(client_id)

    return socketio


def register_presence_routes(_app) -> None:
    """Optional HTTP fallbacks (e.g. POST /api/presence/leave). Add routes when needed."""
    pass