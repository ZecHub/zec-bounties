const MAX_DELIVERABLE_LINKS = 5;

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function validateDeliverableUrl(value) {
  if (value == null) return null;
  const tokens = value.split(/[\s,]+/).filter(Boolean);
  if (tokens.some((token) => !isHttpUrl(token))) {
    return "Each deliverable link must be a valid http:// or https:// URL";
  }
  if (new Set(tokens).size > MAX_DELIVERABLE_LINKS) {
    return `You can add up to ${MAX_DELIVERABLE_LINKS} deliverable links`;
  }
  return null;
}

module.exports = { MAX_DELIVERABLE_LINKS, isHttpUrl, validateDeliverableUrl };
