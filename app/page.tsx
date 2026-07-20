import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthAtmosphere } from "@/components/auth-atmosphere";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    redirect("/chats");
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-[#0F0E0D] px-4 py-10">
      <AuthAtmosphere />
      <div className="safe-pb relative z-10 w-full max-w-md rounded-3xl border border-[#2E2B28] bg-[#1A1816] p-8 text-center">
        <div className="flex justify-center">
          <Logo size="lg" markSize={28} />
        </div>
        <p className="mt-3 text-[13px] leading-[1.4] text-[#6E6963]">
          Private messaging that stays on your devices. End-to-end encrypted.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <Link
            href="/signup"
            className="flex h-12 items-center justify-center rounded-xl bg-[#EA580C] px-5 text-[14px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C]"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-xl px-5 text-[14px] font-medium text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
