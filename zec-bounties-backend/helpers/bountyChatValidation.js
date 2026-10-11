const MAX_IMAGE_BYTES = 512 * 1024;
const IMAGE_DATA_URL =
  /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/;

function canAccessBountyChat(bounty, user) {
  if (!bounty || !user) return false;
  if (user.role === "ADMIN") return true;

  return (
    bounty.assignee === user.id ||
    (bounty.assignees ?? []).some((assignee) => assignee.userId === user.id)
  );
}

function validateChatMessage({ content, imageData } = {}) {
  const text = typeof content === "string" ? content.trim() : "";
  if (text.length > 2000)
    return { error: "Messages must be 2000 characters or fewer" };

  if (imageData == null || imageData === "") {
    return text
      ? { content: text, imageData: null }
      : { error: "Add a message or image" };
  }

  if (typeof imageData !== "string")
    return { error: "Invalid image attachment" };
  const match = imageData.match(IMAGE_DATA_URL);
  if (!match) return { error: "Use a PNG, JPEG, WebP, or GIF image" };

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.toString("base64") !== match[2] || bytes.length > MAX_IMAGE_BYTES) {
    return { error: "Images must be 512 KB or smaller" };
  }

  return { content: text, imageData };
}

module.exports = { canAccessBountyChat, validateChatMessage };
