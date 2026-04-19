export function normalizePhone(input?: string | null): string | null {
  if (!input) return null;

  let s = input.toString().trim();

  // remove spaces, dashes, brackets
  s = s.replace(/[\s().-]/g, "");

  // remove multiple +
  s = s.replace(/\++/g, "+");

  // if starts with 0 → remove
  if (s.startsWith("0")) {
    s = s.slice(1);
  }

  // if no country code → assume India (91)
  if (!s.startsWith("+")) {
    if (s.length === 10) {
      s = "+91" + s;
    } else {
      s = "+" + s;
    }
  }

  // final validation (basic)
  if (s.length < 10) return null;

  return s;
}