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

  console.log('[SB] script loaded, appUrl:', appUrl, 'apiKey length:', apiKey.length);

  if (!appUrl || !apiKey) {
    console.warn('[SB] missing appUrl or apiKey — aborting. appUrl:', appUrl, 'apiKey length:', apiKey.length);
    return;
  }

  /* ── Dedup: prevent multiple hooks from sending duplicate DELETEs ────── */
  var deletedWidgets = {};

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
    apiDelete(widgetId, embedId);
  }

  function apiRegister(widgetId, embedId) {
    try {
      var body = JSON.stringify({
        apiKey:     apiKey,
        widgetId:   widgetId  || null,
        embedId:    embedId   || null,
        pageUrl:    window.location.href,
        pageTitle:  document.title,
      });
      navigator.sendBeacon(
        appUrl + '/api/embed-instances',
        new Blob([body], { type: 'application/json' })
      );
    } catch (e) {
      console.warn('[SB] register beacon failed', e);
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
    console.log('[SB] setupElementorHooks called');
    console.log('[SB] $e available:', typeof window.$e);
    console.log('[SB] $e.hooks available:', !!(window.$e && window.$e.hooks));
    console.log('[SB] $e.commands available:', !!(window.$e && window.$e.commands));
    console.log('[SB] elementor.channels available:', !!(window.elementor && window.elementor.channels));

    // ── Primary: $e.hooks (Elementor 3.x command-based hooks) ─────────────
    if (window.$e && window.$e.hooks) {
      try {
        $e.hooks.registerDataAfter('document/elements/delete', function (result, args) {
          try {
            var containers = (args && args.containers) || (args && args.container ? [args.container] : []);
            containers.forEach(function (c) {
              var el = c && c.model;
              if (isScheduleWidget(el)) {
                console.log('[SB] $e.hooks delete detected:', getWidgetId(el));
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
              console.log('[SB] $e.hooks create detected:', getWidgetId(el));
              apiRegister(getWidgetId(el), getEmbedId(el));
            }
          } catch (e) { console.warn('[SB] create hook error', e); }
        });
        console.log('[SB] $e.hooks registered successfully');
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
                console.log('[SB] channel element:before:remove:', getWidgetId(el));
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
                console.log('[SB] Backbone element:after:add:', wid, eid);
                apiRegister(wid, eid);
              }
            } catch (e) {
              console.warn('[SB] element:after:add error', e);
            }
          });
          console.log('[SB] Backbone channel listener registered');
        } else {
          console.warn('[SB] elementor.channels.data not available — Backbone fallback skipped');
        }
      } catch (e) { console.warn('[SB] Backbone channel registration failed', e); }
    }

    // ── Safety net: re-scan all schedule widgets on every auto-save ────────
    if (window.$e && window.$e.hooks && window.$e.commands) {
      try {
        $e.hooks.registerDataAfter('document/save/auto-save', function () {
          console.log('[SB] auto-save detected');
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
              console.log('[SB] auto-save scan registering:', wid, eid);
              apiRegister(wid, eid);
            });
          } catch (e) {}
        });
        console.log('[SB] auto-save hook registered');
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
              try {
                var stillExists = doc.querySelector('[data-id="' + widgetId + '"]');
                if (stillExists) return;
              } catch (e) {}
              var embedId = null;
              try {
                var fr = w.querySelector('iframe[src]');
                if (fr) embedId = new URL(fr.src).searchParams.get('embedId') || null;
              } catch (e) {}
              console.log('[SB] DOM observer delete:', widgetId, embedId);
              apiDeleteOnce(widgetId, embedId);
            }, 2000);
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
            console.log('[SB] DOM addedNode REGISTERING:', widgetId, embedId);
            apiRegister(widgetId, embedId);
          });
        });

      });
    }).observe(doc.body, { childList: true, subtree: true });
    console.log('[SB] MutationObserver attached to iframe body');
  }

  function observePreviewIframe() {
    console.log('[SB] observePreviewIframe called');
    var _iframe = document.getElementById('elementor-preview-iframe');
    console.log('[SB] iframe found:', !!_iframe,
      'contentDoc:', !!(_iframe && _iframe.contentDocument),
      'body:', !!(_iframe && _iframe.contentDocument && _iframe.contentDocument.body));
    try {
      var iframe = _iframe;
      if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) {
        console.warn('[SB] observePreviewIframe: iframe not ready, MutationObserver not attached');
        return;
      }
      attachDocObserver(iframe.contentDocument);
      // Poll every 2s to detect iframe document replacement (Elementor swaps doc on preview refresh)
      var lastDoc = iframe.contentDocument;
      setInterval(function () {
        try {
          var currentIframe = document.getElementById('elementor-preview-iframe');
          if (!currentIframe) return;
          var currentDoc = currentIframe.contentDocument || currentIframe.contentWindow.document;
          if (currentDoc && currentDoc !== lastDoc && currentDoc.body) {
            console.log('[SB] iframe doc changed, re-attaching');
            lastDoc = currentDoc;
            attachDocObserver(currentDoc);
          }
        } catch (e) {}
      }, 2000);
      // Re-attach after every preview reload (e.g. when widget settings change)
      iframe.addEventListener('load', function () {
        console.log('[SB] preview iframe reloaded, re-attaching observer');
        try {
          var newDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (newDoc && newDoc.body) {
            attachDocObserver(newDoc);
          }
        } catch (e) { console.warn('[SB] re-attach after reload failed', e); }
      });
    } catch (e) {
      console.warn('[SB] observePreviewIframe failed', e);
    }
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */

  var _initialized = false;
  function init() {
    console.log('[SB] init() called, already initialized:', _initialized);
    if (_initialized) {
      console.log('[SB] already initialized, skipping');
      return;
    }
    _initialized = true;
    console.log('[SB] init() running — setting up hooks and observer');
    setupElementorHooks();
    observePreviewIframe();

    // ── postMessage listener: sbHeight from Scheduler widget iframes ───────
    // The embed iframe sends { sbHeight: number } on every load/resize.
    // This is the most reliable signal that a Scheduler widget exists in the preview.
    window.addEventListener('message', function (ev) {
      try {
        if (!ev.data || typeof ev.data.sbHeight === 'undefined') return;

        var previewIframe = document.getElementById('elementor-preview-iframe');
        if (!previewIframe) return;

        var previewDoc;
        try {
          previewDoc = previewIframe.contentDocument || previewIframe.contentWindow.document;
        } catch (e) { return; }

        if (!previewDoc || !previewDoc.body) return;

        var widgets = previewDoc.querySelectorAll('[data-widget_type^="schedule_widget"]');
        widgets.forEach(function (w) {
          var widgetId = w.dataset && w.dataset.id;
          if (!widgetId) return;

          var embedId = null;
          try {
            var fr = w.querySelector('iframe[src]');
            if (fr) embedId = new URL(fr.src).searchParams.get('embedId') || null;
          } catch (e) {}

          console.log('[SB] sbHeight → registering widget:', widgetId, embedId);
          apiRegister(widgetId, embedId);
        });
      } catch (e) {}
    });
  }

  function tryInit() {
    console.log('[SB] tryInit called');
    var _diag_iframe = document.getElementById('elementor-preview-iframe');
    console.log('[SB] iframe check:', {
      iframeExists: !!_diag_iframe,
      hasDoc: !!(_diag_iframe && _diag_iframe.contentDocument),
      hasBody: !!(_diag_iframe && _diag_iframe.contentDocument && _diag_iframe.contentDocument.body),
      hasElementor: typeof window.elementor
    });
    try {
      var iframe = _diag_iframe;
      if (iframe && iframe.contentDocument &&
          iframe.contentDocument.body && window.elementor) {
        console.log('[SB] tryInit: preview already ready — calling init() immediately');
        init();
        return;
      }
    } catch (e) { console.warn('[SB] tryInit immediate check threw', e); }

    if (window.elementor) {
      console.log('[SB] tryInit: elementor exists but iframe not ready — registering preview:loaded + 500ms timeout');
      try {
        window.elementor.on('preview:loaded', function () {
          console.log('[SB] preview:loaded fired — calling init()');
          init();
        });
      } catch (e) { console.warn('[SB] elementor.on(preview:loaded) failed', e); }
      setTimeout(function () {
        console.log('[SB] 500ms timeout fired');
        try { init(); } catch (e) {}
      }, 500);
    } else {
      console.log('[SB] tryInit: elementor not yet available — waiting for elementor:init');
      window.addEventListener('elementor:init', function () {
        console.log('[SB] elementor:init event fired');
        setTimeout(function () { try { init(); } catch (e) {} }, 200);
      });
      setTimeout(function () {
        console.log('[SB] 2000ms fallback timeout fired');
        try { init(); } catch (e) {}
      }, 2000);
    }
  }

  tryInit();
})();
