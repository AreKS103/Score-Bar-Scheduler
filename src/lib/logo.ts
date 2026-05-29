// The absolute Base URL pointing to this app's deployed public folder.
// This is used for generating absolute URLs for the WordPress integration
// so it doesn't 404. Github Raw won't work because the repo is private.
// Uses NEXT_PUBLIC_APP_URL env var so it works across domain renames.
const APP_PUBLIC_BASE =
  (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '') ||
  'https://scorebar.vercel.app';

export const LOGO_PLACEHOLDER_LOCAL = '/file.svg';
export const LOGO_PLACEHOLDER_REMOTE = `${APP_PUBLIC_BASE}/file.svg`;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

// In the browser, prefer the current origin so assets always resolve from
// the running deployment (dev server, preview branch, or production) instead
// of a hard-coded base that may not yet have the asset deployed.
function currentOriginBase(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return APP_PUBLIC_BASE;
}

function toAbsolutePublicUrl(pathValue: string): string {
  const normalized = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  return `${currentOriginBase()}${normalized}`;
}

export function resolvePublishLogoUrl(logo: string, publishLogo?: string): string {
  const primary = (logo || '').trim();
  if (primary) {
    if (isHttpUrl(primary)) return primary;
    if (primary.startsWith('/')) return toAbsolutePublicUrl(primary);
    return primary;
  }

  return (publishLogo || '').trim();
}

export function getLogoCandidates(logo?: string, publishLogo?: string): string[] {
  const out: string[] = [];
  const primary = (logo || '').trim();
  const publish = (publishLogo || '').trim();
  const publishResolved = resolvePublishLogoUrl(primary, publishLogo);

  if (primary) out.push(primary);
  if (publishResolved) out.push(publishResolved);
  if (publish) out.push(publish);

  // If a relative path is given, also try the opposite flavor explicitly.
  if (primary.startsWith('/')) {
    out.push(toAbsolutePublicUrl(primary));
  }

  out.push(LOGO_PLACEHOLDER_LOCAL);
  out.push(LOGO_PLACEHOLDER_REMOTE);

  return Array.from(new Set(out.filter(Boolean)));
}
