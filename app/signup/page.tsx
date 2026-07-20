import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return (
    <div className="screen-enter flex h-app min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-[var(--bg)]">
      <div className="safe-pb w-full max-w-lg px-[var(--sp-4)] pb-[var(--sp-8)] pt-[calc(var(--safe-top)+var(--sp-8))]">
        <SignupForm />
      </div>
    </div>
  );
}
