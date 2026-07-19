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
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md border border-neutral-300 bg-white p-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[#EA580C]">Cipher</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-700">
          End-to-end encrypted chat. Your messages stay on your devices.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="border border-[#EA580C] bg-[#EA580C] px-5 py-2.5 text-sm font-medium text-white"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="border border-neutral-400 bg-white px-5 py-2.5 text-sm font-medium text-neutral-900"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
