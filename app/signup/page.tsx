import { AuthColumn } from "@/components/auth-ui";
import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return (
    <AuthColumn>
      <SignupForm />
    </AuthColumn>
  );
}
