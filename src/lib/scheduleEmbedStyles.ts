/**
 * Shared embed shell CSS — used by the live /embed route and the in-app preview
 * so both render the schedule with identical styling.
 */

import { SCHEDULE_LAYOUT_CSS } from '@/lib/scheduleLayout';

/** CSS custom properties for standalone embed pages (:root is fine there) */
export const EMBED_PAGE_CSS_VARS = `
:root{
  --bg:#fff;
  --text:#111827;
  --muted:#6b7280;
  --heading:#111827;
  --border:#e5e7eb;
  --tab-bg:#f3f4f6;
  --tab-text:#6b7280;
  --tab-active:#1e3a5f;
  --tab-active-text:#fff;
  --accent:#3b82f6;
}
`;

/**
 * Scoped vars for in-app preview — must NOT use :root or they override the app
 * theme tokens (e.g. --border) and cause bright white borders in dark mode.
 */
export const PREVIEW_SCOPED_CSS_VARS = `
.sb-schedule-preview-root{
  --bg:#fff;
  --text:#111827;
  --muted:#6b7280;
  --heading:#111827;
  --border:#e5e7eb;
  --tab-bg:#f3f4f6;
  --tab-text:#6b7280;
  --tab-active:#1e3a5f;
  --tab-active-text:#fff;
  --accent:#3b82f6;
}
`;

/** Shell styles around .schedule-content (tabs, reset, typography) */
export const EMBED_SHELL_CSS = `
${EMBED_PAGE_CSS_VARS}
.sb-schedule-preview-root,.sb-schedule-preview-root *{box-sizing:border-box}
.sb-schedule-preview-root{background:var(--bg);color:var(--text);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
#schedule-root,.schedule-content{width:100%}
.schedule-content{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
#sport-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.tab{background:#fff;border:1px solid var(--border,#e5e7eb);color:var(--muted,#6b7280);padding:5px 14px;border-radius:999px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:500;white-space:nowrap}
.tab.active{background:var(--heading,#1e3a5f);color:#fff;border-color:var(--heading,#1e3a5f)}
@media (max-width:480px){#sport-tabs{gap:5px;margin-bottom:12px}.tab{padding:4px 11px;font-size:11px}}
`;

/** Full stylesheet for in-app preview (matches default embed list layout) */
export function getSchedulePreviewCss(): string {
  return `${PREVIEW_SCOPED_CSS_VARS}
.sb-schedule-preview-root,.sb-schedule-preview-root *{box-sizing:border-box}
.sb-schedule-preview-root{background:var(--bg);color:var(--text);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
#schedule-root,.schedule-content{width:100%}
.schedule-content{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
#sport-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.tab{background:#fff;border:1px solid var(--border,#e5e7eb);color:var(--muted,#6b7280);padding:5px 14px;border-radius:999px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:500;white-space:nowrap}
.tab.active{background:var(--heading,#1e3a5f);color:#fff;border-color:var(--heading,#1e3a5f)}
@media (max-width:480px){#sport-tabs{gap:5px;margin-bottom:12px}.tab{padding:4px 11px;font-size:11px}}
${SCHEDULE_LAYOUT_CSS}`;
}

/** Strip inline style blocks from generateHTML output (DOMPurify removes them anyway) */
export function stripScheduleStyleTags(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>\s*/gi, '').trim();
}
