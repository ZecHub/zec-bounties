/**
 * Normalizes Zingo-flavored JSON outside of quoted string literals so values
 * containing colons (URLs, timestamps, memos) or underscores are preserved.
 * @param {string} rawJson
 * @returns {string}
 */
function normalizeZingoJson(rawJson) {
  const parts = [];
  let i = 0;
  let plainStart = 0;

  const flushPlain = (end) => {
    if (end <= plainStart) return;
    let segment = rawJson.slice(plainStart, end);
    // Remove numeric underscores without altering identifiers like v1_2
    segment = segment.replace(
      /(?<![A-Za-z0-9_$])(\d+(?:_\d+)+)(?![A-Za-z0-9_$])/g,
      (num) => num.replace(/_/g, ""),
    );
    // Quote unquoted object keys without touching already-quoted strings
    segment = segment.replace(/([\{,\s])([A-Za-z_]\w*)\s*:/g, '$1"$2":');
    // Remove trailing commas before closing braces/brackets
    segment = segment.replace(/,\s*([}\]])/g, "$1");
    parts.push(segment);
  };

  while (i < rawJson.length) {
    if (rawJson[i] === '"') {
      flushPlain(i);
      const strStart = i;
      i += 1;
      while (i < rawJson.length) {
        if (rawJson[i] === "\\") {
          i += 2;
        } else if (rawJson[i] === '"') {
          i += 1;
          break;
        } else {
          i += 1;
        }
      }
      parts.push(rawJson.slice(strStart, i));
      plainStart = i;
    } else {
      i += 1;
    }
  }
  flushPlain(rawJson.length);

  return parts.join("");
}

/**
 * Extracts and cleans the first JSON object block {...} from raw terminal output.
 * @param {string} rawOutput - The string captured from zingo-cli stdout.
 * @returns {Object|null} - The parsed JSON object or null if not found.
 */
function parseZingoObject(rawOutput) {
  if (typeof rawOutput !== "string" || rawOutput.length === 0) return null;

  // 1. Regex to find everything from the FIRST '{' to the LAST '}'
  // This handles cases where there might be text before or after the JSON.
  const jsonMatch = rawOutput.match(/\{([\s\S]*)\}/);

  if (!jsonMatch) {
    console.warn("No JSON object block found in Zingo output.");
    return null;
  }

  try {
    // 2. Clean Zingo-specific formatting outside string literals:
    const cleanJson = normalizeZingoJson(jsonMatch[0]);
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Failed to parse Zingo Object:", error.message);
    // Return the raw match so you can at least see the text
    return { raw: jsonMatch[0] };
  }
}

module.exports = { parseZingoObject, normalizeZingoJson };
