const ADDRESS_PATTERN = /^[a-zA-Z0-9]{1,1000}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MEMO_MAX = 512;
const DEFAULT_MEMO = "Sent from the ZEC bounty app!";

const FIXED_COMMANDS = new Set([
  "quit",
  "rescan",
  "sync status",
  "addresses",
  "balance",
  "transactions",
  "recovery_info",
  "info",
]);

function assertPlainAddress(address) {
  if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) {
    throw new Error("Invalid address");
  }
  return address;
}

function assertFixedCommand(command) {
  if (!FIXED_COMMANDS.has(command)) {
    throw new Error("Rejected zingo command");
  }
  return command;
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseAddressLine(zaddress) {
  return `parse_address ${assertPlainAddress(zaddress)}`;
}

function quicksendLine(recipients) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new Error("No recipients");
  }
  const sanitized = recipients.map((recipient) => {
    assertPlainAddress(recipient.address);
    const amount = Math.ceil(Number(recipient.amount));
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("Invalid amount");
    }
    const memo =
      recipient.memo == null || recipient.memo === ""
        ? DEFAULT_MEMO
        : recipient.memo;
    if (
      typeof memo !== "string" ||
      memo.length > MEMO_MAX ||
      CONTROL.test(memo)
    ) {
      throw new Error("Invalid memo");
    }
    return { address: recipient.address, amount, memo };
  });
  const line = `quicksend ${shellSingleQuote(JSON.stringify(sanitized))}`;
  if (CONTROL.test(line)) {
    throw new Error("Rejected zingo command");
  }
  return line;
}

module.exports = {
  ADDRESS_PATTERN,
  assertPlainAddress,
  assertFixedCommand,
  parseAddressLine,
  quicksendLine,
};
