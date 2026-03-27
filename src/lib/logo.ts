// The absolute Base URL pointing to this app's deployed public folder.
// This is used for generating absolute URLs for the WordPress integration
// so it doesn't 404. Github Raw won't work because the repo is private.
const APP_PUBLIC_BASE = 'https://score-bar-scheduler.vercel.app';

export const LOGO_PLACEHOLDER_LOCAL = '/file.svg';
export const LOGO_PLACEHOLDER_REMOTE = `${APP_PUBLIC_BASE}/file.svg`;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function toAbsolutePublicUrl(pathValue: string): string {
  const normalized = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  return `${APP_PUBLIC_BASE}${normalized}`;
}

export function resolvePublishLogoUrl(logo: string, publishLogo?: string): string {
  const publish = (publishLogo || '').trim();
  if (publish) return publish;

  const primary = (logo || '').trim();
  if (!primary) return '';
  if (isHttpUrl(primary)) return primary;
  if (primary.startsWith('/')) return toAbsolutePublicUrl(primary);
  return primary;
}

export function getLogoCandidates(logo?: string, publishLogo?: string): string[] {
  const out: string[] = [];
  const primary = (logo || '').trim();
  const publishResolved = resolvePublishLogoUrl(primary, publishLogo);

  if (primary) out.push(primary);
  if (publishResolved) out.push(publishResolved);

  // If a relative path is given, also try the opposite flavor explicitly.
  if (primary.startsWith('/')) {
    out.push(toAbsolutePublicUrl(primary));
  }

  out.push(LOGO_PLACEHOLDER_LOCAL);
  out.push(LOGO_PLACEHOLDER_REMOTE);

  return Array.from(new Set(out.filter(Boolean)));
}
