const USER_SELECT = { id: true, name: true, nickname: true, avatar: true };

const USER_SELECT_PUBLIC = USER_SELECT;

// Public fields plus the role. The bounty cards read createdByUser.role to
// label hunter-suggested tasks, so signed-in users get it without the email.
const USER_SELECT_PUBLIC_WITH_ROLE = { ...USER_SELECT, role: true };

const USER_SELECT_FULL = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  avatar: true,
  z_address: true,
  UA_address: true,
};

const USER_SELECT_WITH_ROLE = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  role: true,
  avatar: true,
};

const USER_SELECT_BASIC = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  avatar: true,
};

const USER_SELECT_MINIMAL = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  discordUsername: true,
};

const USER_SELECT_EXPORT = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  z_address: true,
  UA_address: true,
  ofacVerified: true,
};

// Which user fields a viewer gets on the bounty read routes. Email and payout
// addresses (z_address, UA_address) are for admins only; being signed in is
// not enough to see another user's.
function bountyUserSelects({ isAuthed, isAdmin }) {
  if (isAdmin) {
    return { user: USER_SELECT_FULL, createdByUser: USER_SELECT_WITH_ROLE };
  }
  return {
    user: USER_SELECT_PUBLIC,
    createdByUser: isAuthed ? USER_SELECT_PUBLIC_WITH_ROLE : USER_SELECT_PUBLIC,
  };
}

module.exports = {
  USER_SELECT,
  USER_SELECT_PUBLIC,
  USER_SELECT_PUBLIC_WITH_ROLE,
  bountyUserSelects,
  USER_SELECT_FULL,
  USER_SELECT_WITH_ROLE,
  USER_SELECT_BASIC,
  USER_SELECT_MINIMAL,
  USER_SELECT_EXPORT,
};
