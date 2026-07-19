import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    redirect("/chats");
  }

  return (
    <div className="safe-pb safe-pt flex min-h-dvh flex-1 flex-col items-center justify-center bg-[#0C0A09] px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-[#292524] bg-[#1C1917] p-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[#EA580C]">
          Celesth
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#A8A29E]">
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
