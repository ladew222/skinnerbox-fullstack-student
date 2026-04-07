# WebSocket presence (Skinnerbox)

This document explains how **Socket.IO** is used in this project for **browser presence**: detecting when an operator’s tab disconnects so the backend can react (for example, pausing a running trial after a grace period).

It is **not** a general tutorial on WebSockets; it maps directly to the code under `backend/web_socket.py` and `frontend/src/utilities/presenceClient.js`.

---

## 1. What Socket.IO is (in this repo)

- **WebSocket** is a browser feature: a long-lived TCP connection that the server can use to know when the client is still “there.”
- This project uses **Flask-SocketIO** on the server and **socket.io-client** on the React app. Socket.IO can speak WebSockets under the hood but adds its own handshake, reconnect, and fallbacks.

**Important:** The client connects to the **same origin** as the API when `REACT_APP_BACKEND_URL` is set, or to the current host in dev if it is empty (see below).

---

## 2. End-to-end flow

```mermaid
sequenceDiagram
  participant Tab as Browser tab
  participant IO as socket.io-client
  participant Srv as Flask-SocketIO
  participant SM as TestSessionManager

  Tab->>IO: connectPresenceSocket()
  IO->>Srv: connect (auth: clientId)
  Srv->>Srv: map sid -> clientId, mark online
  Note over Tab,Srv: User closes tab or loses network
  Tab--xSrv: connection drops
  Srv->>Srv: disconnect: schedule offline timer
  Note over Srv: After DISCONNECT_GRACE_SECONDS
  Srv->>SM: get_status(); if testRunning && !testFinished
  Srv->>SM: stop_test()
```

1. **App loads** → `App.js` runs `connectPresenceSocket()` once.
2. **Client** generates or reads a **tab-local `clientId`** from `sessionStorage` and sends it in the Socket.IO `auth` payload.
3. **Server** accepts the connection, stores `request.sid → clientId`, and marks that client “online” (cancels any pending “offline” timer).
4. **On disconnect** (refresh, close tab, network drop), the server schedules a **timer** (`DISCONNECT_GRACE_SECONDS`, default 8s).
5. **If the timer fires** before a new connection clears it, the server checks `session_manager.get_status()` and calls `stop_test()` when a trial is running and not finished.

The **grace period** exists because a **page refresh** disconnects briefly; the same tab usually reconnects quickly with the same `clientId`, and `_mark_online` cancels the pending timer.

---

## 3. Frontend: `clientId` (per tab, not per page)

| Storage | Scope |
|--------|--------|
| `sessionStorage` key `sb.presence.clientId` | One ID per **browser tab** |

- Navigating between React routes **does not** change `clientId`.
- A **new tab** gets a new ID.
- Closing the tab typically clears that tab’s `sessionStorage`; the next visit gets a new ID.

Implementation: `frontend/src/utilities/presenceClient.js`

- `getOrCreateClientId()` — read or create the ID.
- `connectPresenceSocket()` — `io(API_BASE_URL, { transports: ['websocket'], auth: { clientId }, reconnection: ... })`.
- `disconnectPresenceSocket()` — used when the React root unmounts (e.g. strict mode double-mount in dev).

Lifecycle wiring: `frontend/src/components/App/App.js` — `useEffect` on mount connects; cleanup disconnects.

**Environment:** `REACT_APP_BACKEND_URL` should match where Flask-SocketIO listens (scheme + host + port), e.g. `http://localhost:5000`, so the socket hits the correct server.

---

## 4. Backend: `backend/web_socket.py`

### 4.1 State

- `_clients`: each `client_id` → `{ "connected", "timer", "last_seen" }`  
  Use **lowercase** `"connected"` consistently when reading/writing (Python dict keys are case-sensitive).
- `_sid_to_client_id`: Socket.IO **session id** (`request.sid`) → `client_id` so `disconnect` knows which logical client left.
- `_session_manager`: set once in `init_socket(...)` from `sbBackend.py` so offline handling can call `get_status()` and `stop_test()`.

### 4.2 `init_socket(app, session_manager)`

- Creates `SocketIO(app, cors_allowed_origins="*", async_mode="threading")`.
- **`connect` handler:** reads `auth["clientId"]`. If missing, **reject** the connection (`return False` in Flask-SocketIO). Maps `request.sid` → `client_id`, calls `_mark_online(client_id)`.
- **`disconnect` handler:** looks up `client_id` by `request.sid`, calls `_schedule_offline(client_id)`.

### 4.3 Presence helpers

- **`_mark_online`:** cancel any `Timer` for this client, set `connected` True, update `last_seen`.
- **`_schedule_offline`:** cancel existing timer, start a new `Timer(DISCONNECT_GRACE_SECONDS, _finalize_offline, args=(client_id,))`.
- **`_finalize_offline`:** mark disconnected; if `testRunning` and not `testFinished`, `stop_test()`.

### 4.4 Trial status shape

`TestSessionManager.get_status()` includes at least:

- `testRunning`, `testFinished`, `testPaused`, `eventTimeline`, etc.

The presence module only needs **`testRunning`** and **`testFinished`** for the auto-stop rule.

### 4.5 Bootstrapping in `sbBackend.py`

After `app` and `session_manager` exist:

```python
socketio = init_socket(app, session_manager)
```

The process must be started with **`socketio.run(app, ...)`**, not `app.run(...)`, so Socket.IO is active.

Optional: **`register_presence_routes(app)`** can add HTTP fallbacks (e.g. `POST /api/presence/leave` via `navigator.sendBeacon`). This project may enable that later for stronger “tab closed” detection.

---

## 5. Security note (no auth on socket)

The current design identifies browsers by **`clientId` only**. Anyone who can reach the server could open a socket with a guessed ID. For a lab device on a trusted LAN this is often acceptable; for wider exposure, tie presence to **logged-in user** or a signed token.

---

## 6. Operational checklist

- [ ] `flask-socketio` (and compatible async layer if you change from `threading`) installed on the backend.
- [ ] `socket.io-client` installed in `frontend`.
- [ ] `socketio = init_socket(app, session_manager)` present and `socketio.run(...)` used under `if __name__ == "__main__":`.
- [ ] `REACT_APP_BACKEND_URL` points at the same host/port as the Flask server.
- [ ] CORS/proxy allows WebSocket upgrade if you use a reverse proxy in production.

---

## 7. Quick debugging

- Browser DevTools → Network → WS: confirm a Socket.IO connection after load.
- Backend logs: add temporary `print` in `handle_connect` / `handle_disconnect` / `_finalize_offline` to see `client_id` and timer behavior.
- After refresh: you should see disconnect then connect within the grace window; trial should **not** stop.
- After closing the tab: after ~`DISCONNECT_GRACE_SECONDS`, a running trial should **pause** via `stop_test()`.

---

## 8. File reference

| Piece | Location |
|--------|----------|
| Socket server + presence | `backend/web_socket.py` |
| Flask app + `session_manager` | `backend/sbBackend.py` |
| Client ID + socket | `frontend/src/utilities/presenceClient.js` |
| Mount / unmount wiring | `frontend/src/components/App/App.js` |
