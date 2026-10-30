// How long a send written to the wallet may run before quicksend gives up
// and reports an unknown outcome. Payout recovery and the shutdown wait in
// utils/payoutRecovery.js are timed from it.
const SEND_TIMEOUT_MS = 360000;

module.exports = { SEND_TIMEOUT_MS };
