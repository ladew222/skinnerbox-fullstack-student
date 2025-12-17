
# SkinnerBox Full-Stack System

**Development · Testing · Deployment · Update Guide**

This repository contains the **official student-supported version** of the SkinnerBox experimental control system.

The system is a **full-stack application** composed of:

- **Flask backend** (Python) — experiment logic & hardware control  
- **React frontend** (JavaScript) — user interface  
- **GPIO hardware layer** (Raspberry Pi only)

The project is designed so that:

- ✅ Students can develop on **any laptop**
- ✅ No physical hardware is required for development
- ✅ The *same code* runs in development and production
- ✅ Real hardware is enabled only on the Raspberry Pi
- ✅ Code updates can be pulled safely in production

---

## 1. System Overview (Mental Model)

Think of the system as **four layers**:

```

[ React Frontend ]
↓
[ Flask Backend ]
↓
[ GPIO Adapter ]
↓
[ Mock GPIO ]  OR  [ Real Hardware ]

```

Only the **bottom layer changes** between development and production.

Everything else stays the same.

---

## 2. Repository Structure

```

skinnerbox-fullstack-student/
├── backend/                  # Flask API + hardware abstraction
│   ├── sbBackend.py          # Main backend entry point
│   ├── gpio_adapter.py       # Mock vs real GPIO logic
│   ├── requirements.base.txt
│   ├── Dockerfile
│
├── frontend/                 # React UI
│   ├── src/
│   ├── package.json
│   ├── Dockerfile
│
├── docker-compose.yml        # Base system (DEV + PROD)
├── docker-compose.pi.yml     # Raspberry Pi hardware override
├── README.md

````

---

## 3. Development Mode (Laptop / Desktop)

### Purpose

- Write code
- Test experiment logic
- Learn system behavior
- No hardware required

---

### Requirements

- Docker Desktop

That’s it.

You **do not** need:

- Python
- Node.js
- GPIO libraries
- A Raspberry Pi

---

### Start the system (DEV)

From the project root:

```bash
docker compose up
````

This uses:

```
docker-compose.yml
```

---

### Access the system

