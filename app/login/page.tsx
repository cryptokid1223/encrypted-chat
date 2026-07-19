import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md border border-neutral-300 bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Log in to <span className="text-[#EA580C]">Cipher</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-600">Username and password only</p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
