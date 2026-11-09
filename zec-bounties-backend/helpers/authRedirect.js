// Build the post-login redirect to the SPA auth callback.
//
// The session token MUST go in the URL FRAGMENT (#...), never the query string.
// A fragment is not sent to any server (so the 7-day bearer can't land in
// access/proxy logs) and is not included in the Referer header when the callback
// page loads third-party resources. The CSRF `state` nonce is not secret and
// stays in the query, where the SPA reads it.
//
// @param {string} frontendUrl
// @param {string} token
// @param {string|null|undefined} state
// @returns {string}
function buildCallbackRedirect(frontendUrl, token, state) {
  const stateQuery = state ? `?state=${state}` : "";
  return `${frontendUrl}/auth/callback${stateQuery}#token=${token}`;
}

module.exports = { buildCallbackRedirect };
