
# SkinnerBox Full-Stack System

**Development · Testing · Deployment · Update Guide**

This repository contains the **official student-supported version** of the SkinnerBox experimental control system.

The system is a **full-stack application** composed of:

- **Flask backend** (Python) — experiment logic & hardware control  
- **React frontend** (JavaScript) — user interface  
- **GPIO hardware layer** (Raspberry Pi only)

The project is designed so that:


- No physical hardware is required for development
- The *same code* runs in development and production
- Real hardware is enabled only on the Raspberry Pi
- Code updates can be pulled safely in production

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
├── backend/
│   ├── sbBackend.py          # Backend entry point
│   ├── gpio_adapter.py       # Mock vs real GPIO
│   ├── requirements.base.txt # Shared Python deps
│   ├── requirements.txt      # Laptop / dev deps
│   ├── requirements.pi.txt   # Raspberry Pi deps
│   ├── Dockerfile
│
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── Dockerfile
│
├── docker-compose.yml        # Laptop development
├── docker-compose.pi.yml     # Raspberry Pi override
├── README.md

````

---

## 3. Development Mode (Laptop / Desktop)

### Purpose

- Write code
- Test experiment logic
- Learn system behavior
- **No hardware required**

---

### Requirements

- **Docker Desktop**

You do **not** need:

- Python
- Node.js
- GPIO libraries
- A Raspberry Pi

---

### Start the system (DEV)

From the project root:

```bash
docker compose up --build
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
| Backend  | [http://localhost:5001](http://localhost:5001) |

> ⚠️ The backend is exposed on **port 5001** on your laptop.

---

## 4. Live Editing (Critical Concept)

This project uses **Docker volume mounts**.

That means:

> 🧠 You edit files on your computer
> 🐳 Docker runs those same files live

Example:

```yaml
volumes:
  - ./backend:/app
```

### What this means

* Edit code → changes apply immediately
* No rebuild required for code changes
* Rebuild **only if dependencies change**

---

## 5. Editing the Code

### Backend (Flask / Python)

Edit files in:

```
backend/
```

Primary files:

* `sbBackend.py` — API routes & experiment logic
* `gpio_adapter.py` — hardware abstraction

---

### Frontend (React)

Edit files in:

```
frontend/src/
```

React runs in development mode with **hot reload enabled**.

---

## 6. GPIO Abstraction (Why Hardware Is Optional)

GPIO behavior is controlled in:

```
backend/gpio_adapter.py
```

Modes:

* **Mock mode (default on laptops)**

  * Prints log messages
  * Safe everywhere
* **Real mode (Raspberry Pi only)**

  * Accesses physical GPIO pins

The backend never imports GPIO libraries directly.

---

## 7. Simulated Inputs (No Hardware Required)

When running on a laptop, physical buttons do not exist.

The backend provides **simulation endpoints** that trigger the **same callbacks** used by GPIO interrupts on the Pi.

---

### Simulation Endpoints

| Action             | Method | Endpoint              |
| ------------------ | ------ | --------------------- |
| Simulate lever     | POST   | `/api/input/lever`    |
| Simulate nose poke | POST   | `/api/input/nosepoke` |

---

### Example (Terminal)

```bash
curl -X POST http://localhost:5001/api/input/lever
curl -X POST http://localhost:5001/api/input/nosepoke
```

Expected backend output:

```
Lever pressed. Count: 1
Nose poke. Count: 1
```

The backend does **not** know whether an input came from hardware or simulation.

---

## 8. Verifying the Backend

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
curl http://localhost:5001
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

> Flask runs on 5000 **inside** the container, mapped to **5001 on the host**.

---

## 9. Git Workflow (Student Workflow)

### Start work

```bash
git pull
docker compose up
```

---

### Save work

```bash
git add .
git commit -m "Describe your change"
git push
```

---

### Rule

> ❗ Never edit files inside a running container
> Always edit files in the repository folders

---

## 10. Raspberry Pi Deployment (Production)

The Raspberry Pi uses **two Docker Compose files**:

1. Base system
2. Pi-specific override

---

### Start system on the Pi

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.pi.yml \
  up -d --build
```

This enables:

* real GPIO
* privileged access
* background execution

⚠️ Only run this on a Raspberry Pi with hardware attached.

---

## 11. Updating Code on the Pi

```bash
git pull
docker compose \
  -f docker-compose.yml \
  -f docker-compose.pi.yml \
  up -d --build
```

---

## 12. Requirements Files (Do Not Edit Unless Instructed)

| File                    | Purpose                    |
| ----------------------- | -------------------------- |
| `requirements.base.txt` | Shared Python dependencies |
| `requirements.txt`      | Laptop / development       |
| `requirements.pi.txt`   | Raspberry Pi GPIO          |

---

## 13. Key Takeaway

> This is **one system** with **two configurations**.

* Development → mock hardware
* Production → real hardware
* Same code
* Only configuration changes

---

## 14. Final Advice

If something breaks, ask:

> **Which layer am I working in?**

Frontend? Backend? GPIO? Docker?

That question solves most problems.
