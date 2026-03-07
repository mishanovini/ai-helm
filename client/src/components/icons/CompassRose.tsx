/**
 * Compass Rose icon — the AI Helm brand icon.
 * Double ring + 8-point star (C+D Variant 4).
 * Accepts the same props as lucide-react icons (className, etc.).
 */
interface CompassRoseProps extends React.SVGProps<SVGSVGElement> {
  /** Icon size shorthand — sets both width and height. Defaults to 24. */
  size?: number | string;
}

export default function CompassRose({ size = 24, className, ...props }: CompassRoseProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      {...props}
    >
      {/* Double ring */}
      <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.25" />
      {/* Cardinal points (N/S/E/W) */}
      <polygon points="16,1.5 17.5,13 16,16 14.5,13" />
      <polygon points="16,30.5 14.5,19 16,16 17.5,19" />
      <polygon points="30.5,16 19,14.5 16,16 19,17.5" />
      <polygon points="1.5,16 13,17.5 16,16 13,14.5" />
      {/* Ordinal points (NE/SE/SW/NW) */}
      <polygon points="26,6 18,14 16,16 14,14" opacity="0.35" />
      <polygon points="6,26 14,18 16,16 18,18" opacity="0.35" />
      <polygon points="26,26 18,18 16,16 18,14" opacity="0.35" />
      <polygon points="6,6 14,14 16,16 14,18" opacity="0.35" />
      {/* Center */}
      <circle cx="16" cy="16" r="2" />
      <circle cx="16" cy="16" r="3.5" fill="none" stroke="currentColor" strokeWidth="0.7" />
    </svg>
  );
}
