# AGENT.md — "SmoothDrive" (working title)

A mobile web app that uses the iPhone's motion sensors to measure how smoothly a car is being driven, estimate how likely passengers are to feel car sick, and — when the phone is mounted — coach the driver toward a "perfect green" level of jerk (rate of change of acceleration) so nobody gets nauseous.

This document is the complete implementation spec. Read it fully before writing code. Everything here is deliberate: iOS Safari has sharp edges around motion sensors, and the order of operations (intro screen → user tap → permission request → sensor stream) is not optional — it is required by the platform.

---

## 1. Product overview

### 1.1 What the app does

1. **Intro screen (first thing the user sees).** A description of what the app does, why motion-sickness happens, how the app measures it, what permissions will be requested, and a safety disclaimer. At the bottom: a single large **Continue** button. No sensor code runs before this button is tapped.
2. **Permission + calibration.** Tapping Continue triggers the iOS motion-sensor permission prompt (this MUST happen inside the tap handler — see §4.2). After permission is granted, a short calibration step establishes the gravity vector and the vehicle's forward axis.
3. **Live visualization.** A giant full-screen bar showing current longitudinal acceleration/braking, with a color-coded comfort scale (green = smooth, yellow = noticeable, red = sickness-inducing). A secondary indicator shows **jerk** — the real villain of car sickness. The driver's goal: keep the needle in the green.
4. **Coaching / conditioning.** Real-time feedback (color, optional audio chime) plus a running "smoothness score" for the trip, so drivers are conditioned toward smooth throttle and brake inputs over time.

### 1.2 Who uses it and how

- Phone is either **mounted on the dash/windshield** (driver-coaching mode) or **held by a passenger** (car-sickness meter mode). The math is the same; the UI copy differs slightly.
- Target device: modern iPhones (iOS 16+, ideally 18+) in Safari. Must degrade gracefully on Android Chrome (which fires motion events without a permission prompt) and on desktop (show a friendly "open this on your phone" screen with a QR code of the deployed URL).

### 1.3 Safety framing (must appear on the intro screen)

- "Never interact with this app while driving. Mount the phone before you start. Glanceable color feedback only."
- The app is a comfort/coaching tool, not a safety device.

---

## 2. Tech stack & hosting

| Concern | Choice | Why |
|---|---|---|
| Framework | **Vite + React + TypeScript** (SPA, no server) | The app is 100% client-side; Vercel serves it as static assets. Next.js is acceptable if preferred, but there is zero server-side logic, so keep it simple. |
| Styling | Tailwind CSS (or plain CSS modules) | Fast to build the giant-bar UI; dark theme by default (night driving). |
| State | Plain React state + a small state machine (see §7). No Redux. | Only ~5 screens/states. |
| Sensor access | **`DeviceMotionEvent` (`devicemotion` window event)** | The ONLY motion API that works in iOS Safari. The W3C Generic Sensor API (`new Accelerometer()`) is **not implemented in WebKit** — do not use it, do not feature-detect for it first. |
| Keep screen on | Screen Wake Lock API with graceful fallback | See §6. |
| Hosting | **Vercel** (static deploy) | Automatic HTTPS, which is mandatory: motion sensors only work in a secure context. |
| Testing on device | Vercel preview deployments | You cannot meaningfully test `devicemotion` in a desktop browser or the iOS Simulator (no accelerometer). Every sensor change must be tested on a real iPhone via a deployed preview URL. Build a debug overlay (§9) to make this feasible. |

No backend, no database, no analytics in v1. All computation happens on-device.

---

## 3. The physics & physiology (why the app measures what it measures)

You need this to get the thresholds and filtering right.

### 3.1 Definitions

