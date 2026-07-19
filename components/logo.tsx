import Link from "next/link";

function Mark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M18.5 5.2c-5.9 1.1-10.3 6.3-10.3 12.5 0 7 5.7 12.7 12.7 12.7 2.4 0 4.7-.7 6.6-1.9C24.2 30.8 20.3 32 16 32 7.2 32 0 24.8 0 16S7.2 0 16 0c1.7 0 3.4.3 5 .8-.9 1.3-1.9 2.7-2.5 4.4z"
        fill="#EA580C"
      />
      <path
        d="M25.5 8.5l1.15 2.85L29.5 12.5l-2.85 1.15L25.5 16.5l-1.15-2.85L21.5 12.5l2.85-1.15L25.5 8.5z"
        fill="#EA580C"
      />
    </svg>
  );
}

export function Logo({
  size = "md",
  href,
  className = "",
  markSize: markSizeProp,
}: {
  size?: "sm" | "md" | "lg";
  /** Override mark pixel size (e.g. sidebar 20, auth 28). */
  markSize?: number;
  href?: string;
  className?: string;
}) {
  const markSize =
    markSizeProp ?? (size === "lg" ? 28 : size === "sm" ? 20 : 24);
  const textClass =
    size === "lg"
      ? "text-[20px] leading-none"
      : size === "sm"
        ? "text-[14px] leading-none"
        : "text-[15px] leading-none";

  const content = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark size={markSize} />
      <span
        className={`font-semibold tracking-tight text-[#EA580C] ${textClass}`}
      >
        Celesth
      </span>
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex transition-opacity duration-150 ease-in-out hover:opacity-90"
      >
        {content}
      </Link>
    );
  }

  return content;
}
