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
    <div className="relative flex min-h-dvh flex-1 flex-col items-center justify-center bg-[#0C0A09] px-6 py-16">
      <AuthAtmosphere />
      <div className="safe-pb relative z-10 w-full max-w-md rounded-3xl border border-[#292524] bg-[#1C1917] px-8 py-10 text-center sm:px-10">
        <div className="flex justify-center">
          <Logo size="lg" />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-[#A8A29E]">
          Private messaging that stays on your devices. End-to-end encrypted.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/signup"
            className="flex h-12 items-center justify-center rounded-2xl bg-[#EA580C] px-5 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#C2410C]"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-2xl px-5 text-sm font-medium text-[#A8A29E] transition-colors duration-150 hover:bg-[#292524] hover:text-[#FAFAF9]"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
