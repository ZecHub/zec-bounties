// Many bounty and team routes select `email` on nested users (creators,
// assignees, applicants, team members, activity actors). Only admins may see
// other users' addresses, so for everyone else the JSON response drops
// `email` from every object except the caller's own user row. `email` exists
// only on the User model, so dropping it by key cannot remove anything else.
function withoutOtherUsersEmails(body, viewerId) {
  if (body === null || typeof body !== "object") return body;
  return JSON.parse(
    JSON.stringify(body, function (key, value) {
      if (key === "email" && (!viewerId || this.id !== viewerId)) {
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
