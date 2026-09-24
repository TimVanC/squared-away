// "Squared" in bold type with "away" in a small butter-yellow tile raised to the
// top right like an exponent. Matches the floating tile UI (PRD 4.9).

type Props = {
  variant?: "navy" | "light";
  size?: "sm" | "lg";
  className?: string;
};

export default function Wordmark({ variant = "navy", size = "sm", className = "" }: Props) {
  const textColor = variant === "navy" ? "#F3F5FA" : "#1F2B4D";
  const tileShadow = variant === "navy" ? "#141C33" : "#C9A92E";
  const fontSize = size === "lg" ? 44 : 26;
  const tileFont = size === "lg" ? 15 : 10;
  const pad = size === "lg" ? "3px 8px" : "2px 5px";
  const raise = size === "lg" ? 12 : 7;
  const offset = size === "lg" ? 3 : 2;

  return (
    <span
      className={`inline-flex items-start select-none ${className}`}
      style={{ fontSize, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.02em", color: textColor }}
      aria-label="Squared Away"
    >
      <span>Squared</span>
      <span
        style={{
          display: "inline-block",
          marginLeft: 3,
          marginTop: -raise,
          padding: pad,
          fontSize: tileFont,
          fontWeight: 700,
          letterSpacing: 0,
          color: "#1F2B4D",
          background: "#FFD84D",
          borderRadius: size === "lg" ? 6 : 4,
          boxShadow: `${offset}px ${offset}px 0 ${tileShadow}`,
        }}
      >
        away
      </span>
    </span>
  );
}
