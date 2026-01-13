(function() {
  'use strict';

  // Configuration
  var IMPROVER_ENDPOINT = 'https://uncommon-hare-880.convex.site/api/recordings/ingest';
  var RRWEB_CDN = 'https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.11/dist/rrweb.min.js';
  var BATCH_SIZE = 50;
  var FLUSH_INTERVAL = 10000;

  // State
  var events = [];
  var stopFn = null;
  var flushTimer = null;
  var initialized = false;
  var sessionId = null;

  function generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getSessionId() {
    if (sessionId) return sessionId;
    try {
      sessionId = sessionStorage.getItem('_improverSessionId');
      if (!sessionId) {
        sessionId = generateSessionId();
        sessionStorage.setItem('_improverSessionId', sessionId);
      }
    } catch (e) {
      sessionId = generateSessionId();
    }
    return sessionId;
  }

  function parseUserAgent() {
    var ua = navigator.userAgent.toLowerCase();
    var deviceType = 'desktop';
    if (/ipad|tablet|playbook|silk/.test(ua)) {
      deviceType = 'tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(ua)) {
      deviceType = 'mobile';
    }
    var browser = 'Unknown';
    if (ua.indexOf('chrome') > -1 && ua.indexOf('edge') === -1) browser = 'Chrome';
    else if (ua.indexOf('firefox') > -1) browser = 'Firefox';
    else if (ua.indexOf('safari') > -1 && ua.indexOf('chrome') === -1) browser = 'Safari';
    else if (ua.indexOf('edge') > -1) browser = 'Edge';
    var os = 'Unknown';
    if (ua.indexOf('windows') > -1) os = 'Windows';
    else if (ua.indexOf('mac') > -1) os = 'macOS';
    else if (ua.indexOf('linux') > -1 && ua.indexOf('android') === -1) os = 'Linux';
    else if (ua.indexOf('android') > -1) os = 'Android';
    else if (/iphone|ipad|ipod/.test(ua)) os = 'iOS';
    return { deviceType: deviceType, browser: browser, os: os };
  }

  function sendEvents() {
    if (events.length === 0) return;
    var batch = events.splice(0, events.length);
    var meta = parseUserAgent();
    var payload = JSON.stringify({
      sessionId: getSessionId(),
      events: batch,
      metadata: {
        startTime: Date.now(),
        userAgent: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        pageUrl: window.location.href,
        deviceType: meta.deviceType,
        browser: meta.browser,
        os: meta.os
      }
    });

    // Use sendBeacon for reliability, fallback to fetch
    if (navigator.sendBeacon) {
      var sent = navigator.sendBeacon(IMPROVER_ENDPOINT, new Blob([payload], { type: 'application/json' }));
      if (!sent) {
        events.unshift.apply(events, batch);
      }
    } else {
      fetch(IMPROVER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function() {
        events.unshift.apply(events, batch);
      });
    }
  }

  function startRecording() {
    if (initialized && stopFn) return;
    if (typeof rrweb === 'undefined') return;

    stopFn = rrweb.record({
      emit: function(event) {
        events.push(event);
        if (events.length >= BATCH_SIZE) {
          sendEvents();
        }
      },
      maskAllInputs: true,
      maskTextContent: false,
      recordCanvas: false
    });

    if (!flushTimer) {
      flushTimer = setInterval(sendEvents, FLUSH_INTERVAL);
    }

    if (!initialized) {
      window.addEventListener('beforeunload', sendEvents);
      window.addEventListener('pagehide', sendEvents);
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
          sendEvents();
        }
      });
    }

    initialized = true;
  }

  function loadRrweb(callback) {
    if (typeof rrweb !== 'undefined') {
      callback();
      return;
    }
    var script = document.createElement('script');
    script.src = RRWEB_CDN;
    script.onload = callback;
    script.onerror = function() {
      console.error('[Improver] Failed to load rrweb');
    };
    document.head.appendChild(script);
  }

  // Initialize
  getSessionId();
  loadRrweb(startRecording);
})();
