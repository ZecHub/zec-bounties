const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_IMAGE_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const IMAGE_DATA_URL =
  /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/;

function canAccessBountyChat(bounty, user) {
  if (!bounty || !user) return false;
  if (user.role === "ADMIN") return true;
  if (user.id === undefined || user.id === null || user.id === "") {
    return false;
  }

  return (
    (bounty.assignee != null && bounty.assignee === user.id) ||
    (Array.isArray(bounty.assignees) &&
      bounty.assignees.some(
        (assignee) => assignee && assignee.userId === user.id,
      ))
  );
}

function validateChatMessage(input) {
  const { content, imageData } =
    input && typeof input === "object" ? input : {};
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

  const base64Payload = match[2];
  if (base64Payload.length > MAX_IMAGE_BASE64_CHARS) {
    return { error: "Images must be 512 KB or smaller" };
  }

  const bytes = Buffer.from(base64Payload, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== base64Payload) {
    return { error: "Invalid image attachment" };
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { error: "Images must be 512 KB or smaller" };
  }

  return { content: text, imageData };
}

module.exports = { canAccessBountyChat, validateChatMessage };
