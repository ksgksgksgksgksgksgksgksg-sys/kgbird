/* ═══════════════════════════════════════════════════════
   KGBIRD Analytics — Demand Logging Engine
   Tracks: merch attempts, page views, play counts
   Storage: localStorage (exportable to CSV)
   ═══════════════════════════════════════════════════════ */

const KG_ANALYTICS = (() => {
  const STORAGE_KEY = 'kgbird_analytics';
  const VERSION = '1.0.0';

  function _getData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return _initData();
      return JSON.parse(raw);
    } catch {
      return _initData();
    }
  }

  function _initData() {
    const data = {
      version: VERSION,
      created: new Date().toISOString(),
      pageViews: [],
      playEvents: [],
      merchAttempts: [],
      paymentAttempts: [],
    };
    _save(data);
    return data;
  }

  function _save(data) {
    data.lastUpdated = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function _fingerprint() {
    const nav = navigator;
    const screen = window.screen;
    return btoa([
      nav.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      nav.hardwareConcurrency || 'n/a',
      Intl.DateTimeFormat().resolvedOptions().timeZone
    ].join('|')).slice(0, 16);
  }

  function _sessionId() {
    let sid = sessionStorage.getItem('kgbird_sid');
    if (!sid) {
      sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('kgbird_sid', sid);
    }
    return sid;
  }

  return {
    /* Track a page view */
    pageView(page) {
      const data = _getData();
      data.pageViews.push({
        page,
        timestamp: new Date().toISOString(),
        referrer: document.referrer || 'direct',
        userAgent: navigator.userAgent.slice(0, 120),
        fingerprint: _fingerprint(),
        session: _sessionId(),
      });
      _save(data);
    },

    /* Track a play event */
    trackPlay(trackName, albumName, durationListened) {
      const data = _getData();
      data.playEvents.push({
        track: trackName,
        album: albumName,
        duration: durationListened,
        timestamp: new Date().toISOString(),
        fingerprint: _fingerprint(),
        session: _sessionId(),
      });
      _save(data);
    },

    /* Track a merch click / interest */
    merchInterest(itemName, price, action) {
      const data = _getData();
      data.merchAttempts.push({
        item: itemName,
        price,
        action, // 'click', 'add_to_cart', 'size_selected'
        timestamp: new Date().toISOString(),
        fingerprint: _fingerprint(),
        session: _sessionId(),
      });
      _save(data);
    },

    /* Track a full payment attempt */
    paymentAttempt(orderData) {
      const data = _getData();
      data.paymentAttempts.push({
        ...orderData,
        timestamp: new Date().toISOString(),
        fingerprint: _fingerprint(),
        session: _sessionId(),
        attemptId: 'PA-' + Date.now().toString(36).toUpperCase(),
      });
      _save(data);
    },

    /* Get all data for the report */
    getReport() {
      return _getData();
    },

    /* Get summary stats */
    getSummary() {
      const data = _getData();
      const uniqueVisitors = new Set(data.pageViews.map(p => p.fingerprint)).size;
      const totalPlays = data.playEvents.length;
      const totalMerchClicks = data.merchAttempts.length;
      const totalPaymentAttempts = data.paymentAttempts.length;

      // Top tracks
      const trackCounts = {};
      data.playEvents.forEach(e => {
        trackCounts[e.track] = (trackCounts[e.track] || 0) + 1;
      });

      // Top merch items
      const merchCounts = {};
      data.merchAttempts.forEach(e => {
        merchCounts[e.item] = (merchCounts[e.item] || 0) + 1;
      });

      // Revenue demand (sum of attempted purchase amounts)
      const revenueDemand = data.paymentAttempts.reduce((sum, p) => {
        return sum + (parseFloat(p.total) || 0);
      }, 0);

      return {
        uniqueVisitors,
        totalPageViews: data.pageViews.length,
        totalPlays,
        totalMerchClicks,
        totalPaymentAttempts,
        revenueDemand,
        trackCounts,
        merchCounts,
        since: data.created,
        lastActivity: data.lastUpdated,
      };
    },

    /* Export to CSV */
    exportCSV(type) {
      const data = _getData();
      let rows, headers;

      switch(type) {
        case 'payments':
          headers = ['Attempt ID', 'Timestamp', 'Item', 'Size', 'Price', 'Name', 'Email', 'City', 'Country', 'Session'];
          rows = data.paymentAttempts.map(p => [
            p.attemptId, p.timestamp, p.item, p.size, p.total,
            p.name || '', p.email || '', p.city || '', p.country || '', p.session
          ]);
          break;
        case 'plays':
          headers = ['Timestamp', 'Track', 'Album', 'Duration (s)', 'Session'];
          rows = data.playEvents.map(p => [
            p.timestamp, p.track, p.album, p.duration, p.session
          ]);
          break;
        case 'merch':
          headers = ['Timestamp', 'Item', 'Price', 'Action', 'Session'];
          rows = data.merchAttempts.map(m => [
            m.timestamp, m.item, m.price, m.action, m.session
          ]);
          break;
        case 'views':
          headers = ['Timestamp', 'Page', 'Referrer', 'Session', 'Fingerprint'];
          rows = data.pageViews.map(v => [
            v.timestamp, v.page, v.referrer, v.session, v.fingerprint
          ]);
          break;
        default:
          return;
      }

      const csv = [headers.join(','), ...rows.map(r =>
        r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
      )].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kgbird_${type}_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },

    /* Clear all data */
    clearAll() {
      if (confirm('Clear all analytics data? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEY);
        return true;
      }
      return false;
    }
  };
})();
