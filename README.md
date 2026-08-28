# Mailnex — Automated Cold Email & Outreach Platform

Mailnex is a high-performance, multi-user SaaS platform built for automated job applications and cold email outreach. It allows multiple users to manage their candidate profiles, import tens of thousands of company contacts from Excel, customize dynamic role-agnostic templates, personalize emails using Google Gemini AI, and schedule human-like delivery through Gmail with strict quota management and bounce tracking.

---

## 🌟 Key Features

- **Multi-Tenant SaaS Architecture:**
  - Secure registration & authentication (JWT + bcrypt).
  - 100% isolated tenant data across contacts, templates, credentials, quotas, and logs.
  - Multi-user background scheduler that processes independent campaign ticks concurrently.

- **Intelligent Campaign Automation:**
  - **3 Campaign Modes:**
    - `DRAFT`: Dry-run mode — generates subjects/bodies with AI and records logs without sending real emails.
    - `TEST`: Sends all generated emails to your personal test inbox for quality assurance.
    - `LIVE`: Delivers real cold emails to company recipients with PDF resume attachments.
  - **Human-Like Scheduling:** Spreads emails evenly with randomized jitter across active business hours (e.g. 9:00 AM – 6:00 PM).
  - **Daily Quota Safety:** Enforces per-user daily limits (default 50/day) to keep Gmail sender reputation safe.

- **AI Personalization & Dynamic Templates:**
  - **Google Gemini 1.5 Flash:** Dynamically personalizes subject lines and body text per company.
  - **Universal Role-Agnostic Placeholders:** Interpolates candidate profile variables (`{{name}}`, `{{role}}`, `{{targetRole}}`, `{{skills}}`, `{{experience}}`, `{{portfolio}}`, `{{linkedin}}`, `{{github}}`).
  - **Interactive Template Picker:** Choose exactly which templates to rotate during outreach.

- **Excel Contact Importer:**
  - Stream-parses large Excel files (`.xlsx`, `.xls`) with progress polling.
  - Smart column header detection (`Company`, `Location`, `Email`).
  - Automatic email validation and duplicate detection.

- **Progressive Web App (PWA) & Mobile Native Feel:**
  - Installable directly to home screens on **Android**, **iOS**, and **Desktop**.
  - Auto-updating Service Worker (`vite-plugin-pwa`) with offline asset precaching.
  - Real-time background sync (`refetchOnWindowFocus` + polling) — **zero manual web refreshes required**.

- **Modern Responsive Design:**
  - Designed with a custom **Teal & Ice** color palette (`#E3FDFD`, `#CBF1F5`, `#A6E3E9`, `#71C9CE`).
  - Mobile slide-over navigation drawer and horizontal scroll table wrappers.
  - Dark / Light mode toggle.

---

## 🛠️ Technology Stack

### Frontend
- **Framework:** React 18 with TypeScript
- **Bundler:** Vite 5 + `vite-plugin-pwa` (Workbox Service Worker)
- **Styling:** TailwindCSS 3 (Custom Teal/Ice design tokens)
- **State & Sync:** TanStack React Query v5 + Zustand
- **Forms & Validation:** React Hook Form + Zod
- **Charts:** Recharts (Daily trend lines & success/failure donuts)
- **Icons:** Lucide React

### Backend
- **Runtime:** Node.js (ESM)
- **Framework:** Fastify 4 (Lightweight, ultra-fast HTTP engine)
- **Database:** PostgreSQL with Drizzle ORM
- **Authentication:** JWT (`@fastify/jwt`) + `bcryptjs`
- **Background Engine:** `node-cron` with transactional locking
- **Email Delivery:** Nodemailer (Gmail SMTP / App Passwords)
- **AI Engine:** `@google/generative-ai` (Gemini 1.5 Flash)
- **Spreadsheet Parsing:** ExcelJS

---

