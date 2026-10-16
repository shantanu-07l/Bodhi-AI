# Bodhi AI — JanSahayak 🇮🇳
### Intelligent Government Scheme & Public Services Assistant (RAG Platform)

An AI assistant and semantic retrieval-augmented generation (RAG) platform that helps Indian citizens discover, understand, and navigate 2,000+ Central and State Government welfare schemes, eligibility rules, financial subsidies, document checklists, and application procedures in **English**, **Hindi (हिन्दी)**, and **Marathi (मराठी)**.

---

## 🌟 Core Architecture & Features

- 🇮🇳 **Verified Government Scheme Retrieval (RAG)** — Grounded answers citing official portals (`myscheme.gov.in`, `pmkisan.gov.in`, etc.) with traceable section chunks and verified links.
- 🌾 **Citizen-Centric Welfare Coverage** — Agriculture (PM-KISAN), healthcare (Ayushman Bharat), housing (PMAY), street vendor micro-loans (PM SVANidhi), pensions (IGNOAPS), and educational scholarships.
- ⚡ **Dual-Mode Intelligence** — Automatically detects government scheme queries to retrieve verified data while preserving general conversational chat for general topics.
- 🎙️ **Multilingual Voice Input** — Native speech-to-text powered by Sarvam AI (`saaras:v3`) supporting 10 Indian languages.
- 🔄 **Incremental Refresh & Section-Level Change Tracking** — Automated scheduler and admin trigger detecting modifications in eligibility, benefits, or documents without re-indexing unchanged text.
- 🛡️ **Enterprise Security & Reliability** — SSRF prevention, citizen PII redaction (Aadhaar/PAN/phone/email), prompt injection neutralization, rate limiting, and server-side admin authorization.
- 📊 **Administrative Oversight Dashboard** — Full system metrics, real-time ingestion jobs, granular change audit logs, deep scheme inspectors, and manual crawl controls.

---

## 💻 Tech Stack & System Requirements

### Required Software & Versions
| Software | Recommended Version | Minimum Version | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v20.x` (LTS) | `v18.18.0` | Required for ES Modules (`"type": "module"`) |
| **npm** | `v10.x` | `v9.x` | Bundled with Node.js |
| **MongoDB** | `v7.0` | `v6.0` | Local standalone or MongoDB Atlas (M0 Free Tier) |
| **Ollama** | `v0.4+` | `v0.1.30+` | Local embedding inference (`nomic-embed-text`, free) |
| **Docker** (Optional) | `v24.x+` | `v20.x` | For containerized deployment |
| **Docker Compose** | `v2.x+` | `v1.29` | Multi-container local orchestration |
| **OS** | Windows 10/11, macOS, Linux | Any | Fully tested on Windows PowerShell |

---

## 📋 Environment Variables Reference

### Backend (`Backend/.env`)

Copy `Backend/.env.example` to `Backend/.env`:

```bash
cp Backend/.env.example Backend/.env
```

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | Backend server port | `5000` |
| `NODE_ENV` | Runtime environment (`development`, `production`, `test`) | `development` |
| `CLIENT_URL` | Allowed frontend origins for CORS | `http://localhost:5173,https://bodhi-ai-eight.vercel.app` |
| `MONGODB_URL` | MongoDB connection URI (Atlas or Local) | `mongodb+srv://<user>:<pwd>@cluster.mongodb.net/bodhi_jansahayak` |
| `JWT_SECRET` | 64-char hex key for short-lived access tokens | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRE` | JWT access token lifespan | `15m` |
| `REFRESH_TOKEN_SECRET` | 64-char hex key for HTTP-only refresh tokens | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `REFRESH_TOKEN_EXPIRE` | Refresh token lifespan | `7d` |
| `ADMIN_EMAIL` | Citizen email granted admin dashboard privileges | `admin@jansahayak.gov.in` |
| `ADMIN_API_KEY` | Master key for CLI/cron background runners | `master_admin_secret_key_32_chars_min` |
| `OPENAI_API_KEY` | OpenRouter API Key for chat LLMs | `sk-or-v1-...` ([Get key](https://openrouter.ai/keys)) |
| `SARVAM_API_KEY` | Sarvam AI API Key for Indian voice transcription | `sk_...` ([Get key](https://sarvam.ai)) |
| `OLLAMA_BASE_URL` | Base address for local Ollama embedding instance | `http://localhost:11434` |
| `EMBEDDING_MODEL` | Embedding model identifier | `nomic-embed-text` |
| `EMBEDDING_DIMENSIONS` | Vector embedding dimension size | `768` |
| `USE_ATLAS_VECTOR_SEARCH` | Set `true` for Atlas M10+ `$vectorSearch`, `false` for M0 in-memory hybrid search | `false` |
| `SCHEME_REFRESH_ENABLED` | Enable automated background cron in this web process | `false` |
| `SCHEME_REFRESH_CRON` | Cron schedule expression | `0 2 * * 0` (Every Sunday at 2:00 AM) |
| `SCHEME_REFRESH_TIMEZONE`| Scheduler timezone | `Asia/Kolkata` |
| `SCHEME_INGEST_SOURCE` | Dataset file path or verified government URL | `pipeline/fixtures/sample-schemes.json` |

