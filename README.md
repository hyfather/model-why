# SmoothDrive

A mobile web app that measures acceleration and jerk to coach smoother driving. All sensor processing stays on-device.

## Run

```bash
npm install
npm run dev
```

Open `/?fake=1&debug=1` to exercise the complete sensor pipeline on desktop. Real iPhone motion access requires HTTPS (a Vercel preview is the easiest route).

## Verify

```bash
npm test
npm run build
```
