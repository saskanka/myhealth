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

  // Ensure inline close onclick always has a safe fallback even before the
  // main `hideModal` function is attached. This covers cases where the
  // fragment includes `onclick="(window.__hideModal && window.__hideModal())"`.
  window.__hideModal = function() {
    try {
      const m = document.getElementById('garmin-modal');
      if (m && m.classList) m.classList.add('hidden');
    } catch (e) {}
  };

  // Attach close handlers when the modal fragment is inserted. Use a
  // MutationObserver so we reliably bind even if the fragment is injected
  // before the rest of the script runs or later via ensureModalLoaded().
  try {
    const moTarget = modalRoot || document.body;
    const mo = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (!(node && node.querySelector)) continue;
          const close = node.querySelector && node.querySelector('#close-modal');
          if (close) {
            try { close.addEventListener('click', () => { try { window.__hideModal(); } catch(e){} }); } catch(e){}
          }
        }
      }
    });
    mo.observe(moTarget, { childList: true, subtree: true });
  } catch (e) {}

  const EXERCISE_URL = 'https://connect.garmin.com/app/activities';
  const btn = document.getElementById('exercise-btn');

  // Ensure external mock data is loaded. `mock-data.js` defines
  // `window.CLIENT_MOCK_DATA` and `window._mapCanvasHtml`.
  if (typeof window.CLIENT_MOCK_DATA === 'undefined') {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/mock-data.js';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('mock-data.js failed to load'));
        document.head.appendChild(s);
      });
    } catch (e) {
      console.warn('Failed to load mock-data.js', e);
    }
  }

  // Global mock toggle flag (false = use real Garmin data)
  if (typeof window.__USE_MOCK === 'undefined') window.__USE_MOCK = false;

  let lastActivities = [];
  // If you paste the activity detail DOM from DevTools into this string,
  // the renderer will attempt to extract canvas width/height and translate3d
  // so the SVG map lines up with the original Leaflet canvas.
  // (This value is intentionally editable for local debugging.)
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

    // Decide whether to use mock data: explicit option overrides global flag
    const useMock = (options && options.mock === true) || (window && window.__USE_MOCK === true);

    // If using mock data, render the client-side mock without a network call.
    if (useMock) {
      try {
        setTimeout(() => renderActivities(window.CLIENT_MOCK_DATA || []), 150);
      } catch (e) { console.warn('render mock failed', e); activitiesList.textContent = 'Failed to load mock activities.'; }
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
    // remove any active leaflet details map
    try { if (typeof tearDownLeafletMap === 'function') tearDownLeafletMap(); } catch(e){}
    if (!activitiesList) return;
    if (!data || !Array.isArray(data) || data.length === 0) {
      activitiesList.innerHTML = '<div class="no-activities">No activities found.</div>';
      return;
    }
    // keep a reference for detail rendering
    lastActivities = data;
    const html = data.map(act => {
      const name = act.activityName || act.name || 'Activity';
      const type = act.activityType ? act.activityType.typeKey : (act.type || 'unknown');
      const time = act.startTimeLocal || act.startTime || '';
      const distance = act.distance ? (Math.round(act.distance) + ' m') : '';
      return `
        <div class="activity-item" data-activity-id="${act.id}" style="cursor:pointer">
          <div class="activity-icon">🏃</div>
          <div class="activity-meta">
            <div class="activity-name">${escapeHtml(name)}</div>
            <div class="activity-sub">${type} • ${time} • ${distance}</div>
          </div>
        </div>`;
    }).join('\n');
    activitiesList.innerHTML = html;
  }

  // Render a simple activity details view using the passed activity object.
  function renderActivityDetails(act) {
    if (!activitiesList) return;
    const name = act.activityName || act.name || 'Activity';
    const type = act.activityType ? act.activityType.typeKey : (act.type || 'unknown');
    const time = act.startTimeLocal || act.startTime || '';
    const distance = act.distance ? (Math.round(act.distance) + ' m') : '';
    // format metrics
    const km = (act.distance && !isNaN(act.distance)) ? (act.distance / 1000).toFixed(2) + ' km' : distance;
    function fmtTime(sec) {
      if (!sec && sec !== 0) return '';
      const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.floor(sec % 60);
      return (h > 0 ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    function fmtPace(secPerKm) { if (!secPerKm && secPerKm !== 0) return ''; const m = Math.floor(secPerKm / 60); const s = Math.floor(secPerKm % 60); return m + ':' + String(s).padStart(2,'0') + ' /km'; }
    const dispTime = fmtTime(act.durationSeconds || 0);
    const dispPace = fmtPace(act.avgPaceSecPerKm || 0);
    const dispAscent = (act.ascentMeters || 0) + ' m';
    const dispCalories = (act.calories || 0);

    const detailsHtml = `
      <div class="activity-details" style="font-family:Segoe UI,Arial,sans-serif;">
        <button id="activity-back" class="btn-link" style="margin-bottom:8px;">← Back</button>
        <h2 style="margin:4px 0 8px 0; font-weight:600;">${escapeHtml(name)}</h2>
        <div style="display:flex;gap:20px;align-items:flex-start;">
          <div style="flex:1;min-width:360px;">
            <div style="display:flex;gap:18px;margin-bottom:12px;">
              <div style="text-align:center;">
                <div style="font-size:28px;font-weight:700;">${km}</div>
                <div style="color:#666;font-size:12px">Distance</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:28px;font-weight:700;">${dispTime}</div>
                <div style="color:#666;font-size:12px">Time</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:28px;font-weight:700;">${dispPace}</div>
                <div style="color:#666;font-size:12px">Avg Pace</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:28px;font-weight:700;">${dispAscent}</div>
                <div style="color:#666;font-size:12px">Ascent</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:28px;font-weight:700;">${dispCalories}</div>
                <div style="color:#666;font-size:12px">Calories</div>
              </div>
            </div>
            <div id="details-map" class="details-map" style="width:640px;height:320px;border-radius:8px;overflow:hidden;position:relative;background:#f4f4f4"></div>
          </div>
          <div style="width:320px;">
            <div style="background:#fff;border-radius:6px;padding:12px;border:1px solid #eee"> 
              <strong>Photos</strong>
              <div style="margin-top:8px;color:#777">Click to add photos to your activity.</div>
            </div>
            <div style="margin-top:12px;background:#fff;border-radius:6px;padding:12px;border:1px solid #eee"> 
              <strong>Notes</strong>
              <textarea style="width:100%;height:80px;margin-top:8px;border:1px solid #ddd;padding:8px;border-radius:4px" placeholder="How was your activity?"></textarea>
            </div>
          </div>
        </div>
      </div>`;
    activitiesList.innerHTML = detailsHtml;
    // render map: prefer Leaflet if available, otherwise fallback to SVG renderer
    const mapContainer = document.getElementById('details-map');
    if (mapContainer) {
      try {
        if (window && window.L) {
          renderLeafletMap(act, mapContainer);
        } else {
          mapContainer.innerHTML = renderMapSVG(act, 640, 320);
          // add play overlay for SVG fallback
          const play = document.createElement('button');
          play.innerHTML = '▶';
          Object.assign(play.style, { position: 'absolute', left: '16px', bottom: '16px', background: '#fff', border: 'none', borderRadius: '28px', width: '44px', height: '44px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', cursor: 'pointer' });
          play.title = 'Play activity (mock)';
          play.addEventListener('click', () => { sendClientLog('log', 'Play clicked for activity ' + act.id); });
          mapContainer.appendChild(play);
        }
      } catch (e) { mapContainer.innerHTML = renderMapSVG(act, 640, 320); }
    }
    const back = document.getElementById('activity-back');
    if (back) back.addEventListener('click', (e) => { e.preventDefault(); renderActivities(lastActivities); });
  }

  // Delegate clicks on activity items to show details
  try {
    if (activitiesList && typeof activitiesList.addEventListener === 'function') {
      activitiesList.addEventListener('click', (ev) => {
        try {
          const el = ev.target.closest && ev.target.closest('.activity-item');
          if (!el) return;
          const id = el.getAttribute('data-activity-id');
          if (!id) return;
          const act = lastActivities.find(a => String(a.id) === String(id));
          if (!act) return;
          renderActivityDetails(act);
        } catch (e) {}
      });
    }
  } catch (e) {}

  // Render a small inline SVG map from `act.coords` (array of [lat,lon])
  // renderMapSVG: draw SVG route. If `canvasInfo` is provided (string or object)
  // it can contain a Leaflet canvas outerHTML snippet to extract display size
  // and translate3d offsets so the SVG matches the same layout.
  function renderMapSVG(act, w = 480, h = 220, canvasInfo) {
    try {
      if (!act || !Array.isArray(act.coords) || act.coords.length === 0) return '<div style="padding:12px;background:#f4f4f4;border-radius:6px;">No map data</div>';
      const pts = act.coords.map(c => ({ lat: Number(c[0]), lon: Number(c[1]) }));
      const lats = pts.map(p => p.lat);
      const lons = pts.map(p => p.lon);
      const minLat = Math.min.apply(null, lats);
      const maxLat = Math.max.apply(null, lats);
      const minLon = Math.min.apply(null, lons);
      const maxLon = Math.max.apply(null, lons);
      const pad = 8;
      // If canvasInfo provided or global window._mapCanvasHtml exists, try to parse display size and transform
      let wrapperStyle = '';
      try {
        const html = (canvasInfo && typeof canvasInfo === 'string') ? canvasInfo : (window && window._mapCanvasHtml ? window._mapCanvasHtml : null);
        if (html && typeof html === 'string') {
          // parse style width/height
          const styleW = (html.match(/style="[^"]*?width:\s*(\d+)px/) || html.match(/width:\s*(\d+)px/));
          const styleH = (html.match(/style="[^"]*?height:\s*(\d+)px/) || html.match(/height:\s*(\d+)px/));
          const trans = (html.match(/transform:\s*translate3d\((-?\d+)px,\s*(-?\d+)px,\s*0px\)/) || html.match(/translate3d\((-?\d+)px,\s*(-?\d+)px,\s*0px\)/));
          const sw = styleW && styleW[1] ? Number(styleW[1]) : null;
          const sh = styleH && styleH[1] ? Number(styleH[1]) : null;
          const tx = trans && trans[1] ? Number(trans[1]) : 0;
          const ty = trans && trans[2] ? Number(trans[2]) : 0;
          if (sw && sh) {
            // use display width/height
            w = sw; h = sh;
            wrapperStyle = `width:${w}px;height:${h}px;transform:translate3d(${tx}px, ${ty}px, 0);overflow:hidden;position:relative;`;
          }
        }
      } catch (e) {}
      const latRange = (maxLat - minLat) || 0.0001;
      const lonRange = (maxLon - minLon) || 0.0001;
      const project = (p) => {
        const x = pad + ((p.lon - minLon) / lonRange) * (w - pad * 2);
        const y = pad + (1 - ((p.lat - minLat) / latRange)) * (h - pad * 2);
        return { x, y };
      };
      const path = pts.map((p, i) => {
        const xy = project(p);
        return (i === 0 ? 'M' : 'L') + xy.x.toFixed(1) + ' ' + xy.y.toFixed(1);
      }).join(' ');
      const start = project(pts[0]);
      const end = project(pts[pts.length - 1]);
      const svgInner = `
        <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Activity map">
          <rect x="0" y="0" width="${w}" height="${h}" fill="#f4f4f4" rx="8" />
          <path d="${path}" fill="none" stroke="#ff5a5f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}" r="4" fill="#2b9cdb" />
          <circle cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="4" fill="#3ac569" />
        </svg>`;
      if (wrapperStyle) {
        return `<div style="${wrapperStyle}">${svgInner}</div>`;
      }
      return svgInner;
    } catch (e) {
      return '<div style="padding:12px;background:#f4f4f4;border-radius:6px;">Map error</div>';
    }
  }

  // Leaflet map state used for the details view
  let leafletMap = null;
  let leafletMarker = null;
  let leafletSegments = [];
  let leafletRect = null;
  let playbackTimer = null;
  let playbackIndex = 0;
  let isPlaying = false;

  function paceToColor(paceSecPerKm) {
    // map pace (sec/km) to color hue: faster -> green (120), slower -> red (0)
    const min = 150; // 2:30/km fast
    const max = 600; // 10:00/km slow
    const v = Math.max(min, Math.min(max, paceSecPerKm));
    const t = (v - min) / (max - min); // 0..1
    const hue = (1 - t) * 120; // green to red
    return `hsl(${hue.toFixed(0)}, 75%, 45%)`;
  }

  function tearDownLeafletMap() {
    try {
      if (playbackTimer) { clearInterval(playbackTimer); playbackTimer = null; }
      playbackIndex = 0; isPlaying = false;
      if (leafletMap) {
        try { leafletMap.remove(); } catch (e) {}
        leafletMap = null; leafletMarker = null; leafletSegments = [];
      }
    } catch (e) {}
  }

  function createPlaybackControls(container, coords) {
    try {
      // create a small control in bottom-left
      const ctrl = document.createElement('div');
      Object.assign(ctrl.style, { position: 'absolute', left: '12px', bottom: '12px', zIndex: 999, display: 'flex', gap: '8px' });
      const playBtn = document.createElement('button'); playBtn.textContent = 'Play';
      const pauseBtn = document.createElement('button'); pauseBtn.textContent = 'Pause'; pauseBtn.disabled = true;
      const rectBtn = document.createElement('button'); rectBtn.textContent = 'Rect'; rectBtn.title = 'Toggle rectangle overlay';
      ctrl.appendChild(playBtn); ctrl.appendChild(pauseBtn);
      ctrl.appendChild(rectBtn);
      container.appendChild(ctrl);

      function stepTo(i) {
        if (!leafletMarker || !leafletMap) return;
        const latlng = coords[i];
        leafletMarker.setLatLng(latlng);
        try { leafletMap.panTo(latlng, {animate:true, duration:0.2}); } catch(e){}
      }

      playBtn.addEventListener('click', () => {
        if (isPlaying) return;
        isPlaying = true; playBtn.disabled = true; pauseBtn.disabled = false;
        playbackTimer = setInterval(() => {
          playbackIndex = Math.min(playbackIndex + 1, coords.length - 1);
          stepTo(playbackIndex);
          if (playbackIndex >= coords.length - 1) { clearInterval(playbackTimer); playbackTimer = null; isPlaying = false; playBtn.disabled = false; pauseBtn.disabled = true; playbackIndex = 0; }
        }, 300);
      });

      pauseBtn.addEventListener('click', () => {
        if (!isPlaying) return;
        isPlaying = false; playBtn.disabled = false; pauseBtn.disabled = true;
        if (playbackTimer) { clearInterval(playbackTimer); playbackTimer = null; }
      });

      // rectangle toggle: draws bounding rectangle around route
      rectBtn.addEventListener('click', () => {
        try {
          if (!leafletMap) return;
          if (leafletRect) {
            try { leafletMap.removeLayer(leafletRect); } catch(e){}
            leafletRect = null;
            rectBtn.textContent = 'Rect';
            return;
          }
          const bounds = L.latLngBounds(coords);
          leafletRect = L.rectangle(bounds.pad(0.02), { color: '#ff9800', weight: 2, dashArray: '6 4', fill: false }).addTo(leafletMap);
          rectBtn.textContent = 'Remove Rect';
        } catch (e) { console.warn('rect toggle failed', e); }
      });
    } catch (e) { console.warn('playback controls failed', e); }
  }

  function renderLeafletMap(act, container) {
    try {
      tearDownLeafletMap();
      if (!window.L) {
        // fallback to SVG renderer if Leaflet isn't present
        container.innerHTML = renderMapSVG(act, container.clientWidth || 640, container.clientHeight || 320, window._mapCanvasHtml);
        return;
      }
      // create map container
      container.innerHTML = '<div id="leaflet-details-map" style="width:100%;height:100%"></div>';
      const mapDiv = container.querySelector('#leaflet-details-map');
      const coords = (act.coords || []).map(c => [Number(c[0]), Number(c[1])]);
      if (!coords || coords.length === 0) { container.innerHTML = '<div style="padding:12px">No map data</div>'; return; }
      const center = coords[Math.floor(coords.length/2)];
      leafletMap = L.map(mapDiv, { attributionControl: false, zoomControl: false, scrollWheelZoom: false, dragging: false }).setView(center, 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafletMap);

      // draw per-segment colored polylines (synthetic variation around avgPace)
      const segs = [];
      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i], p2 = coords[i+1];
        const basePace = act.avgPaceSecPerKm || 400;
        const pace = basePace * (1 + ( (i / Math.max(1, coords.length)) - 0.5 ) * 0.6); // synthetic gradient
        const color = paceToColor(pace);
        const line = L.polyline([p1, p2], { color, weight: 5, opacity: 0.95, lineCap: 'round' }).addTo(leafletMap);
        segs.push(line);
      }

      // start/end markers (use small circle markers if assets unavailable)
      try {
        const startIcon = L.divIcon({ className: 'start-marker', html: '<div style="width:18px;height:18px;border-radius:9px;background:#2b9cdb;border:3px solid white"></div>', iconSize: [18,18], iconAnchor: [9,9] });
        const endIcon = L.divIcon({ className: 'end-marker', html: '<div style="width:18px;height:18px;border-radius:9px;background:#3ac569;border:3px solid white"></div>', iconSize: [18,18], iconAnchor: [9,9] });
        L.marker(coords[0], { icon: startIcon }).addTo(leafletMap);
        L.marker(coords[coords.length - 1], { icon: endIcon }).addTo(leafletMap);
      } catch (e) {}

      // moving player marker
      const playIcon = L.divIcon({ className: 'player-marker', html: '<div style="width:12px;height:12px;border-radius:6px;background:#222;border:2px solid white"></div>', iconSize: [12,12], iconAnchor: [6,6] });
      leafletMarker = L.marker(coords[0], { icon: playIcon }).addTo(leafletMap);

      // fit to bounds
      const bounds = L.latLngBounds(coords);
      leafletMap.fitBounds(bounds.pad(0.12));

      leafletSegments = segs;
      createPlaybackControls(container, coords);
    } catch (e) {
      console.error('renderLeafletMap error', e);
      container.innerHTML = renderMapSVG(act, container.clientWidth || 640, container.clientHeight || 320);
    }
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
      if (authBtn && typeof authBtn.addEventListener === 'function') authBtn.addEventListener('click', (e) => { e.preventDefault(); window.open('https://aforesaid-cade-uneclipsed.ngrok-free.dev/auth/start', '_blank'); });
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

  // Global mock checkbox: when checked, open modal and show mock activities
  if (useMockGlobal && typeof useMockGlobal.addEventListener === 'function') {
    // initialize unchecked
    try { useMockGlobal.checked = false; } catch(e){}
    useMockGlobal.addEventListener('change', async (e) => {
      try {
        // set global flag so fetchActivities will choose mock or real accordingly
        window.__USE_MOCK = !!useMockGlobal.checked;
        // Do NOT open the modal when toggling mock. Only update the global flag.
        // If the modal is already open, refresh the activities list so it reflects
        // the newly selected source (mock vs real).
        try {
          if (modal && modal.classList && !modal.classList.contains('hidden')) {
            fetchActivities();
          }
        } catch (e) {}
      } catch (err) { console.warn('mock checkbox handler failed', err); }
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
