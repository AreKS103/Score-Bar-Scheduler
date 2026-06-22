<?php
/**
 * Horizontal-overflow diagnostic for the live frontend.
 *
 * Add ?sb_diag=1 to any page URL to inject a small diagnostic panel that can
 * log/copy a full Scheduler page report. Add ?sb_overflow_diag=1 to run the
 * overflow scanner immediately as well.
 *
 * Output appears in the browser console under "[ScoreBar diagnostic]".
 * This script ONLY runs when the query var is present, so it is safe to
 * leave shipped in production.
 */
if (!defined('ABSPATH')) exit;

if (!function_exists('schedule_maybe_inject_overflow_diagnostic')) {
function schedule_maybe_inject_overflow_diagnostic() {
    $run_full_diag = !empty($_GET['sb_diag']) && $_GET['sb_diag'] === '1';
    $run_overflow_diag = !empty($_GET['sb_overflow_diag']) && $_GET['sb_overflow_diag'] === '1';
    if (!$run_full_diag && !$run_overflow_diag) return;

    $theme = function_exists('wp_get_theme') ? wp_get_theme() : null;
    $server_context = [
        'pluginVersion' => defined('SCHEDULE_PLUGIN_VERSION') ? SCHEDULE_PLUGIN_VERSION : 'unknown',
        'appDomain' => function_exists('schedule_get_app_domain') ? schedule_get_app_domain() : '',
        'theme' => $theme ? trim($theme->get('Name') . ' ' . $theme->get('Version')) : '',
        'isSchedulePage' => function_exists('schedule_page_has_widget') && schedule_page_has_widget(),
        'bannerEnabled' => function_exists('schedule_banner_get_settings') ? !empty(schedule_banner_get_settings()['enabled']) : null,
    ];
    ?>
    <script>
    (function(){
      var serverContext = <?php echo wp_json_encode($server_context, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT); ?>;
      var autoRunOverflow = <?php echo $run_overflow_diag ? 'true' : 'false'; ?>;
      var logStore = window.__scorebarDiagnosticLog = window.__scorebarDiagnosticLog || [];
      var methods = ['log','info','warn','error','debug'];

      function stringifyArg(arg){
        if (arg instanceof Error) return {name:arg.name,message:arg.message,stack:arg.stack || ''};
        if (arg && typeof arg === 'object') {
          try { return JSON.parse(JSON.stringify(arg)); } catch(e) { return String(arg); }
        }
        return arg;
      }

      if (!window.__scorebarConsoleHooked) {
        window.__scorebarConsoleHooked = true;
        methods.forEach(function(method){
          var original = console[method];
          if (typeof original !== 'function') return;
          console[method] = function(){
            try {
              logStore.push({at:new Date().toISOString(), level:method, args:Array.prototype.slice.call(arguments).map(stringifyArg)});
              if (logStore.length > 250) logStore.splice(0, logStore.length - 250);
            } catch(e) {}
            return original.apply(console, arguments);
          };
        });
        window.addEventListener('error', function(event){
          logStore.push({at:new Date().toISOString(), level:'window.error', message:event.message || '', source:event.filename || '', line:event.lineno || 0, column:event.colno || 0, error:stringifyArg(event.error)});
        });
        window.addEventListener('unhandledrejection', function(event){
          logStore.push({at:new Date().toISOString(), level:'unhandledrejection', reason:stringifyArg(event.reason)});
        });
      }

      function redactedUrl(value){
        if (!value) return '';
        try {
          var url = new URL(value, location.href);
          url.pathname = url.pathname.replace(/\/embed\/[^/?#]+/i, '/embed/[redacted-token]');
          ['apiKey','token','key'].forEach(function(param){ if (url.searchParams.has(param)) url.searchParams.set(param, '[redacted]'); });
          return url.toString();
        } catch(e) {
          return String(value).replace(/\/embed\/[^?\s"']+/i, '/embed/[redacted-token]');
        }
      }

      function cssPath(el){
        if (!el || !el.tagName) return '';
        var parts = [];
        while (el && el.nodeType === 1 && parts.length < 6) {
          var part = el.tagName.toLowerCase();
          if (el.id) { part += '#' + el.id; parts.unshift(part); break; }
          if (el.className && typeof el.className === 'string') {
            var cls = el.className.trim().split(/\s+/).slice(0, 3).join('.');
            if (cls) part += '.' + cls;
          }
          parts.unshift(part);
          el = el.parentElement;
        }
        return parts.join(' > ');
      }

      function box(el){
        if (!el) return null;
        var rect = el.getBoundingClientRect();
        var cs = window.getComputedStyle(el);
        return {
          selector: cssPath(el),
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          className: String(el.className || '').slice(0, 160),
          text: String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          display: cs.display,
          visibility: cs.visibility,
          position: cs.position,
          zIndex: cs.zIndex,
          overflow: cs.overflow,
        };
      }

      function scan(root){
        var doc = root || document;
        var viewport = (doc.documentElement && doc.documentElement.clientWidth) || window.innerWidth;
        var all = Array.prototype.slice.call(doc.querySelectorAll('*'));
        var offenders = [];
        all.forEach(function(el){
          try{
            var rect = el.getBoundingClientRect();
            if (!rect.width && !rect.height) return;
            var rightOverflow = Math.ceil(rect.right - viewport);
            var leftOverflow  = Math.ceil(0 - rect.left);
            var scrollOverflow = Math.ceil((el.scrollWidth || 0) - (el.clientWidth || 0));
            if (rightOverflow > 1 || leftOverflow > 1 || scrollOverflow > 1) {
              var cs = window.getComputedStyle(el);
              offenders.push({
                tag: el.tagName.toLowerCase(),
                id: el.id || '',
                cls: (el.className && el.className.toString().slice(0,80)) || '',
                rightOverflow: rightOverflow > 0 ? rightOverflow : 0,
                leftOverflow:  leftOverflow  > 0 ? leftOverflow  : 0,
                scrollOverflow: scrollOverflow > 0 ? scrollOverflow : 0,
                width: Math.round(rect.width),
                rectRight: Math.round(rect.right),
                position: cs.position,
                transform: cs.transform === 'none' ? '' : cs.transform,
                marginRight: cs.marginRight,
                node: el,
              });
            }
          }catch(e){}
        });
        offenders.sort(function(a,b){
          return (b.rightOverflow + b.leftOverflow + b.scrollOverflow) - (a.rightOverflow + a.leftOverflow + a.scrollOverflow);
        });
        return offenders;
      }
      function runOverflow(){
        var off = scan(document);
        if (!off.length){
          console.info('[SB overflow] No horizontal overflow detected at viewport',
            document.documentElement.clientWidth, 'px.');
          return [];
        }
        console.group('[SB overflow] Top offenders (viewport ' + document.documentElement.clientWidth + 'px)');
        console.table(off.slice(0,20).map(function(o){
          return {tag:o.tag,id:o.id,cls:o.cls,rightOverflow:o.rightOverflow,leftOverflow:o.leftOverflow,scrollOverflow:o.scrollOverflow,width:o.width,rectRight:o.rectRight,position:o.position};
        }));
        off.slice(0,5).forEach(function(o,i){
          try{
            o.node.style.outline = (i===0 ? '3px solid red' : '2px dashed orange');
            o.node.style.outlineOffset = '-2px';
          }catch(e){}
        });
        console.info('[SB overflow] Outlined top 5. Inspect the red one first.');
        console.groupEnd();
        return off;
      }

      function textBeforeHeader(){
        var header = document.querySelector('header,#masthead,.elementor-location-header,[data-elementor-type="header"],.hfe-site-header');
        if (!header) return '';
        var text = '';
        var children = Array.prototype.slice.call(document.body.children);
        for (var i = 0; i < children.length; i++) {
          var child = children[i];
          if (child === header || (child.contains && child.contains(header))) break;
          text += ' ' + String(child.innerText || child.textContent || '').trim();
        }
        return text.replace(/\s+/g, ' ').trim().slice(0, 800);
      }

      function collectDiagnostic(){
        var banner = document.getElementById('sb-banner');
        var iframes = Array.prototype.slice.call(document.querySelectorAll('iframe')).map(function(frame){
          var data = box(frame);
          data.src = redactedUrl(frame.getAttribute('src') || frame.getAttribute('data-src') || '');
          data.rawSrcPresent = !!frame.getAttribute('src');
          data.loading = frame.getAttribute('loading') || '';
          data.dataLayout = frame.getAttribute('data-layout') || '';
          return data;
        });
        var seoNodes = Array.prototype.slice.call(document.querySelectorAll('.scorebar-seo-content,.scorebar-seo-category,.scorebar-seo-league,[data-scorebar-seo]')).map(box);
        var bannerConfigs = window.ScorebarBannerConfigs || (window.ScorebarBannerConfig ? [window.ScorebarBannerConfig] : []);
        return {
          label: 'ScoreBar Scheduler diagnostic',
          generatedAt: new Date().toISOString(),
          server: serverContext,
          page: {
            url: location.href,
            title: document.title,
            readyState: document.readyState,
            userAgent: navigator.userAgent,
            viewport: {width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1},
            scroll: {x: window.scrollX, y: window.scrollY},
          },
          counts: {
            banners: document.querySelectorAll('#sb-banner').length,
            bannerConfigs: bannerConfigs.length,
            scheduleWidgets: document.querySelectorAll('.elementor-widget-schedule_widget').length,
            scheduleWrappers: document.querySelectorAll('.schedule-wrapper').length,
            scorebarIframes: document.querySelectorAll('iframe[title="Score Bar schedule"]').length,
            seoLeakNodes: seoNodes.length,
          },
          banner: banner ? {
            box: box(banner),
            classes: banner.className,
            serial: banner.getAttribute('data-serial') || '',
            fixed: banner.getAttribute('data-fixed') || '',
            config: bannerConfigs.map(function(config){
              var copy = {};
              Object.keys(config || {}).forEach(function(key){
                copy[key] = /token|apiKey|key/i.test(key) ? '[redacted]' : config[key];
              });
              return copy;
            }),
          } : null,
          header: box(document.querySelector('header,#masthead,.elementor-location-header,[data-elementor-type="header"],.hfe-site-header')),
          scheduleWidgets: Array.prototype.slice.call(document.querySelectorAll('.elementor-widget-schedule_widget,.schedule-wrapper')).map(box),
          iframes: iframes,
          seoLeakNodes: seoNodes,
          topBodyChildren: Array.prototype.slice.call(document.body.children).slice(0, 8).map(box),
          textBeforeHeader: textBeforeHeader(),
          overflowTop: scan(document).slice(0, 10).map(function(o){
            return {selector:cssPath(o.node),tag:o.tag,id:o.id,cls:o.cls,rightOverflow:o.rightOverflow,leftOverflow:o.leftOverflow,scrollOverflow:o.scrollOverflow,width:o.width,rectRight:o.rectRight,position:o.position};
          }),
          recentConsole: logStore.slice(-80),
        };
      }

      function diagnosticText(){
        return JSON.stringify(collectDiagnostic(), null, 2);
      }

      function logDiagnostic(){
        var diagnostic = collectDiagnostic();
        console.group('[ScoreBar diagnostic] Full Scheduler report');
        console.log(diagnostic);
        console.log(JSON.stringify(diagnostic, null, 2));
        console.groupEnd();
        return diagnostic;
      }

      function copyText(text){
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text);
        }
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); } finally { area.remove(); }
        return Promise.resolve();
      }

      function mountPanel(){
        if (document.getElementById('scorebar-diagnostic-panel')) return;
        var panel = document.createElement('section');
        panel.id = 'scorebar-diagnostic-panel';
        panel.setAttribute('aria-label', 'ScoreBar Scheduler diagnostics');
        panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;width:min(360px,calc(100vw - 24px));box-sizing:border-box;background:#111827;color:#f9fafb;border:1px solid rgba(255,255,255,.18);box-shadow:0 14px 34px rgba(0,0,0,.28);border-radius:8px;padding:12px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';
        panel.innerHTML = '<div style="font-weight:700;margin-bottom:4px">ScoreBar Scheduler diagnostics</div><div id="scorebar-diagnostic-summary" style="color:#cbd5e1;margin-bottom:10px">Ready to collect page, banner, iframe, SEO, and console context.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-sb-diag="log" style="cursor:pointer;border:1px solid #64748b;background:#1f2937;color:#fff;border-radius:6px;padding:7px 10px;font-weight:700">Log full report</button><button type="button" data-sb-diag="copy" style="cursor:pointer;border:1px solid #22c55e;background:#16a34a;color:#fff;border-radius:6px;padding:7px 10px;font-weight:700">Copy report</button><button type="button" data-sb-diag="overflow" style="cursor:pointer;border:1px solid #f97316;background:#9a3412;color:#fff;border-radius:6px;padding:7px 10px;font-weight:700">Scan overflow</button><button type="button" data-sb-diag="close" aria-label="Close diagnostics" style="margin-left:auto;cursor:pointer;border:1px solid #475569;background:#0f172a;color:#fff;border-radius:6px;padding:7px 10px">Close</button></div>';
        document.body.appendChild(panel);
        var summary = document.getElementById('scorebar-diagnostic-summary');
        function setStatus(message){ if (summary) summary.textContent = message; }
        panel.addEventListener('click', function(event){
          var action = event.target && event.target.getAttribute && event.target.getAttribute('data-sb-diag');
          if (!action) return;
          if (action === 'log') {
            logDiagnostic();
            setStatus('Full report logged to the console.');
          } else if (action === 'copy') {
            copyText(diagnosticText()).then(function(){ setStatus('Full diagnostic report copied.'); }, function(err){ setStatus('Copy failed: ' + (err && err.message ? err.message : err)); });
          } else if (action === 'overflow') {
            runOverflow();
            setStatus('Overflow scan logged; top offenders are outlined.');
          } else if (action === 'close') {
            panel.remove();
          }
        });
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function(){ mountPanel(); if (autoRunOverflow) runOverflow(); });
      } else {
        mountPanel();
        if (autoRunOverflow) runOverflow();
      }
      window.addEventListener('load', function(){ if (autoRunOverflow) setTimeout(runOverflow, 400); });
      window.sbOverflowDiag = runOverflow;
      window.sbSchedulerDiag = collectDiagnostic;
      window.sbLogSchedulerDiag = logDiagnostic;
      window.sbCopySchedulerDiag = function(){ return copyText(diagnosticText()); };
    })();
    </script>
    <?php
}
}
add_action('wp_footer', 'schedule_maybe_inject_overflow_diagnostic', 999);
