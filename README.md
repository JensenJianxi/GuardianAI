# Guardian AI

Guardian AI is a fraud-detection prototype for high-risk transfer monitoring. The app combines behavioral biometrics, device context, motion capture, geolocation, and transaction heuristics to score transfers in real time and route them into analyst workflows.
Checkout the Project Walkthrough Demo Video: https://drive.google.com/file/d/1zsANNOhbbtlngqYldFnlxB2hvVxgU4A0/view?usp=share_link

The project includes:
- A client transfer experience for submitting live transfer events
- An executive overview dashboard
- An operations command center
- A manual review workspace
- An AI sensitivity page
- A system architecture page
- An AWS Lambda backend backed by DynamoDB and S3

## Current Hosted URLs

These URLs are the ones currently wired into the repo configuration as of April 13, 2026.

- Hosted frontend: `https://main.d1eevjsp6yi7f3.amplifyapp.com`
- Default backend API base: `https://r3izz4ipwosvopk43nsq2r4ovy0iyquk.lambda-url.ap-southeast-2.on.aws`

Useful hosted routes:

- `/` or `/executive` - Executive Overview
- `/ops` - Guardian Ops Command Center
- `/manual-review` - Manual Review Workspace
- `/settings` - AI Sensitivity
- `/architecture` - System Architecture
- `/client` - Client Transfers

## Demo Flow

If you want to demonstrate the prototype end to end:

1. Open `https://main.d1eevjsp6yi7f3.amplifyapp.com/client`
2. Click `New Secure Transfer`
3. Enter a 12-digit recipient account number
4. Enter a transfer amount
5. Type the verification phrase shown in the modal
6. Allow motion and location access if the browser prompts you
7. Submit the transfer
8. If the transfer is flagged, complete the prototype face-auth step
9. Open `/ops` or `/manual-review` to inspect the new event

## What Each Page Does

### `/client`

Client transfer experience for creating live events. It captures:

- Recipient and transfer amount
- Typing rhythm
- Device profile
- Motion signature
- Geolocation

The frontend submits that payload to `POST /ingest`.

### `/executive`

High-level platform view for:

- Approval, review, and freeze trends
- Confidence summaries
- Geospatial insight
- Live event distribution

### `/ops`

Operations console for:

- Reviewing scored event streams
- Inspecting device and location metadata
- Understanding BMS, GMRS, GTRS, and unified risk

### `/manual-review`

Analyst workflow for:

- Investigating flagged cases
- Recording review decisions
- Comparing backend and reviewer outcomes

### `/settings`

Sensitivity page driven by live events. It helps explain:

- Review pressure
- Confidence compression
- Repeated-target concentration
- Suggested sensitivity band

### `/architecture`

Visual overview of the intended platform architecture and AWS service layout.

## Backend API

The frontend expects the following routes from the backend:

- `GET /health`
  Returns a basic backend health payload.

- `POST /ingest`
  Accepts a transfer payload, scores it, stores it in DynamoDB, and returns the scored event.

- `GET /events`
  Returns all stored events.

- `PATCH /events`
  Updates review metadata for an event.

- `DELETE /events`
  Clears all stored events for demo reset.

- `GET /models`
  Lists model artifacts from S3.

## Backend Location

The active Lambda handler lives here:

- [Event Handler Lambda Backend/Backend_Event-handler/lambda_function.py](/Users/jensenjianxi/Downloads/GuardianAI-main/Event%20Handler%20Lambda%20Backend/Backend_Event-handler/lambda_function.py)

## Backend Environment Variables

The Lambda handler supports these environment variables:

- `TABLE_NAME`
  Default: `guardian_ai_events`

- `BUCKET_NAME`
  Default: `aiguardianmodels`

- `MODEL_PREFIX`
  Default: `guardian_deploy/`

- `FRONTEND_ORIGIN`
  Default: `https://main.d1eevjsp6yi7f3.amplifyapp.com`

## Local Development

### Frontend

Install dependencies and start Vite:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Override the backend URL locally if needed:

```bash
VITE_GUARDIAN_API_BASE=https://your-backend-url npm run dev
```

