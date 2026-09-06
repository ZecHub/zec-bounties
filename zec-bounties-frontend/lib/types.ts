export type UserRole = "ADMIN" | "CLIENT" | "TEAM" | "HUNTER";

export type BountyStatus =
  | "TO_DO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE"
  | "CANCELLED";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  nickname?: string;
  z_address?: string; // Orchard Wallet
  UA_address?: string | null;
  avatar?: string; // GitHub avatar URL
  githubId?: string; // GitHub username/ID
  isRobin: Boolean;
  emailNotifications?: boolean;
  badges?: string[];
}

/** Privacy-first profile visibility. Missing keys treated as false except avatar/displayName. */
export interface ProfileVisibility {
  showAvatar?: boolean;
  showDisplayName?: boolean;
  showBio?: boolean;
  showBadges?: boolean;
  showCompleted?: boolean;
  showCreated?: boolean;
  showEarnings?: boolean;
  showCompletionRate?: boolean;
  showAddressType?: boolean;
  showMemberSince?: boolean;
  showRecentBounties?: boolean;
  showRole?: boolean;
  showGithub?: boolean;
}

export type ProfileChain = "MAIN" | "TEST";

export interface ProfileChainStats {
  completed: number;
  created: number;
  submitted: number;
  totalEarned: number;
  completionRate: number | null;
  recentCompleted?: PublicUserProfile["recentCompleted"];
  recentCreated?: PublicUserProfile["recentCreated"];
}

export interface PublicUserTeam {
  id: string;
  name: string;
  logo?: string | null;
  isVerified?: boolean;
  memberRole: string;
}

export interface PublicUserProfile {
  id: string;
  visibility: Required<ProfileVisibility>;
  isOwner?: boolean;
  isAdminViewer?: boolean;
  displayName?: string;
  nickname?: string | null;
  name?: string;
  avatar?: string | null;
  bio?: string | null;
  badges?: string[];
  role?: UserRole;
  teams?: PublicUserTeam[];
  statsByChain?: Record<ProfileChain, ProfileChainStats>;
  memberSince?: string | Date;
  githubId?: string;
  githubUsername?: string;
  completed?: number;
  submitted?: number;
  created?: number;
  totalEarned?: number;
  completionRate?: number | null;
  addressType?: string;
  hasUnifiedAddress?: boolean;
  hasShieldedAddress?: boolean;
  recentCompleted?: Array<{
    id: string;
    title: string;
    bountyAmount: number;
    status: string;
    chain: string;
    paidAt?: string | null;
    dateCreated: string;
  }>;
  recentCreated?: Array<{
    id: string;
    title: string;
    bountyAmount: number;
    status: string;
    isApproved?: boolean;
    chain: string;
    dateCreated: string;
  }>;
  profileVisibility?: Required<ProfileVisibility>;
  _private?: {
    completed: number;
    created: number;
    submitted: number;
    totalEarned: number;
    completionRate: number | null;
    byChain?: Record<ProfileChain, ProfileChainStats>;
  };
}

export interface BountyCategory {
  id: number;
  name: string;
}

export interface BountyApplication {
  id: string;
  bountyId: string;
  applicantId: string;
  message: string;
  status: string;
  appliedAt: Date;
  applicantUser?: User; // Populated user data
  bounty?: { id: string; title: string };
}

export interface Bounty {
  id: string;
  title: string;
  description: string;
  createdBy: string; // User ID
  assignee?: string; // User ID
  bountyAmount: number; // ZEC amount
  dateCreated: Date;
  timeToComplete: Date;
  status: BountyStatus;
  isApproved: boolean;
  isPaid: boolean;
  isPrivate: boolean;
  paymentAuthorized: boolean;
  paymentScheduled?: PaymentSchedule;
  paymentBatchId?: string;
  paidAt?: Date;
  paymentTxId?: string;
  // True while a send is in flight or its outcome is unknown — the bounty is
  // locked out of the payable set server-side until it settles.
  paymentInFlight?: boolean;
  createdByUser?: User; // Populated user data
  assigneeUser?: User; // Populated user data
  applications?: BountyApplication[];
  categoryId?: string;
  category?: BountyCategory;
  difficulty: "Easy" | "Medium" | "Hard";
  chain: "MAIN" | "TEST";
  assignees?: BountyAssignee[];
  teamId?: string | null;
  team?: { id: string; name: string; logo?: string | null } | null;
}

// One row per bounty per payout attempt, from /api/transactions/records.
// PENDING/UNKNOWN rows are unsettled sends that need manual resolution.
export interface PaymentRecord {
  id: string;
  bountyId: string;
  txid: string | null;
  amountZat: number;
  toAddress: string;
  memo: string;
  chain: "MAIN" | "TEST";
  status: "PENDING" | "BROADCAST" | "FAILED" | "UNKNOWN";
  batchKey: string;
  initiatedBy: string;
  walletAccount: string;
  errorDetail?: string | null;
  createdAt: string;
  settledAt?: string | null;
  bounty?: {
    id: string;
    title: string;
    chain: "MAIN" | "TEST";
    assigneeUser?: { id: string; name: string; nickname?: string | null };
  };
}

export interface BountyFormData {
  title: string;
  description: string;
  assignee?: string;
  bountyAmount: number;
  timeToComplete: Date;
  category: string;
  chain?: "MAIN" | "TEST";
}

export interface ZcashParamsFormData {
  chain: "mainnet" | "testnet";
  serverUrl: string;
  accountName: string;
}

