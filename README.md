# GitForge

A Git-inspired version control system and repository management platform built from scratch using **Node.js, Express.js, MongoDB, and React**.

**Live App**: https://gitforge-eta.vercel.app

GitForge implements core Git internals—content-addressable **SHA-256 hashing**, **line-by-line LCS diffing**, **staging & atomic commits**, **branching**, **Lowest Common Ancestor (LCA) 3-way merging with conflict detection**, and **push/pull/revert**—exposed through both a **command-line interface** and a **full-stack web workspace**.

---

## Architecture

```
+-----------------------+        HTTP / REST (/api/*)        +--------------------------+
|   React 18 + Vite UI  | <--------------------------------> |   Express.js + Socket.IO |
|  (frontend-main/src)  |                                    |     (backend-main/)      |
+-----------------------+                                    +------------+-------------+
                                                                          |
+-----------------------+      Remote Sync (push / pull)                  v
|   GitForge CLI        | ---------------------------------> +--------------------------+
|  (.gitforge / yargs)  |                                    |    VCS Core Engine       |
+-----------------------+                                    |  (vcs/engine.js)         |
                                                             |  - SHA-256 Blob & Commit |
                                                             |  - LCS Line Diffing      |
                                                             |  - LCA 3-Way Merge       |
                                                             +------------+-------------+
                                                                          |
                                                                          v
                                                             +--------------------------+
                                                             |  MongoDB (Mongoose)      |
                                                             |  + Local JSON Fallback   |
                                                             |  + Optional AWS S3 Sync  |
                                                             +--------------------------+
```

---

## Key Features

### Version Control Engine (CLI & Web)
- **Repository Initialization & Staging (`init`, `add`, `status`)**: Tracks working tree files, detects modifications against branch `HEAD`, and manages a staging index before committing.
- **SHA-256 Content Hashing & Integrity Verification**: Every file snapshot (`sha256(content)`) and commit (`sha256(branch + parents + message + timestamp + tree)`) is cryptographically hashed. Includes a one-click integrity check to verify file digests and commit chains.
- **Line-by-Line Diff Tracking**: Computes additions, deletions, and unchanged context lines across working changes, commits, and branch comparisons using Longest Common Subsequence (LCS) diffing.
- **Branching, 3-Way Merging & Conflict Resolution (`branch`, `checkout`, `merge`)**:
  - Supports parallel feature branches with fast-forward merges and automatic non-overlapping 3-way merges via LCA lookup.
  - Detects overlapping edits and modify/delete conflicts, inserting standard conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) and providing an interactive conflict resolver in the Web UI.
- **History & Revert (`log`, `revert`, `push`, `pull`)**: Inspect full commit snapshots, revert any branch back to an earlier commit hash, and sync commits between local `.gitforge` CLI workspaces and the remote API (with optional AWS S3 support).

### Web Platform (MERN)
- **JWT Authentication & Authorization**: Password hashing with `bcryptjs`, stateless JWT auth middleware, and repository owner/visibility access guards.
- **Interactive Repository Workspace**: Edit/create/delete working files, inspect live SHA-256 digests, review color-coded diffs, stage & commit changes, switch/merge branches, resolve conflicts, and track issues.
- **User Profile & Activity Heatmap**: Contribution heatmap computed from commit timestamps, plus repository starring and public repo discovery.

---

## Project Structure

```text
.
├── backend-main/
│   ├── app.js
│   ├── index.js
│   ├── vcs/engine.js
│   ├── models/
│   ├── db/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   └── tests/vcs.test.js
├── frontend-main/
│   ├── src/
│   │   ├── api.js
│   │   ├── components/auth/
│   │   ├── components/dashboard/
│   │   ├── components/repo/
│   │   └── components/user/
│   └── vercel.json
├── Dockerfile
├── docker-compose.yml
├── render.yaml
└── package.json
```

---

## Quick Start (Local)

### Prerequisites
- **Node.js** `>= 20`
- **MongoDB** (optional for local development — if no `MONGODB_URI` or local `mongod` on port `27017` is detected, the backend falls back to local JSON persistence at `backend-main/.local-db.json`)

### 1. Install Dependencies & Build
```bash
git clone https://github.com/sharmapiyush11/GitForge.git
cd GitForge
npm run build
```

