import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { type NextRequest } from 'next/server';
import type { MatchEvent } from '@/types';
import { renderEmbedContent } from '@/lib/renderEmbed';
import {
  SCHEDULE_LAYOUT_CSS,
  SCHEDULE_FILTER_TAB_JS,
  buildFilterTabsHTML,
} from '@/lib/scheduleLayout';
import { renderCalendarContent, getCalendarCSS, getCalendarNavJS } from '@/lib/renderCalendar';
import { buildScheduleSeoPayload } from '@/lib/seoSchedule';
import { getOrgMemberIds } from '@/lib/supabase/org';
import { hasRefreshableSnapshotEvents, isRefreshableSnapshotEvent, refreshSnapshotEvents } from '@/lib/refreshSnapshotEvents';

export const dynamic = 'force-dynamic';

interface EmbedOpts {
  showHeader: boolean;
  showDate: boolean;
  showTime: boolean;
  theme: string;
  accentColor: string;
  fontSize: string;
  logoSize: string;
  headerSize: string;
  matchFontSize: string;
  dateFontSize: string;
  lineHeight: string;
  showSportTabs: boolean;
  fontFamily: string;
  hideLogos: boolean;
  bgColor: string;
  textColor: string;
  padding: string;
  tabStyle: string;
  listStyle: string;
  catLabels: Record<string, string>;
  embedId: string;
  widgetId: string;
  appUrl: string;
  apiKey: string;
  hideViewToggle: boolean;
  noInlineToggle: boolean;
  noCopy: boolean;
  highlightFontSize: string;
  timeFontSize: string;
  // Per-section styling — normal schedule list ("normal") and highlights ("hl").
  // Empty string = inherit existing/global styling (backward compatible).
  normalFont: string;
  normalWeight: string;
  normalTextColor: string;
  normalTimeColor: string;
  hlFont: string;
  hlWeight: string;
  hlTextColor: string;
  hlTimeColor: string;
}

const EMBED_POLL_INTERVAL_MS = 120_000;
const EMBED_POLL_JITTER_MS = 30_000;
const EMPTY_EMBED_RETRY_MS = 300_000;
const EMBED_BEACON_DEBOUNCE_MS = 5 * 60 * 1000;

function jsString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\x3c');
}

function buildBeaconScript(opts: Pick<EmbedOpts, 'appUrl' | 'apiKey' | 'embedId' | 'widgetId'>): string {
  if (!opts.appUrl || !opts.apiKey) return '';

  const beaconKey = crypto
    .createHash('sha1')
    .update(`${opts.apiKey}|${opts.embedId}|${opts.widgetId}`)
    .digest('hex')
    .slice(0, 20);

  return `\n<script>\n(function(){\n  var KEY='sb_embed_beacon_${beaconKey}';\n  var TTL=${EMBED_BEACON_DEBOUNCE_MS};\n  function seenRecently(){\n    try{\n      var last=parseInt(localStorage.getItem(KEY)||'0',10);\n      return last>0&&Date.now()-last<TTL;\n    }catch(e){return false;}\n  }\n  function markSeen(){\n    try{localStorage.setItem(KEY,String(Date.now()));}catch(e){}\n  }\n  setTimeout(function(){\n    if(seenRecently())return;\n    try{\n      fetch('${jsString(opts.appUrl)}/api/embed-instances',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:'${jsString(opts.apiKey)}',embedId:'${jsString(opts.embedId)}',widgetId:'${jsString(opts.widgetId)}',pageUrl:document.referrer||location.href}),keepalive:true})\n        .then(function(r){if(!r||r.ok)markSeen();})\n        .catch(function(){});\n    }catch(e){}\n  },800);\n})();\n</script>`;
}

function buildEmbedPollScript(applyContentBody: string): string {
  return `\n<script>\n(function(){\n  var INTERVAL=${EMBED_POLL_INTERVAL_MS};\n  var JITTER=${EMBED_POLL_JITTER_MS};\n  var root=document.getElementById('schedule-root');\n  if(!root)return;\n  var serial=root.getAttribute('data-serial')||'';\n  var base=location.href.split('#')[0];\n  var sep=base.indexOf('?')>=0?'&':'?';\n  var pollBase=base+sep+'_poll=1';\n  var pending=false;\n  var timer=null;\n  function nextDelay(){return INTERVAL+Math.floor(Math.random()*JITTER);}\n  function scheduleNext(){\n    if(timer)clearTimeout(timer);\n    timer=setTimeout(function(){\n      if(document.hidden){scheduleNext();return;}\n      poll();\n    },nextDelay());\n  }\n  function finish(){\n    pending=false;\n    scheduleNext();\n  }\n  function applyContent(d){\n${applyContentBody}\n  }\n  function poll(){\n    if(pending)return;\n    pending=true;\n    fetch(pollBase+'&_serial='+encodeURIComponent(serial),{cache:'no-store'})\n      .then(function(r){return r.ok?r.json():null;})\n      .then(function(d){if(d&&d.serial!==serial)applyContent(d);finish();})\n      .catch(function(){finish();});\n  }\n  scheduleNext();\n  document.addEventListener('visibilitychange',function(){\n    if(!document.hidden)poll();\n  });\n  window.addEventListener('message',function(ev){\n    if(ev.data&&ev.data.sbRefresh)poll();\n  });\n})();\n</script>`;
}

