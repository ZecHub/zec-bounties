# Glossary

Names in the code that the other docs leave undefined. The enums and flags below are copied from `zec-bounties-backend/prisma/schema.prisma` and the routes that write them.

Using the board is covered in [Contributors](contributors.md). This page is the map for those names.

## Account roles (`UserRole`)

Set on `User.role`. New accounts start as `CLIENT`. Onboarding picks Hunter or Team once. Admin is not a signup choice.

| Value | Meaning |
| --- | --- |
| `CLIENT` | Default before onboarding. Not a board role you choose. |
| `HUNTER` | Individual account. Applies, gets assigned, submits work, receives a shielded payout. |
| `TEAM` | Account that posts work with a team and a shared wallet. |
| `ADMIN` | Operator. Can approve bounties, change approval, authorize payment, and administer bounties they do not own. |

## Team membership

`TeamMember.role` is a string, not `UserRole`. Allowed values in the schema comment: `OWNER`, `ADMIN`, `MEMBER`. Default is `MEMBER`. A team role does not change `User.role`.

## Creator

`creator` is not a role. It is `Bounty.createdBy`: the user who opened the bounty.

A Hunter who creates a bounty is stored as its creator, is auto-assigned, and the row is saved with `isApproved: false`. Team and Admin accounts can assign someone else. Only an Admin can create a bounty that is already approved; other callers' `isApproved` is ignored and stored as false.

## Bounty status (`Status`)

`Bounty.status`. Default is `TO_DO`.

| Value | Meaning |
| --- | --- |
| `TO_DO` | Open and not yet in progress. The status route treats `TO_DO` as not approved. |
| `IN_PROGRESS` | Someone is assigned, or an admin approval moved it here. A rejected submission, or one marked `needs_revision`, returns the bounty here when no other submission is approved. |
| `IN_REVIEW` | An assignee submitted work. Submit is allowed from `TO_DO`, `IN_PROGRESS`, or `IN_REVIEW`. |
| `DONE` | Work was accepted, or an admin set this status. `completedAt` is set. If several people are assigned, a winner must be chosen before the status can move to `DONE`. |
| `CANCELLED` | No assignees left, or an admin cleared approval. The status route treats `CANCELLED` as not approved. |

Work submissions and applications use their own status strings. They are not `Status` values.

- Application (`BountyApplication.status`): `pending` by default.
- Submission (`WorkSubmission.status`): `pending` by default. Review accepts `approved`, `rejected`, or `needs_revision`.

## Bounty flags

| Field | Meaning for a hunter |
| --- | --- |
| `isApproved` | The bounty is accepted. Submit work fails while this is false. Admins set it. Setting it true on edit moves status to `IN_PROGRESS`. Setting it false moves status to `CANCELLED`. A status change to anything other than `TO_DO` or `CANCELLED` sets it true. |
| `isPaid` | A payout was recorded. `paidAt` is set in the same update. A `DONE` bounty with `isPaid: false` is still unpaid. |
| `paymentAuthorized` | An admin authorized payout. A successful send also sets it true. |
| `paymentInFlight` | A send has claimed this bounty so a second send cannot start. It is set only when status is `DONE`, `isApproved` is true, `isPaid` is false, and this flag is still false. It is cleared when the send is recorded or marked failed. |
| `paymentScheduled` | Optional schedule stored as JSON text (for example a Sunday batch). It does not by itself pay the bounty. |

## Transaction status (`TxStatus`)

On `Transaction.status`, not on the bounty.

| Value | Meaning |
| --- | --- |
| `PENDING` | Claimed. The wallet has not confirmed a send. |
| `BROADCAST` | A txid was seen. The send is recorded, and the bounty is marked paid. |
| `FAILED` | The wallet reported an error before sending. The bounty is not marked paid, and `paymentInFlight` is cleared. |
| `UNKNOWN` | A send was attempted and the outcome is unclear. A human resolves it. |

## Next

[FAQ →](faq.md) · [Privacy & payments →](privacy-payments.md)
