import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="safe-pb safe-pt flex min-h-dvh flex-1 items-center justify-center bg-[#0C0A09] px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-lg font-semibold tracking-tight text-[#EA580C]">
          Celesth
        </p>
        <div className="rounded-2xl border border-[#292524] bg-[#1C1917] p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAF9]">
            Log in to Celesth
          </h1>
          <p className="mt-1 text-sm text-[#A8A29E]">
            Username and password only
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
