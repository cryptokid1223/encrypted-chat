/** Subtle atmosphere behind auth / welcome cards — orange glow + faint stars. */
export function AuthAtmosphere() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute left-1/2 top-[-10%] h-[520px] w-[720px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(234,88,12,0.055) 0%, transparent 68%)",
        }}
      />
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.08]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12%" cy="18%" r="1" fill="#FAFAF9" />
        <circle cx="28%" cy="32%" r="0.8" fill="#FAFAF9" />
        <circle cx="72%" cy="14%" r="1.1" fill="#FAFAF9" />
        <circle cx="88%" cy="28%" r="0.7" fill="#FAFAF9" />
        <circle cx="8%" cy="58%" r="0.9" fill="#FAFAF9" />
        <circle cx="42%" cy="72%" r="0.7" fill="#FAFAF9" />
        <circle cx="65%" cy="62%" r="1" fill="#FAFAF9" />
        <circle cx="92%" cy="70%" r="0.8" fill="#FAFAF9" />
        <circle cx="55%" cy="22%" r="0.6" fill="#FAFAF9" />
        <circle cx="18%" cy="82%" r="0.7" fill="#FAFAF9" />
        <circle cx="78%" cy="48%" r="0.6" fill="#FAFAF9" />
        <circle cx="35%" cy="12%" r="0.8" fill="#FAFAF9" />
      </svg>
    </div>
  );
}