function buildEmptyEmbedRefreshScript(): string {
  return `<script>(function(){var RETRY=${EMPTY_EMBED_RETRY_MS};var JITTER=${EMBED_POLL_JITTER_MS};function reload(){location.reload();}function schedule(){setTimeout(function(){if(document.hidden){schedule();return;}reload();},RETRY+Math.floor(Math.random()*JITTER));}schedule();window.addEventListener('message',function(ev){if(ev.data&&ev.data.sbRefresh)reload();});})();</script>`;
}

function buildPublishedScheduleSerial(publishedAt: string, events: MatchEvent[]): string {
  const refreshableRows = events.filter(isRefreshableSnapshotEvent);
  if (refreshableRows.length === 0) return publishedAt;

  const fingerprint = refreshableRows
    .map((event) => [
      event.id,
      event.sourceEventId ?? '',
      event.date,
      event.time,
      event.home,
      event.away,
      event.homeLogo ?? '',
      event.awayLogo ?? '',
      event.round,
      event.status ?? '',
    ].join('|'))
    .join('~');
  const hash = crypto.createHash('sha1').update(fingerprint).digest('hex').slice(0, 12);
  return `${publishedAt || 'published'}:src:${hash}`;
}

function buildResizeScript(): string {
  return `\n<script>\n(function(){\n  function getHeight(){\n    var root=document.getElementById('schedule-root')||document.body;\n    var bodyStyle=window.getComputedStyle?window.getComputedStyle(document.body):null;\n    var bottomPad=bodyStyle?(parseFloat(bodyStyle.paddingBottom)||0):0;\n    if(root&&root.getBoundingClientRect){\n      var rect=root.getBoundingClientRect();\n      return Math.ceil(Math.max(120,rect.top+rect.height+bottomPad));\n    }\n    return Math.max(120,document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);\n  }\n  var pending=false;\n  function send(){\n    if(pending)return;\n    pending=true;\n    requestAnimationFrame(function(){\n      pending=false;\n      try{ var h=getHeight(); if(h>0)window.parent.postMessage({sbHeight:h},'*'); }catch(e){}\n    });\n  }\n  window._sbSendHeight=send;\n  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',send); } else { send(); }\n  window.addEventListener('load',send);\n  window.addEventListener('resize',send);\n  window.addEventListener('message',function(ev){if(ev.data&&ev.data.sbRequestHeight){requestAnimationFrame(function(){requestAnimationFrame(send);});}});\n  if(typeof ResizeObserver!=='undefined'){\n    new ResizeObserver(send).observe(document.body);\n    var root=document.getElementById('schedule-root');\n    if(root)new ResizeObserver(send).observe(root);\n  }\n  setTimeout(send,50);\n  setTimeout(send,350);\n})();\n</script>`;
}

