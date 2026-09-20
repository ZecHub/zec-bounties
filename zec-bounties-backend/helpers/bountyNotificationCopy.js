// Notification copy for a newly created bounty.
//
// A HUNTER-created bounty is assigned to its creator at creation time
// (`resolvedAssignee` in routes/bounties.js) and POST /apply rejects every
// other user once `assignee` is set ("Bounty already assigned"), so such a
// bounty is reserved rather than open work. The notification copy therefore
// has to distinguish the two cases — otherwise opted-in users receive
// "New Bounty Available" for work they are not allowed to claim.

const isReservedBounty = (bounty) => Boolean(bounty && bounty.assignee);

function buildBountyNotificationCopy(bounty, creatorDisplayName) {
  const reserved = isReservedBounty(bounty);

  const text = reserved
    ? `A new reserved bounty has been created.\n\nCreated by: ${creatorDisplayName}\n\nTitle: ${bounty.title}\nAmount: ${bounty.bountyAmount}\n\nThis bounty is reserved for its creator and is not accepting other applicants.`
    : `A new bounty has been created.\n\nCreated by: ${creatorDisplayName}\n\nTitle: ${bounty.title}\nAmount: ${bounty.bountyAmount}`;

  const html = `
            <h2>${reserved ? "New Reserved Bounty Created" : "New Bounty Created"}</h2>
            <p><strong>Created by:</strong> ${creatorDisplayName}</p>
            <p><strong>Title:</strong> ${bounty.title}</p>
            <p><strong>Description:</strong><br/>
              ${bounty.formattedDescription}
            </p>
            ${reserved ? "" : `<p><strong>Apply:</strong> this bounty is open to applicants.</p>`}
            <p><strong>Amount:</strong> ${bounty.bountyAmount} ZEC</p>
            <p><strong>Time to complete:</strong> ${bounty.timeToComplete}</p>
          `;

  return {
    reserved,
    push: {
      title: reserved ? "New Bounty Created" : "New Bounty Available",
      body: reserved
        ? `${bounty.title} — suggested by ${creatorDisplayName} (no other applicants)`
        : `${bounty.title} — ${bounty.bountyAmount} ZEC`,
    },
    email: {
      subject: reserved
        ? `New Bounty Created (reserved): ${bounty.title}`
        : `New Bounty Created: ${bounty.title}`,
      text,
      html,
    },
  };
}

module.exports = { isReservedBounty, buildBountyNotificationCopy };