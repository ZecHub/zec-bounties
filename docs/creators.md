# Creators

Propose tasks, review work, and pay contributors with shielded ZEC.

Individuals and **[Teams](teams.md)** both use this flow. Teams typically pay from a shared wallet; hunters who later post a bounty still pay from a personal wallet.

## Workflow

### 1. Propose a bounty

Create a bounty with a clear title, description, ZEC amount, and deadline. Spell out acceptance criteria so submissions are easy to judge.

### 2. Admin approval

New bounties typically need admin approval before they go live on the public board.

### 3. Review applications

Review applicants and assign the contributor(s) who should do the work.

### 4. Review submissions

When work is submitted, review the deliverable against the description. Request changes or approve.

### 5. Payout

After approval, payment can be triggered (one-click or batched by admins). Funds are sent as a shielded transaction to the assignee’s registered UA. A transaction ID is stored for transparency.

## Writing a good bounty

- Specific scope — what “done” looks like
- Fair ZEC amount for the effort
- Links to repos, designs, or prior art when relevant
- Realistic deadline

## Payment notes

- Assignees must have a UA with at least one shielded receiver. Transparent-only addresses cannot be paid. Mixed UAs (shielded + transparent) are allowed with a warning — see [Addresses](addresses.md).
- Paying wallets (personal or team) must be funded and reachable for the send to succeed.
- Failed sends should not silently mark a bounty as paid.

## Next

[Teams →](teams.md) · [Privacy & payments →](privacy-payments.md)