By default, the app uses the hosted Lambda Function URL from [src/app/guardianApi.ts](/Users/jensenjianxi/Downloads/GuardianAI-main/src/app/guardianApi.ts).

### Backend

This repo does not include a full local Lambda emulator setup. The usual workflow is:

1. Edit [lambda_function.py](/Users/jensenjianxi/Downloads/GuardianAI-main/Event%20Handler%20Lambda%20Backend/Backend_Event-handler/lambda_function.py)
2. Upload or redeploy that handler to the AWS Lambda function
3. Confirm the Lambda Function URL CORS settings
4. Test from the hosted frontend or from local Vite using `VITE_GUARDIAN_API_BASE`

## AWS Hosting Notes

### Amplify SPA Rewrite

Because the frontend uses React Router, Amplify Hosting needs a SPA rewrite so routes like `/client` and `/ops` do not return document-level 404s.

Recommended Amplify rewrite:

```json
[
  {
    "source": "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>",
    "status": "200",
    "target": "/index.html",
    "condition": null
  }
]
```

### Lambda Function URL CORS

For the current frontend/backend setup, the Lambda Function URL should allow:

- Origin: `https://main.d1eevjsp6yi7f3.amplifyapp.com`
- Headers: `content-type`
- Methods: `GET`, `POST`, `PATCH`, `DELETE`

Important:

- Do not manually add `Access-Control-Allow-Origin` headers inside the Lambda response if Function URL CORS is enabled
- AWS Function URL CORS handles the preflight response automatically

## Project Structure

Key paths in this repo:

- [src/app/routes.ts](/Users/jensenjianxi/Downloads/GuardianAI-main/src/app/routes.ts) - frontend route definitions
- [src/app/guardianApi.ts](/Users/jensenjianxi/Downloads/GuardianAI-main/src/app/guardianApi.ts) - frontend API client and default backend URL
- [src/app/pages/ClientTransfers.tsx](/Users/jensenjianxi/Downloads/GuardianAI-main/src/app/pages/ClientTransfers.tsx) - client transfer flow
- [src/app/pages/OpsCommandCenter.tsx](/Users/jensenjianxi/Downloads/GuardianAI-main/src/app/pages/OpsCommandCenter.tsx) - ops dashboard
- [src/app/pages/ManualReviewWorkspace.tsx](/Users/jensenjianxi/Downloads/GuardianAI-main/src/app/pages/ManualReviewWorkspace.tsx) - manual review UI
- [src/app/pages/ExecutiveOverview.tsx](/Users/jensenjianxi/Downloads/GuardianAI-main/src/app/pages/ExecutiveOverview.tsx) - executive dashboard
- [src/app/pages/SensitivityControl.tsx](/Users/jensenjianxi/Downloads/GuardianAI-main/src/app/pages/SensitivityControl.tsx) - sensitivity page
- [Event Handler Lambda Backend/Backend_Event-handler/lambda_function.py](/Users/jensenjianxi/Downloads/GuardianAI-main/Event%20Handler%20Lambda%20Backend/Backend_Event-handler/lambda_function.py) - backend Lambda handler

## Troubleshooting

### `/client` or another route shows a 404

Amplify is missing the SPA `200` rewrite to `/index.html`.

### Browser shows a CORS error for the Lambda Function URL

Check both of these:

- Lambda Function URL CORS has the correct allowed origin and methods
- The deployed Lambda code is not also manually returning duplicate `Access-Control-Allow-*` headers

### `POST /ingest` fails

Check:

- The Lambda Function URL allows `POST`
- The deployed Lambda includes the `POST /ingest` route
- DynamoDB permissions and table name are correct

### Events do not appear in dashboards

Check:

- The frontend is pointing at the intended API base
- `POST /ingest` is writing to the expected DynamoDB table
- `GET /events` returns data from the deployed backend

## Notes

- This is a prototype, not a production fraud engine
- Some user-facing security steps are simulated for demo purposes
- Risk scoring is heuristic and demo-oriented
- Before public release, remove any sensitive URLs, credentials, or project-specific private references
