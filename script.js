(async function() {
  // Load modal fragment into the page if a placeholder exists.
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot) {
    try {
      const resp = await fetch('/garmin-modal.html');
      if (resp.ok) modalRoot.innerHTML = await resp.text();
    } catch (e) {
      console.warn('Failed to load modal fragment', e);
    }
  }

  const EXERCISE_URL = 'https://connect.garmin.com/app/activities';
  const btn = document.getElementById('exercise-btn');
  // Client-side mock data so "Use mock data" works without the backend
  const CLIENT_MOCK_DATA = [
    { id: 1, activityName: 'Morning Run', activityType: { typeKey: 'running' }, startTimeLocal: '2026-02-01T06:45:00', distance: 5000 },
    { id: 2, activityName: 'Lunch Ride', activityType: { typeKey: 'cycling' }, startTimeLocal: '2026-01-31T12:10:00', distance: 15000 },
    { id: 3, activityName: 'Evening Walk', activityType: { typeKey: 'walking' }, startTimeLocal: '2026-01-30T18:20:00', distance: 3000 }
  ];
  let modal = document.getElementById('garmin-modal');
  let closeBtn = document.getElementById('close-modal');
  let openNewTabBtn = document.getElementById('open-new-tab');
  let authBtn = document.getElementById('auth-start');
  let refreshBtn = document.getElementById('refresh-activities');
  let activitiesList = document.getElementById('activities-list');
  let useMockBtn = document.getElementById('use-mock');
  const navBtn = document.querySelector('.nav-btn');
  let modalHandlersAttached = false;
  const useMockGlobal = document.getElementById('use-mock-global');

  // --- In-page debug panel and remote reporting (for environments that block DevTools) ---
  function createDebugPanel() {
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '8px',
      right: '8px',
      width: '360px',
      maxHeight: '240px',
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      fontSize: '12px',
      padding: '8px',
      overflow: 'auto',
      zIndex: 99999,
      borderRadius: '6px',
      display: 'block'
    });
    const header = document.createElement('div');
    header.style.marginBottom = '6px';
    header.innerText = 'Debug (no DevTools)';
    const toggle = document.createElement('button');
    toggle.innerText = 'Show';
    Object.assign(toggle.style, { position: 'fixed', right: '8px', bottom: '256px', zIndex: 99999 });
    toggle.addEventListener('click', () => {
      if (panel.style.display === 'none') { panel.style.display = 'block'; toggle.innerText = 'Hide'; }
      else { panel.style.display = 'none'; toggle.innerText = 'Show'; }
    });
    document.body.appendChild(toggle);
    // show panel by default
    panel.style.display = 'block';
    toggle.innerText = 'Hide';
    panel.appendChild(header);
    document.body.appendChild(panel);
    return { panel, append: (msg) => { const el = document.createElement('div'); el.textContent = msg; panel.appendChild(el); panel.scrollTop = panel.scrollHeight; } };
  }

  const debug = (typeof document !== 'undefined') ? createDebugPanel() : null;

  function sendClientLog(level, message, meta) {
    try {
      fetch('/client-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, message, meta })
      }).catch(() => {});
    } catch (e) {}
    if (debug) debug.append(`[${level}] ${message}` + (meta ? ' ' + JSON.stringify(meta) : ''));
  }

  // Wrap console methods to forward to server as well
  try {
    const _log = console.log.bind(console);
    const _error = console.error.bind(console);
    console.log = function(...args) { _log(...args); try { sendClientLog('log', args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); } catch(e){} };
    console.error = function(...args) { _error(...args); try { sendClientLog('error', args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); } catch(e){} };
  } catch (e) {}

  window.addEventListener('error', (ev) => {
    try {
      sendClientLog('error', ev.message || 'window.error', { filename: ev.filename, lineno: ev.lineno, colno: ev.colno });
    } catch (e) {}
  });
  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const reason = ev.reason && ev.reason.message ? ev.reason.message : JSON.stringify(ev.reason);
      sendClientLog('error', 'unhandledrejection: ' + reason);
    } catch (e) {}
  });

  // --- end debug/reporting ---

  if (!btn) return;

  function openInNewTab() {
    window.open(EXERCISE_URL, '_blank', 'noopener');
  }

  function setNavActive(active) {
    if (navBtn) {
      if (active) navBtn.classList.add('active');
      else navBtn.classList.remove('active');
    }
  }

  async function fetchActivities(options = {}) {
    if (!activitiesList) return;
    activitiesList.textContent = 'Loading activities...';

    // If caller requested mock data, render the client-side mock without a network call.
    if (options.mock) {
      // slight delay to mimic network
      setTimeout(() => renderActivities(CLIENT_MOCK_DATA), 150);
      return;
    }

    try {
      const url = '/api/activities';
      const res = await fetch(url);
      if (res.status === 401) {
        activitiesList.innerHTML = '<div class="not-auth">Not signed in. Click "Sign in to Garmin".</div>';
        return;
      }
      const data = await res.json();
      renderActivities(data);
    } catch (err) {
      console.error(err);
      activitiesList.textContent = 'Failed to load activities.';
    }
  }

  function renderActivities(data) {
    if (!activitiesList) return;
    if (!data || !Array.isArray(data) || data.length === 0) {
      activitiesList.innerHTML = '<div class="no-activities">No activities found.</div>';
      return;
    }
    const html = data.map(act => {
      const name = act.activityName || act.name || 'Activity';
      const type = act.activityType ? act.activityType.typeKey : (act.type || 'unknown');
      const time = act.startTimeLocal || act.startTime || '';
      const distance = act.distance ? (Math.round(act.distance) + ' m') : '';
      return `
        <div class="activity-item">
          <div class="activity-icon">🏃</div>
          <div class="activity-meta">
            <div class="activity-name">${escapeHtml(name)}</div>
            <div class="activity-sub">${type} • ${time} • ${distance}</div>
          </div>
        </div>`;
    }).join('\n');
    activitiesList.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
  }

  async function ensureModalLoaded() {
    if (modal) return true;
    const root = document.getElementById('modal-root');
    if (!root) return false;
    try {
      const resp = await fetch('/garmin-modal.html');
      if (!resp.ok) return false;
      root.innerHTML = await resp.text();
      // re-query elements
      modal = document.getElementById('garmin-modal');
      closeBtn = document.getElementById('close-modal');
      openNewTabBtn = document.getElementById('open-new-tab');
      authBtn = document.getElementById('auth-start');
      refreshBtn = document.getElementById('refresh-activities');
      activitiesList = document.getElementById('activities-list');
      useMockBtn = document.getElementById('use-mock');

      if (closeBtn && typeof closeBtn.addEventListener === 'function') closeBtn.addEventListener('click', hideModal);
      if (openNewTabBtn && typeof openNewTabBtn.addEventListener === 'function') openNewTabBtn.addEventListener('click', (e) => { e.preventDefault(); openInNewTab(); });
      if (authBtn && typeof authBtn.addEventListener === 'function') authBtn.addEventListener('click', (e) => { e.preventDefault(); window.open('/auth/start', '_blank'); });
      if (refreshBtn && typeof refreshBtn.addEventListener === 'function') refreshBtn.addEventListener('click', (e) => { e.preventDefault(); fetchActivities(); });
      if (useMockBtn && typeof useMockBtn.addEventListener === 'function') useMockBtn.addEventListener('click', (e) => { e.preventDefault(); fetchActivities({ mock: true }); });

      if (modal && typeof modal.addEventListener === 'function') modal.addEventListener('click', (ev) => { if (ev.target === modal) hideModal(); });
      // Expose hide function for inline onclick fallback in the fragment
      try { window.__hideModal = hideModal; } catch (e) {}
      // Ensure modal overlay is on top so close button receives clicks
      try { if (modal && modal.style) modal.style.zIndex = 100000; } catch (e) {}

      // Attach a delegated listener once to reliably handle the close button
      if (!modalHandlersAttached) {
        // non-capturing delegated listener
        document.addEventListener('click', (ev) => {
          try {
            const t = ev.target;
            if (!t) return;
            if (t.id === 'close-modal' || (t.closest && t.closest('#close-modal'))) {
              hideModal();
            }
          } catch (e) {}
        });
        // capturing delegated listener (catches events even if propagation is stopped)
        document.addEventListener('click', (ev) => {
          try {
            const t = ev.target;
            if (!t) return;
            if (t.id === 'close-modal' || (t.closest && t.closest('#close-modal'))) {
              hideModal();
            }
          } catch (e) {}
        }, true);

        // global Escape key handler to close modal
        document.addEventListener('keydown', (ev) => {
          try { if (ev.key === 'Escape' || ev.key === 'Esc') hideModal(); } catch(e){}
        });

        modalHandlersAttached = true;
      }

      return !!modal;
    } catch (e) {
      console.warn('Failed to load modal fragment', e);
      return false;
    }
  }

  async function showModal() {
    const ok = await ensureModalLoaded();
    if (!ok) {
      // fallback: open Garmin in new tab
      openInNewTab();
      return;
    }

    // Ensure `modal` exists before touching DOM
    if (!modal) {
      openInNewTab();
      return;
    }

    // Open modal and fetch activities from local proxy
    if (modal.classList) modal.classList.remove('hidden');
    setNavActive(true);
    fetchActivities();

    // Optional iframe fallback: only run if an iframe with id 'garmin-iframe' exists.
    const iframe = document.getElementById('garmin-iframe');
    if (!iframe) return;

    // If iframe loads, clear fallback. If embedding is blocked, fallback will open new tab.
    let fallbackTimer = setTimeout(() => {
      try {
        const href = iframe.contentWindow.location.href;
        if (!href || href === 'about:blank') {
          modal.classList.add('hidden');
          openInNewTab();
        }
      } catch (e) {
        // Cross-origin access denied usually means content loaded; do nothing.
      }
    }, 3500);

    function onLoadHandler() {
      clearTimeout(fallbackTimer);
      iframe.removeEventListener('load', onLoadHandler);
    }

    if (iframe && typeof iframe.addEventListener === 'function') iframe.addEventListener('load', onLoadHandler);
    if (modal) modal.dataset.fallbackTimer = fallbackTimer;
  }

  // Global mock button: ensure modal loaded and show mock activities
  if (useMockGlobal && typeof useMockGlobal.addEventListener === 'function') {
    useMockGlobal.addEventListener('click', async (e) => {
      e.preventDefault();
      const ok = await ensureModalLoaded();
      if (!ok) {
        openInNewTab();
        return;
      }
      if (modal && modal.classList) modal.classList.remove('hidden');
      setNavActive(true);
      fetchActivities({ mock: true });
    });
  }

  function hideModal() {
    modal.classList.add('hidden');
    const iframe = document.getElementById('garmin-iframe');
    try { if (iframe) iframe.src = 'about:blank'; } catch(e) {}
    const t = modal.dataset.fallbackTimer;
    if (t) clearTimeout(t);
    setNavActive(false);
  }

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    await showModal();
  });
})();
