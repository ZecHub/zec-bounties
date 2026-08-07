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
  paymentAuthorized: boolean;
  paymentScheduled?: PaymentSchedule;
  paymentBatchId?: string;
  paidAt?: Date;
  paymentTxId?: string;
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
  createdAt: string;
  updatedAt: string;
  members: TeamMember[];
  wallet?: TeamWallet | null;
  logo?: string | null;
  isPrivate: boolean;
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
  confirmed_orchard_balance: number;
  unconfirmed_orchard_balance: number;
  total_orchard_balance: number;
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
