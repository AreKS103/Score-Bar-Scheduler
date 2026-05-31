/**
 * Scheduler banner front-end.
 *
 * Fetches highlighted matches for the admin-selected embed, avoids browser/CDN
 * cache, refreshes on focus/visibility, and polls lightly while the page is open.
 */
(function () {
  'use strict';

  var configs = [];
  if (Array.isArray(window.ScorebarBannerConfigs)) {
    configs = window.ScorebarBannerConfigs;
  } else if (window.ScorebarBannerConfig) {
    configs = [window.ScorebarBannerConfig];
  }
  if (!configs.length) return;

  var REDUCED = false;
  try {
    REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getTz(cfg) {
    if (cfg && cfg.timeZone) return cfg.timeZone;
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  }

  function initBanner(cfg) {
    if (!cfg) return;

    var targetId = cfg.targetId || 'sb-banner';
    var banner = document.getElementById(targetId);
    if (!banner) return;

    var interval = Math.max(2, parseInt(cfg.interval, 10) || 5) * 1000;
    var refreshInterval = Math.max(5, Math.min(300, parseInt(cfg.refresh, 10) || 15)) * 1000;
    var animClass = cfg.animation === 'fade' ? 'sb-anim-fade' : 'sb-anim-slide';
    var rotationTimer = null;
    var refreshTimer = null;
    var pending = false;
    var lastSerial = banner.getAttribute('data-serial') || null;
    var current = 0;
    var fixedOffsetAttached = false;
    var fixedResizeObserver = null;

    banner.classList.remove('sb-anim-fade', 'sb-anim-slide');
    banner.classList.add(animClass);

    function buildSlideHtml(item) {
      item = item || {};
      var parts = [];
      var logo = item.leagueLogo || item.homeLogo || item.awayLogo || '';
      var sport = item.league || item.sport || '';
      var matchup = item.matchup || item.label || '';

      if (cfg.showLogos && logo) {
        parts.push('<img class="sb-logo" src="' + esc(logo) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'" />');
      }
      if (cfg.showTime && item.time) {
        parts.push('<span class="sb-time">' + esc(item.time) + '</span>');
      }
      if (cfg.showTime && item.time && sport) {
        parts.push('<span class="sb-separator">&middot;</span>');
      }
      if (sport) {
        parts.push('<span class="sb-sport">' + esc(sport) + ':</span>');
      }
      parts.push('<span class="sb-matchup">' + esc(matchup || 'Featured match') + '</span>');
      return parts.join('');
    }

    function fallbackItems() {
      if (!cfg.fallback) return [];
      return [{ label: cfg.fallback, matchup: cfg.fallback, sport: '', league: '', time: '', leagueLogo: '', homeLogo: '', awayLogo: '', away: '', round: '' }];
    }

    function syncFixedOffset() {
      if (banner.getAttribute('data-fixed') !== '1' || !document.body) return;
      var h = banner.classList.contains('sb-ready') ? (banner.offsetHeight || 0) : 0;
      document.body.style.paddingTop = h > 0 ? h + 'px' : '';
    }

    function applyFixedOffset() {
      if (banner.getAttribute('data-fixed') !== '1') return;
      syncFixedOffset();
      if (fixedOffsetAttached) return;
      fixedOffsetAttached = true;
      window.addEventListener('resize', syncFixedOffset);
      if (typeof ResizeObserver !== 'undefined') {
        try {
          fixedResizeObserver = new ResizeObserver(syncFixedOffset);
          fixedResizeObserver.observe(banner);
        } catch (e) {
          fixedResizeObserver = null;
        }
      }
    }

    function stopRotation() {
      if (rotationTimer) {
        clearInterval(rotationTimer);
        rotationTimer = null;
      }
    }

    function go(slides, next) {
      if (next === current || !slides[current] || !slides[next]) return;
      var outgoing = slides[current];
      var incoming = slides[next];

      if (animClass === 'sb-anim-fade' || REDUCED) {
        outgoing.classList.remove('sb-active');
        incoming.classList.add('sb-active');
      } else {
        incoming.classList.add('sb-active');
        outgoing.classList.add('sb-leaving');
        outgoing.classList.remove('sb-active');
        (function (slide) {
          setTimeout(function () { slide.classList.remove('sb-leaving'); }, 550);
        })(outgoing);
      }
      current = next;
    }

    function startRotation() {
      if (rotationTimer || document.hidden) return;
      var slides = banner.querySelectorAll('.sb-slide');
      if (slides.length < 2) return;
      rotationTimer = setInterval(function () {
        go(slides, (current + 1) % slides.length);
      }, interval);
    }

    function hideBanner() {
      stopRotation();
      banner.innerHTML = '';
      banner.classList.remove('sb-ready');
      syncFixedOffset();
    }

    function render(items, serial, allowFallback) {
      if (!items || !items.length) items = allowFallback ? fallbackItems() : [];
      if (!items.length) {
        hideBanner();
        return;
      }

      stopRotation();
      current = 0;

      var prefixHtml = cfg.prefix
        ? '<div class="sb-prefix">' + esc(cfg.prefix) + '</div>'
        : '';

      var slidesHtml = '';
      for (var i = 0; i < items.length; i++) {
        slidesHtml += '<div class="sb-slide' + (i === 0 ? ' sb-active' : '') + '" data-i="' + i + '">' + buildSlideHtml(items[i]) + '</div>';
      }

      var inner = '<div class="sb-inner">' + prefixHtml + '<div class="sb-track">' + slidesHtml + '</div></div>';
      banner.innerHTML = cfg.link
        ? '<a class="sb-link" href="' + esc(cfg.link) + '">' + inner + '</a>'
        : inner;
      banner.setAttribute('data-serial', serial || '');
      banner.classList.add('sb-ready');
      applyFixedOffset();
      startRotation();
    }

    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (!cfg.app || !cfg.token || !cfg.embedId) return;
      refreshTimer = setTimeout(function () {
        if (document.hidden) {
          scheduleRefresh();
          return;
        }
        load(false);
      }, refreshInterval);
    }

    function load(force) {
      if (!cfg.app || !cfg.token || !cfg.embedId) {
        lastSerial = 'fallback';
        render(fallbackItems(), lastSerial, true);
        return;
      }
      if (pending) return;
      pending = true;

      var url = cfg.app + '/api/banner?apiKey=' + encodeURIComponent(cfg.token) +
        '&embedId=' + encodeURIComponent(cfg.embedId) +
        '&tz=' + encodeURIComponent(getTz(cfg)) +
        '&range=' + encodeURIComponent(cfg.range === 'week' ? 'week' : 'today') +
        '&_=' + Date.now();

      fetch(url, { credentials: 'omit', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          var items = data && Array.isArray(data.items) ? data.items : [];
          var serial = data && (data.serial || data.publishedAt) ? String(data.serial || data.publishedAt) : 'fallback';
          var slideCount = banner.querySelectorAll('.sb-slide').length;
          if (serial !== lastSerial || !banner.classList.contains('sb-ready') || slideCount !== items.length) {
            lastSerial = serial;
            render(items, serial, !data);
          } else {
            startRotation();
          }
        })
        .catch(function () {
          if (lastSerial === null) {
            lastSerial = 'fallback';
            render(fallbackItems(), lastSerial, true);
          }
        })
        .then(function () {
          pending = false;
          scheduleRefresh();
        });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopRotation();
      } else {
        load(false);
        startRotation();
      }
    });
    window.addEventListener('focus', function () { load(false); });
    window.addEventListener('pageshow', function () { load(false); });
    window.addEventListener('online', function () { load(false); });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { load(true); });
    } else {
      load(true);
    }
  }

  configs.forEach(initBanner);
})();
