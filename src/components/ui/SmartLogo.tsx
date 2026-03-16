'use client';

import { useEffect, useMemo, useState } from 'react';
import { getLogoCandidates } from '@/lib/logo';

interface SmartLogoProps {
  logo?: string;
  publishLogo?: string;
  alt?: string;
  className?: string;
  title?: string;
}

export default function SmartLogo({
  logo,
  publishLogo,
  alt = '',
  className,
  title,
}: SmartLogoProps) {
  const candidates = useMemo(() => getLogoCandidates(logo, publishLogo), [logo, publishLogo]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [candidates]);

  if (!candidates.length) return null;

  const src = candidates[Math.min(index, candidates.length - 1)];

  return (
    <img
      src={src}
      alt={alt}
      title={title}
      className={className}
      onError={(event) => {
        if (index < candidates.length - 1) {
          setIndex((prev) => prev + 1);
          return;
        }
        (event.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}
