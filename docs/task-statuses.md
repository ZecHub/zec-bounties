# Task statuses

Every bounty has one of five statuses. Here is what each one means and what moves a bounty to the next.

## The five statuses

### To Do

Every new bounty starts here with approval pending. Nobody can submit work until an admin approves (activates) it. Bounties created by an admin are approved on creation.

### In Progress

The bounty is live and someone is working on it. It moves here when an admin approves it, or when an application is accepted or an assignee is added.

### In Review

An assignee has submitted work: a description of what was done, usually with a deliverable link (PR, doc, design, repo). The submission waits for review.

### Done

The submission was approved. If it is rejected or sent back for revision instead, the bounty returns to In Progress.

### Cancelled

The bounty is closed without a payout. This happens when an admin removes its approval or all assignees are removed. Adding an assignee again moves it back to In Progress.

Platform admins can change any status. For team bounties, the team's OWNER and ADMIN members can too.

## Flow

```
To Do (approval pending)
  │ admin approves, or
  │ an assignee is added
  ▼
In Progress ◄─────────────┐
  │ assignee submits work │ rejected /
  ▼                       │ needs revision
In Review ────────────────┘
  │ submission approved
  ▼
Done
  │ admin authorizes payment
  ▼
Paid (txid recorded)

Cancelled ◄── approval removed, or
              all assignees removed
```

## Done is not the same as paid

After Done, payouts are batched and usually go out the following Sunday to the payout UA set in Profile. The hunter has nothing else to do. Payment is still a separate step: an admin authorizes a shielded payment to the assignee's registered UA, and the transaction ID is recorded on the bounty. Until then a Done bounty is approved but unpaid. See [Privacy & payments](privacy-payments.md).

## Suggested is not a status

**Suggested** is a label for a bounty created by a user with the Hunter role. It can be in any of the five statuses.

- The card shows a lock and reads **Invite Only / No other applicants**.
- The apply button is hidden. Other users cannot apply.
- The hunter who suggested it is assigned to it from the start.

Why: the bounty fund is limited, so admins approve the suggestions that are most useful to the community. An approved suggestion goes to the hunter who proposed it.

## New bounties

- New bounties are usually posted on Mondays.
- Suggest a bounty only for work that is not already listed. Check the board first.

## Next

[Creators →](creators.md)
