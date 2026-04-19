# Browser Test Lab — open-source multi-device responsive tester (BrowserStack-style MVP)

Render any URL in multiple mobile viewports side-by-side. Two engines, same UI:

1. **iframe mode** — instant, runs purely in the browser. Each device is an `<iframe>` sized to the device viewport. Fast, but constrained by `X-Frame-Options` / CSP.
2. **Real-browser mode** — backend launches a real Chromium via [Playwright](https://playwright.dev) per (device × URL), emulates the device (viewport, DPR, user-agent, touch), and streams JPEG frames to the browser over WebSocket. Click/scroll input is relayed back so the real page responds. No iframe restrictions.

All open source. No paid APIs.

---

## Folder structure

```
browser-test-lab/
├── package.json              # workspace root (runs both apps via concurrently)
├── shared/
│   └── devices.js            # single source of truth for device descriptors
├── backend/                  # Node + Express + Playwright + ws
│   ├── package.json
│   └── src/
│       ├── server.js
│       ├── config/
│       ├── routes/
│       │   ├── api.js        # REST: devices, sessions, navigate, network…
│       │   └── proxy.js      # strips X-Frame-Options for iframe mode
│       └── services/
│           ├── sessionManager.js   # Playwright contexts + frame streaming
│           └── wsHub.js            # WebSocket fan-out & input relay
└── frontend/                 # Next.js 14 (App Router) + Tailwind + Zustand
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    └── src/
        ├── app/              # layout, page, globals.css
        ├── components/
        │   ├── Toolbar.jsx
        │   ├── DeviceGrid.jsx
        │   ├── IframeDeviceFrame.jsx
        │   └── RealDeviceFrame.jsx
        ├── config/devices.js
        ├── lib/api.js
        └── store/useLabStore.js
```

---

## Architecture

```
 ┌─────────────────── Browser (Next.js UI) ──────────────────┐
 │  Toolbar (URL, mode toggle, devices, network, theme)      │
 │           │                                               │
 │           ▼                                               │
 │  Zustand store ──► DeviceGrid ──► {IframeFrame|RealFrame} │
 └───────────┬───────────────────────────────┬───────────────┘
             │ iframe mode                   │ real-browser mode
             │ (optional proxy)              │ WS /stream + REST
             ▼                               ▼
     ┌────────────────┐             ┌───────────────────────┐
     │ /proxy/fetch   │             │ Express + ws          │
     │ strips XFO/CSP │             │   sessionManager.js   │
     └────────────────┘             │     │ Playwright      │
                                    │     └► Chromium       │
                                    │        contexts (1/dev)│
                                    └───────────────────────┘
```

### Separation of concerns

- **UI layer** (`frontend/src/components/*`, `frontend/src/app/*`) — only rendering and input. No device knowledge beyond IDs.
- **Device simulation config** (`shared/devices.js` + `frontend/src/config/devices.js`) — viewports, DPR, user-agents, Playwright descriptor mapping. One place to add a device.
- **Rendering engines**:
  - `IframeDeviceFrame` — pure DOM, optionally routes through the proxy.
  - `RealDeviceFrame` + `backend/src/services/*` — Playwright sessions, JPEG streaming, input relay.
- **State** (`useLabStore`) — URL, mode, selected devices, theme, orientation, network profile, scroll broadcast.

---

## Running locally

**Requirements:** Node 18+, ~1 GB free disk (for Chromium).

```bash
cd browser-test-lab

# 1) install everything
npm install
npm --workspace backend install          # triggers `playwright install chromium`
npm --workspace frontend install

# 2) copy env examples (defaults already work for localhost)
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env.local

# 3) start both apps
npm run dev
# backend → http://localhost:4000
# frontend → http://localhost:3000
```

Open http://localhost:3000. Type a URL → pick devices → hit **Go**.

- Switch to **real browser** mode in the toolbar to use Playwright streaming. First load for each device takes ~1–3 s while Chromium boots a context.
- In **iframe** mode, turn on **Proxy** if the site blocks framing (X-Frame-Options / CSP).

---

## Feature map (what's wired up)

| Requirement                      | Where                                                   |
| -------------------------------- | ------------------------------------------------------- |
| Multi-device grid                | `DeviceGrid.jsx`                                        |
| Device presets (iPhone/Android…) | `shared/devices.js`                                     |
| Screen res / DPR / UA            | `sessionManager.js` (Playwright context options)        |
| Touch events                     | Playwright `hasTouch: true` + `page.touchscreen.tap`    |
| Orientation toggle               | Store + `applyOrientation()` in frames                  |
| Parallel rendering               | One Playwright context per frame, streamed independently|
| Sync scroll/reload               | `broadcastScroll` in store + WS `scroll` / `reload`     |
| Network throttling               | `applyNetworkProfile` via CDP `Network.emulateNetworkConditions` |
| Screenshot capture               | `GET /api/sessions/:id/screenshot` (PNG)                |
| Custom screen size               | Add entry to `shared/devices.js`                        |
| Dark/light toggle                | Store + Tailwind `dark:` class on `<html>`              |
| Session share via URL            | `shareUrl()` → base64 in `#s=…` + `hydrateFromHash()`   |
| iframe XFO workaround            | `/proxy/fetch` strips framing headers (local QA only)   |
| Mode toggle (iframe vs real)     | `mode` in store, gated per component                    |

---

## Key challenges & how we addressed them

- **`X-Frame-Options` / CSP `frame-ancestors`** — iframe mode includes an optional proxy route that strips those headers server-side. For real accuracy, switch to real-browser mode (no iframe at all, so restrictions don't apply).
- **Cross-origin scroll sync** — impossible via DOM across origins. In iframe mode we best-effort `postMessage` and otherwise accept asymmetric scroll. In real mode we relay scroll deltas through the WS to each Playwright page, which is origin-agnostic.
- **Performance with N views** — real mode uses a single shared browser process with per-device `BrowserContext` (cheap); frames are JPEG-compressed and throttled to `FRAME_FPS` (default 4). Clients without subscribers are idled (`startStreaming` checks `subscribers.size`).
- **Session sprawl** — `MAX_SESSIONS` caps concurrent Playwright contexts; `DELETE /api/sessions/:id` is called on unmount.

---

## Security note on the iframe proxy

`/proxy/fetch` will fetch any URL and strip framing restrictions, so it is effectively an open relay. That's intentional for **local QA** only. Before exposing this to the public internet, add:

- request auth (session token or auth header),
- an allowlist of target hosts,
- rate limiting,
- output sanitization if you expand beyond read-only GETs.

---

## Scaling to a real-device cloud (future)

The current MVP runs Chromium on the same box as the Node server. To grow from "desktop tool" to "BrowserStack-lite":

1. **Horizontal fleet of renderers.** Wrap `sessionManager` as a stateless worker. Put many renderer nodes behind a router that sticky-routes `sessionId → node` (Redis map or consistent hashing). Each node only tracks its own sessions.
2. **Session persistence.** Move session metadata (deviceId, url, owner, network profile, createdAt) into Redis. Keep Playwright contexts in memory on the assigned node. Reconnecting clients look up the node and open WS there.
3. **Separate real-device layer.** For Android, swap the Chromium renderer for `adb + screencopy` or `scrcpy` on real devices / Genymotion / a rack of reference phones. For iOS, `appium` + `ios-deploy` against physical devices in an MDM pool. The device list stays in `shared/devices.js`; only the renderer implementation changes.
4. **Edge-ish streaming.** Replace JPEG-over-WS with WebRTC (VP8/H.264) once frame rate / bandwidth matters. `@roamhq/wrtc` or `pion` on the server, `RTCPeerConnection` on the client.
5. **Multi-tenant isolation.** One K8s pod per concurrent user; disposable contexts so history/cookies don't leak. `--user-data-dir` per session.
6. **Observability.** Export Playwright context CPU/RAM via Prometheus; track tail latency of `goto` and frame cadence. Rotate on soft failure.
7. **Auth + billing.** Gate `POST /api/sessions` behind an auth middleware; track session-minutes per account.

---

## Extending

- **Add a device:** append to `shared/devices.js` AND `frontend/src/config/devices.js`. Use a Playwright built-in descriptor name (see `playwright.devices`) when one exists so you inherit realistic UA/viewport.
- **Add a network profile:** extend `NETWORK_PROFILES` in both copies.
- **Custom screen size:** the store already accepts arbitrary `viewport` objects; wire a small "custom device" form into the toolbar if you need it exposed as UI.
- **Scripted flows (Playwright):** add routes like `POST /api/sessions/:id/run` that accept a tiny step DSL (`click "#cta"`, `type`, `waitFor`) and execute against `session.page`.

---

## Open-source dependencies

| Piece               | Package                                     |
| ------------------- | ------------------------------------------- |
| Real-browser engine | `playwright` (Apache-2.0)                   |
| Server              | `express`, `ws`, `cors`                     |
| Frontend            | `next`, `react`, `zustand`, `tailwindcss`   |

No paid services. Everything runs on your laptop.