| Service  | URL                                            |
| -------- | ---------------------------------------------- |
| Frontend | [http://localhost:3000](http://localhost:3000) |
| Backend  | [http://localhost:5000](http://localhost:5000) |

---

## 4. Live Editing (Very Important)

This project uses **Docker volume mounts**.

That means:

> 🧠 You edit files on your computer
> 🐳 Docker runs those same files live

Example (backend):

```yaml
volumes:
  - ./backend:/app
```

### What this means in practice

* Edit code → changes apply immediately
* No container rebuild required
* Restart only if you change dependencies

---

## 5. Editing the Code

### Backend (Flask / Python)

Edit files in:

```
backend/
```

Most work happens in:

* `sbBackend.py` — API routes & experiment logic
* `gpio_adapter.py` — hardware abstraction

---

### Frontend (React)

Edit files in:

```
frontend/src/
```

React runs in development mode with **hot reload** enabled.

---

## 6. GPIO Abstraction (Why Hardware Is Optional)

### `gpio_adapter.py`

This file controls how GPIO behaves.

* **Mock mode** (default)

  * Prints log messages
  * Safe on laptops
* **Real mode** (Pi only)

  * Accesses physical GPIO pins

The backend **never imports GPIO libraries directly**.

This design:

* prevents crashes on laptops
* keeps development hardware-free
* enables clean deployment

---

## 7. Simulated Inputs (Development Without Hardware)

When running on a laptop, **physical buttons do not exist**.
To support full testing without hardware, the backend provides **simulation endpoints**.

These endpoints trigger the **exact same logic** used by real GPIO interrupts.

---
### Simulating Button Inputs (Without Hardware)

When running on a laptop, **physical buttons do not exist**.  
To support full testing without hardware, the backend provides **simulation endpoints**.

These endpoints trigger the **exact same callback functions** that real GPIO interrupts use on the Raspberry Pi.

---

#### Available Simulation Endpoints

| Action | Method | Endpoint |
|------|--------|----------|
| Simulate lever press | POST | `/api/input/lever` |
| Simulate nose poke | POST | `/api/input/nosepoke` |

---

#### Simulate a Lever Press (Terminal)

```bash
curl -X POST http://localhost:5000/api/input/lever

```
[ Frontend Button Click ]
            ↓
[ Simulation API Endpoint ]
            ↓
[ Same Callback Used by GPIO Interrupt ]
            ↓
[ Counters · Database · Experiment Logic ]
```

The backend does **not know** whether an input came from hardware or simulation.

---

### Simulation Endpoints

| Action             | Method | Endpoint              |
| ------------------ | ------ | --------------------- |
| Simulate lever     | POST   | `/api/input/lever`    |
| Simulate nose poke | POST   | `/api/input/nosepoke` |

---

### Example: Simulate Inputs from Terminal

```bash
curl -X POST http://localhost:5000/api/input/lever
curl -X POST http://localhost:5000/api/input/nosepoke
```

Expected backend output:

```
Lever pressed. Count: 1
Nose poke. Count: 1
```

---

### Frontend Usage

In development, the frontend can:

* expose **Simulate Lever / Nose Poke** buttons
* call these endpoints
* test experiment logic without hardware

This enables **full-system testing on any laptop**.

---

### Production Behavior

On the Raspberry Pi:

* Physical button presses trigger GPIO interrupts
* GPIO interrupts call the **same callback functions**
* Simulation endpoints typically go unused

The backend code **does not change**.

---

## 8. Verifying the Backend Is Running

### Check containers

```bash
docker ps
```

You should see:

* `skinnerbox-backend`
* `skinnerbox-frontend`

---

### Check backend directly

```bash
curl http://localhost:5000
```

Expected response:

```
Backend is running!
```

---

### Expected backend logs (DEV)

```
[GPIO MOCK] Button initialized
[GPIO MOCK] LED initialized
 * Running on http://0.0.0.0:5000
```

---

## 9. Git Workflow (How You Should Work)

### Start working

```bash
git pull
docker compose up
```

---

### Save work

```bash
git status
git add .
git commit -m "Describe your change"
git push
```

---

### Important rule

> ❗ Never edit files inside a running container
> Always edit files in the repository folders

---

## 10. Production Deployment (Raspberry Pi)

### Key idea

The Raspberry Pi uses **two Docker Compose files**:

1. Base system (shared everywhere)
2. Pi-specific override (hardware access)

---

### Start system on the Pi (PROD)

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.pi.yml \
  up -d
```

This enables:

* real GPIO
* privileged execution
* background operation

⚠️ Only run this on a Raspberry Pi with hardware connected.

---

## 11. Updating Code in Production

To update a running Pi system safely:

```bash
git pull
docker compose \
  -f docker-compose.yml \
  -f docker-compose.pi.yml \
  build
docker compose \
  -f docker-compose.yml \
  -f docker-compose.pi.yml \
  up -d
```

---

## 12. Common Docker Commands

| Task                     | Command                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| Start system (DEV)       | `docker compose up`                                                   |
| Start system (PROD)      | `docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d` |
| Stop system              | `Ctrl+C`                                                              |
| Stop background services | `docker compose down`                                                 |
| Rebuild images           | `docker compose build --no-cache`                                     |

---

## 13. Key Takeaway

> This is **one system** with **two configurations**.

* Development uses mock hardware
* Production uses real hardware
* The code is identical
* Only configuration changes

---

## 14. Why This Architecture Matters

This project intentionally demonstrates:

* separation of concerns
* hardware abstraction
* containerized development
* safe deployment practices

These are **real-world patterns** used in:

* embedded systems
* robotics
* IoT platforms
* experimental control software

---

## 15. Support

If something feels confusing:

* reread this README
* check Docker logs
* ask *which layer* you are working in

Every design choice here is intentional.

```

---

If you want next, I can:

- generate an **architecture diagram**
- add a **student quick-start**
- write a **TA troubleshooting guide**
- add a **hardware wiring appendix**

But this README is now **complete, clear, and production-ready**.
```