## 🔄 How Mailnex Works (End-to-End Flow)

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Upload Excel   │ ────> │ Select Templates│ ────> │ Configure Keys  │
│  (Contacts DB)  │       │ (Role Placeholders)     │ (Gmail + Gemini)│
└─────────────────┘       └─────────────────┘       └─────────────────┘
                                                             │
                                                             ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ Real-Time Logs  │ <──── │ Gmail Delivery  │ <──── │ Cron Scheduler  │
│  & Analytics    │       │ (Live / Test)   │       │ (Human Jitter)  │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

1. **User Registration:** Each user registers their own account and receives a pre-seeded set of 20 universal cold outreach templates.
2. **Profile & Credentials:** User configures their candidate profile (target role, skills, portfolio) and uploads their PDF resume in **Settings**. Gmail credentials and Gemini API keys are encrypted per tenant.
3. **Contact Ingestion:** Upload an Excel spreadsheet containing target companies and recruiter emails.
4. **Campaign Scheduling:** Clicking **Start** on the **Campaign** page builds today's randomized schedule for pending contacts.
5. **Automated Sending:** Every minute, the background scheduler checks for due items, generates personalized content via Gemini AI, attaches the candidate's resume, and sends the email via Gmail SMTP.
6. **Audit & Analytics:** Every send attempt, bounce, or failure is logged in real-time on the **Email Logs** and **Dashboard** pages.

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- **Node.js:** v18 or higher (v20+ recommended)
- **PostgreSQL:** Running locally or hosted (e.g., Supabase, Neon, Railway)

### 1. Clone & Install Dependencies
```bash
# Clone the repository
git clone <repo-url>
cd email-autometion-node

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/job_app_db

# Security & Secrets
JWT_SECRET=super_secret_jwt_key_change_in_production
ENCRYPTION_KEY=32_character_random_hex_string_for_creds
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change_this_admin_password

# Default Daily Limit
DEFAULT_DAILY_LIMIT=50
```

### 3. Database Migration & Clean Seed
```bash
cd backend

# Run database migrations
npm run db:migrate

# Clean and seed initial admin account + default templates
npm run db:clean
```

### 4. Start Development Servers
```bash
# Start Backend (Port 3000)
cd backend
npm run dev

# Start Frontend in another terminal (Port 6001)
cd frontend
npm run dev
```

Open **`http://localhost:6001`** in your browser.

---

## 📦 Production Build & Deployment

### Build Both Services
```bash
# Build Backend
cd backend
npm run build

# Build Frontend (with PWA service worker & manifest)
cd ../frontend
npm run build
```

### Deployment Options

#### 1. VPS / Single Server (Ubuntu / Debian + PM2)
1. Install Node.js 20 & PostgreSQL.
2. Clone repository and run `npm install` in `backend` and `frontend`.
3. Build frontend with `npm run build` and serve static files using Nginx or Caddy.
4. Run backend using PM2:
   ```bash
   cd backend
   pm2 start dist/server.js --name mailnex-api
   ```

#### 2. Cloud Platforms (Render / Railway / Fly.io)
- **Backend Service:** Deploy `backend` as a Web Service. Set start command to `node dist/server.js` and provide the environment variables (`DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`).
- **Frontend Service:** Deploy `frontend` as a Static Site with build command `npm run build` and publish directory `dist`.

---

## 🗄️ Useful Commands

| Command | Location | Description |
|---|---|---|
| `npm run dev` | `backend/` | Start backend in watch mode with `tsx` |
| `npm run build` | `backend/` | Compile backend TypeScript to `dist/` |
| `npm test` | `backend/` | Run all 150 unit and integration tests |
| `npm run db:migrate` | `backend/` | Apply pending database schema migrations |
| `npm run db:clean` | `backend/` | Truncate database tables and seed fresh Admin |
| `npm run dev` | `frontend/` | Start Vite development server (Port 6001) |
| `npm run build` | `frontend/` | Compile PWA production bundle to `frontend/dist` |

---

## 📄 License
This project is proprietary and built for automated outreach and candidate job application management.
