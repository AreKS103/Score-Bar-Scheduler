/* global $e, elementor */
/* Scorebar Scheduler — Elementor editor sync script.
 * Runs in the main Elementor editor window (not inside the preview iframe).
 * Fires POST (register) / DELETE (remove) to the Supabase-backed API whenever
 * a schedule_widget is added to or removed from the Elementor canvas.
 *
 * Config is injected by scorebar-scheduler.php via wp_localize_script:
 *   window._sbEditorCfg = { appUrl: '...', apiKey: '...' }
 */
(function () {
  'use strict';

  var cfg    = window._sbEditorCfg || {};
  var appUrl = (cfg.appUrl || '').replace(/\/$/, '');
  var apiKey = cfg.apiKey || '';

  if (!appUrl || !apiKey) {
    console.warn('[SB] missing appUrl or apiKey — aborting. appUrl:', appUrl, 'apiKey length:', apiKey.length);
    return;
  }

  /* ── Dedup: prevent multiple hooks from sending duplicate DELETEs / REGISTERs ── */
  var deletedWidgets = {};
  var registeredWidgets = new Set();
  var registeredEmbedIds = {}; // widgetId → last embedId sent, for rename detection

  function describeElement(el) {
    if (!el || !el.tagName) return '';
    var out = el.tagName.toLowerCase();
    if (el.id) out += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      out += '.' + el.className.trim().split(/\s+/).slice(0, 4).join('.');
    }
    return out;
  }

  function findHorizontalOverflow(doc) {
    var win = doc.defaultView || window;
    var viewport = doc.documentElement.clientWidth;
    var results = [];
    Array.prototype.slice.call(doc.body.querySelectorAll('*')).forEach(function (el) {
      var rect = el.getBoundingClientRect();
      if (!rect.width || rect.height === 0) return;
      var style = win.getComputedStyle(el);
      var rightOverflow = Math.ceil(rect.right - viewport);
      var leftOverflow = Math.ceil(0 - rect.left);
      var scrollOverflow = Math.ceil((el.scrollWidth || 0) - (el.clientWidth || 0));
      if (rightOverflow > 1 || leftOverflow > 1 || scrollOverflow > 1) {
        results.push({
          selector: describeElement(el),
          rightOverflow: rightOverflow > 0 ? rightOverflow : 0,
          leftOverflow: leftOverflow > 0 ? leftOverflow : 0,
          scrollOverflow: scrollOverflow > 0 ? scrollOverflow : 0,
          width: Math.round(rect.width),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          marginLeft: style.marginLeft,
          marginRight: style.marginRight,
          transform: style.transform === 'none' ? '' : style.transform,
          position: style.position,
          element: el
        });
      }
    });
    results.sort(function (a, b) {
      return (b.rightOverflow + b.leftOverflow + b.scrollOverflow) - (a.rightOverflow + a.leftOverflow + a.scrollOverflow);
    });
    return results;
  }

  window.sbFindHorizontalOverflow = function () {
    var iframe = document.getElementById('elementor-preview-iframe');
    if (!iframe || !iframe.contentDocument) {
      console.warn('[SB] Elementor preview iframe is not ready yet.');
      return [];
    }
    var offenders = findHorizontalOverflow(iframe.contentDocument);
    offenders.slice(0, 10).forEach(function (item) {
      item.element.style.outline = '2px solid #ef4444';
      item.element.style.outlineOffset = '-2px';
    });
    console.table(offenders.slice(0, 20).map(function (item) {
      return {
        selector: item.selector,
        rightOverflow: item.rightOverflow,
        leftOverflow: item.leftOverflow,
        scrollOverflow: item.scrollOverflow,
        width: item.width,
        left: item.left,
        right: item.right,
        marginLeft: item.marginLeft,
        marginRight: item.marginRight,
        transform: item.transform,
        position: item.position
      };
    }));
    return offenders;
  };

  function warnHorizontalOverflow(doc) {
    setTimeout(function () {
      var offenders = findHorizontalOverflow(doc);
      if (offenders.length) {
        console.warn('[SB] Horizontal overflow detected. Run sbFindHorizontalOverflow() in this console to outline the source element.', offenders[0]);
      }
    }, 500);
  }

  /* ── HTTP helpers ──────────────────────────────────────────────────────── */

  function apiDelete(widgetId, embedId) {
    var params = new URLSearchParams({ apiKey: apiKey });
    if (widgetId) {
      params.set('widgetId', widgetId);
    } else {
      params.set('embedId', embedId || '__null__');
    }
    try {
      fetch(appUrl + '/api/embed-instances?' + params.toString(), {
        method: 'DELETE',
        keepalive: true
      }).catch(function (e) { console.warn('[SB] delete failed', e); });
    } catch (e) {
      console.warn('[SB] delete failed', e);
    }
  }

  /** Deduplicated delete — only fires once per widgetId per session */
  function apiDeleteOnce(widgetId, embedId) {
    var key = widgetId || embedId || '__null__';
    if (deletedWidgets[key]) return;
    deletedWidgets[key] = true;
    registeredWidgets.delete(key); // allow re-registration if widget is re-added
    delete registeredEmbedIds[key];
    apiDelete(widgetId, embedId);
  }

  function getPageUrl() {
    // Read the iframe's `src` attribute — cross-origin-safe, no contentWindow access needed.
    // Elementor sets src to the actual page URL with ?elementor-preview=<postId> appended.
    // Strip query params to get the clean page URL (e.g. https://scorekh.com/sports-schedule/).
    try {
      var iframe = document.getElementById('elementor-preview-iframe');
      if (iframe && iframe.src) {
        var iframeSrc = new URL(iframe.src);
        if (iframeSrc.searchParams.get('elementor-preview')) {
          return iframeSrc.origin + iframeSrc.pathname;
        }
      }
    } catch (e) {}
    return window.location.href;
  }

  function apiRegister(widgetId, embedId) {
    // FIX 2: Cancel any pending delete for this widget before registering.
    // This handles the re-render cycle: MutationObserver fires DELETE when
    // Elementor temporarily removes the widget node, then the widget re-appears
    // and calls apiRegister — the pending delete must be cancelled.
    if (widgetId && deleteTimers[widgetId]) {
      clearTimeout(deleteTimers[widgetId]);
      delete deleteTimers[widgetId];
      console.log('[SB] cancelled pending delete on re-register:', widgetId);
    }

    var dedupKey = widgetId || embedId || '__unknown__';
    if (registeredWidgets.has(dedupKey)) {
      // Allow re-registration if the embed name changed in Elementor settings
      if (!widgetId || registeredEmbedIds[widgetId] === (embedId || null)) return;
      // embedId changed — clear slot so it re-registers with the new name
      registeredWidgets.delete(dedupKey);
    }
    registeredWidgets.add(dedupKey);
    if (widgetId) registeredEmbedIds[widgetId] = embedId || null;
    try {
      var body = JSON.stringify({
        apiKey:     apiKey,
        widgetId:   widgetId  || null,
        embedId:    embedId   || null,
        pageUrl:    getPageUrl(),
        pageTitle:  document.title,
      });
      fetch(appUrl + '/api/embed-instances', {
        method:    'POST',
        headers:   { 'Content-Type': 'application/json' },
        body:      body,
        keepalive: true,
      })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        console.log('[SB] register response:', JSON.stringify(d));
      })
      .catch(function (e) {
        console.warn('[SB] register failed:', e.message);
      });
    } catch (e) {
      console.warn('[SB] register error:', e);
    }
  }

  /* ── Elementor model helpers ───────────────────────────────────────────── */

  function isScheduleWidget(element) {
    try {
      return element &&
        typeof element.get === 'function' &&
        element.get('widgetType') === 'schedule_widget';
    } catch (e) { return false; }
  }

  function getWidgetId(element) {
    try { return element.get('id') || null; } catch (e) { return null; }
  }

  function getEmbedId(element) {
    try {
      if (typeof element.getSetting === 'function') return element.getSetting('embed_id') || null;
      var settings = element.get('settings');
      return (settings && settings.get && settings.get('embed_id')) || null;
    } catch (e) { return null; }
  }

  /* ── Elementor JS hooks ────────────────────────────────────────────────── */

  function setupElementorHooks() {
    // ── Primary: $e.hooks (Elementor 3.x command-based hooks) ─────────────
    if (window.$e && window.$e.hooks) {
      try {
        $e.hooks.registerDataAfter('document/elements/delete', function (result, args) {
          try {
            var containers = (args && args.containers) || (args && args.container ? [args.container] : []);
            containers.forEach(function (c) {
              var el = c && c.model;
              if (isScheduleWidget(el)) {
                apiDeleteOnce(getWidgetId(el), getEmbedId(el));
              }
            });
          } catch (e) { console.warn('[SB] delete hook error', e); }
        });

        $e.hooks.registerDataAfter('document/elements/create', function (result) {
          try {
            var container = result;
            var el = container && container.model;
            if (isScheduleWidget(el)) {
              apiRegister(getWidgetId(el), getEmbedId(el));
            }
          } catch (e) { console.warn('[SB] create hook error', e); }
        });
      } catch (e) {
        console.warn('[SB] $e.hooks registration failed, falling back', e);
      }
    }

    // ── Fallback: Backbone channel events (Elementor 2.x / older 3.x) ─────
    if (window.elementor) {
      try {
        if (elementor.channels && elementor.channels.data) {
          var ch = elementor.channels.data;
          ch.on('element:before:remove', function (view) {
            try {
              var el = view && (view.model || view);
              if (isScheduleWidget(el)) {
                apiDeleteOnce(getWidgetId(el), getEmbedId(el));
              }
            } catch (e) {}
          });
          ch.on('element:after:add', function (model) {
            try {
              var el = model && (model.model || model);
              if (isScheduleWidget(el)) {
                var wid = getWidgetId(el);
                var eid = getEmbedId(el);
                apiRegister(wid, eid);
              }
            } catch (e) {
              console.warn('[SB] element:after:add error', e);
            }
          });
        } else {
          console.warn('[SB] elementor.channels.data not available — Backbone fallback skipped');
        }
      } catch (e) { console.warn('[SB] Backbone channel registration failed', e); }
    }

    // ── Safety net: re-scan all schedule widgets on every auto-save ────────
    if (window.$e && window.$e.hooks && window.$e.commands) {
      try {
        $e.hooks.registerDataAfter('document/save/auto-save', function () {
          try {
            var iframe = document.getElementById('elementor-preview-iframe');
            if (!iframe || !iframe.contentDocument) return;
            var widgets = iframe.contentDocument.querySelectorAll('[data-widget_type^="schedule_widget"]');
            widgets.forEach(function (w) {
              var wid = w.dataset && w.dataset.id;
              if (!wid || deletedWidgets[wid]) return;
              var eid = null;
              try {
                var fr = w.querySelector('iframe[src]');
                if (fr) eid = new URL(fr.src).searchParams.get('embedId') || null;
              } catch (e) {}
              apiRegister(wid, eid);
            });
          } catch (e) {}
        });
      } catch (e) { console.warn('[SB] auto-save hook registration failed', e); }
    }
  }

  /* ── DOM-level fallback: MutationObserver on Elementor preview iframe ─── */

  var deleteTimers = {};

  function attachDocObserver(doc) {
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {

        // ── Removed nodes → potential DELETE ────────────────────────────
        mutation.removedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          var candidates = [];
          if (node.dataset && node.dataset.widget_type === 'schedule_widget.default') {
            candidates.push(node);
          }
          if (typeof node.querySelectorAll === 'function') {
            node.querySelectorAll('[data-widget_type^="schedule_widget"]').forEach(function (w) {
              candidates.push(w);
            });
          }
          candidates.forEach(function (w) {
            var widgetId = (w.dataset && w.dataset.id) || null;
            if (!widgetId) return;
            if (deleteTimers[widgetId]) clearTimeout(deleteTimers[widgetId]);
            deleteTimers[widgetId] = setTimeout(function () {
              delete deleteTimers[widgetId];
              // FIX 1: Verify the widget is truly gone — not just temporarily
              // removed by an Elementor iframe re-render.
              try {
                var currentIframe = document.getElementById('elementor-preview-iframe');
                if (currentIframe && currentIframe.contentDocument) {
                  var stillExists = currentIframe.contentDocument.querySelector(
                    '[data-id="' + widgetId + '"][data-widget_type^="schedule_widget"]'
                  );
                  if (stillExists) {
                    console.log('[SB] widget still in DOM, cancelling delete:', widgetId);
                    return; // Widget came back — do NOT delete
                  }
                }
              } catch (e) {}
              var embedId = null;
              try {
                var fr = w.querySelector('iframe[src]');
                if (fr) embedId = new URL(fr.src).searchParams.get('embedId') || null;
              } catch (e) {}
              console.log('[SB] confirmed gone after 8s, deleting:', widgetId);
              apiDeleteOnce(widgetId, embedId);
            }, 8000); // FIX 1: 8s — long enough to survive Elementor iframe re-renders
          });
        });

        // ── Added nodes → potential REGISTER ────────────────────────────
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;

          var addedCandidates = [];
          if (node.dataset && node.dataset.widget_type &&
              node.dataset.widget_type.indexOf('schedule_widget') === 0) {
            addedCandidates.push(node);
          }
          if (typeof node.querySelectorAll === 'function') {
            node.querySelectorAll('[data-widget_type^="schedule_widget"]').forEach(function (w) {
              addedCandidates.push(w);
            });
          }

          addedCandidates.forEach(function (w) {
            var wid = w.dataset && w.dataset.id;
            // Cancel any pending delete for this widget (it's being re-added)
            if (wid && deleteTimers[wid]) {
              clearTimeout(deleteTimers[wid]);
              delete deleteTimers[wid];
            }
            var widgetId = wid || null;
            if (!widgetId) return;
            // embedId may be null — iframe loads async after the wrapper appears.
            // The embed beacon in elementor-widget.php will send full data once loaded.
            var embedId = null;
            try {
              var fr = w.querySelector('iframe[src]');
              if (fr) embedId = new URL(fr.src).searchParams.get('embedId') || null;
            } catch (e) {}
            apiRegister(widgetId, embedId);
          });
        });

      });
    }).observe(doc.body, { childList: true, subtree: true });
  }

  function observePreviewIframe() {
    var _iframe = document.getElementById('elementor-preview-iframe');
    try {
      var iframe = _iframe;
      if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) return;
      attachDocObserver(iframe.contentDocument);
      // Relay sbHeight messages from nested widget iframes up to the editor window
      function attachMessageRelay(win) {
        try {
          win.addEventListener('message', function (ev) {
            try {
              if (!ev.data || typeof ev.data.sbHeight === 'undefined') return;
              // Relay only to the editor window itself (same origin)
              window.postMessage({ sbHeight: ev.data.sbHeight, sbFromWidget: true }, window.location.origin);
            } catch (e) {}
          });
        } catch (e) {
          console.warn('[SB] could not attach preview relay:', e);
        }
      }
      attachMessageRelay(iframe.contentWindow);
      // Poll every 2s to detect iframe document replacement (Elementor swaps doc on preview refresh)
      var lastDoc = iframe.contentDocument;
      setInterval(function () {
        try {
          var currentIframe = document.getElementById('elementor-preview-iframe');
          if (!currentIframe) return;
          var currentDoc = currentIframe.contentDocument || currentIframe.contentWindow.document;
          if (currentDoc && currentDoc !== lastDoc && currentDoc.body) {
            console.log('[SB] iframe doc changed, clearing registration cache');
            lastDoc = currentDoc;
            // FIX 4: Clear the registration Set so widgets re-register with fresh
            // last_seen timestamps after an iframe reload. Without this, widgets
            // that already registered won't re-register even after the doc swaps.
            registeredWidgets.clear();
            attachDocObserver(currentDoc);
            warnHorizontalOverflow(currentDoc);
          }
        } catch (e) {}
      }, 2000);
      // Re-attach after every preview reload (e.g. when widget settings change)
      iframe.addEventListener('load', function () {
        try {
          var newDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (newDoc && newDoc.body) {
            attachDocObserver(newDoc);
            warnHorizontalOverflow(newDoc);
          }
          // Re-attach message relay on the new window after reload
          if (iframe.contentWindow) attachMessageRelay(iframe.contentWindow);
        } catch (e) { console.warn('[SB] re-attach after reload failed', e); }
      });
    } catch (e) {
      console.warn('[SB] observePreviewIframe failed', e);
    }
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */

  var _initialized = false;
  function init() {
    if (_initialized) return;
    _initialized = true;
    setupElementorHooks();
    observePreviewIframe();

    // ── postMessage listener: sbHeight from Scheduler widget iframes ───────
    // The embed iframe sends { sbHeight: number } on every load/resize.
    // This is the most reliable signal that a Scheduler widget exists in the preview.
    window.addEventListener('message', function (ev) {
      try {
        // Only accept messages from the same origin or from the configured app domain.
        // Relayed internal messages (sbFromWidget) arrive from the same origin.
        var isRelayed = ev.origin === window.location.origin;
        // Validate message shape before acting
        if (!ev.data || typeof ev.data.sbHeight === 'undefined') return;
        if (!isRelayed && !/^https?:\/\//.test(ev.origin)) return;
        // Ensure the height value is a safe number
        if (typeof ev.data.sbHeight !== 'number' || !isFinite(ev.data.sbHeight)) return;

        var previewIframe = document.getElementById('elementor-preview-iframe');
        if (!previewIframe) return;

        var previewDoc;
        try {
          previewDoc = previewIframe.contentDocument || previewIframe.contentWindow.document;
        } catch (e) { return; }

        if (!previewDoc || !previewDoc.body) return;

        var widgets = previewDoc.querySelectorAll('[data-widget_type^="schedule_widget"]');
        if (!widgets.length) return;

        widgets.forEach(function (w) {
          var widgetId = w.dataset && w.dataset.id;
          if (!widgetId) return;

          // FIX 3: Cancel any pending delete — widget is clearly still alive
          // (it just sent a resize message to the editor window)
          if (deleteTimers[widgetId]) {
            clearTimeout(deleteTimers[widgetId]);
            delete deleteTimers[widgetId];
            console.log('[SB] sbHeight cancelled pending delete:', widgetId);
          }

          // Extract embedId first so we can detect renames even for registered widgets
          var embedId = null;
          try {
            var fr = w.querySelector('iframe[src]');
            if (fr) embedId = new URL(fr.src).searchParams.get('embedId') || null;
          } catch (e) {}

          // Skip if already registered with the same embedId (sbHeight fires on every resize)
          if (registeredWidgets.has(widgetId) &&
              registeredEmbedIds[widgetId] === (embedId || null)) return;

          apiRegister(widgetId, embedId);
        });
      } catch (e) {}
    });
  }

  function tryInit() {
    var _diag_iframe = document.getElementById('elementor-preview-iframe');
    try {
      var iframe = _diag_iframe;
      if (iframe && iframe.contentDocument &&
          iframe.contentDocument.body && window.elementor) {
        init();
        return;
      }
    } catch (e) { console.warn('[SB] init check failed', e); }

    if (window.elementor) {
      try {
        window.elementor.on('preview:loaded', function () { init(); });
      } catch (e) { console.warn('[SB] elementor.on(preview:loaded) failed', e); }
      setTimeout(function () { try { init(); } catch (e) {} }, 500);
    } else {
      window.addEventListener('elementor:init', function () {
        setTimeout(function () { try { init(); } catch (e) {} }, 200);
      });
      setTimeout(function () { try { init(); } catch (e) {} }, 2000);
    }
  }

  tryInit();
})();