function buildEmbedPage(
  scheduleContent: string,
  foundCategories: string[],
  opts: EmbedOpts,
  serial: string,
  publishedAt: string,
  events: MatchEvent[],
): string {
  const isDark = opts.theme === 'dark';
  const isAuto = opts.theme === 'auto';
  const accent = opts.accentColor || '#3b82f6';

  // Resolve size: supports legacy sm/md/lg tokens OR direct numeric px values
  const rp = (v: string, sm: string, md: string, lg: string) => { if (v==='sm') return sm; if (v==='lg') return lg; const n=parseInt(v??''); return (!isNaN(n)&&n>=1&&n<=500)?`${n}px`:md; };
  const logoHeight  = rp(opts.logoSize,             '22px', '32px',  '46px');
  const h3Size      = rp(opts.headerSize,            '14px', '16px',  '19px');
  const matchSize   = rp(opts.matchFontSize,         '12px', '14px',  '16px');
  const dateSize    = rp(opts.dateFontSize,          '10px', '11px',  '13px');
  const hlFontSize  = rp(opts.highlightFontSize||'18','14px','18px',  '22px');
  const timeSize    = rp(opts.timeFontSize||'11',     '9px',  '11px',  '13px');
  const FONT_STACKS: Record<string, string> = {
    system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    serif:  "Georgia, 'Times New Roman', Times, serif",
    mono:   "'SF Mono', 'Fira Code', Consolas, monospace",
  };
  const fontStack = FONT_STACKS[opts.fontFamily] ?? FONT_STACKS.system;

  // Per-section style values — fall back to inherit/theme defaults when unset
  const normalFontCss  = FONT_STACKS[opts.normalFont] ?? 'inherit';
  const hlFontCss      = FONT_STACKS[opts.hlFont] ?? 'inherit';
  const normalWeight   = opts.normalWeight || '400';
  const hlWeight       = opts.hlWeight || '400';
  const normalTextCss  = opts.normalTextColor || 'var(--text)';
  const hlTextCss      = opts.hlTextColor || 'var(--heading,#111827)';
  const normalTimeCss  = opts.normalTimeColor || 'var(--time-default)';
  const hlTimeCss      = opts.hlTimeColor || 'var(--time-default)';

  const isCard = opts.listStyle === 'card';
  const lineH = Math.max(0.8, Math.min(4, parseFloat(opts.lineHeight) || 1.6));
  const leagueGap = `${Math.round(lineH * 10)}px`;
  const dateMarginTop = Math.round(lineH * 5);
  const dateMarginBottom = Math.max(4, Math.round(lineH * 4));
  const dateMargin = `${dateMarginTop}px 0 ${dateMarginBottom}px`;
  const paddingVal = Math.max(0, Math.min(80, parseInt(opts.padding) || 12));
  const bodyPad = `${paddingVal}px`;

  const tabsHTML = opts.showSportTabs ? buildFilterTabsHTML(events, opts.catLabels) : '';

  const bgOverride   = opts.bgColor || '';
  const textOverride = opts.textColor || '';
  const lightVars = `--bg:${bgOverride || '#fff'};--text:${textOverride || '#111827'};--muted:#6b7280;--heading:${textOverride || '#111827'};--border:#e5e7eb;--tab-bg:#f3f4f6;--tab-text:#6b7280;--tab-active:${accent};--tab-active-text:#fff;--accent:${accent};--card-bg:#f4f6f9;--hl-title-color:#000;--time-default:${textOverride || '#111827'};`;
  const darkVars  = `--bg:${bgOverride || '#0f1117'};--text:${textOverride || '#e8eaf0'};--muted:#8b92a8;--heading:${textOverride || '#f0f2f8'};--border:#2d3142;--tab-bg:#1e2130;--tab-text:#8b92a8;--tab-active:${accent};--tab-active-text:#fff;--accent:${accent};--card-bg:#181c28;--hl-title-color:${textOverride || '#f0f2f8'};--time-default:#fff;`;

  const css = `
:root{${isAuto ? lightVars : isDark ? darkVars : lightVars};--sb-match-size:${matchSize};--sb-date-size:${dateSize};--sb-h3-size:${h3Size};--sb-logo-height:${logoHeight};--sb-hl-size:${hlFontSize};--sb-time-size:${timeSize};--sb-normal-font:${normalFontCss};--sb-normal-weight:${normalWeight};--sb-normal-text:${normalTextCss};--sb-normal-time-color:${normalTimeCss};--sb-hl-font:${hlFontCss};--sb-hl-weight:${hlWeight};--sb-hl-text:${hlTextCss};--sb-hl-time-color:${hlTimeCss}}
${isAuto ? `@media(prefers-color-scheme:dark){:root{${darkVars}}}` : ''}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--text);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:${lineH};-webkit-font-smoothing:antialiased;width:100%}
body{padding:${bodyPad}}
#sport-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.tab{background:#fff;border:1px solid var(--border,#e5e7eb);color:var(--muted,#6b7280);padding:5px 14px;border-radius:999px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:500;white-space:nowrap}
.tab.active{background:var(--heading,#1e3a5f);color:#fff;border-color:var(--heading,#1e3a5f)}
@media (max-width:480px){#sport-tabs{gap:5px;margin-bottom:12px}.tab{padding:4px 11px;font-size:11px}}
#schedule-root,.schedule-content{width:100%}
.schedule-content{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.hl-updated{font-size:12px;color:#6b7280;margin:0 0 12px;display:flex;align-items:center;gap:6px}
.hl-updated-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;flex-shrink:0;display:inline-block}
.vt-bar{display:flex;justify-content:flex-end;gap:4px;margin-bottom:10px}
.vt-btn{padding:4px 12px;border-radius:999px;border:1px solid var(--border,#e5e7eb);background:var(--tab-bg,#f3f4f6);color:var(--tab-text,#6b7280);cursor:pointer;font-size:12px;font-family:inherit;font-weight:500;white-space:nowrap}
.vt-active{background:var(--accent,#3b82f6)!important;color:#fff!important;border-color:var(--accent,#3b82f6)!important}
${SCHEDULE_LAYOUT_CSS}
`;

  const tabJS = `\n<script>\n${SCHEDULE_FILTER_TAB_JS}\n</script>`;

  const cardJS = '';

  const resizeJS = buildResizeScript();
  const styleJS = `\n<script>\n(function(){\n  var CSS_SIZE=/^\\d+(\\.\\d+)?(px|em|rem|%)$/;\n  window.addEventListener('message',function(e){\n    if(!e.data||!e.data.sbStyle)return;\n    var r=document.documentElement;var s=e.data.sbStyle;\n    if(s.matchFontSize&&CSS_SIZE.test(s.matchFontSize))r.style.setProperty('--sb-match-size',s.matchFontSize);\n    if(s.dateFontSize&&CSS_SIZE.test(s.dateFontSize))r.style.setProperty('--sb-date-size',s.dateFontSize);\n    if(s.headerSize&&CSS_SIZE.test(s.headerSize))r.style.setProperty('--sb-h3-size',s.headerSize);\n    if(s.logoHeight&&CSS_SIZE.test(s.logoHeight))r.style.setProperty('--sb-logo-height',s.logoHeight);\n    if(s.hlFontSize&&CSS_SIZE.test(s.hlFontSize))r.style.setProperty('--sb-hl-size',s.hlFontSize);\n  });\n})();\n</script>`;

  const noCopyJS = opts.noCopy ? `\n<script>\n(function(){\n  var s=document.createElement('style');s.textContent='*{-webkit-user-select:none!important;user-select:none!important;-moz-user-select:none!important}';\n  document.head.appendChild(s);\n  function b(e){e.preventDefault();return false;}\n  document.addEventListener('contextmenu',b,false);\n  document.addEventListener('selectstart',b,false);\n  document.addEventListener('copy',b,false);\n  document.addEventListener('cut',b,false);\n  document.addEventListener('keydown',function(e){\n    if((e.ctrlKey||e.metaKey)&&['a','c','u','s','p'].indexOf(e.key.toLowerCase())>=0)b(e);\n  });\n  document.addEventListener('dragstart',b,false);\n})();\n</script>` : '';

  const beaconJS = buildBeaconScript(opts);

  const _ic = 'false';
  const pollJS = buildEmbedPollScript(`    var isCard=${_ic};\n    if(d.empty){\n      var sc=root.querySelector('.schedule-content');\n      if(sc)sc.innerHTML='<div style="display:inline-flex;align-items:center;gap:8px;font-size:13px;border:1px dashed #d1d5db;border-radius:8px;padding:10px 16px;background:#f9fafb;color:#9ca3af">No schedule published yet.</div>';\n      var ot=document.getElementById('sport-tabs');if(ot)ot.remove();\n      root.setAttribute('data-serial','none');serial='none';\n      try{if(window._sbSendHeight){window._sbSendHeight();}else{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}}catch(e){}\n      return;\n    }\n    var oldT=document.getElementById('sport-tabs');\n    if(d.tabsHtml){\n      var tmp=document.createElement('div');tmp.innerHTML=d.tabsHtml;\n      var newT=tmp.firstElementChild;\n      if(oldT){oldT.replaceWith(newT);}else{root.insertBefore(newT,root.firstChild);}\n    }else if(oldT){oldT.remove();}\n    var sc=root.querySelector('.schedule-content');\n    if(sc){\n      sc.innerHTML=d.html;\n      if(isCard&&window._sbWrapCards){\n        var s=sc.querySelectorAll('.sport-section,.sport-always');\n        if(s.length>0){s.forEach(window._sbWrapCards);}else{window._sbWrapCards(sc);}\n      }\n    }\n    root.setAttribute('data-serial',d.serial);serial=d.serial;\n    try{if(window._sbSendHeight){window._sbSendHeight();}else{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}}catch(e){}`);

  const toggleBar = !opts.hideViewToggle && !opts.noInlineToggle ? `<div class="vt-bar" style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:10px"><button class="vt-btn vt-active" data-layout="list" style="padding:4px 14px;border-radius:999px;border:1px solid var(--accent,#3b82f6);background:var(--accent,#3b82f6);color:#fff;cursor:pointer;font-size:12px;font-family:inherit;font-weight:600">List</button><button class="vt-btn" data-layout="calendar" style="padding:4px 14px;border-radius:999px;border:1px solid var(--border,#e5e7eb);background:var(--tab-bg,#f3f4f6);color:var(--tab-text,#6b7280);cursor:pointer;font-size:12px;font-family:inherit;font-weight:500">Calendar</button></div>` : '';
  const toggleJS = !opts.hideViewToggle ? `\n<script>\n(function(){document.querySelectorAll('.vt-btn').forEach(function(b){b.addEventListener('click',function(){var u=new URL(location.href);u.searchParams.set('layout',b.getAttribute('data-layout'));location.replace(u.toString());});});})();\n</script>` : '';

  const safePublishedAt = publishedAt.replace(/[^0-9a-zA-Z.:+\-TZ]/g, '');
  const lastUpdatedJS = safePublishedAt ? `\n<script>\n(function(){\n  var d=new Date('${safePublishedAt}');\n  if(isNaN(d))return;\n  var el=document.getElementById('last-updated');\n  if(!el)return;\n  el.innerHTML='<span class=\"hl-updated-dot\"></span> Last updated: '+d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+', '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});\n})();\n</script>` : '';

  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8"/>\n<meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n<title>Schedule</title>\n<style>${css}</style>\n</head>\n<body>\n${toggleBar}\n<div id="schedule-root" data-serial="${serial}">\n<div class="hl-updated" id="last-updated"></div>\n${tabsHTML}\n<div class="schedule-content">${scheduleContent}</div>\n</div>\n${tabJS}\n${cardJS}\n${toggleJS}\n${resizeJS}\n${styleJS}\n${noCopyJS}\n${beaconJS}\n${pollJS}\n${lastUpdatedJS}\n</body>\n</html>`;
}

