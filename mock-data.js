// External mock data used by the frontend. Loaded as /mock-data.js
// Defines `window.CLIENT_MOCK_DATA` and `window._mapCanvasHtml`.
(function(){
  window.CLIENT_MOCK_DATA = [
    { id: 1, activityName: 'Morning Run', activityType: { typeKey: 'running' }, startTimeLocal: '2026-02-01T06:45:00', distance: 11260,
      durationSeconds: 4019, avgPaceSecPerKm: 357, ascentMeters: 19, calories: 850,
      coords: [
        [43.4895, -79.7010], [43.4900, -79.7000], [43.4910, -79.6990], [43.4920, -79.6985],
        [43.4930, -79.6980], [43.4935, -79.6990], [43.4930, -79.7000], [43.4925, -79.7010],
        [43.4920, -79.7020], [43.4910, -79.7030], [43.4900, -79.7025], [43.4892, -79.7020],
        [43.4885, -79.7015], [43.4888, -79.7005], [43.4890, -79.7000], [43.4893, -79.6992],
        [43.4897, -79.6987], [43.4905, -79.6982], [43.4918, -79.6980], [43.4928, -79.6990],
        [43.4915, -79.6998], [43.4905, -79.7005], [43.4895, -79.7010]
      ] },
    { id: 2, activityName: 'Lunch Ride', activityType: { typeKey: 'cycling' }, startTimeLocal: '2026-01-31T12:10:00', distance: 15000,
      durationSeconds: 3200, avgPaceSecPerKm: 213, ascentMeters: 45, calories: 620,
      coords: [
        [43.4860, -79.7040], [43.4870, -79.7030], [43.4885, -79.7015], [43.4900, -79.7005],
        [43.4915, -79.6995], [43.4930, -79.6985], [43.4940, -79.6975]
      ] },
    { id: 3, activityName: 'Evening Walk', activityType: { typeKey: 'walking' }, startTimeLocal: '2026-01-30T18:20:00', distance: 3000,
      durationSeconds: 2100, avgPaceSecPerKm: 700, ascentMeters: 5, calories: 180,
      coords: [
        [43.4950, -79.6950], [43.4945, -79.6955], [43.4940, -79.6960], [43.4935, -79.6965]
      ] }
  ];

  // Optional captured Leaflet canvas HTML used by the SVG fallback for sizing/translate
  window._mapCanvasHtml = `
<div class="span12 activity-map-view-container">
    <div id="activity-map-canvas" class="activity-map-canvas leaflet-container leaflet-touch leaflet-retina leaflet-fade-anim leaflet-touch-zoom leaflet-grab leaflet-touch-drag" style="min-width: 300px; position: relative;" tabindex="0"><div class="leaflet-pane leaflet-map-pane" style="transform: translate3d(0px, 0px, 0px);"><div class="leaflet-pane leaflet-tile-pane"></div><div class="leaflet-pane leaflet-overlay-pane"></div><div class="leaflet-pane leaflet-shadow-pane"></div><div class="leaflet-pane leaflet-marker-pane"></div><div class="leaflet-pane leaflet-tooltip-pane"></div><div class="leaflet-pane leaflet-popup-pane"></div><div class="leaflet-proxy leaflet-zoom-animated"></div></div><div class="leaflet-control-container"><div class="leaflet-top leaflet-left"><div class="leaflet-control-zoom leaflet-bar leaflet-control" style="display: none;"><a class="leaflet-control-zoom-in" href="#" title="Zoom in" role="button" aria-label="Zoom in" aria-disabled="false"><span aria-hidden="true">+</span></a><a class="leaflet-control-zoom-out" href="#" title="Zoom out" role="button" aria-label="Zoom out" aria-disabled="false"><span aria-hidden="true">−</span></a></div></div><div class="leaflet-top leaflet-right"></div><div class="leaflet-bottom leaflet-left"></div><div class="leaflet-bottom leaflet-right"><div class="leaflet-control-scale leaflet-control"><div class="leaflet-control-scale-line"></div><div class="leaflet-control-scale-line"></div></div><div class="leaflet-control-attribution leaflet-control"><a href="https://leafletjs.com" title="A JavaScript library for interactive maps"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8" class="leaflet-attribution-flag"><path fill="#4C7BE1" d="M0 0h12v4H0z"></path><path fill="#FFD500" d="M0 4h12v3H0z"></path><path fill="#E0BC00" d="M0 7h12v1H0z"></path></svg> Leaflet</a></div></div></div><div class="leaflet-pane leaflet-map-pane" style="transform: translate3d(-49px, 0px, 0px);"><div class="leaflet-pane leaflet-tile-pane"><div class="leaflet-layer " style="z-index: 1; opacity: 1;"><div class="leaflet-tile-container leaflet-zoom-animated" style="z-index: 20; transform: translate3d(6px, -33px, 0px) scale(2);"></div><div class="leaflet-tile-container leaflet-zoom-animated" style="z-index: 19; transform: translate3d(-394px, -73px, 0px) scale(4);"></div><div class="leaflet-tile-container leaflet-zoom-animated" style="z-index: 21; transform: translate3d(-392px, -75px, 0px) scale(1);"><div class="leaflet-tile leaflet-tile-loaded" style="width: 256px; height: 256px; transform: translate3d(634px, 166px, 0px); opacity: 1;"><img draggable="false" alt="" role="presentation" src="https://maps.googleapis.com/maps/vt?pb=!1m5!1m4!1i15!2i9129!3i11979!4i256!2m3!1e0!2sm!3i765528902!3m18!2sen-CA!3sUS!5e18!12m5!1e68!2m2!1sset!2sRoadmap!4e2!12m3!1e37!2m1!1ssmartmaps!12m4!1e26!2m2!1sstyles!2zcy50OjMzfHMuZTpsfHAudjpvZmY!4e0!5m2!1e3!5f2!23i46991212!23i47054750!23i47083502&amp;key=AIzaSyBuqMiuCNohSYg09UnOzu9Poy05jND5m3k&amp;channel=connect&amp;token=91858" style="width: 256px; height: 256px; user-select: none; border: 0px; padding: 0px; margin: 0px; max-width: none; position: absolute;"></div><!-- trimmed for brevity in file -->
</div>
`;
})();
