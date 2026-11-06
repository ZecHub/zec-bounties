// utils/exportableBounty.js
// Completed mainnet bounties that are not paid or being paid in the app.
const EXPORTABLE_BOUNTY = {
  status: "DONE",
  chain: "MAIN",
  isApproved: true,
  isPaid: false,
  paymentInFlight: false,
};

// Admin handles platform bounties plus teams that chose admin payout.
const ADMIN_PAYOUT_SCOPE = {
  OR: [{ teamId: null }, { team: { payoutBy: "ADMIN" } }],
};
const ADMIN_EXPORTABLE_BOUNTY = { ...EXPORTABLE_BOUNTY, ...ADMIN_PAYOUT_SCOPE };

module.exports = {
  EXPORTABLE_BOUNTY,
  ADMIN_PAYOUT_SCOPE,
  ADMIN_EXPORTABLE_BOUNTY,
};
