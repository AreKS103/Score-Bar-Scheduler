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

  if (!appUrl || !apiKey) return;

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
        }
      } catch (e) {}
    }
  }

  /* ── DOM-level fallback: MutationObserver on Elementor preview iframe ─── */

  var deleteTimers = {};

  function observePreviewIframe() {
    try {
      var iframe = document.getElementById('elementor-preview-iframe');
      if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) return;
      var doc = iframe.contentDocument;

      new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
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

          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            var check = function (el) {
              if (el.dataset && el.dataset.widget_type &&
                  el.dataset.widget_type.indexOf('schedule_widget') === 0 &&
                  el.dataset.id && deleteTimers[el.dataset.id]) {
                clearTimeout(deleteTimers[el.dataset.id]);
                delete deleteTimers[el.dataset.id];
              }
            };
            check(node);
            if (typeof node.querySelectorAll === 'function') {
              node.querySelectorAll('[data-widget_type^="schedule_widget"]').forEach(check);
            }
          });
        });
      }).observe(doc.body, { childList: true, subtree: true });
    } catch (e) {
      console.warn('[SB] observePreviewIframe failed', e);
    }
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */

  var _initialized = false;
  function init() {
    if (_initialized) {
      console.log('[SB] already initialized, skipping');
      return;
    }
    _initialized = true;
    console.log('[SB] editor sync init');
    setupElementorHooks();
    observePreviewIframe();
  }

  function tryInit() {
    try {
      var iframe = document.getElementById('elementor-preview-iframe');
      if (iframe && iframe.contentDocument &&
          iframe.contentDocument.body && window.elementor) {
        init();
        return;
      }
    } catch (e) {}

    if (window.elementor) {
      try {
        window.elementor.on('preview:loaded', function () { init(); });
      } catch (e) {}
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
