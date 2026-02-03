
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const session = require('express-session');
const qs = require('querystring');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({ secret: process.env.SESSION_SECRET || 'dev-secret', resave: false, saveUninitialized: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

const GARMIN_AUTH_URL = process.env.GARMIN_AUTH_URL || 'https://connect.garmin.com/oauth/authorize';
const GARMIN_TOKEN_URL = process.env.GARMIN_TOKEN_URL || 'https://connect.garmin.com/oauth/token';
const GARMIN_CLIENT_ID = process.env.GARMIN_CLIENT_ID;
const GARMIN_CLIENT_SECRET = process.env.GARMIN_CLIENT_SECRET;
const GARMIN_REDIRECT_URI = process.env.GARMIN_REDIRECT_URI;
const GARMIN_SCOPE = process.env.GARMIN_SCOPE || 'activity:read';
const GARMIN_ACTIVITIES_URL = process.env.GARMIN_ACTIVITIES_URL || 'https://connect.garmin.com/modern/proxy/activitylist-service/activities';
const MOCK_ACTIVITIES = String(process.env.MOCK_ACTIVITIES || 'false').toLowerCase() === 'true';

function buildAuthUrl(state) {
  const params = {
    response_type: 'code',
    client_id: GARMIN_CLIENT_ID,
    redirect_uri: GARMIN_REDIRECT_URI,
    scope: GARMIN_SCOPE,
    state: state || 'state'
  };
  return GARMIN_AUTH_URL + '?' + qs.stringify(params);
}

// Start OAuth flow
app.get('/auth/start', (req, res) => {
  if (!GARMIN_CLIENT_ID || !GARMIN_REDIRECT_URI) {
    return res.status(400).send('GARMIN_CLIENT_ID and GARMIN_REDIRECT_URI must be set in .env');
  }
  const state = Math.random().toString(36).slice(2);
  req.session.oauthState = state;
  res.redirect(buildAuthUrl(state));
});

// OAuth callback: exchange code for tokens
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing code');
  if (!state || state !== req.session.oauthState) {
    // Warning: state mismatch
  }

  try {
    const body = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: GARMIN_REDIRECT_URI,
      client_id: GARMIN_CLIENT_ID,
      client_secret: GARMIN_CLIENT_SECRET
    };

    const tokenResp = await fetch(GARMIN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: qs.stringify(body)
    });
    const tokenData = await tokenResp.json();
    // store token and expiry
    if (tokenData && tokenData.access_token) {
      const now = Date.now();
      tokenData._obtained_at = now;
      if (tokenData.expires_in) tokenData._expires_at = now + (tokenData.expires_in * 1000);
      req.session.garminToken = tokenData;
    }
    res.send('<html><body><h3>Authenticated with Garmin. You can close this window and return to the dashboard.</h3></body></html>');
  } catch (err) {
    console.error('Token exchange failed', err);
    res.status(500).send('Token exchange failed');
  }
});

// Helper to refresh token if refresh_token available
async function ensureFreshToken(req) {
  const token = req.session.garminToken;
  if (!token) return null;
  const now = Date.now();
  if (token._expires_at && token._expires_at > now) return token;
  if (!token.refresh_token) return token;

  // Attempt refresh
  try {
    const body = {
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: GARMIN_CLIENT_ID,
      client_secret: GARMIN_CLIENT_SECRET
    };
    const resp = await fetch(GARMIN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: qs.stringify(body)
    });
    const newToken = await resp.json();
    if (newToken && newToken.access_token) {
      const now2 = Date.now();
      newToken._obtained_at = now2;
      if (newToken.expires_in) newToken._expires_at = now2 + (newToken.expires_in * 1000);
      // keep refresh token if not returned
      if (!newToken.refresh_token && token.refresh_token) newToken.refresh_token = token.refresh_token;
      req.session.garminToken = newToken;
      return newToken;
    }
    return token;
  } catch (e) {
    console.error('Refresh token failed', e);
    return token;
  }
}

// Mock activities payload for offline testing
const MOCK_DATA = [
  { id: 1, activityName: 'Morning Run', activityType: { typeKey: 'running' }, startTimeLocal: '2026-02-01T06:45:00', distance: 5000 },
  { id: 2, activityName: 'Lunch Ride', activityType: { typeKey: 'cycling' }, startTimeLocal: '2026-01-31T12:10:00', distance: 15000 },
  { id: 3, activityName: 'Evening Walk', activityType: { typeKey: 'walking' }, startTimeLocal: '2026-01-30T18:20:00', distance: 3000 }
];

// Proxy endpoint to fetch activities (supports mock via ?mock=1 or env MOCK_ACTIVITIES=true)
app.get('/api/activities', async (req, res) => {
  const useMock = MOCK_ACTIVITIES || req.query.mock === '1' || req.query.mock === 'true';
  if (useMock) return res.json(MOCK_DATA);

  let token = req.session.garminToken;
  if (!token) return res.status(401).json({ error: 'Not authenticated. Start /auth/start to authenticate.' });

  token = await ensureFreshToken(req);
  if (!token || !token.access_token) return res.status(401).json({ error: 'No access token available.' });

  try {
    const r = await fetch(GARMIN_ACTIVITIES_URL, {
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Accept': 'application/json'
      }
    });
    if (!r.ok) {
      const text = await r.text();
      console.error('Activities fetch non-ok:', r.status, text);
      return res.status(502).json({ error: 'Failed to fetch activities from Garmin', details: text });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('Proxy fetch error', err);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Client-side logging endpoint: receive logs from the browser when DevTools is blocked
app.post('/client-log', (req, res) => {
  try {
    const body = req.body || {};
    const level = (body.level || 'log').toLowerCase();
    const message = body.message || '';
    const meta = body.meta || null;
    const out = `[CLIENT ${level.toUpperCase()}] ${message}` + (meta ? ` ${JSON.stringify(meta)}` : '');
    if (level === 'error' || level === 'warn') console.error(out);
    else console.log(out);
  } catch (e) {
    console.error('Failed to handle client log', e);
  }
  res.sendStatus(204);
});

// Respond to Chrome/extension probe to avoid noisy 404 logs
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.type('application/json').send('{}');
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
