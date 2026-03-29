# LaserFlow

![logo_dark](https://github.com/user-attachments/assets/d9df33df-63a3-4ddc-b525-d313353abb6d)

**Modern Web-Based Controller for GRBL Laser Machines**

LaserFlow is an open-source, browser-based CAM (Computer-Aided Manufacturing) tool and machine controller for GRBL-compatible laser cutters and engravers. Import SVG artwork, arrange operations across layers, generate G-code, and stream it directly to your machine — all from a single web interface.

* 🗂️ Organize your workspace with projects
* 🖼️ Import SVG files and raster images (PNG/JPEG)
* 🧩 Organize shapes into layers, manipulate them with scale, offset, rotation, and mirror controls
* ✂️ Assign cut / engrave operations with per-operation parameters (power, feed rate, passes)
* 👁️ Preview G-code in a dedicated preview tool
* 📡 Live stream G-code to the laser and monitor the state, live progress, ETA in real time
* ♻️ Save and reuse material and machine configurations
* 🧪 Inspect raw serial communication between the app and the machine

## Quick Start

```sh
curl -fsSL https://raw.githubusercontent.com/praegustator/laserflow/main/install.sh | sh
```

The script will: detect / install **Node.js 20** –> clone repo –> `npm install` –> start backend + frontend in dev mode.

## Manual Installation

**Prerequisites**

You will need Node.js (recommended version 20 LTS) and `git` for cloning.

**Steps**

```sh
git clone https://github.com/praegustator/laserflow.git
cd laserflow

npm install
```

## Running the Application

### Development Mode

Open **two terminals** from the repository root:

```sh
# Terminal 1 — backend (auto-reloads on file changes)
npm run dev --workspace=packages/backend
# → API server listening on http://localhost:3001

# Terminal 2 — frontend (Vite dev server with HMR)
npm run dev --workspace=packages/frontend
# → UI available at http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) in your browser. The frontend automatically proxies API requests to the backend.

### Production Build

```sh
# Build both packages
npm run build

# Start the backend (serves compiled output)
npm run start --workspace=packages/backend
# → http://localhost:3001

# The frontend build output is in packages/frontend/dist/
# Serve it with any static file server (Nginx, caddy, etc.)
```

### Docker

The simplest way to run LaserFlow in production:

```sh
# Start backend (port 3001) + frontend (port 8080)
docker compose up -d
```

Then open [http://localhost:8080](http://localhost:8080).

**Serial port access:** The `docker-compose.yml` passes `/dev/ttyUSB0` into the backend container. Adjust the `devices` entry if your machine appears on a different path (e.g. `/dev/ttyACM0`).

```yaml
# docker-compose.yml — devices section
devices:
  - "/dev/ttyACM0:/dev/ttyUSB0"   # example: map a different host port
```

---

## Architecture Overview

```
Browser (React SPA)
       │
       │  HTTP REST  /api/*
       │  WebSocket  /ws
       ▼
Fastify Backend (Node.js)
       │
       │  serialport
       ▼
GRBL Laser Machine (/dev/ttyUSB0)
```

| Layer | Role |
|-------|------|
| **Frontend** | React 18 SPA — project management, SVG editing, operation setup, G-code preview |
| **Backend API** | Fastify server — SVG → G-code compilation, job queue, serial port management |
| **WebSocket** | Real-time push of machine status, job progress, and console output |
| **Serial** | Implements GRBL's 127-byte RX-buffer streaming protocol |

Project data (jobs, machine profiles, material presets) is persisted by the backend in a `data/` directory. The frontend stores the current project in `localStorage`.

---

## Configuration

### Backend

| Environment Variable | Default | Description |
|----------------------|---------|-------------|
| `PORT` | `3001` | HTTP port the backend listens on |
| `HOST` | `0.0.0.0` | Interface the backend binds to |
| `NODE_ENV` | — | Set to `production` for production deployments |

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_APP_VERSION` | `dev` | Version string shown in the footer |
| `VITE_BASE_PATH` | `/` | Base URL path for the frontend build |

The **backend URL** and **WebSocket URL** are configurable at runtime through the UI Settings page and are stored in the browser's `localStorage`.

---

## Development Guide

### Project Structure

```
laserflow/
├── packages/
│   ├── backend/
│   │   └── src/
│   │       ├── cam/          # SVG parsing and G-code generation
│   │       ├── config/       # Machine profiles and material presets
│   │       ├── jobs/         # Job management and streaming logic
│   │       ├── routes/       # Fastify HTTP routes (/api/jobs, /api/files, …)
│   │       ├── serial/       # Serial port connection and GRBL protocol
│   │       ├── ws/           # WebSocket server and message broadcasting
│   │       └── index.ts      # Application entry point
│   └── frontend/
│       └── src/
│           ├── components/   # Reusable UI components
│           ├── hooks/        # Custom React hooks (keyboard shortcuts, …)
│           ├── pages/        # Top-level page components
│           ├── store/        # Zustand state stores
│           ├── types/        # Shared TypeScript types
│           └── utils/        # Geometry helpers and utilities
├── docker-compose.yml
├── install.sh                # One-line quick-install script
└── package.json              # Monorepo root
```

### Available Scripts

Run from the **repository root** unless noted otherwise:

| Command | Description |
|---------|-------------|
| `npm run build` | Build both backend and frontend |
| `npm run lint` | Lint both packages |
| `npm run typecheck` | Type-check both packages |
| `npm run test` | Run backend unit tests (Vitest) |
| `npm run dev --workspace=packages/backend` | Start backend in watch mode |
| `npm run dev --workspace=packages/frontend` | Start frontend dev server |

### Tech Stack

| Area | Technology |
|------|-----------|
| Frontend framework | React 18 |
| Frontend styling | Tailwind CSS |
| Frontend state | Zustand |
| Frontend routing | React Router v6 |
| Frontend build | Vite |
| Backend framework | Fastify |
| Serial communication | serialport |
| Real-time | WebSocket (`@fastify/websocket`) |
| SVG processing | svgson, svg-pathdata |
| Language | TypeScript (throughout) |
| Testing | Vitest |
| Linting | ESLint |
| Deployment | Docker + Nginx |

---

## Contributing

Contributions are welcome! Here is how to get started:

1. **Fork** the repository and create a feature branch:
   ```sh
   git checkout -b feature/my-awesome-feature
   ```

2. **Install dependencies** (see [Manual Installation](#manual-installation) above).

3. **Make your changes.** Please follow the existing code style — TypeScript strict mode is enabled throughout.

4. **Lint and type-check** before committing:
   ```sh
   npm run lint
   npm run typecheck
   ```

5. **Test** your changes:
   ```sh
   npm run test
   ```

6. **Open a Pull Request** against the `main` branch with a clear description of what you changed and why.

### Good First Issues

- Additional material presets
- More keyboard shortcuts
- G-code preview enhancements (zoom, pan, colour by operation)
- Improved error messages for serial connection failures
- Unit tests for CAM / G-code generation utilities
- Translations / i18n

### Reporting Bugs

Please open a [GitHub Issue](https://github.com/praegustator/laserflow/issues) and include:
- Steps to reproduce
- Expected vs. actual behaviour
- Browser, Node.js, and OS versions
- Any relevant console output

---

## License

This project is open source. See [LICENSE](LICENSE) for details.
