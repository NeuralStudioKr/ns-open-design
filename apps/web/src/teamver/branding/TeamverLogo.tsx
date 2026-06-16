import { useTeamverBranding } from "./TeamverBrandingProvider";

type Variant = "wordmark" | "navMark";

interface Props {
  variant?: Variant;
  className?: string;
  /** Wordmark height in px (nav mark scales from width). */
  height?: number;
}

/**
 * Teamver brand image — fe-v2 wordmark (light/dark) or slide rail icon.
 * Non-embed callers should not render this; gate at the call site.
 */
export function TeamverLogo({ variant = "wordmark", className, height = 50 }: Props) {
  const { logoUrl, logoUrlDark, navMarkUrl } = useTeamverBranding();

  if (variant === "navMark") {
    return (
      <img
        src={navMarkUrl}
        alt=""
        className={className}
        draggable={false}
        style={{ height: Math.min(height, 20), width: "auto", objectFit: "contain" }}
      />
    );
  }

  const style = { height: `${height}px`, width: "auto", objectFit: "contain" as const };

  return (
    <span className={className} style={{ display: "inline-block", lineHeight: 0 }}>
      <img
        src={logoUrl}
        alt=""
        draggable={false}
        className="teamver-logo teamver-logo--light"
        style={style}
      />
      <img
        src={logoUrlDark}
        alt=""
        draggable={false}
        className="teamver-logo teamver-logo--dark"
        style={{ ...style, display: "none" }}
      />
    </span>
  );
}
