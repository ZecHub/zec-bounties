# Addresses

Payouts are shielded only. Your registered address must be able to receive shielded ZEC.

## Preferred

A Unified Address with **shielded receivers only** (Ironwood and/or Sapling, no transparent receiver) is the best privacy match for this platform.

## Allowed with caution

A UA that includes **both shielded and transparent receivers** is accepted for payouts, as long as a shielded receiver is present. Be aware: the transparent component can still receive public funds if someone sends to it. For bounty payouts on this platform, only the shielded path is used — but a mixed UA is not “shielded-only” in general wallet use.

## Acceptance rules

| Rule | Status |
|------|--------|
| UA with shielded receivers only (Ironwood and/or Sapling, no transparent component) | **Preferred** |
| UA with shielded and transparent receivers (must include at least one shielded receiver) | **Allowed** — transparent component is not used for platform payouts, but can still receive transparent funds outside this app |
| Transparent-only address (`t1…` / `t3…`) | **Rejected** |
| UA with only transparent receivers | **Rejected** |

## Receiver types

A Unified Address can embed one or more receivers. After NU6.3 (Ironwood), the preferred shielded pool is Ironwood.

| Receiver | Type | For payouts |
|----------|------|-------------|
| Ironwood | Shielded | Preferred |
| Sapling | Shielded | Accepted |
| Transparent | Public | Allowed in a UA only if a shielded receiver is also present |

Many modern wallets still show an Orchard-related receiver in the UA; after Ironwood activation, shielded receives are expected to land in the Ironwood pool. What matters for this platform is the presence of a shielded receiver — transparent-only addresses are not accepted.

## How to register

1. Sign in with GitHub.
2. Open [Profile](https://bounties.zechub.wiki/profile) (or the address prompt on first use).
3. Paste a UA from a maintained wallet (Zashi, Zingo, YWallet, ZODL, etc.).
4. Confirm the wallet can receive shielded funds. Prefer a UA without a transparent receiver when your wallet allows it.

Wallet / setup resources: [zechub.wiki/developers](https://zechub.wiki/developers)

## Important

- Never paste a seed phrase or spending key into the platform. Only the address is needed for payouts.
- You can update your payout address later in Profile. Future payments use the address on file at payment time.
- Mainnet ZEC is real value. Double-check the address in your wallet before saving.
- A mixed UA (shielded + transparent) is valid here, but anything sent to the transparent receiver is public on-chain.

## Next

[Getting started →](getting-started.md)
