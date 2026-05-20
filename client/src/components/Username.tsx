import Link from 'next/link';

interface UsernameProps {
  name: string;
  isSupporter?: boolean | null;
  className?: string;
  title?: string;
  linkToProfile?: boolean;
}

export default function Username({ name, isSupporter, className, title, linkToProfile }: UsernameProps) {
  const classes = [className, isSupporter ? 'supporter-name' : null].filter(Boolean).join(' ');
  const resolvedTitle = title ?? (isSupporter ? 'Vexara supporter' : undefined);

  if (linkToProfile && name) {
    return (
      <Link
        href={`/u/${encodeURIComponent(name)}`}
        className={classes || undefined}
        title={resolvedTitle}
        onClick={(e) => e.stopPropagation()}
      >
        {name}
      </Link>
    );
  }

  return (
    <span className={classes || undefined} title={resolvedTitle}>
      {name}
    </span>
  );
}
