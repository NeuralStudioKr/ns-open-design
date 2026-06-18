import { readDisplayInitial } from "../teamverEmbedVisuals";

type Props = {
  imageUrl?: string | null;
  label: string;
  size?: "sm" | "md";
  className?: string;
};

export function TeamverAvatarGlyph({
  imageUrl,
  label,
  size = "md",
  className = "",
}: Props) {
  const initial = readDisplayInitial(label);
  const sizeClass =
    size === "sm" ? "teamver-avatar-glyph--sm" : "teamver-avatar-glyph--md";

  if (imageUrl) {
    return (
      <span
        className={`teamver-avatar-glyph teamver-avatar-glyph--image ${sizeClass} ${className}`.trim()}
        aria-hidden
      >
        <img src={imageUrl} alt="" className="teamver-avatar-glyph__img" />
      </span>
    );
  }

  return (
    <span
      className={`teamver-avatar-glyph teamver-avatar-glyph--initial ${sizeClass} ${className}`.trim()}
      aria-hidden
    >
      {initial}
    </span>
  );
}