function buildCalendarPage(
  calendarHTML: string,
  opts: EmbedOpts,
  serial: string,
  publishedAt: string,
): string {
  const isDark = opts.theme === 'dark';
  const isAuto = opts.theme === 'auto';
  const accent = opts.accentColor || '#3b82f6';

  const baseFontSize = ({ sm: '13px', md: '15px', lg: '17px' } as Record<string, string>)[opts.fontSize] ?? '15px';
  const rpc = (v: string, sm: string, md: string, lg: string) => { if (v==='sm') return sm; if (v==='lg') return lg; const n=parseInt(v??''); return (!isNaN(n)&&n>=1&&n<=500)?`${n}px`:md; };
  const hlFontSizeCal = rpc(opts.highlightFontSize||'18','14px','18px','22px');
  const fontStack = ({
    system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    serif:  "Georgia, 'Times New Roman', Times, serif",
    mono:   "'SF Mono', 'Fira Code', Consolas, monospace",
  } as Record<string, string>)[opts.fontFamily] ?? "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  const paddingVal = Math.max(0, Math.min(80, parseInt(opts.padding) || 12));
  const bgOverride = opts.bgColor || '';
  const textOverride = opts.textColor || '';
  const lightVars = `--bg:${bgOverride || '#fff'};--text:${textOverride || '#111827'};--muted:#6b7280;--heading:${textOverride || '#111827'};--border:#e5e7eb;--tab-bg:#f3f4f6;--surface:#f8f9fa;--accent:${accent};--card-bg:#f4f6f9;--hl-title-color:#000;--time-default:${textOverride || '#111827'};`;
  const darkVars  = `--bg:${bgOverride || '#0f1117'};--text:${textOverride || '#e8eaf0'};--muted:#8b92a8;--heading:${textOverride || '#f0f2f8'};--border:#2d3142;--tab-bg:#1e2130;--surface:#1a1d27;--accent:${accent};--card-bg:#181c28;--hl-title-color:${textOverride || '#f0f2f8'};--time-default:#fff;`;

  const h3SizeCal   = rpc(opts.headerSize,       '14px', '16px', '19px');
  const dateSizeCal  = rpc(opts.dateFontSize,      '10px', '11px', '13px');
  const hlWeightCal  = opts.hlWeight || '400';
  const hlTextCal    = opts.hlTextColor || 'var(--heading,#111827)';
  const hlTimeCal    = opts.hlTimeColor || 'var(--time-default)';

  const baseCss = `
:root{${isAuto ? lightVars : isDark ? darkVars : lightVars};--sb-hl-size:${hlFontSizeCal};--sb-h3-size:${h3SizeCal};--sb-date-size:${dateSizeCal};--sb-hl-weight:${hlWeightCal};--sb-hl-text:${hlTextCal};--sb-hl-time-color:${hlTimeCal}}
${isAuto ? `@media(prefers-color-scheme:dark){:root{${darkVars}}}` : ''}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--text);font-family:${fontStack};font-size:${baseFontSize};line-height:1.5;-webkit-font-smoothing:antialiased;width:100%}
body{padding:${paddingVal}px}
#schedule-root{width:100%}
.vt-bar{display:flex;justify-content:flex-end;gap:4px;margin-bottom:10px}
.vt-btn{padding:4px 12px;border-radius:999px;border:1px solid var(--border,#e5e7eb);background:var(--tab-bg,#f3f4f6);color:var(--tab-text,#6b7280);cursor:pointer;font-size:12px;font-family:inherit;font-weight:500;white-space:nowrap;transition:all .15s}
.vt-btn:hover{color:var(--text);border-color:var(--accent,#3b82f6)}
.vt-active{background:var(--accent,#3b82f6)!important;color:#fff!important;border-color:var(--accent,#3b82f6)!important}
.hl-teams{font-size:var(--sb-hl-size)!important;font-weight:var(--sb-hl-weight,400);color:var(--sb-hl-text,var(--heading,#111827))}
.hl-league-spotlight{font-size:var(--sb-hl-size)!important;display:flex;align-items:center;gap:8px}
.hl-title{font-size:var(--sb-h3-size)!important;font-weight:800;color:var(--hl-title-color,#000);margin:0 0 4px;text-transform:uppercase}
.hl-updated{font-size:12px;color:#6b7280;margin:0 0 12px;display:flex;align-items:center;gap:6px}
.hl-updated-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;flex-shrink:0;display:inline-block}
.hl-date-header{font-size:var(--sb-date-size)!important;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--heading,var(--text));padding:6px 0;border-bottom:1px solid var(--border,#e5e7eb);margin-bottom:8px}
.hl-time{font-size:var(--sb-date-size)!important;font-weight:var(--sb-hl-weight,400);color:var(--sb-hl-time-color,var(--time-default,var(--accent,#3b82f6)))}
.hl-league-name{font-size:var(--sb-date-size)!important;font-weight:700;color:var(--heading,var(--text))}
`;

  const calendarCss = getCalendarCSS(accent);

  const beaconJS = buildBeaconScript(opts);

  const resizeJS = buildResizeScript();

  const pollJS = buildEmbedPollScript(`    if(d.empty){\n      root.innerHTML='<div style="display:inline-flex;align-items:center;gap:8px;font-size:13px;border:1px dashed #d1d5db;border-radius:8px;padding:10px 16px;background:#f9fafb;color:#9ca3af">No schedule published yet.</div>';\n      root.setAttribute('data-serial','none');serial='none';\n      try{if(window._sbSendHeight){window._sbSendHeight();}else{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}}catch(e){}\n      return;\n    }\n    root.innerHTML=d.html;\n    root.setAttribute('data-serial',d.serial);serial=d.serial;\n    try{if(window._sbSendHeight){window._sbSendHeight();}else{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}}catch(e){}`);

  const styleJSCal = `\n<script>\n(function(){\n  var CSS_SIZE=/^\\d+(\\.\\d+)?(px|em|rem|%)$/;\n  window.addEventListener('message',function(e){\n    if(!e.data||!e.data.sbStyle)return;\n    var r=document.documentElement;var s=e.data.sbStyle;\n    if(s.hlFontSize&&CSS_SIZE.test(s.hlFontSize))r.style.setProperty('--sb-hl-size',s.hlFontSize);\n    if(s.headerSize&&CSS_SIZE.test(s.headerSize))r.style.setProperty('--sb-h3-size',s.headerSize);\n    if(s.dateFontSize&&CSS_SIZE.test(s.dateFontSize))r.style.setProperty('--sb-date-size',s.dateFontSize);\n  });\n})();\n</script>`;

  const noCopyJSCal = opts.noCopy ? `\n<script>\n(function(){\n  var s=document.createElement('style');s.textContent='*{-webkit-user-select:none!important;user-select:none!important;-moz-user-select:none!important}';\n  document.head.appendChild(s);\n  function b(e){e.preventDefault();return false;}\n  document.addEventListener('contextmenu',b,false);\n  document.addEventListener('selectstart',b,false);\n  document.addEventListener('copy',b,false);\n  document.addEventListener('cut',b,false);\n  document.addEventListener('keydown',function(e){\n    if((e.ctrlKey||e.metaKey)&&['a','c','u','s','p'].indexOf(e.key.toLowerCase())>=0)b(e);\n  });\n  document.addEventListener('dragstart',b,false);\n})();\n</script>` : '';

  const calNavJS = `\n<script>${getCalendarNavJS()}</script>`;

  const calToggleBar = !opts.hideViewToggle && !opts.noInlineToggle ? `<div class="vt-bar" style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:10px"><button class="vt-btn" data-layout="list" style="padding:4px 14px;border-radius:999px;border:1px solid var(--border,#e5e7eb);background:var(--tab-bg,#f3f4f6);color:var(--tab-text,#6b7280);cursor:pointer;font-size:12px;font-family:inherit;font-weight:500">List</button><button class="vt-btn vt-active" data-layout="calendar" style="padding:4px 14px;border-radius:999px;border:1px solid var(--accent,#3b82f6);background:var(--accent,#3b82f6);color:#fff;cursor:pointer;font-size:12px;font-family:inherit;font-weight:600">Calendar</button></div>` : '';
  const calToggleJS = !opts.hideViewToggle ? `\n<script>\n(function(){document.querySelectorAll('.vt-btn').forEach(function(b){b.addEventListener('click',function(){var u=new URL(location.href);u.searchParams.set('layout',b.getAttribute('data-layout'));location.replace(u.toString());});});})();\n</script>` : '';

  const safePublishedAtCal = publishedAt.replace(/[^0-9a-zA-Z.:+\-TZ]/g, '');
  const lastUpdatedJSCal = safePublishedAtCal ? `\n<script>\n(function(){\n  var d=new Date('${safePublishedAtCal}');\n  if(isNaN(d))return;\n  var el=document.getElementById('last-updated');\n  if(!el)return;\n  el.innerHTML='<span class=\"hl-updated-dot\"></span> Last updated: '+d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+', '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});\n})();\n</script>` : '';

  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8"/>\n<meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n<title>Schedule</title>\n<style>${baseCss}${calendarCss}</style>\n</head>\n<body>\n${calToggleBar}\n<div id="schedule-root" data-serial="${serial}"><div class="hl-updated" id="last-updated"></div>${calendarHTML}</div>\n${calNavJS}\n${calToggleJS}\n${resizeJS}\n${styleJSCal}\n${noCopyJSCal}\n${beaconJS}\n${pollJS}\n${lastUpdatedJSCal}\n</body>\n</html>`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ apiKey: string }> }
) {
  try {
  const { apiKey } = await params;
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Resolve the incoming token to a key_hash for DB lookup:
  //   1. Starts with "sb_" → raw API key → hash it
  //   2. 64 lowercase hex chars → already a hashed embed token → use as-is
  //   3. Anything else → legacy raw key (pre-prefix era) → hash it
  let hash: string;
  if (/^sb_/.test(apiKey)) {
    hash = crypto.createHash('sha256').update(apiKey).digest('hex');
  } else if (/^[0-9a-f]{64}$/.test(apiKey)) {
    hash = apiKey; // already a hash — no secret in the URL
  } else {
    hash = crypto.createHash('sha256').update(apiKey).digest('hex'); // legacy raw key
  }

  const { data: keyData } = await supabase
    .from('user_api_keys')
    .select('user_id')
    .eq('key_hash', hash)
    .single();

  if (!keyData) {
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#888;text-align:center">Invalid embed token.</body></html>`,
      { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  // Extract embedId early (before opts is built) so it can be used in DB queries
  const embedId  = (sp.embedId ?? '').replace(/[^\w#\- ]/g, '').substring(0, 64) || '';
  const widgetId = (sp._wid    ?? '').replace(/[^\w-]/g, '').substring(0, 64);

  // Resolve the schedule target:
  //  • widgetId present + DB row found → DB name overrides URL param (handles renames/duplicates)
  //  • embedId present in URL and no DB row yet → use it directly (PHP bakes it in from Elementor settings)
  //  • widgetId present but no DB row AND no embedId → truly unknown, show empty
  //  • No ids at all → empty string → show empty
  let scheduleTarget = embedId;
  let widgetNotRegistered = false;

  const orgMemberIdsForWidget = await getOrgMemberIds(keyData.user_id);

  type EmbedInstRow = { embed_id?: string | null };
  type ScheduleRow = {
    events_snapshot: unknown;
    league_order: unknown;
    featured_leagues: unknown;
    published_at?: string;
  };

  const instPromise = widgetId
    ? supabase
        .from('embed_instances')
        .select('embed_id')
        .in('user_id', orgMemberIdsForWidget)
        .eq('widget_id', widgetId)
        .maybeSingle()
    : Promise.resolve({ data: null as EmbedInstRow | null });

  // Optimistic schedule fetch using embedId from the URL — runs in parallel with
  // embed_instances lookup so we save one serial Supabase round-trip on cold loads.
  const optimisticSchedulePromise = embedId
    ? supabase
        .from('published_schedules')
        .select('events_snapshot, league_order, featured_leagues, published_at')
        .in('user_id', orgMemberIdsForWidget)
        .eq('embed_target', embedId)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null as ScheduleRow | null });

  const [{ data: inst }, { data: optimisticSchedule }] = await Promise.all([
    instPromise,
    optimisticSchedulePromise,
  ]);

  if (widgetId) {
    if (inst?.embed_id) {
      scheduleTarget = inst.embed_id;
    } else if (!embedId) {
      widgetNotRegistered = true;
    }
  }

  let schedule: ScheduleRow | null = null;
  let scheduleAt = '';

  if (!widgetNotRegistered) {
    if (!scheduleTarget) {
      schedule = null;
    } else if (optimisticSchedule && scheduleTarget === embedId) {
      schedule = optimisticSchedule;
      scheduleAt = optimisticSchedule.published_at ?? '';
    } else {
      const { data } = await supabase
        .from('published_schedules')
        .select('events_snapshot, league_order, featured_leagues, published_at')
        .in('user_id', orgMemberIdsForWidget)
        .eq('embed_target', scheduleTarget)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      schedule = data;
      if (data) scheduleAt = data.published_at ?? '';
    }
  }

  const isPoll = sp._poll === '1';
  const clientSerial = typeof sp._serial === 'string' ? sp._serial : '';

  if (!schedule) {
    if (isPoll) {
      if (clientSerial === 'none') {
        return Response.json(
          { serial: 'none', unchanged: true, empty: true },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return Response.json(
        { serial: 'none', html: '', tabsHtml: '', hasTabs: false, empty: true },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const appUrl       = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const emptyBeacon  = buildBeaconScript({
      appUrl,
      apiKey,
      embedId,
      widgetId: (sp._wid ?? '').replace(/[^\w-]/g, '').substring(0, 64),
    });
    const emptyHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:transparent;padding:12px;color:#9ca3af}</style></head><body><div style="display:inline-flex;align-items:center;gap:8px;font-size:13px;border:1px dashed #d1d5db;border-radius:8px;padding:10px 16px;background:#f9fafb"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>No schedule published yet.</div><script>(function(){function send(){try{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}catch(e){}}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',send);}else{send();}if(typeof ResizeObserver!=='undefined'){new ResizeObserver(send).observe(document.body);}})();</script>${emptyBeacon}${buildEmptyEmbedRefreshScript()}</body></html>`;
    return new Response(emptyHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // Accept legacy sm/md/lg tokens OR direct numeric pixel values
  const sizeVal = (v: string | undefined) => { if (!v) return 'md'; if (v==='sm'||v==='md'||v==='lg') return v; const n=parseInt(v); return (!isNaN(n)&&n>=1&&n<=500)?v:'md'; };
  // Per-section style param parsers — empty string means "not set" (inherit)
  const fontVal   = (v: string | undefined) => ['system', 'serif', 'mono'].includes(v ?? '') ? (v as string) : '';
  const weightVal = (v: string | undefined) => { const n = parseInt(v ?? ''); return (!isNaN(n) && n >= 100 && n <= 900) ? String(n) : ''; };
  const colorVal  = (v: string | undefined) => v && /^#?[0-9a-fA-F]{3,8}$/.test(v) ? `#${v.replace(/^#/, '')}` : '';
  const opts: EmbedOpts = {
    showHeader:    sp.showHeader !== '0',
    showDate:      sp.showDate   !== '0',
    showTime:      sp.showTime   !== '0',
    theme:         ['dark', 'light', 'auto'].includes(sp.theme) ? sp.theme : 'light',
    accentColor:   sp.accent ? `#${sp.accent.replace(/^#/, '')}` : '#4b5563',
    fontSize:      ['sm', 'md', 'lg'].includes(sp.fontSize)      ? sp.fontSize      : 'md',
    logoSize:      sizeVal(sp.logoSize),
    headerSize:    sizeVal(sp.headerSize),
    matchFontSize: sizeVal(sp.matchFontSize),
    dateFontSize:  sizeVal(sp.dateFontSize),
    lineHeight:    (() => { const n = parseFloat(sp.lineHeight); return (!isNaN(n) && n >= 0.8 && n <= 4) ? sp.lineHeight : '1.6'; })(),
    showSportTabs: sp.tabs !== '0',
    fontFamily:    ['system', 'serif', 'mono'].includes(sp.font) ? sp.font : 'system',
    hideLogos:     sp.hideLogos === '1',
    bgColor:       sp.bg       ? `#${sp.bg.replace(/^#/, '')}` : '',
    textColor:     sp.textColor ? `#${sp.textColor.replace(/^#/, '')}` : '',
    padding:       (() => { const n = parseInt(sp.padding ?? ''); return (!isNaN(n) && n >= 0 && n <= 80) ? String(n) : '12'; })(),
    tabStyle:      ['pill', 'underline', 'square'].includes(sp.tabStyle) ? sp.tabStyle  : 'pill',
    listStyle:     ['default', 'card'].includes(sp.listStyle)            ? sp.listStyle : 'default',
    catLabels:     sp.catLabels ? (() => { try { return JSON.parse(Buffer.from(sp.catLabels, 'base64').toString()) as Record<string,string>; } catch { return {}; } })() : {},
    hideViewToggle: sp.hideViewToggle === '1',
    noInlineToggle: sp.noInlineToggle === '1',
    noCopy:         sp.noCopy === '1',
    highlightFontSize: (() => { const n = parseInt(sp.highlightFontSize ?? ''); return (!isNaN(n) && n >= 1 && n <= 500) ? sp.highlightFontSize : '18'; })(),
    timeFontSize: (() => { const n = parseInt(sp.timeFontSize ?? ''); return (!isNaN(n) && n >= 1 && n <= 500) ? sp.timeFontSize : '11'; })(),
    normalFont:      fontVal(sp.normalFont),
    normalWeight:    weightVal(sp.normalWeight),
    normalTextColor: colorVal(sp.normalTextColor),
    normalTimeColor: colorVal(sp.normalTimeColor),
    hlFont:          fontVal(sp.hlFont),
    hlWeight:        weightVal(sp.hlWeight),
    hlTextColor:     colorVal(sp.hlTextColor),
    hlTimeColor:     colorVal(sp.hlTimeColor),
  embedId:       embedId,  // already extracted + sanitised above
    widgetId:      (sp._wid ?? '').replace(/[^\w-]/g, '').substring(0, 64) || '',
    appUrl:        '',  // will set below
    apiKey:        apiKey,
  };
  opts.appUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  const snapshotEvents = (schedule.events_snapshot ?? []) as MatchEvent[];
  const hasRefreshableEvents = hasRefreshableSnapshotEvents(snapshotEvents);
  if (isPoll && !hasRefreshableEvents && clientSerial === scheduleAt) {
    return Response.json(
      { serial: scheduleAt, unchanged: true, empty: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const events = await refreshSnapshotEvents(snapshotEvents, sp.timeZone);
  const scheduleSerial = buildPublishedScheduleSerial(scheduleAt, events);
  const leagueOrder = (schedule.league_order ?? []) as string[];
  const featuredLeaguesObj = (schedule.featured_leagues ?? {}) as Record<string, string>;
  const featuredLeagues = new Map(Object.entries(featuredLeaguesObj));

  if (sp._seo === '1') {
    return Response.json(
      buildScheduleSeoPayload(events, {
        pageUrl: typeof sp.pageUrl === 'string' ? sp.pageUrl.slice(0, 2048) : '',
        publishedAt: scheduleAt,
        embedTarget: scheduleTarget,
      }),
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  }

  const isCalendar = sp.layout === 'calendar';

  // ── Calendar layout ─────────────────────────────────────────────────────────
  if (isCalendar) {
    const { html: calHTML } = renderCalendarContent(events, {
      showTime: opts.showTime,
      hideLogos: opts.hideLogos,
      title: sp.calTitle || undefined,
      featuredLeagues,
    });

    if (isPoll) {
      return Response.json(
        { serial: scheduleSerial, html: calHTML, tabsHtml: '', hasTabs: false, empty: false },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return new Response(buildCalendarPage(calHTML, opts, scheduleSerial, scheduleAt), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': 'frame-ancestors *',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300, stale-if-error=3600',
      },
    });
  }

  // ── Default list layout ─────────────────────────────────────────────────────
  const { html: scheduleContent, categories } = renderEmbedContent(
    events,
    leagueOrder,
    featuredLeagues,
    {
      showTime:      opts.showTime,
      showDate:      opts.showDate,
      showHeader:    opts.showHeader,
      hideLogos:     opts.hideLogos,
      showSportTabs: opts.showSportTabs,
      catLabels:     opts.catLabels,
      embedTarget:   scheduleTarget,
    },
  );

  if (isPoll) {
    const tabsHtml = opts.showSportTabs ? buildFilterTabsHTML(events, opts.catLabels) : '';
    return Response.json(
      {
        serial: scheduleSerial,
        html: scheduleContent,
        tabsHtml,
        hasTabs: Boolean(tabsHtml),
        empty: false,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return new Response(buildEmbedPage(scheduleContent, categories, opts, scheduleSerial, scheduleAt, events), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300, stale-if-error=3600',
    },
  });
  } catch (err) {
    // Graceful fallback: if the server crashes, return a lightweight HTML page
    // that auto-retries instead of a broken embed. The stale-if-error CDN
    // cache should prevent this from ever being reached in normal operation.
    console.error('[Embed] Unhandled error in GET handler:', err);
    const fallbackHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:transparent;padding:12px;color:#9ca3af}</style></head><body><div style="display:inline-flex;align-items:center;gap:8px;font-size:13px;border:1px dashed #d1d5db;border-radius:8px;padding:10px 16px;background:#f9fafb"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Schedule temporarily unavailable. Retrying&hellip;</div><script>setTimeout(function(){location.reload();},30000);</script></body></html>`;
    return new Response(fallbackHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
}
