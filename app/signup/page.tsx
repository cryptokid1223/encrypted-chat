import { AuthAtmosphere } from "@/components/auth-atmosphere";
import { Logo } from "@/components/logo";
import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return (
    <div className="relative flex min-h-dvh flex-1 items-start justify-center bg-[#0C0A09] px-4 py-10 sm:items-center sm:py-14">
      <AuthAtmosphere />
      <div className="safe-pb relative z-10 w-full max-w-xl">
        <div className="rounded-3xl border border-[#292524] bg-[#1C1917] px-8 py-10 sm:px-10 sm:py-11">
          <div className="flex flex-col items-center text-center">
            <Logo size="lg" />
            <p className="mt-3 text-sm text-[#A8A29E]">
              Private messaging. End-to-end encrypted.
            </p>
          </div>
          <h1 className="mt-8 text-xl font-semibold tracking-tight text-[#FAFAF9]">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-[#A8A29E]">
            Username, password, and an avatar — nothing else
          </p>
          <div className="mt-6">
            <SignupForm />
          </div>
        </div>
      </div>
    </div>
  );
}
