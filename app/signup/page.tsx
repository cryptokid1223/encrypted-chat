import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return (
    <div className="safe-pb safe-pt flex min-h-dvh flex-1 items-start justify-center bg-[#0C0A09] px-4 py-10 sm:items-center">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-lg font-semibold tracking-tight text-[#EA580C]">
          Celesth
        </p>
        <div className="rounded-2xl border border-[#292524] bg-[#1C1917] p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAF9]">
            Join Celesth
          </h1>
          <p className="mt-1 text-sm text-[#A8A29E]">
            Choose a username, password, and avatar
          </p>
          <div className="mt-6">
            <SignupForm />
          </div>
        </div>
      </div>
    </div>
  );
}
