# Guardian AI

Guardian AI is a fraud-detection prototype that uses live behavioral biometrics, device context, geolocation, and transaction signals to assess transfer risk in real time. It includes an executive dashboard, operations monitoring, manual review, AI sensitivity controls, and a client transfer flow with prototype step-up verification.

## Features

- Real-time transfer risk scoring with AI-assisted decisions
- Client-side capture of typing rhythm, device context, motion, and geolocation
- Ops dashboard for live event monitoring
- Manual review workspace with approve, risked, and freeze actions
- AI sensitivity page driven by live event outcomes
- Prototype face-authentication step-up flow for flagged transfers

## Tech Stack

- React
- TypeScript
- Vite
- React Router
- Recharts
- Motion
- Lucide React

## Getting Started

### Prerequisites

- Node.js 18+ recommended
- npm

### Install

```bash
npm install
```

### Run Locally

```bash
npm run dev
```

Vite will start a local development server, usually at:

```text
http://localhost:5173
```

### Production Build

```bash
npm run build
```

## Environment Configuration

The app can use a custom backend API base URL through:

```text
VITE_GUARDIAN_API_BASE
```

Example:

```bash
VITE_GUARDIAN_API_BASE=https://your-api-gateway-url/prod npm run dev
```

If this variable is not provided, the app falls back to the default API URL defined in [src/app/guardianApi.ts](/Users/jensenjianxi/Downloads/Guardian-AI-main/src/app/guardianApi.ts).

## How To Use

After starting the app, use these routes from the sidebar:

- `/executive`
  Platform overview with live metrics, AI confidence, and risk summaries.
- `/ops`
  Live operations command center for event stream monitoring and score breakdowns.
- `/manual-review`
  Investigation workspace where analysts can review cases and patch decisions.
- `/settings`
  AI sensitivity page showing live recommendation, review pressure, and confidence trends.
- `/architecture`
  System architecture overview page.
- `/client`
  Client-facing transfer flow for submitting transfers and testing fraud checks.

## Demo Flow

To demonstrate the prototype:

1. Open `/client`.
2. Start a new transfer.
3. Enter a 12-digit recipient account and transfer amount.
4. Type the verification phrase to capture live typing behavior.
5. Allow motion and location access if prompted.
6. Submit the transfer.
7. If the transfer is flagged, complete the prototype `Face Authentication` step.
8. Open `/ops` or `/manual-review` to inspect the resulting event.

## Backend Expectations

This frontend expects a backend with:

- `POST /ingest`
  Accepts a transfer payload and returns a scored event.
- `GET /events`
  Returns stored transaction events.
- `PATCH /events`
  Updates review status for an event.
- `DELETE /events`
  Clears stored events for demo reset.

## Notes

- This is a prototype and includes simulated verification UX such as the face-authentication popup.
- The current system is location-aware and can surface location-distance mismatch style signals, but full historical impossible-travel checking depends on backend support.
- Before publishing publicly, remove any secrets, private URLs, or environment-specific credentials.

# GuardianAI
Guardian AI is a fraud-detection prototype that uses live behavioral biometrics, device context, geolocation, and transaction signals to assess transfer risk in real time and support step-up verification and analyst review.
