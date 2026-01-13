/**
 * Improver Session Recorder
 *
 * Records user sessions using rrweb and sends them to Improver for analysis.
 *
 * Usage:
 * 1. Include rrweb: <script src="https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb.min.js"></script>
 * 2. Include this script: <script src="https://footage-bot-production.up.railway.app/recorder.js"></script>
 * 3. Initialize: ImproverRecorder.init()
 */

(function() {
  'use strict';

  const IMPROVER_ENDPOINT = 'https://uncommon-hare-880.convex.site/api/recordings/ingest';
  const BATCH_SIZE = 50;
  const FLUSH_INTERVAL = 10000;

  let events = [];
  let stopFn = null;
  let flushTimer = null;
  let initialized = false;
  let config = {
    maskAllInputs: true,
    maskTextContent: false,
  };

  function generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getOrCreateSessionId() {
    // Persist session ID in sessionStorage to survive React strict mode remounts
    let sessionId = sessionStorage.getItem('_improverSessionId');
    if (!sessionId) {
      sessionId = generateSessionId();
      sessionStorage.setItem('_improverSessionId', sessionId);
    }
    return sessionId;
  }

  function parseUserAgent() {
    const ua = navigator.userAgent.toLowerCase();

    let deviceType = 'desktop';
    if (/ipad|tablet|playbook|silk/.test(ua)) {
      deviceType = 'tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(ua)) {
      deviceType = 'mobile';
    }

    let browser = 'Unknown';
    if (ua.includes('chrome') && !ua.includes('edge')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edge')) browser = 'Edge';

    let os = 'Unknown';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac')) os = 'macOS';
    else if (ua.includes('linux') && !ua.includes('android')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (/iphone|ipad|ipod/.test(ua)) os = 'iOS';

    return { deviceType, browser, os };
  }

  async function sendEvents() {
    if (events.length === 0) return;

    const batch = events.splice(0, events.length);
    const { deviceType, browser, os } = parseUserAgent();

    console.log('[Improver] Sending', batch.length, 'events for session', window._improverSessionId);

    try {
      const response = await fetch(IMPROVER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: window._improverSessionId,
          events: batch,
          metadata: {
            startTime: Date.now(),
            userAgent: navigator.userAgent,
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,
            pageUrl: window.location.href,
            deviceType: deviceType,
            browser: browser,
            os: os,
          }
        }),
      });

      if (!response.ok) {
        console.error('[Improver] Failed to send events:', response.statusText);
        events.unshift(...batch);
      } else {
        console.log('[Improver] Events sent successfully');
      }
    } catch (error) {
      console.error('[Improver] Error sending events:', error);
      events.unshift(...batch);
    }
  }

  function init(options = {}) {
    if (typeof rrweb === 'undefined') {
      console.error('[Improver] rrweb is not loaded. Please include rrweb before this script.');
      return;
    }

    // Use initialized flag instead of stopFn to handle React strict mode
    if (initialized && stopFn) {
      return window._improverSessionId;
    }

    config = { ...config, ...options };

    // Get or create persistent session ID
    window._improverSessionId = getOrCreateSessionId();

    // Only log on first real initialization
    if (!initialized) {
      console.log('[Improver] Starting session recording:', window._improverSessionId);
    }

    stopFn = rrweb.record({
      emit(event) {
        events.push(event);
        if (events.length >= BATCH_SIZE) {
          sendEvents();
        }
      },
      maskAllInputs: config.maskAllInputs,
      maskTextContent: config.maskTextContent,
      recordLog: true,
      recordCanvas: false,
    });

    // Only set up timer once
    if (!flushTimer) {
      flushTimer = setInterval(sendEvents, FLUSH_INTERVAL);
    }

    // Only add event listeners once
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
    return window._improverSessionId;
  }

  function stop() {
    if (stopFn) {
      stopFn();
      stopFn = null;
    }
    // Don't clear timer or send events on stop - let the session continue
    // This handles React strict mode unmount/remount cycles
  }

  function forceStop() {
    // Use this for actual cleanup (e.g., user logs out)
    if (stopFn) {
      stopFn();
      stopFn = null;
    }
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    sendEvents();
    initialized = false;
    sessionStorage.removeItem('_improverSessionId');
    console.log('[Improver] Session recording force stopped');
  }

  function getSessionId() {
    return window._improverSessionId;
  }

  window.ImproverRecorder = {
    init: init,
    stop: stop,
    forceStop: forceStop,
    getSessionId: getSessionId,
  };

})();
