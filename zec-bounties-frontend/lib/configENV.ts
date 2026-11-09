export const backendUrl =
  process.env.NODE_ENV === "production"
    ? "https://zechub.zone"
    : "http://localhost:9000";

export const backendWebSpocketUrl =
  process.env.NODE_ENV === "production"
    ? "wss://zechub.zone/"
    : "ws://localhost:9000";

export const IS_DEV = process.env.NODE_ENV !== "production";

// Permanent invite to the Discord support server.
export const discordInviteUrl = "https://discord.gg/d4Dcn3GPGE";