### Frontend (`Frontend/.env.local`)

Copy `Frontend/.env.example` to `Frontend/.env.local`:

```bash
cp Frontend/.env.example Frontend/.env.local
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `VITE_API_URL` | Backend API base address | `http://localhost:5000` |

---

## 🚀 Local Installation & Setup Instructions

### 1. Clone the Repository
Open Windows PowerShell (or terminal):
```powershell
git clone https://github.com/shantanu-07l/Bodhi-AI.git
cd Bodhi-AI
```

### 2. Configure Environment Files
```powershell
# Copy backend template and add your credentials
Copy-Item Backend\.env.example Backend\.env

# Copy frontend template
Copy-Item Frontend\.env.example Frontend\.env.local
```

### 3. Install Dependencies
```powershell
# Install Backend packages
cd Backend
npm install

# Install Frontend packages
cd ..\Frontend
npm install
cd ..
```

### 4. Pull the Embedding Model (Ollama)
Ensure Ollama is installed and running, then pull the local embedding model (free, ~274 MB, run once):
```powershell
ollama pull nomic-embed-text
```

### 5. Seed Initial Scheme Records & Vectors
From the `Backend` directory, populate MongoDB with verified government schemes:
```powershell
cd Backend

# Seed 15 flagship national schemes (fast bootstrap)
npm run seed -- --limit 15

# (Optional) Seed 60 popular welfare schemes
npm run seed -- --limit 60
```

### 6. Start the Application
Open two PowerShell terminals:

**Terminal 1 (Backend Server):**
```powershell
cd Backend
npm run dev
# Server listening at http://localhost:5000
```

**Terminal 2 (Frontend Client):**
```powershell
cd Frontend
npm run dev
# Vite client ready at http://localhost:5173
```

Visit **`http://localhost:5173`** in your browser.

---

## 🧪 Testing, Quality Assurance, and RAG Evaluation

The application includes automated unit, integration, security, and benchmark evaluation suites:

```powershell
cd Backend

# Run the complete 86-test automated regression & safety suite
npm test

# Run individual test suites
npm run test:ingest     # Data ingestion and normalization tests
npm run test:vector     # Semantic chunking and vector indexing tests
npm run test:rag        # RAG prompt generation and citation tests
npm run test:refresh    # Refresh pipeline and change tracking tests
npm run test:ui         # Multilingual prompts and admin auth tests
npm run test:security   # SSRF, PII redaction, prompt injection tests
npm run eval:rag        # Programmatic Recall@K and MRR benchmark
```

### Measured RAG Evaluation Benchmark Results:
- **Retrieval Recall@1:** **100.0%** (Target: $\ge 75\%$)
- **Retrieval Recall@3:** **100.0%** (Target: $\ge 85\%$)
- **Retrieval Recall@5:** **100.0%** (Target: $\ge 90\%$)
- **Mean Reciprocal Rank (MRR):** **1.000** (Target: $\ge 0.80$)
- **Citation Correctness:** **100.0%** (Target: $\ge 85\%$)
- **Abstention on Fictitious Queries:** **100.0%** (Target: $100\%$)
- **Average Retrieval Latency:** **326.6 ms**

---

## 🔄 Scheme Ingestion, Refresh Worker, and Job Monitoring

### Running the Scraper / Refresh Worker Separately
To prevent heavy crawling or indexing from consuming web server memory, run the refresh worker as a decoupled process or cron container:

```powershell
cd Backend

# Run an immediate refresh cycle using default dataset
npm run refresh

# Run a dry-run without writing to MongoDB
npm run refresh -- --dry-run

# Run against a specific scraper output file
npm run refresh -- --source path/to/myscheme_output.json
```

### Managing Jobs via Admin API & Dashboard
Authenticate with an admin account or pass `x-admin-key: <ADMIN_API_KEY>` in headers:
- `GET /api/schemes/refresh/status` — View scheduler configuration, cron state, and latest execution.
- `GET /api/schemes/refresh/jobs` — Paginated history of all past refresh jobs.
- `GET /api/schemes/refresh/changes` — Audit log of section-level modifications (eligibility, benefits, documents).
- `GET /api/schemes/inspect/:schemeId` — Deep inspector for scheme records, version history, and active chunks.
- `POST /api/schemes/refresh` — Trigger a manual refresh cycle (`{ "dryRun": false, "asyncRun": true }`).

