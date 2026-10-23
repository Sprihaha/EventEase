// Mirrors backend/app/rules/password.py so users see problems before submitting.
// The backend remains the authority and rejects anything that slips through.
export const PASSWORD_RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 && p.length <= 128 },
  { label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "A digit", test: (p) => /[0-9]/.test(p) },
  { label: "A symbol, e.g. ! @ # -", test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export function isStrongPassword(password: string) {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
