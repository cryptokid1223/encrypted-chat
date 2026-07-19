import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="safe-pb flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[#E7E5E4] bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1C1917]">
          Log in to <span className="text-[#EA580C]">Celesth</span>
        </h1>
        <p className="mt-1 text-sm text-[#78716C]">Username and password only</p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
