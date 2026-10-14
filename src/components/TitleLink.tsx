import type { ReactNode } from 'react';

/** A record's title, opening the original posting, thread or course in a new tab. */
export function TitleLink({ href, children }: { href: string; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="transition-colors hover:text-accent hover:underline"
    >
      {children}
    </a>
  );
}
