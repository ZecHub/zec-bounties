# Privacy & payments

The platform is built around shielded ZEC. Transparent-only payouts are not supported.

## Design goal

Contributors receive value privately. Creators and the platform do not need transparent-only addresses to complete a payout.

## What we require

- A Unified Address with at least one shielded receiver (Ironwood / Sapling preferred)
- **Preferred:** UA with shielded receivers only
- **Allowed with caution:** UA with both shielded and transparent receivers — payouts still use the shielded path; the transparent component is a general privacy risk outside this platform
- Full rules: [Addresses](addresses.md)

## What we do not need

- Your seed phrase or spending keys for normal use
- A transparent-only address for receiving bounty payments

Never paste a seed into the site. Only the receive address is used for payouts.

## How a payout works

1. Work is approved and the bounty is marked ready for payment.
2. The system resolves the assignee’s registered shielded address and the paying wallet (personal or team).
3. A shielded send is constructed (amount in zatoshis, memo with bounty context where used).
4. On success, payment state and transaction ID are stored so either party can verify on-chain.

## Transparency vs privacy

Transaction IDs let you confirm that a payment occurred. Shielded transfers still protect address linkage and amounts according to Zcash’s protocol properties. The platform records the txid for operational verification — not to force transparent flows.

## Next

[FAQ →](faq.md)
