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

## Live Demo

Hosted website:

```text
https://dywaa3h3w49av.cloudfront.net
```

The hosted version gives access to the full prototype experience, including:

- Executive overview
- Guardian Ops command center
- Manual review workspace
- AI sensitivity controls
- System architecture page
- Client transfer flow with prototype face authentication

## How To Use

Open the hosted website and use these routes from the sidebar:

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

## Local Development

If you want to run the project locally:

```bash
npm install
npm run dev
```

Optional API override:

```bash
VITE_GUARDIAN_API_BASE=https://your-api-gateway-url/prod npm run dev
```

## Notes

- This is a prototype and includes simulated verification UX such as the face-authentication popup.
- The current system is location-aware and can surface location-distance mismatch style signals, but full historical impossible-travel checking depends on backend support.
- Before publishing publicly, remove any secrets, private URLs, or environment-specific credentials.
