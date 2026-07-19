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
    <div className="safe-pb flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-[#E7E5E4] bg-white p-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[#EA580C]">
          Celesth
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#78716C]">
          Private messaging that stays on your devices. End-to-end encrypted.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/signup"
            className="flex h-12 items-center justify-center rounded-2xl bg-[#EA580C] px-5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-2xl px-5 text-sm font-medium text-[#57534E] transition-colors duration-150 hover:bg-[#F5F5F4]"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
