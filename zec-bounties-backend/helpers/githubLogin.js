// Login finds the account by email, so the email must be one GitHub has
// verified. The profile email from /user carries no verified flag, so it is
// not used.
function verifiedPrimaryEmail(emails) {
  if (!Array.isArray(emails)) return null;
  const primary = emails.find((email) => email?.primary && email.verified);
  return typeof primary?.email === "string" ? primary.email : null;
}

// An account already linked to one GitHub account must not be opened by
// another GitHub account that shows the same email.
function isOtherGithubAccount(user, githubId) {
  return Boolean(user?.githubId) && user.githubId !== githubId;
}

module.exports = { verifiedPrimaryEmail, isOtherGithubAccount };
