// Deterministic URL slugs from café names. Derived rather than stored so
// no DB migration is needed — slugs change only when names change.
// NFD-normalize first so accented characters (é, ñ, ø, å, …) decompose
// into their base letter + combining mark, then drop the combining marks
// via the U+0300–U+036F range. Without this, "Café Réveille" would
// collapse to "caf-r-veille".

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip combining diacritical marks
    .toLowerCase()
    .replace(/['’]/g, "")          // strip ASCII + curly apostrophes
    .replace(/[^a-z0-9]+/g, "-")        // any non-alphanumeric run → single hyphen
    .replace(/^-+|-+$/g, "");            // trim leading / trailing hyphens
}