- **Acceleration** `a` (m/s²): what the accelerometer measures. Longitudinal accel = speeding up; negative = braking.
- **Jerk** `j = da/dt` (m/s³): how abruptly acceleration changes. Stomachs and inner ears object to jerk more than to steady acceleration. A steady 1 m/s² highway on-ramp pull is fine; the same 1 m/s² arriving in 200 ms (a stabbed brake pedal) is what makes passengers lurch.
- **Motion sickness** is driven primarily by **low-frequency oscillation (~0.1–0.5 Hz)** — the stop-and-go, surge-and-brake rhythm of traffic — combined with sensory conflict (inner ear feels motion the eyes don't see). High-frequency road vibration (>2 Hz) is NOT nauseogenic and must be filtered out or the display will be useless noise.

### 3.2 Comfort thresholds (use these as the default band edges; make them constants in one config file)

Longitudinal acceleration magnitude (after filtering, gravity removed):

| Band | |a| (m/s²) | Meaning |
|---|---|---|
| **Green** | 0 – 1.1 | Smooth. Passengers barely notice. Target zone. |
| **Yellow** | 1.1 – 2.5 | Noticeable. Fine occasionally, nauseogenic if rhythmic. |
| **Red** | > 2.5 | Harsh. Hard braking / aggressive launch. |

Jerk magnitude (filtered):

| Band | |j| (m/s³) | Meaning |
|---|---|---|
| **Green** | 0 – 0.9 | Buttery. This is the "perfect green level of jerk." |
| **Yellow** | 0.9 – 2.0 | Abrupt-ish. |
| **Red** | > 2.0 | Lurch. Passengers' heads bob. |

These derive from ISO 2631-1 comfort research and public-transport ride-quality standards (trams/elevators target jerk ≲ 0.9–1.3 m/s³ for standing passengers). Put them in `src/config/comfort.ts` so they're tunable after real-world testing.

### 3.3 The sickness estimate

Don't just show instantaneous values — car sickness accumulates. Compute a rolling **"Queasiness Index" (0–100)** over a 2–3 minute sliding window:

- Integrate time spent in yellow/red acceleration bands, weighted by band severity.
- Add extra weight for **oscillation in the 0.1–0.5 Hz range**: detect sign changes of longitudinal acceleration (surge→brake→surge cycles) with period 2–10 s; each such cycle is heavily nauseogenic and should bump the index far more than a single smooth stop.
- Decay the index exponentially (half-life ~90 s) so smooth driving visibly "heals" the score — this is the conditioning loop for the driver.

Display as a small gauge/label: "Passengers feel: Fine / Slightly queasy / Car sick soon / Pull over."

---

## 4. Motion sensor engineering — THE CRITICAL SECTION

### 4.1 The API

Use the `devicemotion` event on `window`:

```ts
window.addEventListener('devicemotion', (e: DeviceMotionEvent) => {
  // e.acceleration            -> {x, y, z} in m/s², GRAVITY REMOVED (sensor-fused by Core Motion on iOS)
  // e.accelerationIncludingGravity -> raw accelerometer, includes ~9.81 m/s² gravity
  // e.rotationRate            -> {alpha, beta, gamma} in deg/s (gyroscope)
  // e.interval                -> ms between samples (iOS delivers ~16.67 ms ≈ 60 Hz; do NOT hardcode 60 Hz, read this value)
});
```

Rules:

- **Prefer `e.acceleration`** (gravity already removed via sensor fusion). It is reliably populated on iPhones. If it is `null` or all-null components (some Android devices without gyros), fall back to `accelerationIncludingGravity` and remove gravity yourself with a low-pass gravity estimator (see §4.5).
- **Use `e.interval` (or delta of `performance.now()` between events) as `dt`** for the jerk derivative. Never assume a fixed sample rate.
- **Known platform inconsistency:** iOS and Android historically disagree on the **sign convention** of `accelerationIncludingGravity` (iOS reports the reaction force; e.g. z ≈ +9.8 vs −9.8 when flat). Since the app primarily uses magnitudes and a calibrated vehicle frame, this mostly washes out — but if you use raw gravity direction for calibration, detect the sign at calibration time rather than assuming it.
- Coordinate frame is the **device frame**: x = right edge of screen, y = top of screen, z = out of the screen. The phone's orientation in the car is arbitrary → you MUST transform into the vehicle frame (§4.5). Do not assume portrait-mounted.

### 4.2 iOS permission flow — get this exactly right

Since iOS 13, Safari requires an explicit permission request, and it has strict rules:

1. `DeviceMotionEvent.requestPermission()` exists **only on iOS/WebKit**. Feature-detect:

```ts
async function requestMotionPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
  const anyDME = DeviceMotionEvent as any;
  if (typeof anyDME.requestPermission !== 'function') {
    // Android / desktop: no prompt needed; events either fire or they don't.
    return 'granted';
  }
  try {
    const state: string = await anyDME.requestPermission(); // 'granted' | 'denied'
    return state === 'granted' ? 'granted' : 'denied';
  } catch (err) {
    // Thrown NotAllowedError if called WITHOUT a user gesture.
    return 'denied';
  }
}
```

2. **It MUST be called synchronously inside a genuine user-gesture handler** — a `click` or `touchend`. NOT `touchstart` (a documented gotcha: `touchstart` does not count as the qualifying gesture on iOS). NOT after an intervening `await` of unrelated async work. The **Continue button on the intro screen is this gesture** — this is why the product flow (description → Continue → visuals) maps perfectly onto the platform requirement. Wire it as: `onClick={async () => { const p = await requestMotionPermission(); ... }}` with `requestPermission()` as the first async call in the handler.
3. The prompt is shown **once per origin**. If the user denies it, subsequent calls resolve `'denied'` **without showing the prompt again**. Recovery requires the user to clear website data or toggle Settings → Apps → Safari → Advanced (or on older iOS: Settings → Safari → "Motion & Orientation Access"). Build a dedicated "permission denied" screen with these instructions (§7).
4. Permission does not persist forever across sessions on all iOS versions — always run the same Continue-button flow on every page load. If permission was previously granted, `requestPermission()` resolves `'granted'` instantly with no visible prompt, so the UX cost is zero.
5. **Secure context required.** `https://` (Vercel ✓) or `localhost`. A LAN IP over plain http on your phone will silently never fire events — this wastes hours if you don't know it. For local device testing, use a Vercel preview deploy or a tunneling tool with HTTPS.
6. **Also request `DeviceOrientationEvent.requestPermission()` in the same tap** if you use orientation events (you likely won't need them — gravity from the accelerometer is enough — but if you do, both requests must ride the same gesture).
7. **Embedding caveat:** if the app is ever iframed, motion events need `allow="accelerometer; gyroscope"` on the iframe. Not applicable for v1 but note it in code comments.
8. **PWA caveat:** do NOT push "Add to Home Screen" in v1. Home-screen web apps have had motion/wake-lock bugs across iOS versions, and since iOS 17.4 EU users get degraded PWA behavior. Plain Safari tab is the reliable path. A PWA manifest may exist for nice icons, but the flow must never depend on installation.

### 4.3 Event lifecycle & backgrounding

- iOS **stops delivering `devicemotion` when the tab is backgrounded or the screen locks**. Listen to `visibilitychange`: on hide → pause the pipeline, mark data gap; on visible → resume, reset filter state (don't compute a giant fake jerk across the gap).
- Remove listeners on unmount; keep a single global sensor service (module singleton) rather than per-component listeners.
- If no event arrives for > 1 s while visible, show a "sensor stalled" hint (usually means permission was never granted or the device has no accelerometer).

### 4.4 Signal-processing pipeline (implement as pure, unit-testable functions)

Raw 60 Hz accelerometer data in a moving car is dominated by engine/road vibration. Pipeline, per sample:

1. **Ingest** `{ax, ay, az, dt}` from `e.acceleration` + `e.interval`.
2. **Vehicle-frame projection** (§4.5) → longitudinal component `aLong` (+ optional lateral `aLat` for cornering, a v1.1 feature — capture it, display later).
3. **Low-pass filter** `aLong` with a 2nd-order Butterworth (or two cascaded exponential moving averages) with cutoff ≈ **1.5 Hz**. This keeps the 0.1–0.5 Hz sickness band and the shape of real braking events while killing vibration. Implement the EMA form: `y += alpha * (x - y)` with `alpha = dt / (RC + dt)`, `RC = 1/(2π·fc)` — it's dt-robust for the variable sample interval.
4. **Jerk**: `j = (aFilt - aFiltPrev) / dt`, then low-pass jerk itself with cutoff ≈ **1 Hz** (differentiation amplifies noise; unfiltered jerk will strobe the UI).
5. **Downsample for UI**: the bar re-renders inside a `requestAnimationFrame` loop reading the latest filtered values — never `setState` per sensor event (60 Hz React state updates will jank).
6. **Feed the Queasiness Index** accumulator (§3.3) at ~10 Hz.

Keep the whole pipeline in `src/lib/motion/` with zero DOM/React imports so it can be tested with synthetic waveforms (see §10).

### 4.5 Vehicle-frame calibration (making mounting angle irrelevant)

The phone may be mounted at any angle. Two-step calibration screen after permission is granted:

1. **Gravity capture ("Hold still / phone mounted, car stopped — 2 seconds"):** average `accelerationIncludingGravity` over ~2 s → unit gravity vector `ĝ` in device frame. Everything perpendicular to `ĝ` is the horizontal plane. (While stationary, `e.acceleration` ≈ 0, which is also a good stillness check: reject calibration if variance is high.)
2. **Forward-axis capture (option A, preferred): "Now drive off gently."** For the next few seconds, watch the horizontal component of `e.acceleration`; the dominant sustained direction of the first acceleration event is the vehicle's **forward** axis `f̂`. Option B (fallback if the user skips): don't resolve forward vs. lateral; use the **magnitude of horizontal acceleration** for the bar. It loses the accelerate-vs-brake distinction but the comfort math still works. Ship Option B as the zero-friction default and offer A as "Improve accuracy."
3. Thereafter: `aLong = a⃗ · f̂`, `aLat = a⃗ · (ĝ × f̂)`.
4. **Drift handling:** if the phone is re-mounted or the gravity residual (mean of `|a⃗_inclGravity| − 9.81`-consistency check) drifts, surface a "Recalibrate" button. Persist the calibration vectors in `localStorage` keyed by nothing fancy — but always allow one-tap recalibration from the live screen.

---

## 5. UI specification

### 5.1 Screen 1 — Intro / description (route `/`, state `INTRO`)

- App name + one-line promise: "Drive so smooth, nobody gets car sick."
- 3–4 short paragraphs: what it measures (acceleration & jerk via the iPhone's motion sensors), why jerk causes sickness, the two modes (mounted coach / handheld meter), what the colors mean.
- Privacy note: "All processing happens on your phone. No motion data ever leaves the device."
- Safety disclaimer (§1.3).
- Permission preview: "Next, iOS will ask for Motion & Orientation access — that's the accelerometer."
- **Giant Continue button** (min 60 px tall, full width). This tap = the iOS permission gesture. Nothing else on this screen is interactive.

### 5.2 Screen 2 — Calibration (state `CALIBRATING`)

- Big instruction text, progress ring for the 2 s stillness capture, then "drive off gently" prompt with a Skip option (falls back to magnitude mode).

### 5.3 Screen 3 — Live view (state `LIVE`) — the giant bar

- **Layout: one enormous vertical bar occupying ~70% of the viewport height, centered.** Zero (coasting/steady speed) is at the vertical center. Bar fills **upward for acceleration**, **downward for braking**, length ∝ filtered `aLong`, clamped at ±4 m/s².
- **Color zones painted behind/inside the bar:** green core (±1.1 m/s²), yellow (to ±2.5), red beyond. The bar's own fill color matches the zone its tip is in. Transitions animate smoothly (CSS transform scaleY driven from rAF; never animate `height` — layout thrash).
- **Jerk indicator:** a thin halo/glow or border around the bar: calm green glow when jerk is green, pulsing red flash on a red-jerk event ("lurch"). Plus a small numeric readout (m/s³) for nerds, toggleable.
- **Queasiness Index** gauge in a corner with the plain-language label (§3.3).
- **Session stats strip** (small, bottom): time in green %, lurch count, best streak.
- **Mounted/driver mode toggle:** bigger colors, no numbers, optional gentle audio chime when leaving green (Web Audio; unlock the AudioContext inside the same Continue tap, because iOS blocks audio without a gesture too). Audio OFF by default.
- Dark background, huge glanceable elements, `100dvh` layout (not `100vh` — iOS Safari toolbar), `viewport-fit=cover` + safe-area insets, orientation: support portrait and landscape.
- Buttons: Recalibrate, Pause, End trip (→ summary screen with the smoothness score, the conditioning payoff).

### 5.4 Fallback screens

- `UNSUPPORTED` (desktop / no sensor): explain + QR code of `window.location.href` to open on a phone.
- `DENIED`: step-by-step re-enable instructions for iOS (clear website data, or the Motion & Orientation Access toggle on older iOS), with a "Try again" button (re-runs the gesture+request).

---

## 6. Keep the screen awake (mounted mode is useless if the screen sleeps)

```ts
let sentinel: WakeLockSentinel | null = null;
async function keepAwake() {
  if (!('wakeLock' in navigator)) return; // old iOS: show a hint to disable auto-lock manually
  try {
    sentinel = await navigator.wakeLock.request('screen');
  } catch { /* low battery / power saving can reject — fine, degrade silently */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !sentinel?.released) return;
  if (document.visibilityState === 'visible') keepAwake(); // re-acquire: iOS releases the lock on background
});
```

- Supported in iOS Safari **16.4+**; always wrap in try/catch; the lock is **auto-released whenever the page is hidden**, so re-acquire on `visibilitychange`. (Historically broken in installed home-screen web apps until iOS 18.4 — one more reason v1 targets the Safari tab, per §4.2.)
- Request the wake lock when entering `LIVE`, release on `End trip`.

---

## 7. App state machine

```
INTRO --Continue tap--> REQUESTING_PERMISSION
REQUESTING_PERMISSION --granted--> CALIBRATING --done/skip--> LIVE
REQUESTING_PERMISSION --denied--> DENIED --Try again--> REQUESTING_PERMISSION
REQUESTING_PERMISSION --unsupported--> UNSUPPORTED
LIVE --Pause--> PAUSED --Resume--> LIVE
LIVE --End trip--> SUMMARY --New trip--> CALIBRATING
any --visibility hidden--> (pipeline paused, state preserved)
```

Implement as a tiny discriminated-union reducer; no library needed.

---

## 8. Project structure

```
src/
  config/comfort.ts        // all thresholds & filter cutoffs (single source of truth)
  lib/motion/
    sensor.ts              // permission + devicemotion subscription singleton
    filters.ts             // EMA/Butterworth low-pass, dt-aware
    frame.ts               // gravity capture, forward-axis, projections
    jerk.ts                // derivative + smoothing
    queasiness.ts          // sliding-window sickness index
  lib/wakeLock.ts
  lib/audio.ts             // chime, AudioContext unlocked on Continue tap
  state/machine.ts
  screens/{Intro,Calibrate,Live,Denied,Unsupported,Summary}.tsx
  components/{BigBar,JerkHalo,QueasinessGauge,StatsStrip,DebugOverlay}.tsx
```

---

## 9. Debug overlay (build this FIRST — it is how you'll develop everything else)

A `?debug=1` query param reveals an overlay showing: raw `e.acceleration` xyz, `e.interval`, computed dt, event rate (Hz), filtered `aLong`, jerk, gravity vector, forward vector, permission state, wake-lock state, visibility state. Include a **synthetic-signal mode** (`?fake=1`) that replays a canned drive profile (idle → smooth pull → cruise → gentle stop → panic brake → stop-and-go oscillation) so the entire UI is developable on desktop without a car. The fake driver feeds the same pipeline entry point as the real sensor service.

---

## 10. Testing & acceptance criteria

Unit tests (Vitest) on the pure pipeline with synthetic waveforms:
- A 0.3 Hz, ±2 m/s² sine (classic stop-and-go) must land the Queasiness Index in "car sick soon" within 3 minutes.
- A constant 1.0 m/s² step with a 1 s ramp must read green-accel/green-jerk after the ramp.
- A 1.0 m/s² step with a 100 ms ramp must fire a red-jerk event exactly once.
- Filter must attenuate a 10 Hz vibration overlay by > 90%.
- dt-robustness: same waveform sampled at 30 Hz vs 60 Hz produces band classifications that agree > 95% of the time.

Manual device checklist (real iPhone, Vercel preview URL):
- [ ] Intro shows; no permission prompt appears before Continue is tapped.
- [ ] Tapping Continue shows the iOS motion prompt (first run) or proceeds silently (subsequent runs).
- [ ] Deny path shows the DENIED screen with working instructions.
- [ ] Bar responds to shaking/hand-swinging within ~100 ms perceived latency.
- [ ] Rotating/tilting the mounted phone does NOT move the bar after calibration (gravity is fully rejected).
- [ ] Backgrounding and returning does not spike jerk or crash; wake lock re-acquires.
- [ ] Screen stays on for 10+ minutes in LIVE on iOS 16.4+.
- [ ] Android Chrome works with no permission prompt; desktop shows UNSUPPORTED + QR.
- [ ] Real drive test: normal city driving mostly green; deliberate hard brake produces red bar + red-jerk flash.

---

## 11. Deployment (Vercel)

- Static Vite build; `vercel.json` not required beyond defaults. HTTPS is automatic (mandatory for sensors).
- Every PR gets a preview URL → open on iPhone for sensor testing. Add the QR-code component to UNSUPPORTED to make this loop fast.
- Set correct `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` and `theme-color` for the dark UI.

---

## 12. Explicit non-goals for v1

- No GPS/speed fusion, no lateral-cornering coaching UI (capture `aLat`, don't display), no accounts, no data upload, no App Store wrapper, no required PWA install, no vibration feedback (`navigator.vibrate` is unsupported in iOS Safari — don't attempt it).

## 13. Order of implementation

1. Scaffold + state machine + Intro screen + Continue/permission flow (test on a real iPhone immediately).
2. Sensor service + debug overlay + fake-signal driver.
3. Filter/frame/jerk pipeline with unit tests.
4. BigBar + JerkHalo on the fake driver (desktop).
5. Calibration screens; wake lock; Queasiness Index; Summary.
6. Real-car tuning pass on the thresholds in `config/comfort.ts`.
