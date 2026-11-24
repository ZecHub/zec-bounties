// Browsers hand out push endpoints only on these services. Any other URL in a
// subscription would make the server send requests to a host the user chose.
const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com"];
const PUSH_HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];
const SUBDOMAIN_PREFIX_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

function isAllowedSubdomain(hostname, suffix) {
  if (hostname.length <= suffix.length || !hostname.endsWith(suffix)) {
    return false;
  }
  const prefix = hostname.slice(0, -suffix.length);
  return SUBDOMAIN_PREFIX_PATTERN.test(prefix);
}

function isAllowedPushEndpoint(endpoint) {
  if (
    typeof endpoint !== "string" ||
    !endpoint ||
    endpoint !== endpoint.trim() ||
    /[\u0000-\u001f\u007f]/.test(endpoint)
  ) {
    return false;
  }
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) {
    return false;
  }
  return (
    PUSH_HOSTS.includes(url.hostname) ||
    PUSH_HOST_SUFFIXES.some((suffix) => isAllowedSubdomain(url.hostname, suffix))
  );
}

module.exports = { isAllowedPushEndpoint };