---

## 🐳 Docker Orchestration (Single-Command Setup)

For an isolated, containerized demonstration with MongoDB persistence:

```powershell
# Build and start Backend, Frontend, and MongoDB with persistent volumes
docker compose up --build -d

# Check running container health
docker compose ps

# View backend logs
docker compose logs -f backend

# Stop all containers (data is safely preserved in jansahayak-mongo-data volume)
docker compose down
```

### Container Endpoints:
- **Frontend Web UI:** `http://localhost:5173`
- **Backend API:** `http://localhost:5000`
- **Backend Health Check:** `http://localhost:5000/api/health`
- **MongoDB:** `localhost:27017`

---

## ☁️ Cloud Deployment Guide (Student & Production Options)

### Option A: Free Tier Demonstration (Vercel + Render + MongoDB Atlas)
*Budget: \$0.00 / month (Recommended for student presentation)*

1. **Database:** Create a free `M0` cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
   - In *Network Access*, add `0.0.0.0/0` (allow access from anywhere) or specific Render IPs.
   - Copy connection string into `MONGODB_URL`.
2. **Backend (Render):**
   - Create a **Web Service** on [Render](https://render.com) connected to your repository.
   - Root Directory: `Backend`
   - Build Command: `npm ci`
   - Start Command: `node server.js`
   - Environment Variables: Set all variables from `Backend/.env.example`.
3. **Frontend (Vercel):**
   - Connect repository to [Vercel](https://vercel.com).
   - Root Directory: `Frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Environment Variable: `VITE_API_URL=https://your-backend-service.onrender.com`

### Option B: Cloud VM / Docker VPS (DigitalOcean Droplet / AWS EC2)
*Budget: ~\$5 – \$10 / month*

1. Provision an Ubuntu 22.04 LTS instance (1 vCPU, 2GB RAM).
2. Install Docker & Docker Compose: `sudo apt update && sudo apt install docker-compose-plugin -y`.
3. Clone repository and configure `.env` files.
4. Run: `docker compose up --build -d`.
5. Point DNS A-record to your server IP and add Caddy or Nginx for SSL (`https://`).

---

## 🛠️ Troubleshooting & Common Fixes

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| **`MongooseServerSelectionError`** | IP not whitelisted in MongoDB Atlas | Go to MongoDB Atlas $\to$ **Network Access** $\to$ click **Add IP Address** $\to$ choose **Allow Access From Anywhere (`0.0.0.0/0`)**. |
| **`Port 5000 in use`** | Previous Node process or Apple AirPlay using port | Run `netstat -ano \| findstr :5000` on Windows, find the PID, and kill it with `taskkill /F /PID <PID>`, or change `PORT=5001` in `.env`. |
| **`API returned 401: Switched to local generator`** | OpenRouter embedding key missing or expired | The system automatically activates its circuit breaker and switches to deterministic 768-dim local vectors without crashing. Add a valid `OPENAI_API_KEY` in `.env` to restore OpenRouter API embeddings. |
| **`Concurrency conflict: Refresh job is currently running`** | A previous crawl process exited abruptly while locked | Inspect `RefreshJob` in MongoDB. Delete or set `{ status: "failed" }` on the stuck job, or wait for the automatic 2-hour lock expiration. |
| **`CORS Error in Browser`** | Frontend origin not listed in backend CORS | Ensure `CLIENT_URL` in `Backend/.env` includes your exact frontend origin (e.g., `http://localhost:5173`). |

---

## 🔒 Security Best Practices

1. **Credentials:** Never commit `.env` or files containing API keys to Git. Both `Backend/.env` and `Frontend/.env.local` are explicitly listed in `.gitignore`.
2. **Public Demonstration:** Do not publish live master admin API keys. When demonstrating, use a standard citizen account for chat exploration and showcase admin metrics via verified admin login.
3. **SSRF Guard:** Only official domains (`*.gov.in`, `*.nic.in`, `myscheme.gov.in`) are allowed for remote scraper ingestion.

---

## ⚖️ License & Disclaimer

This project is developed for educational, academic final-year project, and portfolio purposes.

> **Legal Disclaimer:** JanSahayak is an informational assistant. It uses public scheme guidelines from official government portals. Official approval and financial disbursements depend exclusively on verification by the respective government department, state nodal officer, or Common Service Centre (CSC).
