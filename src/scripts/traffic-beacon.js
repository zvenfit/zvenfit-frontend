(function () {
  'use strict';

  var endpoint = String(window.ZVENFIT_TRAFFIC_API || '').trim();
  if (!endpoint || endpoint.indexOf('__TRAFFIC_API_URL__') !== -1) {
    return;
  }

  function createPageViewId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    return 'pv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  var payload = JSON.stringify({
    page_view_id: createPageViewId(),
    url: window.location.href,
    referrer: document.referrer || '',
    webdriver: navigator.webdriver === true,
  });

  if (navigator.sendBeacon && navigator.sendBeacon(endpoint, payload)) {
    return;
  }

  if (window.fetch) {
    window
      .fetch(endpoint, {
        method: 'POST',
        body: payload,
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      })
      .catch(function () {
        // Traffic analytics must never affect the page experience.
      });
  }
})();
