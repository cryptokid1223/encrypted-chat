import { AuthAtmosphere } from "@/components/auth-atmosphere";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="relative flex h-full min-h-0 flex-1 justify-center overflow-y-auto bg-[#0F0E0D] px-4 py-8 sm:py-10">
      <AuthAtmosphere />
      <div className="safe-pb relative z-10 my-auto w-full max-w-lg">
        <div className="rounded-3xl border border-[#2E2B28] bg-[#1A1816] p-8">
          <div className="flex flex-col items-center text-center">
            <Logo size="lg" markSize={28} />
            <p className="mt-2 text-[13px] leading-[1.4] text-[#6E6963]">
              Welcome back — encrypted as always
            </p>
          </div>
          <p className="mt-6 text-[20px] font-semibold leading-[1.4] text-[#FAFAF9]">
            Log in
          </p>
          <p className="mt-1 text-[13px] text-[#6E6963]">
            Username and password only
          </p>
          <div className="mt-5">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
