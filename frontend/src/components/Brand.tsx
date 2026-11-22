import logo from "@/img/logo.png";
import wordmark from "@/img/text-logo.png";
import { BRAND_SLOGAN } from "@/lib/brand";

export function BrandSlogan() {
  const [first, second] = BRAND_SLOGAN.split(", ");
  return (
    <>
      <span className="brand-slogan-part">{first},</span>{" "}
      <span className="brand-slogan-part">{second}</span>
    </>
  );
}

export default function Brand({
  variant = "logo",
}: {
  variant?: "logo" | "wordmark";
}) {
  const artwork = variant === "wordmark" ? wordmark : logo;
  // Frame the artwork inside its transparent canvas without changing the source PNG.
  const viewBox =
    variant === "wordmark" ? "18 234 2140 256" : "10 440 1230 425";
  return (
    <svg
      className={`brand-art brand-art--${variant}`}
      viewBox={viewBox}
      role="img"
      aria-label="Smart Task Manager"
      focusable="false"
    >
      <image href={artwork.src} width={artwork.width} height={artwork.height} />
    </svg>
  );
}
