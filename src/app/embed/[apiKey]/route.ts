import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { type NextRequest } from 'next/server';
import type { MatchEvent } from '@/types';
import { renderEmbedContent } from '@/lib/renderEmbed';
import { renderCalendarContent, getCalendarCSS, getCalendarNavJS } from '@/lib/renderCalendar';

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
  highlightFontSize: string;
  timeFontSize: string;
}

function buildEmbedPage(
  scheduleContent: string,
  foundCategories: string[],
  opts: EmbedOpts,
  serial: string,
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
  const fontStack    = ({
    system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    serif:  "Georgia, 'Times New Roman', Times, serif",
    mono:   "'SF Mono', 'Fira Code', Consolas, monospace",
  } as Record<string, string>)[opts.fontFamily] ?? "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  const isCard = opts.listStyle === 'card';
  const lineH = Math.max(0.8, Math.min(4, parseFloat(opts.lineHeight) || 1.6));
  const leagueGap = `${Math.round(lineH * 15)}px`;
  const dateMarginTop = Math.round(lineH * 5);
  const dateMarginBottom = Math.max(4, Math.round(lineH * 4));
  const dateMargin = `${dateMarginTop}px 0 ${dateMarginBottom}px`;
  const paddingVal = Math.max(0, Math.min(80, parseInt(opts.padding) || 12));
  const bodyPad = `${paddingVal}px`;

  const hasTabs = opts.showSportTabs && foundCategories.length > 1;

  const tabBorder = opts.tabStyle === 'underline'
    ? 'border-bottom:2px solid transparent;border-radius:0'
    : opts.tabStyle === 'square'
    ? 'border-radius:4px'
    : 'border-radius:999px';
  const tabActiveBorder = opts.tabStyle === 'underline'
    ? 'border-bottom-color:var(--tab-active);background:transparent;color:var(--tab-active)'
    : 'background:var(--tab-active);color:var(--tab-active-text);border-color:var(--tab-active)';

  const tabsHTML = hasTabs ? `\n<div id="sport-tabs" role="tablist">\n  <button class="tab active" data-cat="all" role="tab" aria-selected="true">All</button>\n  ${foundCategories.map((c) => `<button class="tab" data-cat="${c.toLowerCase().replace(/\s+/g, '-')}" role="tab">${opts.catLabels?.[c] || c}</button>`).join('\n  ')}\n</div>` : '';

  const bgOverride   = opts.bgColor || '';
  const textOverride = opts.textColor || '';
  const lightVars = `--bg:${bgOverride || '#fff'};--text:${textOverride || '#111827'};--muted:#6b7280;--heading:${textOverride || '#111827'};--border:#e5e7eb;--tab-bg:#f3f4f6;--tab-text:#6b7280;--tab-active:${accent};--tab-active-text:#fff;--accent:${accent};--card-bg:#f4f6f9;`;
  const darkVars  = `--bg:${bgOverride || '#0f1117'};--text:${textOverride || '#e8eaf0'};--muted:#8b92a8;--heading:${textOverride || '#f0f2f8'};--border:#2d3142;--tab-bg:#1e2130;--tab-text:#8b92a8;--tab-active:${accent};--tab-active-text:#fff;--accent:${accent};--card-bg:#181c28;`;

  const css = `
:root{${isAuto ? lightVars : isDark ? darkVars : lightVars};--sb-match-size:${matchSize};--sb-date-size:${dateSize};--sb-h3-size:${h3Size};--sb-logo-height:${logoHeight};--sb-hl-size:${hlFontSize};--sb-time-size:${timeSize}}
${isAuto ? `@media(prefers-color-scheme:dark){:root{${darkVars}}}` : ''}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--text);font-family:${fontStack};font-size:15px;line-height:${lineH};-webkit-font-smoothing:antialiased;width:100%}
body{padding:${bodyPad}}
#sport-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.tab{background:var(--tab-bg);border:1px solid var(--border);color:var(--tab-text);padding:4px 14px;${tabBorder};cursor:pointer;font-size:12px;font-family:inherit;font-weight:500;white-space:nowrap;transition:background .15s,color .15s,border-color .15s}
.tab:hover{color:var(--text);border-color:var(--accent)}
.tab.active{${tabActiveBorder}}
.cat-gap{height:${(lineH * 2.8).toFixed(2)}em;display:block}
.schedule-content h2{font-size:0.78em;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);padding:6px 0 5px;margin:8px 0 13px;border-bottom:1px solid var(--border)}
.schedule-content h2:first-child{margin-top:8px}
#schedule-root,.schedule-content{width:100%}
.schedule-content h3{font-size:var(--sb-h3-size)!important;font-weight:700;color:var(--heading);margin:${leagueGap} 0 3px;display:flex;align-items:center;gap:8px}
.schedule-content img[data-preview-league]{height:var(--sb-logo-height)!important;width:auto!important;display:block;margin-top:${leagueGap}}
.schedule-content img[data-preview-league]+h3{margin-top:4px}
.schedule-content p>strong{display:block;font-size:var(--sb-date-size)!important;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:${dateMargin}}
.schedule-content p{margin:0;padding:0;line-height:${lineH}}
.match-group{margin:2px 0 ${Math.round(lineH * 8)}px}
.schedule-content span[data-preview-match]{display:flex;align-items:center;gap:6px;padding:5px 0;color:var(--text);font-size:var(--sb-match-size)!important}
.schedule-content>br,.sport-section>br{display:none}
.schedule-content ul{list-style:none;padding:0;margin:0 0 10px}
.schedule-content ul li{padding:4px 0;border-bottom:1px solid var(--border);font-size:.9em}
.schedule-content ul li:last-child{border-bottom:none}
.schedule-content ul li strong{color:var(--accent)}
${isCard ? `.league-block{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px}\n.league-block:last-child{margin-bottom:0}\n.league-block img[data-preview-league]{margin-top:0!important}\n.league-block h3{margin-top:6px}` : ''}
.schedule-content p:empty{display:none}
.team-logo{height:16px;width:auto;flex-shrink:0}
.vs-sep{font-style:italic;font-size:.82em;color:var(--muted,#888);margin:0 3px}
.ml-time{font-size:var(--sb-time-size,11px);font-weight:600;color:var(--text);flex-shrink:0;min-width:38px}
.ml-match{display:flex;align-items:center;gap:3px;flex:1;flex-wrap:wrap}
.mc-team{display:inline-flex;align-items:center;gap:3px}
.mc-round{font-size:.82em;color:var(--muted,#888)}
.hl-section{margin-bottom:22px}
.hl-title{font-size:var(--sb-h3-size)!important;font-weight:800;color:var(--heading,var(--text));margin:0 0 12px;text-transform:uppercase}
.hl-date-group{margin-bottom:10px}
.hl-date-header{font-size:var(--sb-date-size)!important;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--heading,var(--text));padding:6px 0;border-bottom:1px solid var(--border,#e5e7eb);margin-bottom:8px}
.hl-event{padding:7px 0}
.hl-event-meta{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.hl-time{font-size:var(--sb-date-size)!important;font-weight:600;color:var(--accent,#3b82f6)}
.hl-league-name{font-size:var(--sb-date-size)!important;font-weight:700;color:var(--heading,var(--text))}
.hl-teams{display:flex;align-items:center;flex-wrap:wrap;gap:4px;font-size:var(--sb-hl-size)!important;font-weight:600;color:var(--heading,#111827)}
.hl-team{display:inline-flex;align-items:center;gap:4px;font-weight:600}
.hl-team-logo{height:24px;width:auto;flex-shrink:0}
.hl-vs{font-style:italic;font-size:.82em;color:var(--muted,#888);margin:0 4px}
.hl-round{font-size:.72em;color:var(--muted,#888);margin-top:2px;font-style:italic}
.hl-league-spotlight{padding:6px 0;font-weight:700;font-size:var(--sb-hl-size)!important;color:var(--heading,var(--text));display:flex;align-items:center;gap:8px}
.vt-bar{display:flex;justify-content:flex-end;gap:4px;margin-bottom:10px}
.vt-btn{padding:4px 12px;border-radius:999px;border:1px solid var(--border,#e5e7eb);background:var(--tab-bg,#f3f4f6);color:var(--tab-text,#6b7280);cursor:pointer;font-size:12px;font-family:inherit;font-weight:500;white-space:nowrap;transition:all .15s}
.vt-btn:hover{color:var(--text);border-color:var(--accent,#3b82f6)}
.vt-active{background:var(--accent,#3b82f6)!important;color:#fff!important;border-color:var(--accent,#3b82f6)!important}
`;

  const tabJS = opts.showSportTabs ? `\n<script>\n(function(){\n  document.addEventListener('click',function(e){\n    var t=e.target&&e.target.closest&&e.target.closest('#sport-tabs .tab');if(!t)return;\n    var c=t.getAttribute('data-cat');\n    document.querySelectorAll('#sport-tabs .tab').forEach(function(x){x.classList.remove('active');x.setAttribute('aria-selected','false');});\n    t.classList.add('active');t.setAttribute('aria-selected','true');\n    document.querySelectorAll('.sport-section[data-cat]').forEach(function(s){s.style.display=(c==='all'||s.getAttribute('data-cat')===c)?'':'none';});\n  });\n})();\n</script>` : '';

  const cardJS = isCard ? `<script>\nwindow._sbWrapCards=function(c){\n    var f=document.createDocumentFragment(),b=null;\n    while(c.firstChild){\n      var n=c.firstChild;c.removeChild(n);\n      var isImg=n.nodeType===1&&n.tagName==='IMG'&&n.getAttribute&&n.getAttribute('data-preview-league');\n      if(isImg){if(b)f.appendChild(b);b=document.createElement('div');b.className='league-block';b.appendChild(n);}\n      else if(b){b.appendChild(n);}\n      else{f.appendChild(n);}\n    }\n    if(b)f.appendChild(b);c.appendChild(f);\n  };\n(function(){\n  var s=document.querySelectorAll('.sport-section,.sport-always');\n  if(s.length>0){s.forEach(window._sbWrapCards);}else{var sc=document.querySelector('.schedule-content');if(sc)window._sbWrapCards(sc);}\n  try{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}catch(e){}\n})();\n</script>` : '';

  const resizeJS = `\n<script>\n(function(){\n  function send(){ try{ window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*'); }catch(e){} }\n  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',send); } else { send(); }\n  if(typeof ResizeObserver!=='undefined'){ new ResizeObserver(send).observe(document.body); }\n})();\n</script>`;
  const styleJS = `\n<script>\n(function(){\n  window.addEventListener('message',function(e){\n    if(!e.data||!e.data.sbStyle)return;\n    var r=document.documentElement;var s=e.data.sbStyle;\n    if(s.matchFontSize)r.style.setProperty('--sb-match-size',s.matchFontSize);\n    if(s.dateFontSize)r.style.setProperty('--sb-date-size',s.dateFontSize);\n    if(s.headerSize)r.style.setProperty('--sb-h3-size',s.headerSize);\n    if(s.logoHeight)r.style.setProperty('--sb-logo-height',s.logoHeight);\n    if(s.hlFontSize)r.style.setProperty('--sb-hl-size',s.hlFontSize);\n  });\n})();\n</script>`;

  const safeEmbedId  = (opts.embedId  || '').replace(/[^\w#\- ]/g, '').substring(0, 64);
  const safeWidgetId = (opts.widgetId || '').replace(/[^\w-]/g,    '').substring(0, 64);
  const safeApiKey   = (opts.apiKey   || '').replace(/[^\w-]/g,    '').substring(0, 128);
  // Skip beacon when _wid is present — WordPress plugin handles registration via elementor-editor-sync.js
  const beaconJS = (!safeWidgetId && opts.appUrl && safeApiKey) ? `\n<script>\n(function(){\n  setTimeout(function(){\n    try{\n      fetch('${opts.appUrl}/api/embed-instances',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:'${safeApiKey}',embedId:'${safeEmbedId}',widgetId:'${safeWidgetId}',pageUrl:document.referrer||location.href}),keepalive:true}).catch(function(){});\n    }catch(e){}\n  },800);\n})();\n</script>` : '';

  const _ic = isCard ? 'true' : 'false';
  const pollJS = `\n<script>\n(function(){\n  var INTERVAL=15000;\n  var root=document.getElementById('schedule-root');\n  if(!root)return;\n  var serial=root.getAttribute('data-serial')||'';\n  var base=location.href.split('#')[0];\n  var sep=base.indexOf('?')>=0?'&':'?';\n  var pollUrl=base+sep+'_poll=1';\n  var isCard=${_ic};\n  function applyContent(d){\n    if(d.empty){\n      var sc=root.querySelector('.schedule-content');\n      if(sc)sc.innerHTML='<div style="display:inline-flex;align-items:center;gap:8px;font-size:13px;border:1px dashed #d1d5db;border-radius:8px;padding:10px 16px;background:#f9fafb;color:#9ca3af">No schedule published yet.</div>';\n      var ot=document.getElementById('sport-tabs');if(ot)ot.remove();\n      root.setAttribute('data-serial','none');serial='none';\n      try{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}catch(e){}\n      return;\n    }\n    var oldT=document.getElementById('sport-tabs');\n    if(d.tabsHtml){\n      var tmp=document.createElement('div');tmp.innerHTML=d.tabsHtml;\n      var newT=tmp.firstElementChild;\n      if(oldT){oldT.replaceWith(newT);}else{root.insertBefore(newT,root.firstChild);}\n    }else if(oldT){oldT.remove();}\n    var sc=root.querySelector('.schedule-content');\n    if(sc){\n      sc.innerHTML=d.html;\n      if(isCard&&window._sbWrapCards){\n        var s=sc.querySelectorAll('.sport-section,.sport-always');\n        if(s.length>0){s.forEach(window._sbWrapCards);}else{window._sbWrapCards(sc);}\n      }\n    }\n    root.setAttribute('data-serial',d.serial);serial=d.serial;\n    try{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}catch(e){}\n  }\n  function poll(){\n    fetch(pollUrl,{cache:'no-store'})\n      .then(function(r){return r.ok?r.json():null;})\n      .then(function(d){if(d&&d.serial!==serial)applyContent(d);})\n      .catch(function(){});\n  }\n  setInterval(poll,INTERVAL);\n  window.addEventListener('message',function(ev){\n    if(ev.data&&ev.data.sbRefresh)poll();\n  });\n})();\n</script>`;

  const toggleBar = !opts.hideViewToggle && !opts.noInlineToggle ? `<div class="vt-bar" style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:10px"><button class="vt-btn vt-active" data-layout="list" style="padding:4px 14px;border-radius:999px;border:1px solid var(--accent,#3b82f6);background:var(--accent,#3b82f6);color:#fff;cursor:pointer;font-size:12px;font-family:inherit;font-weight:600">List</button><button class="vt-btn" data-layout="calendar" style="padding:4px 14px;border-radius:999px;border:1px solid var(--border,#e5e7eb);background:var(--tab-bg,#f3f4f6);color:var(--tab-text,#6b7280);cursor:pointer;font-size:12px;font-family:inherit;font-weight:500">Calendar</button></div>` : '';
  const toggleJS = !opts.hideViewToggle ? `\n<script>\n(function(){document.querySelectorAll('.vt-btn').forEach(function(b){b.addEventListener('click',function(){var u=new URL(location.href);u.searchParams.set('layout',b.getAttribute('data-layout'));location.replace(u.toString());});});})();\n</script>` : '';

  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8"/>\n<meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n<title>Schedule</title>\n<style>${css}</style>\n</head>\n<body>\n${toggleBar}\n<div id="schedule-root" data-serial="${serial}">\n${tabsHTML}\n<div class="schedule-content">${scheduleContent}</div>\n</div>\n${tabJS}\n${cardJS}\n${toggleJS}\n${resizeJS}\n${styleJS}\n${beaconJS}\n${pollJS}\n</body>\n</html>`;
}

function buildCalendarPage(
  calendarHTML: string,
  opts: EmbedOpts,
  serial: string,
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
  const lightVars = `--bg:${bgOverride || '#fff'};--text:${textOverride || '#111827'};--muted:#6b7280;--heading:${textOverride || '#111827'};--border:#e5e7eb;--tab-bg:#f3f4f6;--surface:#f8f9fa;--accent:${accent};--card-bg:#f4f6f9;`;
  const darkVars  = `--bg:${bgOverride || '#0f1117'};--text:${textOverride || '#e8eaf0'};--muted:#8b92a8;--heading:${textOverride || '#f0f2f8'};--border:#2d3142;--tab-bg:#1e2130;--surface:#1a1d27;--accent:${accent};--card-bg:#181c28;`;

  const h3SizeCal   = rpc(opts.headerSize,       '14px', '16px', '19px');
  const dateSizeCal  = rpc(opts.dateFontSize,      '10px', '11px', '13px');

  const baseCss = `
:root{${isAuto ? lightVars : isDark ? darkVars : lightVars};--sb-hl-size:${hlFontSizeCal};--sb-h3-size:${h3SizeCal};--sb-date-size:${dateSizeCal}}
${isAuto ? `@media(prefers-color-scheme:dark){:root{${darkVars}}}` : ''}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--text);font-family:${fontStack};font-size:${baseFontSize};line-height:1.5;-webkit-font-smoothing:antialiased;width:100%}
body{padding:${paddingVal}px}
#schedule-root{width:100%}
.vt-bar{display:flex;justify-content:flex-end;gap:4px;margin-bottom:10px}
.vt-btn{padding:4px 12px;border-radius:999px;border:1px solid var(--border,#e5e7eb);background:var(--tab-bg,#f3f4f6);color:var(--tab-text,#6b7280);cursor:pointer;font-size:12px;font-family:inherit;font-weight:500;white-space:nowrap;transition:all .15s}
.vt-btn:hover{color:var(--text);border-color:var(--accent,#3b82f6)}
.vt-active{background:var(--accent,#3b82f6)!important;color:#fff!important;border-color:var(--accent,#3b82f6)!important}
.hl-teams{font-size:var(--sb-hl-size)!important}
.hl-league-spotlight{font-size:var(--sb-hl-size)!important;display:flex;align-items:center;gap:8px}
.hl-title{font-size:var(--sb-h3-size)!important;font-weight:800;color:var(--heading,var(--text));margin:0 0 12px;text-transform:uppercase}
.hl-date-header{font-size:var(--sb-date-size)!important;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--heading,var(--text));padding:6px 0;border-bottom:1px solid var(--border,#e5e7eb);margin-bottom:8px}
.hl-time{font-size:var(--sb-date-size)!important;font-weight:600;color:var(--accent,#3b82f6)}
.hl-league-name{font-size:var(--sb-date-size)!important;font-weight:700;color:var(--heading,var(--text))}
`;

  const calendarCss = getCalendarCSS(accent);

  const safeEmbedId  = (opts.embedId  || '').replace(/[^\w#\- ]/g, '').substring(0, 64);
  const safeWidgetId = (opts.widgetId || '').replace(/[^\w-]/g,    '').substring(0, 64);
  const safeApiKey   = (opts.apiKey   || '').replace(/[^\w-]/g,    '').substring(0, 128);
  // Skip beacon when _wid is present — WordPress plugin handles registration via elementor-editor-sync.js
  const beaconJS = (!safeWidgetId && opts.appUrl && safeApiKey) ? `\n<script>\n(function(){\n  setTimeout(function(){\n    try{\n      fetch('${opts.appUrl}/api/embed-instances',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:'${safeApiKey}',embedId:'${safeEmbedId}',widgetId:'${safeWidgetId}',pageUrl:document.referrer||location.href}),keepalive:true}).catch(function(){});\n    }catch(e){}\n  },800);\n})();\n</script>` : '';

  const resizeJS = `\n<script>\n(function(){\n  function send(){ try{ window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*'); }catch(e){} }\n  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',send); } else { send(); }\n  if(typeof ResizeObserver!=='undefined'){ new ResizeObserver(send).observe(document.body); }\n})();\n</script>`;

  const pollJS = `\n<script>\n(function(){\n  var INTERVAL=15000;\n  var root=document.getElementById('schedule-root');\n  if(!root)return;\n  var serial=root.getAttribute('data-serial')||'';\n  var base=location.href.split('#')[0];\n  var sep=base.indexOf('?')>=0?'&':'?';\n  var pollUrl=base+sep+'_poll=1';\n  function applyContent(d){\n    if(d.empty){\n      root.innerHTML='<div style="display:inline-flex;align-items:center;gap:8px;font-size:13px;border:1px dashed #d1d5db;border-radius:8px;padding:10px 16px;background:#f9fafb;color:#9ca3af">No schedule published yet.</div>';\n      root.setAttribute('data-serial','none');serial='none';\n      try{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}catch(e){}\n      return;\n    }\n    root.innerHTML=d.html;\n    root.setAttribute('data-serial',d.serial);serial=d.serial;\n    try{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}catch(e){}\n  }\n  function poll(){\n    fetch(pollUrl,{cache:'no-store'})\n      .then(function(r){return r.ok?r.json():null;})\n      .then(function(d){if(d&&d.serial!==serial)applyContent(d);})\n      .catch(function(){});\n  }\n  setInterval(poll,INTERVAL);\n  window.addEventListener('message',function(ev){\n    if(ev.data&&ev.data.sbRefresh)poll();\n  });\n})();\n</script>`;

  const styleJSCal = `\n<script>\n(function(){\n  window.addEventListener('message',function(e){\n    if(!e.data||!e.data.sbStyle)return;\n    var r=document.documentElement;var s=e.data.sbStyle;\n    if(s.hlFontSize)r.style.setProperty('--sb-hl-size',s.hlFontSize);\n    if(s.headerSize)r.style.setProperty('--sb-h3-size',s.headerSize);\n    if(s.dateFontSize)r.style.setProperty('--sb-date-size',s.dateFontSize);\n  });\n})();\n</script>`;

  const calNavJS = `\n<script>${getCalendarNavJS()}</script>`;

  const calToggleBar = !opts.hideViewToggle && !opts.noInlineToggle ? `<div class="vt-bar" style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:10px"><button class="vt-btn" data-layout="list" style="padding:4px 14px;border-radius:999px;border:1px solid var(--border,#e5e7eb);background:var(--tab-bg,#f3f4f6);color:var(--tab-text,#6b7280);cursor:pointer;font-size:12px;font-family:inherit;font-weight:500">List</button><button class="vt-btn vt-active" data-layout="calendar" style="padding:4px 14px;border-radius:999px;border:1px solid var(--accent,#3b82f6);background:var(--accent,#3b82f6);color:#fff;cursor:pointer;font-size:12px;font-family:inherit;font-weight:600">Calendar</button></div>` : '';
  const calToggleJS = !opts.hideViewToggle ? `\n<script>\n(function(){document.querySelectorAll('.vt-btn').forEach(function(b){b.addEventListener('click',function(){var u=new URL(location.href);u.searchParams.set('layout',b.getAttribute('data-layout'));location.replace(u.toString());});});})();\n</script>` : '';

  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8"/>\n<meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n<title>Schedule</title>\n<style>${baseCss}${calendarCss}</style>\n</head>\n<body>\n${calToggleBar}\n<div id="schedule-root" data-serial="${serial}">${calendarHTML}</div>\n${calNavJS}\n${calToggleJS}\n${resizeJS}\n${styleJSCal}\n${beaconJS}\n${pollJS}\n</body>\n</html>`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ apiKey: string }> }
) {
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
  //  • Named embed    → use embedId directly  (e.g. "home", "main")
  //  • Unnamed widget → look up its auto-assigned embed_id ("1", "2", …) via widget_id
  //  • No id at all   → empty string → match against null embed_target (global publish)
  //  • Widget present but not yet in DB (just added) → widgetNotRegistered=true → show empty
  let scheduleTarget = embedId;
  let widgetNotRegistered = false;
  if (!embedId && widgetId) {
    const { data: inst } = await supabase
      .from('embed_instances')
      .select('embed_id')
      .eq('user_id', keyData.user_id)
      .eq('widget_id', widgetId)
      .maybeSingle();
    if (inst?.embed_id) {
      scheduleTarget = inst.embed_id;
    } else {
      // Widget exists in the page but hasn't been registered yet (or just added).
      // Do NOT fall through to the global schedule — show the empty state instead.
      widgetNotRegistered = true;
    }
  }

  // Strict schedule resolution: match exactly on embed_target.
  // If scheduleTarget is set → only return a schedule published to that exact embed.
  // If scheduleTarget is absent AND no widget context → global schedule (embed_target IS NULL).
  // If widgetNotRegistered → skip DB query entirely (avoids leaking the global schedule).
  let schedule: { events_snapshot: unknown; league_order: unknown; featured_leagues: unknown; published_at?: string } | null = null;
  let scheduleAt = '';

  if (!widgetNotRegistered) {
    const baseQuery = supabase
      .from('published_schedules')
      .select('events_snapshot, league_order, featured_leagues, published_at')
      .eq('user_id', keyData.user_id)
      .order('published_at', { ascending: false })
      .limit(1);

    const { data } = scheduleTarget
      ? await baseQuery.eq('embed_target', scheduleTarget).maybeSingle()
      : await baseQuery.is('embed_target', null).maybeSingle();

    schedule = data;
    if (data) scheduleAt = data.published_at ?? '';
  }

  if (!schedule) {
    if (sp._poll === '1') {
      return Response.json(
        { serial: 'none', html: '', tabsHtml: '', hasTabs: false, empty: true },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    // Build beacon even for empty pages so embed rename cascades fire
    const safeApiKey   = apiKey.replace(/'/g, '');
    const safeEmbedId  = embedId.replace(/'/g, '');
    const safeWidgetId = (sp._wid ?? '').replace(/[^\w-]/g, '').substring(0, 64);
    const appUrl       = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    // Skip beacon when _wid is present — WordPress plugin handles registration via elementor-editor-sync.js
    const emptyBeacon  = (!safeWidgetId && appUrl && safeApiKey) ? `<script>(function(){setTimeout(function(){try{fetch('${appUrl}/api/embed-instances',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:'${safeApiKey}',embedId:'${safeEmbedId}',widgetId:'${safeWidgetId}',pageUrl:document.referrer||location.href}),keepalive:true}).catch(function(){});}catch(e){}},800);})();</script>` : '';
    const emptyHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:transparent;padding:12px;color:#9ca3af}</style></head><body><div style="display:inline-flex;align-items:center;gap:8px;font-size:13px;border:1px dashed #d1d5db;border-radius:8px;padding:10px 16px;background:#f9fafb"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>No schedule published yet.</div><script>(function(){function send(){try{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}catch(e){}}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',send);}else{send();}if(typeof ResizeObserver!=='undefined'){new ResizeObserver(send).observe(document.body);}})();</script>${emptyBeacon}<script>setTimeout(function(){location.reload();},15000);window.addEventListener('message',function(ev){if(ev.data&&ev.data.sbRefresh)location.reload();});</script></body></html>`;
    return new Response(emptyHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // Accept legacy sm/md/lg tokens OR direct numeric pixel values
  const sizeVal = (v: string | undefined) => { if (!v) return 'md'; if (v==='sm'||v==='md'||v==='lg') return v; const n=parseInt(v); return (!isNaN(n)&&n>=1&&n<=500)?v:'md'; };
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
    highlightFontSize: (() => { const n = parseInt(sp.highlightFontSize ?? ''); return (!isNaN(n) && n >= 1 && n <= 500) ? sp.highlightFontSize : '18'; })(),
    timeFontSize: (() => { const n = parseInt(sp.timeFontSize ?? ''); return (!isNaN(n) && n >= 1 && n <= 500) ? sp.timeFontSize : '11'; })(),
  embedId:       embedId,  // already extracted + sanitised above
    widgetId:      (sp._wid ?? '').replace(/[^\w-]/g, '').substring(0, 64) || '',
    appUrl:        '',  // will set below
    apiKey:        apiKey,
  };
  opts.appUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  const events = (schedule.events_snapshot ?? []) as MatchEvent[];
  const leagueOrder = (schedule.league_order ?? []) as string[];
  const featuredLeaguesObj = (schedule.featured_leagues ?? {}) as Record<string, string>;
  const featuredLeagues = new Map(Object.entries(featuredLeaguesObj));

  const isCalendar = sp.layout === 'calendar';

  // ── Calendar layout ─────────────────────────────────────────────────────────
  if (isCalendar) {
    const { html: calHTML } = renderCalendarContent(events, {
      showTime: opts.showTime,
      hideLogos: opts.hideLogos,
      title: sp.calTitle || undefined,
      featuredLeagues,
    });

    if (sp._poll === '1') {
      return Response.json(
        { serial: scheduleAt, html: calHTML, tabsHtml: '', hasTabs: false, empty: false },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return new Response(buildCalendarPage(calHTML, opts, scheduleAt), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'ALLOWALL',
        'Cache-Control': 'no-store',
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
    },
  );

  if (sp._poll === '1') {
    const hasTabs = opts.showSportTabs && categories.length > 1;
    const tabsHtml = hasTabs
      ? `<div id="sport-tabs" role="tablist"><button class="tab active" data-cat="all" role="tab" aria-selected="true">All</button>${categories.map((c) => `<button class="tab" data-cat="${c.toLowerCase().replace(/\s+/g, '-')}" role="tab">${(opts.catLabels?.[c] || c).replace(/</g, '&lt;')}</button>`).join('')}</div>`
      : '';
    return Response.json(
      { serial: scheduleAt, html: scheduleContent, tabsHtml, hasTabs, empty: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return new Response(buildEmbedPage(scheduleContent, categories, opts, scheduleAt), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Cache-Control': 'no-store',
    },
  });
}
