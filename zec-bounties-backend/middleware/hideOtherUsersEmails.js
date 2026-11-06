// Many bounty and team routes select sensitive user fields — `email` and the
// payout addresses `z_address` / `UA_address` — on nested user rows (creators,
// assignees, applicants, team members, activity actors). Only admins, or the
// user themselves, may see another user's; for everyone else the JSON response
// drops these from every user object except the caller's own row. All three
// keys exist only on the User model, so dropping them by key cannot remove
// anything else. (Export name kept for import compatibility; it now strips the
// payout addresses too — the fields the codebase elsewhere treats as
// admin-only, e.g. USER_SELECT_FULL / websocket broadcast redaction.)
const PRIVATE_USER_FIELDS = new Set(["email", "z_address", "UA_address"]);

function withoutOtherUsersEmails(body, viewerId) {
  if (body === null || typeof body !== "object") return body;
  return JSON.parse(
    JSON.stringify(body, function (key, value) {
      if (PRIVATE_USER_FIELDS.has(key) && (!viewerId || this.id !== viewerId)) {
        return undefined;
      }
      return value;
    }),
  );
}

// Runs before the router, so it wraps res.json and checks the role only when
// the response is sent, after the route's own authenticate has set req.user.
function hideOtherUsersEmails(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) =>
    req.user?.role === "ADMIN"
      ? json(body)
      : json(withoutOtherUsersEmails(body, req.user?.id));
  next();
}

module.exports = { hideOtherUsersEmails, withoutOtherUsersEmails };
