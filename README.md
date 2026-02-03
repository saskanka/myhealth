# Garmin Activities Proxy Demo

This demo shows how to fetch your Garmin activities via a local proxy and display them inside a modal in the frontend.

WARNING: Garmin's APIs and OAuth endpoints may differ; this project provides a starting scaffold you must adapt with real Garmin OAuth details.

Quick start

1. Copy `.env.example` to `.env` and fill `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, and `GARMIN_REDIRECT_URI`.
2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. Open `http://localhost:3000/index.html` in your browser and click the `Exercise` button.

Notes
- The `/auth/start` endpoint redirects to Garmin's authorization page. After authorizing, Garmin should redirect back to `/auth/callback` which exchanges the code for a token and stores it in the session.
- The `/api/activities` endpoint proxies the activities request using the stored token.
- You may need to adapt endpoints and parameters to match Garmin's official developer documentation.

Mock / offline testing

- You can return a built-in mock activities JSON by either:
	- Setting `MOCK_ACTIVITIES=true` in your `.env`, or
	- Calling the proxy with `GET /api/activities?mock=1`.

This makes it easy to develop the frontend without valid Garmin credentials.

Complete OAuth setup notes

- Register an application with Garmin (if available) to obtain `GARMIN_CLIENT_ID` and `GARMIN_CLIENT_SECRET` and set the redirect URI to `http://localhost:3000/auth/callback` (or your chosen host).
- Update `.env` with `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `GARMIN_REDIRECT_URI`, and (optionally) `GARMIN_AUTH_URL` and `GARMIN_TOKEN_URL` if Garmin's endpoints differ from defaults.
- Start the server, click `Sign in to Garmin` in the dashboard modal, complete authorization, then use `Refresh` to fetch activities.
