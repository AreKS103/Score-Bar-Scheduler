/**
 * Embed schedule typography — CSS variable names, resolution, and defaults.
 * Grouped controls:
 *  - Match line: kick-off time + team/matchup text
 *  - League header: league name + stage suffix
 *  - Section heading: "Full Sports Schedule", "This Week's Highlights", venue
 *  - Date: standalone day label
 */

export interface ScheduleTypographySizes {
  matchLineSize: string;
  dateSize: string;
  leagueHeaderSize: string;
  sectionHeadingSize: string;
  logoHeight: string;
}

const SIZE_DEFAULTS = {
  match: '14px',
  date: '11px',
  leagueHeader: '16px',
  sectionHeading: '18px',
  logo: '32px',
} as const;

function parseSizeToken(
  value: string | undefined,
  legacy: { sm: string; md: string; lg: string },
): string {
  const v = (value ?? '').trim();
  if (!v) return '';
  if (v === 'sm') return legacy.sm;
  if (v === 'md') return legacy.md;
  if (v === 'lg') return legacy.lg;
  const n = parseInt(v, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= 500) return `${n}px`;
  if (/^\d+(\.\d+)?(px|em|rem|%)$/.test(v)) return v;
  return '';
}

/** Match line size — time and matchup text stay linked (match control wins, then time). */
export function resolveMatchLineSize(
  matchFontSize?: string,
  timeFontSize?: string,
): string {
  return (
    parseSizeToken(matchFontSize, { sm: '12px', md: '14px', lg: '16px' })
    || parseSizeToken(timeFontSize, { sm: '12px', md: '14px', lg: '16px' })
    || SIZE_DEFAULTS.match
  );
}

export function resolveTypographySizes(opts: {
  matchFontSize?: string;
  timeFontSize?: string;
  dateFontSize?: string;
  headerSize?: string;
  highlightFontSize?: string;
  logoSize?: string;
}): ScheduleTypographySizes {
  return {
    matchLineSize: resolveMatchLineSize(opts.matchFontSize, opts.timeFontSize),
    dateSize: parseSizeToken(opts.dateFontSize, { sm: '10px', md: '11px', lg: '13px' }) || SIZE_DEFAULTS.date,
    leagueHeaderSize: parseSizeToken(opts.headerSize, { sm: '14px', md: '16px', lg: '19px' }) || SIZE_DEFAULTS.leagueHeader,
    sectionHeadingSize: parseSizeToken(opts.highlightFontSize, { sm: '14px', md: '18px', lg: '22px' }) || SIZE_DEFAULTS.sectionHeading,
    logoHeight: parseSizeToken(opts.logoSize, { sm: '22px', md: '32px', lg: '46px' }) || SIZE_DEFAULTS.logo,
  };
}

/** Inline :root / scoped typography custom properties. */
export function buildTypographyCssVars(sizes: ScheduleTypographySizes): string {
  return [
    `--sb-match-size:${sizes.matchLineSize}`,
    `--sb-time-size:${sizes.matchLineSize}`,
    `--sb-date-size:${sizes.dateSize}`,
    `--sb-league-header-size:${sizes.leagueHeaderSize}`,
    `--sb-h3-size:${sizes.leagueHeaderSize}`,
    `--sb-section-heading-size:${sizes.sectionHeadingSize}`,
    `--sb-hl-size:${sizes.sectionHeadingSize}`,
    `--sb-logo-height:${sizes.logoHeight}`,
  ].join(';');
}

/** Defaults for in-app preview when no embed URL params exist. */
export const PREVIEW_TYPOGRAPHY_CSS_VARS = buildTypographyCssVars(resolveTypographySizes({}));

/** Live postMessage handler — keeps grouped sizes in sync when Elementor tweaks controls. */
export const SCHEDULE_TYPOGRAPHY_LIVE_JS = `
(function(){
  var CSS_SIZE=/^\\d+(\\.\\d+)?(px|em|rem|%)$/;
  function setMatchLine(r,size){
    if(!CSS_SIZE.test(size))return;
    r.style.setProperty('--sb-match-size',size);
    r.style.setProperty('--sb-time-size',size);
  }
  window.addEventListener('message',function(e){
    if(!e.data||!e.data.sbStyle)return;
    var r=document.documentElement;
    var s=e.data.sbStyle;
    if(s.matchFontSize&&CSS_SIZE.test(s.matchFontSize))setMatchLine(r,s.matchFontSize);
    else if(s.timeFontSize&&CSS_SIZE.test(s.timeFontSize))setMatchLine(r,s.timeFontSize);
    if(s.dateFontSize&&CSS_SIZE.test(s.dateFontSize))r.style.setProperty('--sb-date-size',s.dateFontSize);
    if(s.headerSize&&CSS_SIZE.test(s.headerSize)){
      r.style.setProperty('--sb-league-header-size',s.headerSize);
      r.style.setProperty('--sb-h3-size',s.headerSize);
    }
    if(s.hlFontSize&&CSS_SIZE.test(s.hlFontSize)){
      r.style.setProperty('--sb-section-heading-size',s.hlFontSize);
      r.style.setProperty('--sb-hl-size',s.hlFontSize);
    }
    if(s.logoHeight&&CSS_SIZE.test(s.logoHeight))r.style.setProperty('--sb-logo-height',s.logoHeight);
  });
})();
`;
