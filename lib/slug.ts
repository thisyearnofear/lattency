// Deterministic URL slugs from café names. Derived rather than stored so
// no DB migration is needed — slugs change only when names change.

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")          // strip apostrophes: "Kaldi's" → "kaldis"
    .replace(/[^a-z0-9]+/g, "-")   // any non-alphanumeric run → single hyphen
    .replace(/^-+|-+$/g, "");       // trim leading / trailing hyphens
}
