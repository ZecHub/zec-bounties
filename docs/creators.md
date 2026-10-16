# Creators

Propose tasks, review work, and pay contributors with shielded ZEC.

## Workflow

### 1. Propose a bounty

Create a bounty with a clear title, description, ZEC reward, and deadline.
The form only accepts ZEC. Pick that number from the USD intervals in [Bounty amounts](bounty-amounts.md).
Spell out acceptance criteria so submissions are easy to judge.

### 2. Admin approval

New bounties typically need admin approval before they go live on the public board.

### 3. Review applications

Review applicants and assign the contributor(s) who should do the work.

### 4. Review submissions

When work is submitted, review the deliverable against the description.
Request changes or approve.

### 5. Payout

After approval, payment can be triggered (one-click or batched by admins).
Funds are sent as a shielded transaction to the assignee’s registered UA.
A transaction ID is stored for transparency.
If the ZEC/USD spot has moved ≥ 20% or more than 7 days have passed, edit the ZEC reward before paying so the implied USD band still holds — [Bounty amounts](bounty-amounts.md).

## Writing a good bounty

- Specific scope — what “done” looks like
- A ZEC reward chosen from the suggested USD intervals — [Bounty amounts](bounty-amounts.md)
- Links to repos, designs, or prior art when relevant
- Realistic deadline

## Target repositories

When creating a bounty you can optionally tag a target repository. These are the ZecHub projects the platform currently knows about:

| Id | What it means |
| --- | --- |
| `zechub` | ZecHub education hub (https://github.com/ZecHub/zechub) |
| `zechub-wiki` | ZecHub wiki (https://github.com/ZecHub/zechub-wiki, zechub.wiki) |
| `zec-bounties` | This bounty platform (https://github.com/ZecHub/zec-bounties) |
| `namada` | **ZecHub Namada Governance and Network Metrics Dashboard only** — https://github.com/ZecHub/Namada and https://namada.zechub.wiki. This is **not** the upstream Namada protocol codebase (namada-net/namada). Upstream protocol, node, MASP, or client work is out of scope for this target. |

Pick the matching repository so reviewers and hunters know exactly which codebase the work applies to.

## Payment notes

- Assignees must have a UA with at least one shielded receiver. Transparent-only addresses cannot be paid. Mixed UAs (shielded + transparent) are allowed with a warning — see [Addresses](addresses.md).
- Paying wallets (personal or team) must be funded and reachable for the send to succeed.
- Failed sends should not silently mark a bounty as paid.

## Next

[Bounty amounts →](bounty-amounts.md)
