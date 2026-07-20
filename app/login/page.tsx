import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="flex h-app min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)]">
      <div className="safe-pb w-full max-w-lg px-[var(--sp-4)] pb-[var(--sp-8)] pt-[calc(var(--safe-top)+var(--sp-8))]">
        <LoginForm />
      </div>
    </div>
  );
}
