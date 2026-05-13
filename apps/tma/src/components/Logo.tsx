import Image from 'next/image';

type Variant = 'icon' | 'lockup' | 'stacked';

const DIMS: Record<Variant, { w: number; h: number }> = {
  icon: { w: 1, h: 1 },
  lockup: { w: 3, h: 1 },
  stacked: { w: 1, h: 1 },
};

export function Logo({
  variant = 'icon',
  size = 32,
  className,
  priority,
  alt = 'Roosta',
}: {
  variant?: Variant;
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  const ratio = DIMS[variant];
  const width = variant === 'lockup' ? size * 3 : size;
  const height = size;

  const lightSrc = `/brand/roosta-${variant}.svg`;
  const darkSrc = `/brand/roosta-${variant}-dark.svg`;

  return (
    <>
      <Image
        src={lightSrc}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className={`dark:hidden ${className ?? ''}`}
        style={{ width: width, height: height }}
      />
      <Image
        src={darkSrc}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className={`hidden dark:block ${className ?? ''}`}
        style={{ width: width, height: height }}
      />
    </>
  );
  // ratio reference (silence unused)
  void ratio;
}
