interface UsernameProps {
  name: string;
  isSupporter?: boolean | null;
  className?: string;
  title?: string;
}

export default function Username({ name, isSupporter, className, title }: UsernameProps) {
  const classes = [className, isSupporter ? 'supporter-name' : null].filter(Boolean).join(' ');
  return (
    <span
      className={classes || undefined}
      title={title ?? (isSupporter ? 'Vexara supporter' : undefined)}
    >
      {name}
    </span>
  );
}
