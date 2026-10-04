# Job Autopilot — React Frontend

Autonomous Job Search Radar and Candidate Match Interface, built with **React 18 + TypeScript + Vite**.

---

## Tech Stack
- **Framework**: React 18 + TypeScript
- **Bundler / Dev Server**: Vite 5
- **3D Visualizations**: Three.js (WebGL Rotating Radar Globe)
- **Icons**: Lucide React
- **Design System**: Bespoke Cyber-Industrial Vanilla CSS (Barlow, JetBrains Mono, Syne)
- **Port**: `5056` (Proxies `/api` and `/approve` to Backend on port `5055`)

---

## Getting Started

### Development Mode
```bash
npm run dev
# or
npm start
```
Runs the Vite development server at [http://localhost:5056](http://localhost:5056) with instant hot module replacement (HMR).

### Production Build
```bash
npm run build
```
Typechecks and builds optimized static assets into the `dist/` folder.

### Preview Production Build
```bash
npm run preview
```

---

## Features
1. **Real-time 3D Market Radar**: Three.js WebGL globe showing job distribution, orbit line, and country hotspots.
2. **AI Fit Breakdown**: Real-time evaluation of roles against resume experience, seniority, and knockout criteria.
3. **Autonomous Ingestion**: Drag-and-drop resume upload (.pdf, .docx, .txt) with automatic fact and role extraction.
4. **Interactive Filters**: Live search, country selector, remote-only toggle, date limit, and fit score sorting.
5. **Scheduler & Crawlers Telemetry**: Live status of background sweeps, recent execution logs, and ingestion channel health.
6. **Portal Bottleneck Tracker**: Detection and management of required employer applicant portals.
7. **One-Click Approval Screen**: Standalone decision view for email alert tokens (`/approve/:token`).
