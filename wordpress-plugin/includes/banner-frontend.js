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
    var reel = null;
    var rowH = 0;
    var slideCount = 0;
    var useReel = false;
    var REEL_DURATION = 600;
    var REEL_TRANSITION = 'transform ' + (REEL_DURATION / 1000) + 's cubic-bezier(.4,0,.2,1)';

    banner.classList.remove('sb-anim-fade', 'sb-anim-slide');
    banner.classList.add(animClass);
    banner.classList.add('sb-js-ready');

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

    function shouldUseReelForCount(count) {
      return (animClass === 'sb-anim-slide') && !REDUCED && count > 1;
    }

    function measureReel() {
      if (!reel) return;
      var track = banner.querySelector('.sb-track');
      if (!track) return;
      var kids = reel.children;
      reel.style.transition = 'none';
      track.style.height = '';
      for (var i = 0; i < kids.length; i++) {
        kids[i].style.height = '';
      }
      rowH = track.clientHeight;
      if (rowH <= 0 && kids.length) rowH = kids[0].offsetHeight;
      // The track is the clipped viewport and the reel is the moving stack.
      // Locking every slide to the viewport height places the next row exactly
      // at the bottom edge, so one translateY transition moves both rows
      // together: current exits upward while next enters from below.
      track.style.height = rowH + 'px';
      for (var j = 0; j < kids.length; j++) {
        kids[j].style.height = rowH + 'px';
      }
      reel.style.transform = 'translateY(' + (-current * rowH) + 'px)';
    }

    function advanceReel() {
      if (!reel) return;
      if (rowH <= 0) {
        measureReel();
        if (rowH <= 0) return;
      }
      current += 1;
      reel.style.transition = REEL_TRANSITION;
      reel.style.transform = 'translateY(' + (-current * rowH) + 'px)';
      if (current >= slideCount) {
        // Landed on the clone of the first slide; snap back to the real first
        // slide once the transition completes so the loop is seamless.
        setTimeout(function () {
          if (!reel) return;
          reel.style.transition = 'none';
          current = 0;
          reel.style.transform = 'translateY(0px)';
          void reel.offsetHeight;
        }, REEL_DURATION + 60);
      }
    }

    function go(slides, next) {
      if (next === current || !slides[current] || !slides[next]) return;
      var outgoing = slides[current];
      var incoming = slides[next];
      outgoing.classList.add('sb-leaving');
      outgoing.classList.remove('sb-active');
      incoming.classList.remove('sb-leaving');
      incoming.classList.add('sb-active');
      current = next;
      setTimeout(function () {
        outgoing.classList.remove('sb-leaving');
      }, 380);
    }

    function startRotation() {
      if (rotationTimer || document.hidden) return;
      if (useReel) {
        if (slideCount < 2) return;
        rotationTimer = setInterval(advanceReel, interval);
        return;
      }
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
      reel = null;
      rowH = 0;
      slideCount = items.length;
      useReel = shouldUseReelForCount(items.length);

      var prefixHtml = cfg.prefix
        ? '<div class="sb-prefix">' + esc(cfg.prefix) + '</div>'
        : '';

      var trackHtml;
      if (useReel) {
        var reelHtml = '';
        for (var i = 0; i < items.length; i++) {
          reelHtml += '<div class="sb-slide" data-i="' + i + '">' + buildSlideHtml(items[i]) + '</div>';
        }
        // Append a clone of the first slide so the upward scroll can loop
        // back to the start without a visible jump.
        reelHtml += '<div class="sb-slide" data-i="clone" aria-hidden="true">' + buildSlideHtml(items[0]) + '</div>';
        trackHtml = '<div class="sb-track"><div class="sb-reel">' + reelHtml + '</div></div>';
      } else {
        var slidesHtml = '';
        for (var j = 0; j < items.length; j++) {
          slidesHtml += '<div class="sb-slide' + (j === 0 ? ' sb-active' : '') + '" data-i="' + j + '">' + buildSlideHtml(items[j]) + '</div>';
        }
        trackHtml = '<div class="sb-track">' + slidesHtml + '</div>';
      }

      var inner = '<div class="sb-inner">' + prefixHtml + trackHtml + '</div>';
      banner.innerHTML = cfg.link
        ? '<a class="sb-link" href="' + esc(cfg.link) + '">' + inner + '</a>'
        : inner;
      banner.setAttribute('data-serial', serial || '');
      banner.classList.toggle('sb-reel-mode', useReel);
      banner.classList.add('sb-ready');

      if (useReel) {
        reel = banner.querySelector('.sb-reel');
        measureReel();
      }

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
          var slideCountDom = banner.querySelectorAll('.sb-slide:not([data-i="clone"])').length;
          var needsReelRender = shouldUseReelForCount(items.length) && !banner.classList.contains('sb-reel-mode');
          if (serial !== lastSerial || !banner.classList.contains('sb-ready') || slideCountDom !== items.length || needsReelRender) {
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
          } else {
            startRotation();
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
    window.addEventListener('resize', function () { if (useReel) measureReel(); });

    applyFixedOffset();
    startRotation();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { load(true); });
    } else {
      load(true);
    }
  }

  configs.forEach(initBanner);
})();
