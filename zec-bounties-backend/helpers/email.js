const escapeHtml = (text) =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatEmailText = (text) => {
  if (!text) return "";
  return escapeHtml(text).replace(/\n/g, "<br/>");
};

module.exports = { escapeHtml, formatEmailText };
