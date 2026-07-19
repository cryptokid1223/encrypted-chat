/** Synthetic email for Supabase Auth (`user@users.cipherapp.com`). Never show this in the UI. */
export function usernameToAuthEmail(username: string): string {
  return `${username}@users.cipherapp.com`;
}

export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export function validateUsername(username: string): string | null {
  if (!USERNAME_REGEX.test(username)) {
    return "Username must be 3–20 characters: lowercase letters, numbers, and underscores only.";
  }
  return null;
}

export function passwordStrengthHint(password: string): string {
  if (password.length === 0) return "";
  if (password.length < 10) return "Too short — use at least 10 characters.";
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  if (hasLetter && hasNumber && password.length >= 14) return "Strong password.";
  if (hasLetter && hasNumber) return "Decent — longer is better.";
  return "Add letters and numbers for a stronger password.";
}
