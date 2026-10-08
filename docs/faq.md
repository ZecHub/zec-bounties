# FAQ

Common questions about addresses, payouts, roles, and using the platform.

## Why was my transparent address rejected?

Payouts are shielded-only. Provide a Unified Address with a shielded receiver (Ironwood / Sapling preferred). See [Addresses](addresses.md).

## What address should I use?

Preferred: a UA with **shielded receivers only** (Ironwood / Sapling). A UA that also includes a transparent receiver is **allowed**, with a warning — see [Addresses](addresses.md). Transparent-only addresses are rejected.

## Can I use a UA that has both shielded and transparent receivers?

Yes. It is accepted as long as a shielded receiver is present. Platform payouts use the shielded path. The transparent receiver can still receive public funds if used elsewhere — prefer shielded-only when your wallet allows it.

## Can I change my payout address later?

Yes. Update it in [Profile](https://bounties.zechub.wiki/profile). Future payments use the address on file when the payment runs.

## Hunter or Team — which should I pick?

- **Hunter** if you will apply to bounties yourself. See [Hunters](hunters.md).
- **Team** if you will post and fund work as a group. See [Teams](teams.md).

Onboarding sets this once. Normal accounts cannot switch later. Admin is not a self-serve option.

## I picked the wrong role. Can I change it?

Not self-serve. Ask a platform admin if the account must move. Do not create a second GitHub login unless an admin tells you to.

## Does creating a team make me a platform admin?

No. Team OWNER/ADMIN only manage that team. Platform Admin is a separate role. Team verification also requires three platform admins.

## How do I get my first bounty?

First set a shielded UA in [Profile](https://bounties.zechub.wiki/profile). Then apply to an open bounty on the board, or suggest one with **New Bounty** and wait for an admin to approve it. New bounties are usually posted on Mondays — only suggest work that is not already listed. See [Contributors](contributors.md).

## Why can't I apply to a Suggested task?

A Suggested task was created by a hunter and is assigned to that hunter. It shows **Invite Only / No other applicants** with a lock, and the apply button is hidden. The bounty fund is limited, so admins approve the suggestions most useful to the community and the work goes to the hunter who proposed it. See [Task statuses](task-statuses.md).

## My work was approved but I have not been paid.

Payouts are batched and usually go out the Sunday after a bounty is marked Done, to the payout UA set in Profile — you have nothing else to do. Done and paid are separate steps (an admin authorizes the shielded payment and the txid is recorded) — see [Task statuses](task-statuses.md). Confirm the bounty is marked done / payment authorized. If it stays stuck, contact the bounty creator or ZecHub admins. Check that your registered UA is still valid.

## Do I need to share my seed phrase?

No. For normal use the platform only needs your receive address. Never paste a seed or spending key into the site.

## Is this mainnet?

Yes. Live payouts use mainnet ZEC. Treat amounts and addresses as real value.

## Why did the ZEC amount on a bounty change?

The form only stores ZEC. Creators pick that number from an implicit USD interval (`usd_target / zec_usd_spot`). If the spot moves ≥ 20%, a week has passed, or payout is about to run, they should edit the ZEC field so the implied dollar value stays in the same band. See [Bounty amounts](bounty-amounts.md).

## Are the old tip amounts (0.05 ZEC, 0.08 ZEC, …) still used?

Those were snapshots at an older ZEC/USD rate. Suggest from the USD intervals on [Bounty amounts](bounty-amounts.md), then enter the converted ZEC amount.

## Where do I get help?

- [GitHub issues](https://github.com/ZecHub/zec-bounties/issues)
- ZecHub Discord / community channels
- [@ZecHub on X](https://x.com/ZecHub)

## Back to

[Overview](overview.md)
