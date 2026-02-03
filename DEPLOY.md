# Deploying Coup

You can deploy as:

- **Single server** (Render, Railway, Fly): one app serves the React build and Socket.io.
- **Vercel (frontend) + Render (backend)**: frontend on Vercel, game server on Render.

---

## Vercel (frontend) + Render (backend)

Vercel doesn’t run long-lived WebSocket servers, so use Vercel for the UI and Render for the game server.

### 1. Deploy the backend on Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect your GitHub repo and select the `coup` repository.
3. Configure:
   - **Name:** `coup-api` (or any name)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
4. Add environment variable: `NODE_ENV` = `production`.
5. Create the service and copy your backend URL (e.g. `https://coup-api-xxxx.onrender.com`).

### 2. Deploy the frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** and import your GitHub repo.
2. In **Settings** → **Environment Variables**, add:
   - **Name:** `VITE_SOCKET_URL`
   - **Value:** your Render backend URL (e.g. `https://coup-api-xxxx.onrender.com`)
   - Apply to Production (and Preview if you want).
3. Vercel will use `vercel.json` to run `npm run build` and serve the `dist` folder. Deploy.

Your game will be at your Vercel URL (e.g. `https://coup-xxxx.vercel.app`). The frontend will connect to the Render URL for Socket.io.

**Note:** Render’s free tier spins down after inactivity; the first request after a while may take ~30 seconds (cold start).

---

## Single-server deploy

### Option 1: Render (free tier)

1. Push your code to GitHub.
2. Go to [render.com](https://render.com) → **New** → **Web Service**.
3. Connect your GitHub repo and select the `coup` repository.
4. Configure:
   - **Name:** `coup` (or any name)
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance type:** Free
5. Under **Environment**, add (Render sets `NODE_ENV=production` automatically; you can add it to be sure):
   - `NODE_ENV` = `production`
6. Click **Create Web Service**. After the build, your app will be at `https://your-app-name.onrender.com` (replace with your service name).

---

### Option 2: Railway

1. Push your code to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**.
3. Select the `coup` repo.
4. In the service **Settings**:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
5. Under **Variables**, add:
   - `NODE_ENV` = `production`
6. Open **Settings** → **Networking** → **Generate Domain** to get a public URL.

---

### Option 3: Fly.io

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/) and run `fly auth login`.
2. In your project folder:
   ```bash
   fly launch
   ```
   Choose your org, app name, region; say no to PostgreSQL.
3. Set build/start:
   ```bash
   fly scale count 1
   ```
   Ensure a `Dockerfile` or that Fly uses the correct build/start (see below).
4. If you don’t have a Dockerfile, you can use Fly’s **Buildpack** with:
   - Build: `npm install && npm run build`
   - Start: `npm start`
5. Deploy:
   ```bash
   fly deploy
   ```
   Your app will be at `https://your-app-name.fly.dev`.

---

## How it works in production

- **Build:** `npm run build` creates the React app in `dist/`.
- **Start:** `npm start` runs the Node server with `NODE_ENV=production`.
- The server serves files from `dist/` and handles Socket.io on the same port.
- The frontend uses `window.location.origin`, so it connects to the same host (no extra env vars needed).

## Local production test

```bash
npm run build
NODE_ENV=production npm start
```

Then open `http://localhost:3001`. (On Windows: `set NODE_ENV=production&& npm start`.)

For local dev with separate client and server, use `npm run dev`; the app will connect to the backend on port 3001 automatically.