### 2. Configure Environment
Create `backend-main/.env` from `backend-main/.env.example`:
```env
PORT=3002
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/gitforge
JWT_SECRET_KEY=replace_with_a_strong_secret
CORS_ORIGIN=http://localhost:5173
```

### 3. Start the Application
```bash
npm start
```
Once running locally, open:
- **Web App**: http://localhost:3002
- **Sign Up**: http://localhost:3002/signup
- **Login**: http://localhost:3002/auth
- **Health Endpoint**: http://localhost:3002/api/health

For hot-reload development (backend on `http://localhost:3002`, Vite dev server on `http://localhost:5173`):
```bash
npm run dev:backend
npm run dev:frontend
```

### 4. Run Tests & Lint
```bash
npm test
npm run lint --prefix frontend-main
```

---

## CLI Reference

Run commands using `node backend-main/index.js <command>` inside any target directory:

| Command | Description |
| :--- | :--- |
| `node backend-main/index.js init` | Initialize `.gitforge` repository |
| `node backend-main/index.js add .` | Stage all files with SHA-256 hashes |
| `node backend-main/index.js status` | Show branch, staged files, and diffs |
| `node backend-main/index.js commit "feat: init"` | Create SHA-256 commit snapshot |
| `node backend-main/index.js log` | Display commit history |
| `node backend-main/index.js branch feature-auth` | Create a new branch |
| `node backend-main/index.js checkout feature-auth` | Switch branch and restore working tree |
| `node backend-main/index.js merge feature-auth` | 3-way merge with conflict detection |
| `node backend-main/index.js push <repoId>` | Push commits to remote GitForge server |
| `node backend-main/index.js pull <repoId> main` | Pull commits and files from remote |
| `node backend-main/index.js revert <commitHash>` | Revert working tree to a commit hash |

---

## REST API Overview

All API routes are mounted under `/api`:

| Group | Endpoints |
| :--- | :--- |
| **Auth & Users** | `POST /api/signup`, `POST /api/login`, `GET /api/userProfile/:id`, `PUT /api/updateProfile/:id`, `POST /api/star/:repoId`, `POST /api/follow/:id` |
| **Repositories** | `POST /api/repo/create`, `GET /api/repo/all`, `GET /api/repo/user/:userID`, `GET /api/repo/:id`, `PATCH /api/repo/toggle/:id`, `DELETE /api/repo/delete/:id` |
| **VCS Operations** | `GET /api/repo/:id/status`, `POST /api/repo/:id/files`, `POST /api/repo/:id/stage`, `POST /api/repo/:id/commit`, `GET /api/repo/:id/commits`, `GET /api/repo/:id/diff`, `POST /api/repo/:id/branches`, `POST /api/repo/:id/checkout`, `POST /api/repo/:id/merge`, `POST /api/repo/:id/merge/resolve`, `POST /api/repo/:id/revert`, `GET /api/repo/:id/verify` |
| **Issues** | `POST /api/issue/create/:repoId`, `GET /api/issue/all/:repoId`, `PUT /api/issue/update/:id`, `DELETE /api/issue/delete/:id` |

---

## Deployment

### Render (Backend) + Vercel (Frontend)
1. **Backend on Render** (configured in `render.yaml`):
   - **Root Directory**: `backend-main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Env Vars**: `MONGODB_URI`, `JWT_SECRET_KEY`, `CORS_ORIGIN=https://<your-vercel-app>.vercel.app`
2. **Frontend on Vercel** (`frontend-main/vercel.json`):
   - **Root Directory**: `frontend-main`
   - **Build Command**: `npm run build` | **Output Directory**: `dist`
   - **Env Var**: `VITE_API_URL=https://<your-render-service>.onrender.com/api`

### Docker Compose
```bash
docker compose up --build
```
Starts both MongoDB and the unified GitForge server on port `3002`.

---

## Author

**Piyush Sharma**
- GitHub: [@sharmapiyush11](https://github.com/sharmapiyush11)
- LinkedIn: [linkedin.com/in/piyush-sharma-01859332b](https://www.linkedin.com/in/piyush-sharma-01859332b)
- Email: piyushsharma5901@gmail.com
