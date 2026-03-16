const RAW_PUBLIC_BASE = 'https://raw.githubusercontent.com/AreKS103/Score-Bar-Scheduler/main/public';

export const LOGO_PLACEHOLDER_LOCAL = '/file.svg';
export const LOGO_PLACEHOLDER_REMOTE = `${RAW_PUBLIC_BASE}/file.svg`;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function toRawPublicUrl(pathValue: string): string {
  const normalized = pathValue.startsWith('/') ? pathValue.slice(1) : pathValue;
  const encoded = normalized
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${RAW_PUBLIC_BASE}/${encoded}`;
}

export function resolvePublishLogoUrl(logo: string, publishLogo?: string): string {
  const publish = (publishLogo || '').trim();
  if (publish) return publish;

  const primary = (logo || '').trim();
  if (!primary) return '';
  if (isHttpUrl(primary)) return primary;
  if (primary.startsWith('/')) return toRawPublicUrl(primary);
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
    out.push(toRawPublicUrl(primary));
  }

  out.push(LOGO_PLACEHOLDER_LOCAL);
  out.push(LOGO_PLACEHOLDER_REMOTE);

  return Array.from(new Set(out.filter(Boolean)));
}
