// Score how similar two bounty titles are, so the Create Bounty form can warn
// a creator that they may be posting a duplicate.
//
// Pure: no database, no network, no express. That is deliberate — the matching
// rules are the part worth testing, and they are testable only if nothing here
// needs a running server.
//
// The board has two real kinds of duplicate, and they want different handling:
//
//   Exact reposts. Two identical "ZecWeekly Indonesian Translation Vol.34"
//   posts. Normalized titles match outright; these must rank first.
//
//   Near misses. Two "Add a FROST / threshold custody explainer page" posts
//   differing in wording or punctuation. Token overlap catches these.
//
// And one case that looks like a duplicate but is not: "ZecWeekly Indonesian
// Translation Vol.33" against "...Vol.34" shares four tokens of five. Those are
// different newsletter editions, both legitimate. We still surface them —
// seeing the rest of the series is useful when you are about to add to it — but
// a differing number carries a penalty so genuine reposts always outrank
// sequence neighbours in the list of three.

/** Words too common in bounty titles to carry signal. */
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "at", "with",
  "add", "new", "create", "update", "page",
]);

/**
 * Lowercase, strip punctuation, collapse whitespace.
 * "ZecWeekly Indonesian Translation Vol.34" -> "zecweekly indonesian translation vol 34"
 */
function normalizeTitle(title) {
  if (typeof title !== "string") return "";
  return title
    .toLowerCase()
    .replace(/[‘’“”]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Content tokens, stop words removed. Falls back to all tokens if that empties it. */
function tokenize(title) {
  const all = normalizeTitle(title).split(" ").filter(Boolean);
  const kept = all.filter((t) => !STOP_WORDS.has(t));
  return kept.length ? kept : all;
}

function numbersIn(tokens) {
  return tokens.filter((t) => /^\d+$/.test(t));
}

/**
 * Similarity in [0, 1].
 *
 * 1 means the normalized titles are identical. Otherwise it is the Sørensen
 * dice coefficient over content tokens, reduced when the two titles carry
 * different numbers — the Vol.33 / Vol.34 case.
 */
function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  let score = (2 * shared) / (setA.size + setB.size);

  // Different numbers usually mean a different instalment, not a repost.
  const numsA = numbersIn(ta).join(",");
  const numsB = numbersIn(tb).join(",");
  if (numsA !== numsB && (numsA || numsB)) score *= 0.75;

  return score;
}

/** Below this, titles are not worth showing the creator. */
const SIMILARITY_THRESHOLD = 0.45;

/** Never show more than this many, per the form's design. */
const MAX_RESULTS = 3;

/**
 * Rank candidates against a title and return the closest few.
 *
 * Candidates are plain objects with at least { id, title }. Anything else on
 * them (status, dateCreated) is passed through untouched so the caller decides
 * what to expose.
 */
function rankSimilar(title, candidates, options = {}) {
  const limit = options.limit ?? MAX_RESULTS;
  const threshold = options.threshold ?? SIMILARITY_THRESHOLD;
  if (!normalizeTitle(title) || !Array.isArray(candidates)) return [];

  return candidates
    .map((c) => ({ ...c, similarity: titleSimilarity(title, c && c.title) }))
    .filter((c) => c.similarity >= threshold)
    .sort((x, y) => y.similarity - x.similarity || String(x.id).localeCompare(String(y.id)))
    .slice(0, limit);
}

module.exports = {
  normalizeTitle,
  tokenize,
  titleSimilarity,
  rankSimilar,
  SIMILARITY_THRESHOLD,
  MAX_RESULTS,
  STOP_WORDS,
};