export interface ZcashParams {
  id: number;
  chain: string;
  serverUrl: string;
  accountName: string;
  ownerId: string;
  /** Whether this is the active/default wallet used for payments */
  isDefault: boolean;
  /** True when this entry represents a shared team wallet */
  isTeam: boolean;
  /** The team this wallet belongs to, null for personal wallets */
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: {
    id: string;
    name: string;
    nickname?: string;
    email: string;
  };
}

export interface PaymentSchedule {
  type: "instant" | "sunday_batch";
  scheduledFor?: Date;
}

export interface WorkSubmission {
  id: string;
  bountyId: string;
  submittedBy: string; // User ID
  description: string;
  deliverableUrl?: string;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string; // User ID
  reviewNotes?: string;
  status: "pending" | "approved" | "rejected" | "needs_revision";
  submitterUser?: User; // Populated user data
  reviewerUser?: User; // Populated user data
  bounty?: { id: string; title: string };
}

export interface BountyAssignee {
  id: string;
  bountyId: string;
  userId: string;
  assignedAt: string;
  user: {
    id: string;
    name: string;
    nickname?: string;
    email: string;
    avatar?: string;
    z_address?: string;
    UA_address?: string;
  };
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
  user: {
    id: string;
    name: string;
    nickname?: string;
    email: string;
    avatar?: string;
  };
}

export interface TeamWallet {
  id: string;
  teamId: string;
  accountName: string;
  chain: string;
  serverUrl: string;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  twitterUrl: string | null;
  discordUrl: string | null;
  additionalLinks: string[];
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  members: TeamMember[];
  wallet?: TeamWallet | null;
  logo?: string | null;
  banner?: string | null;
  isPrivate: boolean;
}

export interface TeamVerificationStatus {
  verificationCount: number;
  requiredVerifications: number;
  isVerified: boolean;
  verifiedByMe: boolean;
  verifiers: Array<{
    adminUserId: string;
    verifiedAt: string;
    admin: { id: string; name: string; nickname?: string; avatar?: string };
  }>;
}

export interface RecoveryData {
  "seed phrase"?: string;
  ufvk?: string;
  uivk?: string;
  birthday?: number;
  accountIndex?: number;
  no_of_accounts?: number;
  diversifierIndex?: number;
}

export interface ZcashInfo {
  version: string;
  git_commit: string;
  server_uri: string;
  vendor: string;
  taddr_support: boolean;
  chain_name: string;
  sapling_activation_height: number;
  consensus_branch_id: string;
  latest_block_height: number;
}

export type Notice = {
  type: "info" | "warning" | "error";
  title: string;
  message: string;
  action?: { label: string; href: string };
};

export type Balance = {
  confirmed_ironwood_balance?: number;
  unconfirmed_ironwood_balance?: number;
  total_ironwood_balance?: number;
  confirmed_orchard_balance?: number;
  unconfirmed_orchard_balance?: number;
  total_orchard_balance?: number;
  confirmed_sapling_balance: number;
  unconfirmed_sapling_balance: number;
  total_sapling_balance: number;
  confirmed_transparent_balance: number;
  unconfirmed_transparent_balance: number;
  total_transparent_balance: number;
};

/*
 * UNIFIED ADDRESS DECODER
 * Uses @elemental-zcash/zaddr_wasm_parser (Rust → WASM)
 * Browser equivalent of: zcash-cli z_listunifiedreceivers <address>
 */

export interface AddressReceivers {
  p2pkh: string | null;
  p2sh: string | null;
  sapling: string | null;
  orchard: string | null;
  tex: string | null;
}

export interface ZaddrModuleAny {
  initWasm?: () => Promise<void>;
  isZcashAddressValid?: (addr: string) => boolean;
  getZcashAddressType?: (addr: string) => string;
  getAddressReceivers?: (addr: string) => AddressReceivers;
  is_valid_zcash_address?: (addr: string) => boolean;
  get_zcash_address_type?: (addr: string) => string;
  get_address_receivers?: (addr: string) => AddressReceivers;
  [key: string]: unknown;
}

export interface TopContributor extends User {
  submitted: number;
  cancelled: number;
  completed: number;
  totalEarned: number;
  addressType?: string;
  receivers?: {
    ironwood?: boolean | undefined;
    sapling?: boolean | undefined;
    transparent?: boolean | undefined;
  };
}

export interface ContributorsOverTime {
  month: string;
  cumulativeContributors: number;
}

export type BountyTypesOverTime = {
  month: string;
  [category: string]: string | number;
};

export interface Community {
  id: string;
  name: string;
  description: string | null;
  logo?: string | null;
  memberCount: number;
}

export interface TeamFavorite {
  id: string;
  userId: string;
  teamId: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    nickname?: string | null;
    email?: string | null;
    avatar?: string | null;
  };
}

export interface SyncStatus {
  sync_id?: number;
  in_progress?: boolean;
  synced_blocks?: number;
  total_blocks?: number;
  last_synced_hash?: string;
  sync_percent?: number;

  percentage_session_blocks_scanned: number;
  percentage_session_outputs_scanned: number;
  percentage_total_blocks_scanned: number;
  percentage_total_outputs_scanned: number;
  scan_ranges: [];
  session_blocks_scanned: number;
  session_orchard_outputs_scanned: number;
  session_sapling_outputs_scanned: number;
  sync_start_height: number;
  total_blocks_scanned: number;
  total_orchard_outputs_scanned: number;
  total_sapling_outputs_scanned: number;
}
