/**
 * Shared Zcash-address input guard.
 *
 * Any value that is later handed to zingo-cli — whether interpolated into a
 * command, written to the REPL stdin, or passed as an argv element — must
 * contain only the base58/bech32 characters a real Zcash address uses. No
 * quotes, whitespace, shell metacharacters or control characters. This is the
 * same charset already enforced on `update-zaddress` and in
 * `ZingoProcess.quicksend`; centralising it here so every address sink can
 * reuse the one rule.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isSafeShieldedAddress(value) {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 512 &&
    /^[A-Za-z0-9]+$/.test(value)
  );
}

module.exports = { isSafeShieldedAddress };
