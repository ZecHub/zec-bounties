"use client";

import type React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type {
  User,
  Bounty,
  BountyFormData,
  BountyApplication,
  WorkSubmission,
  ZcashParamsFormData,
  ZcashParams,
  Team,
  TeamMember,
  TeamWallet,
  RecoveryData,
  Balance,
} from "./types";
import { backendUrl, backendWebSpocketUrl } from "./configENV";
import { displayName } from "./displayName";

interface BountyCategory {
  id: number;
  name: string;
}

// interface ZcashParams {
//   id: number;
//   chain: string;
//   serverUrl: string;
//   accountName: string;
//   ownerId: string;
//   isDefault: boolean;
//   createdAt: string;
//   updatedAt: string;
//   owner?: {
//     id: string;
//     name: string;
//     email: string;
//   };
// }

interface ImportWalletData {
  accountName: string;
  seedPhrase: string;
  chain: string;
  serverUrl: string;
  birthdayHeight?: number;
}

// ── Sync status shape returned by the backend ────────────────────────────────
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

interface BountyContextType {
  // Auth
  currentUser: User | null;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; user?: any }>;
  logout: () => void;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  requestRecoveryOtp: () => Promise<{ message: string; email: string }>;
  verifyRecoveryOtp: (
    otp: string,
    accountName: string,
  ) => Promise<RecoveryData>;
  nicknameUpdate: (nickname: string) => Promise<boolean | undefined>;

  // Role switching (isRobin users only)
  switchRole: () => Promise<void>;
  isSwitchingRole: boolean;

  // Categories
  categories: BountyCategory[];
  categoriesLoading: boolean;
  fetchCategories: () => Promise<void>;
  createCategory: (name: string) => Promise<BountyCategory>;
  updateCategory: (id: number, name: string) => Promise<BountyCategory>;
  deleteCategory: (id: number) => Promise<void>;

  // Bounties
  bounties: Bounty[];
  bountiesLoading: boolean;
  createBounty: (data: BountyFormData) => Promise<void>;
  updateBounty: (
    id: string,
    data: Partial<BountyFormData> & {
      userIds?: string[];
      notifyUsers?: boolean;
    },
  ) => Promise<void>;
  updateBountyStatus: (
    id: string,
    status: Bounty["status"],
    winnerId?: string,
  ) => Promise<void>;
  approveBounty: (id: string, approved: boolean) => Promise<void>;
  authorizePayment: (id: string) => Promise<void>;
  paymentIDs: string[] | undefined;
  paymentChain: string | undefined;
  paymentServerUrl: string | undefined;
  authorizeDuePayment: (bountyIds: string[]) => Promise<{
    success: boolean;
    paidCount: number;
    skipped: Array<{ id: string; title: string; reason: string }>;
  }>;
  deleteBounty: (id: string) => Promise<void>;
  zAddressUpdate: (z_address: string) => Promise<boolean | undefined>;
  uaAddressUpdate: (UA_address: string) => Promise<boolean | undefined>;
  verifyZaddress: (z_address: string) => Promise<boolean | undefined>;
  verifyUaddress: (z_address: string) => Promise<boolean | undefined>;
  fetchBounties: (reset?: boolean) => Promise<void>;
  loadMoreBounties: () => Promise<void>;
  hasMoreBounties: boolean;
  bountiesPage: number;
  myBounties: Bounty[];
  myBountiesLoading: boolean;
  fetchMyBounties: () => Promise<void>;
  totalBountyAmount: number;
  totalBountyCount: number;
  totalActiveCount: number;
  statusCounts: Record<string, number>;
  fetchBountyById: (id: string) => Promise<Bounty | null>;
  fetchTransactionHashes: () => Promise<void>;
  applyToBounty: (bountyId: string, message: string) => Promise<void>;
  editBounty: (id: string, data: Partial<BountyFormData>) => void;

  // Zcash Params
  zcashParams: ZcashParams[];
  zcashParamsLoading: boolean;
  fetchZcashParams: () => Promise<void>;
  fetchAllZcashParams: () => Promise<void>; // Admin only
  getZcashParam: (accountName: string) => Promise<ZcashParams | null>;
  createZcashParams: (
    data: Omit<
      ZcashParams,
      "id" | "ownerId" | "createdAt" | "updatedAt" | "owner"
    >,
  ) => Promise<ZcashParams>;
  updateZcashParams: (
    accountName: string,
    data: Partial<
      Omit<ZcashParams, "id" | "ownerId" | "createdAt" | "updatedAt" | "owner">
    >,
  ) => Promise<ZcashParams>;
  deleteZcashParams: (accountName: string) => Promise<void>;
  upsertZcashParams: (
    data: Omit<
      ZcashParams,
      "id" | "ownerId" | "createdAt" | "updatedAt" | "owner"
    >,
  ) => Promise<ZcashParams>;
  testZcashConnection: (
    accountName: string,
  ) => Promise<{ success: boolean; message: string; data?: any }>;
  importWallet: (
    data: ImportWalletData,
  ) => Promise<{ success: boolean; message: string; data?: any }>;

  // Users
  users: User[];
  nonAdminUsers: User[];
  usersLoading: boolean;
  fetchUsers: () => Promise<void>;
  balance: Balance | undefined;
  fetchBalance: () => Promise<void>;
  address: string | undefined;
  addresses: string[];
  fetchAddresses: () => Promise<void>;
  emailNotificationsUpdate: (enabled: boolean) => Promise<boolean | undefined>;

  // Sync status & rescan
  syncStatus: SyncStatus | null;
  syncStatusLoading: boolean;
  syncStatusError: string | null;
  rescanStatus: string | null;
  fetchSyncStatus: () => Promise<void>;
  rescanWallet: () => Promise<void>;
  rescanLoading: boolean;

  // Applications
  applications: BountyApplication[];
  allApplications: BountyApplication[];
  bountyApplications: Record<string, BountyApplication[]>;

  // Submissions
  submissions: WorkSubmission[];
  allSubmissions: WorkSubmission[];
  bountySubmissions: Record<string, WorkSubmission[]>;
  fetchUserSubmissions: () => Promise<void>;
  fetchBountySubmissions: (bountyId: string) => Promise<WorkSubmission[]>;
  getUserSubmissionForBounty: (bountyId: string) => WorkSubmission | null;
  getAllSubmissionsForBounty: (bountyId: string) => WorkSubmission[];
  editSubmission: (
    submissionId: string,
    data: { description: string; deliverableUrl?: string },
  ) => Promise<WorkSubmission>;
  rejectOtherSubmissions: (submissionId: string) => Promise<void>;

  // Fetch methods
  fetchUserApplications: () => Promise<void>;
  fetchAllUsersApplications: () => Promise<void>;
  fetchAllSubmissions: () => Promise<WorkSubmission[]>;
  fetchBountyApplications: (bountyId: string) => Promise<BountyApplication[]>;

  // Get methods
  getUserApplicationForBounty: (bountyId: string) => BountyApplication | null;
  getAllApplicationsForBounty: (bountyId: string) => BountyApplication[];
  getAllApplicationForBounty: (bountyId: string) => BountyApplication | null;

  // Action methods
  acceptApplication: (applicationId: string) => Promise<BountyApplication>;
  rejectApplication: (applicationId: string) => Promise<BountyApplication>;

  // Work submission
  submitWork: (
    bountyId: string,
    submissionData: {
      description: string;
      deliverableUrl?: string;
    },
  ) => Promise<void>;

  // Fetch work submissions for a bounty (creator/admin only)
  fetchWorkSubmissions: (bountyId: string) => Promise<WorkSubmission[]>;

  // Review work submission (creator/admin only)
  reviewWorkSubmission: (
    submissionId: string,
    reviewData: {
      status: "approved" | "rejected" | "needs_revision";
      reviewNotes?: string;
    },
  ) => Promise<void>;

  authorizeBatchPayment: (
    bountyId: string,
    scheduledFor: Date,
  ) => Promise<void>;
  processBatchPayments: () => Promise<{
    success: boolean;
    batchId?: string;
    message: string;
  }>;
  getPendingBatchPayments: () => Array<{
    address: string;
    amount: number;
    memo?: string;
  }>;
  setDefaultWallet: (accountName: string, teamId?: string) => Promise<void>;

  fetchExportPayments: (from?: string, to?: string) => Promise<any[]>;
  fetchExportCompleted: () => Promise<any[]>;
  updateUserOfac: (userId: string, ofacVerified: boolean) => Promise<void>;

  // Teams
  teams: Team[];
  teamsLoading: boolean;
  fetchTeams: () => Promise<void>;
  createTeam: (data: { name: string; description?: string }) => Promise<Team>;
  updateTeam: (
    id: string,
    data: { name?: string; description?: string },
  ) => Promise<Team>;
  deleteTeam: (id: string) => Promise<void>;
  addTeamMembers: (
    teamId: string,
    userIds: string[],
    role?: string,
  ) => Promise<TeamMember[]>;
  updateTeamMemberRole: (
    teamId: string,
    userId: string,
    role: string,
  ) => Promise<TeamMember>;
  removeTeamMember: (teamId: string, userId: string) => Promise<void>;
  createTeamWallet: (
    teamId: string,
    data: { accountName: string; chain?: string; serverUrl?: string },
  ) => Promise<TeamWallet>;
  importTeamWallet: (
    teamId: string,
    data: {
      accountName: string;
      seedPhrase: string;
      chain?: string;
      serverUrl?: string;
      birthdayHeight?: number;
    },
  ) => Promise<TeamWallet>;
  deleteTeamWallet: (teamId: string) => Promise<void>;
  currentTeam: Team | null;
}

const BountyContext = createContext<BountyContextType | undefined>(undefined);

export function BountyProvider({ children }: { children: React.ReactNode }) {
  const [bountyChain, setBountyChain] = useState<"MAIN" | "TEST" | "ALL">(
    "MAIN",
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchingRole, setIsSwitchingRole] = useState(false);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [bountiesLoading, setBountiesLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [nonAdminUsers, setNonAdminUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [applications, setApplications] = useState<BountyApplication[]>([]);
  const [allApplications, setAllApplications] = useState<BountyApplication[]>(
    [],
  );
  const [bountyApplications, setBountyApplications] = useState<
    Record<string, BountyApplication[]>
  >({});
  const [submissions, setSubmissions] = useState<WorkSubmission[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<WorkSubmission[]>([]);
  const [bountySubmissions, setBountySubmissions] = useState<
    Record<string, WorkSubmission[]>
  >({});
  const [balance, setBalance] = useState<Balance | undefined>(undefined);
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [paymentIDs, setPaymentIDs] = useState<string[] | undefined>(undefined);
  const [categories, setCategories] = useState<BountyCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const BOUNTIES_PER_PAGE = 10;
  const [bountiesPage, setBountiesPage] = useState(1);
  const [hasMoreBounties, setHasMoreBounties] = useState(true);
  const [totalBountyAmount, setTotalBountyAmount] = useState(0);
  const [totalBountyCount, setTotalBountyCount] = useState(0);
  const [totalActiveCount, setTotalActiveCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [zcashParams, setZcashParams] = useState<ZcashParams[]>([]);
  const [zcashParamsLoading, setZcashParamsLoading] = useState(false);

  // ── Sync status state ──────────────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncStatusLoading, setSyncStatusLoading] = useState(false);
  const [syncStatusError, setSyncStatusError] = useState<string | null>(null);
  const [rescanStatus, setRescanStatus] = useState<string | null>(null);
  const [rescanLoading, setRescanLoading] = useState(false);
  const [paymentChain, setPaymentChain] = useState<string | undefined>(
    undefined,
  );
  const [paymentServerUrl, setPaymentServerUrl] = useState<string | undefined>(
    undefined,
  );
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);

  const [myBounties, setMyBounties] = useState<Bounty[]>([]);
  const [myBountiesLoading, setMyBountiesLoading] = useState(false);

  const fetchBountiesReqId = useRef(0);

  // Helper function to get auth headers
  const getAuthHeaders = () => {
    const token = localStorage.getItem("authToken");
    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  };

  // Helper function to get public headers (no auth required)
  const getPublicHeaders = () => {
    return {
      "Content-Type": "application/json",
    };
  };

  // ==================== Role Switching ====================

  const switchRole = async (): Promise<void> => {
    if (!currentUser || !currentUser.isRobin) return;

    const newRole = currentUser.role === "ADMIN" ? "CLIENT" : "ADMIN";

    setIsSwitchingRole(true);
    try {
      const res = await fetch(`${backendUrl}/api/bounties/switch-role`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to switch role");
      }

      const data = await res.json();

      // Update currentUser in state and localStorage
      setCurrentUser(data.user);
      localStorage.setItem("currentUser", JSON.stringify(data.user));
    } catch (error) {
      console.error("Failed to switch role:", error);
      throw error;
    } finally {
      setIsSwitchingRole(false);
    }
  };

  // ==================== Sync Status & Rescan ====================

  /**
   * Fetch the current wallet sync status from the backend.
   * Admin only — calls GET /api/transactions/sync-status
   */
  const fetchSyncStatus = async () => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    setSyncStatusLoading(true);
    setSyncStatusError(null);
    try {
      const res = await fetch(`${backendUrl}/api/transactions/sync-status`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Failed to fetch sync status");

      const data = await res.json();
      setSyncStatus(data);
    } catch (error) {
      console.error("Failed to fetch sync status:", error);
      setSyncStatusError(
        error instanceof Error ? error.message : "Sync status unavailable",
      );
    } finally {
      setSyncStatusLoading(false);
    }
  };

  /**
   * Trigger a wallet rescan.
   * Admin only — calls GET /api/transactions/rescan
   * After triggering, refreshes sync status automatically.
   */
  const rescanWallet = async () => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    setRescanLoading(true);
    setSyncStatusError(null);
    try {
      const res = await fetch(`${backendUrl}/api/transactions/rescan`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Import wallet again");
      setRescanStatus("Rescan Success");
    } catch (error) {
      console.error("Failed to rescan wallet:", error);
      setSyncStatusError(
        error instanceof Error ? error.message : "Rescan failed",
      );
    } finally {
      setRescanLoading(false);
    }
  };

  // ==================== Zcash Params Functions ====================

  // Import wallet with seed phrase
  const importWallet = async (
    data: ImportWalletData,
  ): Promise<{ success: boolean; message: string; data?: any }> => {
    if (!currentUser) {
      return { success: false, message: "User not authenticated" };
    }

    try {
      const res = await fetch(`${backendUrl}/api/zcash/import-wallet`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });

      const response = await res.json();

      if (!res.ok) {
        return {
          success: false,
          message: response.message || "Failed to import wallet",
        };
      }

      // Add the new wallet config to local state
      if (response.data) {
        setZcashParams((prev) => [...prev, response.data]);
      }

      try {
        await setDefaultWallet(data.accountName);
      } catch (e) {
        console.warn("Wallet imported but failed to set as default:", e);
      }

      await fetchZcashParams();

      return {
        success: true,
        message: response.message || "Wallet imported successfully",
        data: response.data,
      };
    } catch (error) {
      console.error("Failed to import wallet:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  // Fetch all Zcash params for the current user
  const fetchZcashParams = async () => {
    if (!currentUser) return;

    setZcashParamsLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/zcash/params`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Failed to fetch Zcash parameters");

      const response = await res.json();
      setZcashParams(response.data || []);
    } catch (error) {
      console.error("Failed to fetch Zcash parameters:", error);
      setZcashParams([]);
    } finally {
      setZcashParamsLoading(false);
    }
  };

  // Fetch all Zcash params for all users (admin only)
  const fetchAllZcashParams = async () => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    setZcashParamsLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/zcash/params/all`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Failed to fetch all Zcash parameters");

      const response = await res.json();
      setZcashParams(response.data || []);
    } catch (error) {
      console.error("Failed to fetch all Zcash parameters:", error);
      setZcashParams([]);
    } finally {
      setZcashParamsLoading(false);
    }
  };

  // Get a specific Zcash param by account name
  const getZcashParam = async (
    accountName: string,
  ): Promise<ZcashParams | null> => {
    if (!currentUser) return null;

    try {
      const res = await fetch(`${backendUrl}/api/zcash/params/${accountName}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch Zcash parameter");
      }

      const response = await res.json();
      return response.data;
    } catch (error) {
      console.error("Failed to fetch Zcash parameter:", error);
      return null;
    }
  };

  // Create new Zcash params
  const createZcashParams = async (
    data: Omit<
      ZcashParams,
      "id" | "ownerId" | "createdAt" | "updatedAt" | "owner"
    >,
  ): Promise<ZcashParams> => {
    if (!currentUser) throw new Error("User not authenticated");

    try {
      const res = await fetch(`${backendUrl}/api/zcash/params`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.message || "Failed to create Zcash parameters",
        );
      }

      const response = await res.json();
      const newParam = response.data;

      // Update local state
      setZcashParams((prev) => [...prev, newParam]);

      return newParam;
    } catch (error) {
      console.error("Failed to create Zcash parameters:", error);
      throw error;
    }
  };

  // Update existing Zcash params
  const updateZcashParams = async (
    accountName: string,
    data: Partial<
      Omit<ZcashParams, "id" | "ownerId" | "createdAt" | "updatedAt" | "owner">
    >,
  ): Promise<ZcashParams> => {
    if (!currentUser) throw new Error("User not authenticated");

    try {
      const res = await fetch(`${backendUrl}/api/zcash/params/${accountName}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.message || "Failed to update Zcash parameters",
        );
      }

      const response = await res.json();
      const updatedParam = response.data;

      // Update local state
      setZcashParams((prev) =>
        prev.map((param) =>
          param.accountName === accountName ? updatedParam : param,
        ),
      );

      return updatedParam;
    } catch (error) {
      console.error("Failed to update Zcash parameters:", error);
      throw error;
    }
  };

  // Delete Zcash params
  const deleteZcashParams = async (accountName: string): Promise<void> => {
    if (!currentUser) throw new Error("User not authenticated");

    try {
      const res = await fetch(`${backendUrl}/api/zcash/params/${accountName}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.message || "Failed to delete Zcash parameters",
        );
      }

      // Update local state
      setZcashParams((prev) =>
        prev.filter((param) => param.accountName !== accountName),
      );
    } catch (error) {
      console.error("Failed to delete Zcash parameters:", error);
      throw error;
    }
  };

  const setDefaultWallet = async (
    accountName: string,
    teamId?: string,
  ): Promise<void> => {
    if (!currentUser || currentUser.role !== "ADMIN") {
      throw new Error("Only admins can set a default wallet");
    }

    const res = await fetch(
      `${backendUrl}/api/zcash/params/${accountName}/set-default`,
      {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ teamId: teamId ?? null }),
      },
    );

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Failed to set default wallet");
    }

    setZcashParams((prev) =>
      prev.map((param) => ({
        ...param,

        isDefault:
          param.accountName === accountName &&
          (param.teamId ?? null) === (teamId ?? null),
      })),
    );
  };

  // Upsert Zcash params (create or update)
  const upsertZcashParams = async (
    data: Omit<
      ZcashParams,
      "id" | "ownerId" | "createdAt" | "updatedAt" | "owner"
    >,
  ): Promise<ZcashParams> => {
    if (!currentUser) throw new Error("User not authenticated");

    try {
      const res = await fetch(`${backendUrl}/api/zcash/params/upsert`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to save Zcash parameters");
      }

      const response = await res.json();
      const savedParam = response.data;

      // Update local state
      setZcashParams((prev) => {
        const existingIndex = prev.findIndex(
          (param) => param.accountName === data.accountName,
        );
        if (existingIndex >= 0) {
          return prev.map((param, idx) =>
            idx === existingIndex ? savedParam : param,
          );
        } else {
          return [...prev, savedParam];
        }
      });

      return savedParam;
    } catch (error) {
      console.error("Failed to upsert Zcash parameters:", error);
      throw error;
    }
  };

  // Test connection to Zcash server
  const testZcashConnection = async (
    accountName: string,
  ): Promise<{ success: boolean; message: string; data?: any }> => {
    if (!currentUser) {
      return { success: false, message: "User not authenticated" };
    }

    try {
      const res = await fetch(
        `${backendUrl}/api/zcash/test-connection/${accountName}`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        },
      );

      const response = await res.json();

      if (!res.ok) {
        return {
          success: false,
          message: response.message || "Failed to test connection",
        };
      }

      return {
        success: true,
        message: response.message || "Connection successful",
        data: response,
      };
    } catch (error) {
      console.error("Failed to test Zcash connection:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  // ==================== Existing Functions (unchanged) ====================

  const authorizeBatchPayment = async (
    bountyId: string,
    scheduledFor: Date,
  ) => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    try {
      const res = await fetch(
        `${backendUrl}/api/bounties/${bountyId}/authorize-payment`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            paymentAuthorized: true,
            paymentScheduled: {
              type: "sunday_batch",
              scheduledFor: scheduledFor.toISOString(),
            },
          }),
        },
      );

      if (!res.ok) throw new Error("Failed to authorize batch payment");

      const updated = await res.json();
      setBounties((prev) =>
        prev.map((bounty) => (bounty.id === bountyId ? updated : bounty)),
      );

      if (updated.paymentScheduled?.type === "instant") {
        await processInstantPayment(bountyId);
      }
    } catch (error) {
      console.error("Failed to authorize batch payment:", error);
      throw error;
    }
  };

  const processInstantPayment = async (bountyId: string) => {
    const bounty = bounties.find((b) => b.id === bountyId);
    if (!bounty || !bounty.assigneeUser?.z_address) return;

    try {
      await fetch(`${backendUrl}/api/bounties/process-instant-payment`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          address: bounty.assigneeUser.z_address,
          amount: Math.floor(bounty.bountyAmount * 100000000),
          memo: `Bounty: ${bounty.title} (ID: ${bounty.id})`,
          bountyId: bountyId,
        }),
      });
    } catch (error) {
      console.error("Failed to process instant payment:", error);
    }
  };

  const authorizeDuePayment = async (bountyIds: string[]) => {
    if (!currentUser || currentUser.role !== "ADMIN") {
      return { success: false, paidCount: 0, skipped: [] };
    }

    try {
      const res = await fetch(
        `${backendUrl}/api/transactions/authorize-payment`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ bountyIds }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        const message = errorData.details
          ? `${errorData.error}: ${errorData.details}`
          : errorData.error || "Failed to authorize payment";
        throw new Error(message);
      }

      const data = await res.json();

      await fetchBounties();

      return {
        success: true,
        paidCount: data.paidCount,
        skipped: data.skipped || [],
      };
    } catch (error) {
      console.error("Failed to authorize payment:", error);
      throw error;
    }
  };

  const fetchTransactionHashes = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/transactions/`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        // Backend now returns { transactions, chain, serverUrl }
        setPaymentIDs(data.transactions);
        setPaymentChain(data.chain);
        setPaymentServerUrl(data.serverUrl);
      }
    } catch (error) {
      console.error("Failed to fetch transaction hashes:", error);
    }
  };

  const authorizePayment = async (id: string) => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    try {
      const res = await fetch(
        `${backendUrl}/api/bounties/${id}/authorize-payment`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            paymentAuthorized: true,
            paymentScheduled: {
              type: "instant",
            },
          }),
        },
      );

      if (!res.ok) throw new Error("Failed to authorize payment");

      const updated = await res.json();
      setBounties((prev) =>
        prev.map((bounty) => (bounty.id === id ? updated : bounty)),
      );

      await processInstantPayment(id);
    } catch (error) {
      console.error("Failed to authorize payment:", error);
      throw error;
    }
  };

  const getPendingBatchPayments = (): Array<{
    address: string;
    amount: number;
    memo?: string;
  }> => {
    const pendingBatchBounties = bounties.filter(
      (bounty) =>
        bounty.paymentAuthorized &&
        bounty.paymentScheduled?.type === "sunday_batch" &&
        bounty.assigneeUser?.z_address &&
        bounty.status === "DONE" &&
        bounty.isApproved &&
        !bounty.isPaid,
    );

    return pendingBatchBounties.map((bounty) => ({
      address: bounty.assigneeUser!.z_address!,
      amount: Math.floor(bounty.bountyAmount * 100000000),
      memo: `Bounty: ${bounty.title} (ID: ${bounty.id})`,
    }));
  };

  const processBatchPayments = async (): Promise<{
    success: boolean;
    batchId?: string;
    message: string;
  }> => {
    if (!currentUser || currentUser.role !== "ADMIN") {
      return { success: false, message: "Unauthorized" };
    }

    try {
      const batchPayments = getPendingBatchPayments();

      if (batchPayments.length === 0) {
        return {
          success: true,
          message: "No pending batch payments to process",
        };
      }

      const res = await fetch(
        `${backendUrl}/api/bounties/process-batch-payments`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            payments: batchPayments,
            batchTimestamp: new Date().toISOString(),
          }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to process batch payments");
      }

      const result = await res.json();

      if (result.success) {
        const batchBountyIds = bounties
          .filter(
            (bounty) =>
              bounty.paymentAuthorized &&
              bounty.paymentScheduled?.type === "sunday_batch" &&
              !bounty.isPaid,
          )
          .map((bounty) => bounty.id);

        for (const bountyId of batchBountyIds) {
          await fetch(`${backendUrl}/api/bounties/${bountyId}/mark-paid`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify({
              isPaid: true,
              paymentBatchId: result.batchId,
              paidAt: new Date().toISOString(),
            }),
          });
        }

        await fetchBounties();
      }

      return result;
    } catch (error) {
      console.error("Failed to process batch payments:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  };

  // Fetch all categories (PUBLIC - no auth required)
  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/bounties/categories`, {
        headers: getPublicHeaders(),
      });

      if (!res.ok) throw new Error("Failed to fetch categories");

      const data = await res.json();
      setCategories(data);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const createCategory = async (name: string): Promise<BountyCategory> => {
    if (!currentUser || currentUser.role !== "ADMIN") {
      throw new Error("Unauthorized");
    }

    try {
      const res = await fetch(`${backendUrl}/api/bounties/categories`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create category");
      }

      const newCategory = await res.json();
      setCategories((prev) => [...prev, newCategory]);
      return newCategory;
    } catch (error) {
      console.error("Failed to create category:", error);
      throw error;
    }
  };

  const updateCategory = async (
    id: number,
    name: string,
  ): Promise<BountyCategory> => {
    if (!currentUser || currentUser.role !== "ADMIN") {
      throw new Error("Unauthorized");
    }

    try {
      const res = await fetch(`${backendUrl}/api/bounties/categories/${id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update category");
      }

      const updatedCategory = await res.json();
      setCategories((prev) =>
        prev.map((cat) => (cat.id === id ? updatedCategory : cat)),
      );
      return updatedCategory;
    } catch (error) {
      console.error("Failed to update category:", error);
      throw error;
    }
  };

  const deleteCategory = async (id: number): Promise<void> => {
    if (!currentUser || currentUser.role !== "ADMIN") {
      throw new Error("Unauthorized");
    }

    try {
      const res = await fetch(`${backendUrl}/api/bounties/categories/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete category");
      }

      setCategories((prev) => prev.filter((cat) => cat.id !== id));
    } catch (error) {
      console.error("Failed to delete category:", error);
      throw error;
    }
  };

  // Fetch all users (PUBLIC)
  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/bounties/users`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Failed to fetch users");

      const data = await res.json();
      const nonAdminUsersData = data.filter(
        (user: User) => user.role === "CLIENT",
      );
      setUsers(data);
      setNonAdminUsers(nonAdminUsersData);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchBountyApplications = async (bountyId: string) => {
    if (!currentUser) return [];

    try {
      const res = await fetch(
        `${backendUrl}/api/bounties/${bountyId}/applications`,
        {
          headers: getAuthHeaders(),
        },
      );

      if (!res.ok) throw new Error("Failed to fetch bounty applications");

      const data = await res.json();

      setBountyApplications((prev) => ({
        ...prev,
        [bountyId]: data,
      }));

      return data;
    } catch (error) {
      console.error("Failed to fetch bounty applications:", error);
      return [];
    }
  };

  const fetchUserApplications = async () => {
    if (!currentUser) return;

    try {
      const res = await fetch(`${backendUrl}/api/bounties/my-applications`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Failed to fetch applications");

      const data = await res.json();
      setApplications(data);
    } catch (error) {
      console.error("Failed to fetch applications:", error);
    }
  };

  const fetchAllUsersApplications = async () => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    try {
      const res = await fetch(`${backendUrl}/api/bounties/all-applications`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Failed to fetch applications");

      const data = await res.json();
      setAllApplications(data);
    } catch (error) {
      console.error("Failed to fetch applications:", error);
    }
  };

  const fetchUserSubmissions = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${backendUrl}/api/bounties/my-submissions`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch submissions");
      const data = await res.json();
      setSubmissions(data);
    } catch (error) {
      console.error("Failed to fetch submissions:", error);
    }
  };

  const fetchAllSubmissions = async (): Promise<WorkSubmission[]> => {
    if (!currentUser || currentUser.role !== "ADMIN") return [];
    try {
      const res = await fetch(`${backendUrl}/api/bounties/submissions/all`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch all submissions");
      const data = await res.json();
      setAllSubmissions(data);
      return data;
    } catch (error) {
      console.error("Failed to fetch all submissions:", error);
      return [];
    }
  };

  const fetchBountySubmissions = async (bountyId: string) => {
    if (!currentUser) return [];
    try {
      const res = await fetch(
        `${backendUrl}/api/bounties/${bountyId}/submissions`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) throw new Error("Failed to fetch bounty submissions");
      const data = await res.json();
      setBountySubmissions((prev) => ({ ...prev, [bountyId]: data }));
      return data;
    } catch (error) {
      console.error("Failed to fetch bounty submissions:", error);
      return [];
    }
  };

  const getUserApplicationForBounty = (
    bountyId: string,
  ): BountyApplication | null => {
    return applications.find((app) => app.bountyId === bountyId) || null;
  };

  const getAllApplicationsForBounty = (
    bountyId: string,
  ): BountyApplication[] => {
    if (bountyApplications[bountyId]) {
      return bountyApplications[bountyId];
    }

    if (allApplications.length > 0) {
      return allApplications.filter((app) => app.bountyId === bountyId);
    }

    fetchBountyApplications(bountyId);
    return [];
  };

  const getUserSubmissionForBounty = (
    bountyId: string,
  ): WorkSubmission | null =>
    submissions.find((s) => s.bountyId === bountyId) ?? null;

  const getAllSubmissionsForBounty = (bountyId: string): WorkSubmission[] => {
    if (bountySubmissions[bountyId]) return bountySubmissions[bountyId];
    if (allSubmissions.length > 0)
      return allSubmissions.filter((s) => s.bountyId === bountyId);
    fetchBountySubmissions(bountyId);
    return [];
  };

  const editSubmission = async (
    submissionId: string,
    data: { description: string; deliverableUrl?: string },
  ) => {
    if (!currentUser) throw new Error("User not authenticated");

    try {
      const res = await fetch(
        `${backendUrl}/api/bounties/submissions/${submissionId}`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify(data),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to edit submission");
      }

      const result = await res.json();
      const updated: WorkSubmission = result.workSubmission;

      setSubmissions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
      setAllSubmissions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
      setBountySubmissions((prev) => ({
        ...prev,
        [updated.bountyId]: (prev[updated.bountyId] || []).map((s) =>
          s.id === updated.id ? updated : s,
        ),
      }));

      return updated;
    } catch (error) {
      console.error("Failed to edit submission:", error);
      throw error;
    }
  };

  const rejectOtherSubmissions = async (submissionId: string) => {
    if (!currentUser) throw new Error("User not authenticated");

    try {
      const res = await fetch(
        `${backendUrl}/api/bounties/submissions/${submissionId}/reject-others`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.error || "Failed to reject other submissions",
        );
      }

      await fetchBounties();
    } catch (error) {
      console.error("Failed to reject other submissions:", error);
      throw error;
    }
  };

  const acceptApplication = async (applicationId: string) => {
    if (!currentUser) throw new Error("User not authenticated");

    try {
      const res = await fetch(
        `${backendUrl}/api/bounties/applications/${applicationId}`,
        {
          method: "PUT",
          headers: {
            ...getAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "accepted" }),
        },
      );

      if (!res.ok) throw new Error("Failed to accept application");

      const updatedApplication = await res.json();
      const bountyId = updatedApplication.bountyId;

      await fetchBountyApplications(bountyId);
      await fetchBounties();

      return updatedApplication;
    } catch (error) {
      console.error("Failed to accept application:", error);
      throw error;
    }
  };

  const rejectApplication = async (applicationId: string) => {
    if (!currentUser) throw new Error("User not authenticated");

    try {
      const res = await fetch(
        `${backendUrl}/api/bounties/applications/${applicationId}`,
        {
          method: "PUT",
          headers: {
            ...getAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "rejected" }),
        },
      );

      if (!res.ok) throw new Error("Failed to reject application");

      const updatedApplication = await res.json();
      const bountyId = updatedApplication.bountyId;

      await fetchBountyApplications(bountyId);
      await fetchBounties();

      return updatedApplication;
    } catch (error) {
      console.error("Failed to reject application:", error);
      throw error;
    }
  };

  const submitWork = async (
    bountyId: string,
    submissionData: {
      description: string;
      deliverableUrl?: string;
    },
  ) => {
    if (!currentUser) throw new Error("User not authenticated");

    try {
      const res = await fetch(`${backendUrl}/api/bounties/${bountyId}/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(submissionData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to submit work");
      }

      await fetchBounties();
    } catch (error) {
      console.error("Failed to submit work:", error);
      throw error;
    }
  };

  const fetchWorkSubmissions = async (bountyId: string) => {
    if (!currentUser) throw new Error("User not authenticated");

    try {
      const res = await fetch(
        `${backendUrl}/api/bounties/${bountyId}/submissions`,
        {
          headers: getAuthHeaders(),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch work submissions");
      }

      return await res.json();
    } catch (error) {
      console.error("Failed to fetch work submissions:", error);
      throw error;
    }
  };

  // Fetch balance
  const fetchBalance = async () => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    try {
      const res = await fetch(`${backendUrl}/api/transactions/balance`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setBalance(data);
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  };

  // Fetch addresses
  const fetchAddresses = async () => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    try {
      const res = await fetch(`${backendUrl}/api/transactions/addresses`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        const list = data.map((a: any) => a.encoded_address).filter(Boolean);
        setAddresses(list);
        setAddress(list[0]); // keep single address in sync for anything that uses it
      }
    } catch (error) {
      console.error("Failed to fetch addresses:", error);
    }
  };

  const emailNotificationsUpdate = async (enabled: boolean) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${backendUrl}/auth/update-email-notifications`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ emailNotifications: enabled }),
      });
      if (!res.ok) throw new Error("Failed to update preference");
      const data = await res.json();
      setCurrentUser(data.user);
      localStorage.setItem("currentUser", JSON.stringify(data.user));
      return true;
    } catch (error) {
      console.error("Failed to update email notifications:", error);
      return false;
    }
  };

  const reviewWorkSubmission = async (
    submissionId: string,
    reviewData: {
      status: "approved" | "rejected" | "needs_revision";
      reviewNotes?: string;
    },
  ) => {
    if (!currentUser) throw new Error("User not authenticated");

    try {
      const res = await fetch(
        `${backendUrl}/api/bounties/submissions/${submissionId}/review`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify(reviewData),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to review submission");
      }

      await fetchBounties();

      return await res.json();
    } catch (error) {
      console.error("Failed to review submission:", error);
      throw error;
    }
  };

  const getAllApplicationForBounty = (
    bountyId: string,
  ): BountyApplication | null => {
    return allApplications.find((app) => app.bountyId === bountyId) || null;
  };

  const fetchTeams = async () => {
    if (!currentUser || currentUser.role !== "ADMIN") return;
    setTeamsLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/teams`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch teams");
      const data = await res.json();
      setTeams(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch teams:", error);
      setTeams([]);
    } finally {
      setTeamsLoading(false);
    }
  };

  const createTeam = async (data: {
    name: string;
    description?: string;
  }): Promise<Team> => {
    if (!currentUser || currentUser.role !== "ADMIN")
      throw new Error("Unauthorized");
    const res = await fetch(`${backendUrl}/api/teams`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to create team");
    setTeams((prev) => [json, ...prev]);
    return json;
  };

  const updateTeam = async (
    id: string,
    data: { name?: string; description?: string },
  ): Promise<Team> => {
    if (!currentUser || currentUser.role !== "ADMIN")
      throw new Error("Unauthorized");
    const res = await fetch(`${backendUrl}/api/teams/${id}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to update team");
    setTeams((prev) => prev.map((t) => (t.id === id ? json : t)));
    return json;
  };

  const deleteTeam = async (id: string): Promise<void> => {
    if (!currentUser || currentUser.role !== "ADMIN")
      throw new Error("Unauthorized");
    const res = await fetch(`${backendUrl}/api/teams/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || "Failed to delete team");
    }
    setTeams((prev) => prev.filter((t) => t.id !== id));
  };

  const addTeamMembers = async (
    teamId: string,
    userIds: string[],
    role = "MEMBER",
  ): Promise<TeamMember[]> => {
    if (!currentUser || currentUser.role !== "ADMIN")
      throw new Error("Unauthorized");
    const res = await fetch(`${backendUrl}/api/teams/${teamId}/members`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ userIds, role }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to add members");
    const { members } = json;
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const merged = [
          ...t.members.filter(
            (m) => !members.find((nm: TeamMember) => nm.userId === m.userId),
          ),
          ...members,
        ];
        return { ...t, members: merged };
      }),
    );
    return members;
  };

  const updateTeamMemberRole = async (
    teamId: string,
    userId: string,
    role: string,
  ): Promise<TeamMember> => {
    if (!currentUser || currentUser.role !== "ADMIN")
      throw new Error("Unauthorized");
    const res = await fetch(
      `${backendUrl}/api/teams/${teamId}/members/${userId}`,
      {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ role }),
      },
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to update role");
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        return {
          ...t,
          members: t.members.map((m) =>
            m.userId === userId
              ? { ...m, role: role as TeamMember["role"] }
              : m,
          ),
        };
      }),
    );
    return json;
  };

  const removeTeamMember = async (
    teamId: string,
    userId: string,
  ): Promise<void> => {
    if (!currentUser || currentUser.role !== "ADMIN")
      throw new Error("Unauthorized");
    const res = await fetch(
      `${backendUrl}/api/teams/${teamId}/members/${userId}`,
      {
        method: "DELETE",
        headers: getAuthHeaders(),
      },
    );
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || "Failed to remove member");
    }
    setTeams((prev) =>
      prev.map((t) =>
        t.id !== teamId
          ? t
          : { ...t, members: t.members.filter((m) => m.userId !== userId) },
      ),
    );
  };

  const createTeamWallet = async (
    teamId: string,
    data: { accountName: string; chain?: string; serverUrl?: string },
  ): Promise<TeamWallet> => {
    if (!currentUser || currentUser.role !== "ADMIN")
      throw new Error("Unauthorized");
    const res = await fetch(`${backendUrl}/api/teams/${teamId}/wallet`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to create wallet");
    setTeams((prev) =>
      prev.map((t) => (t.id !== teamId ? t : { ...t, wallet: json.wallet })),
    );
    return json.wallet;
  };

  const importTeamWallet = async (
    teamId: string,
    data: {
      accountName: string;
      seedPhrase: string;
      chain?: string;
      serverUrl?: string;
      birthdayHeight?: number;
    },
  ): Promise<TeamWallet> => {
    if (!currentUser || currentUser.role !== "ADMIN")
      throw new Error("Unauthorized");
    const res = await fetch(`${backendUrl}/api/teams/${teamId}/wallet/import`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to import wallet");
    setTeams((prev) =>
      prev.map((t) => (t.id !== teamId ? t : { ...t, wallet: json.wallet })),
    );
    return json.wallet;
  };

  const deleteTeamWallet = async (teamId: string): Promise<void> => {
    if (!currentUser || currentUser.role !== "ADMIN")
      throw new Error("Unauthorized");
    const res = await fetch(`${backendUrl}/api/teams/${teamId}/wallet`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || "Failed to delete wallet");
    }
    setTeams((prev) =>
      prev.map((t) => (t.id !== teamId ? t : { ...t, wallet: null })),
    );
  };

  const activeWallet =
    zcashParams.find((p) => p.isDefault) ??
    (zcashParams.length > 0 ? zcashParams[zcashParams.length - 1] : null);

  const currentTeam: Team | null =
    activeWallet?.isTeam && activeWallet.teamId
      ? (teams.find((t) => t.id === activeWallet.teamId) ?? null)
      : null;

  // Initialize auth and fetch PUBLIC data
  useEffect(() => {
    const initializeAuth = async () => {
      const savedToken = localStorage.getItem("authToken");

      await Promise.all([
        fetchBounties(),
        fetchCategories(),
        fetchTotalStats(),
      ]);

      if (savedToken) {
        try {
          const res = await fetch(`${backendUrl}/auth/me`, {
            headers: { Authorization: `Bearer ${savedToken}` },
          });

          if (!res.ok) throw new Error("Token invalid");

          const data = await res.json();
          setCurrentUser(data.user);
          localStorage.setItem("currentUser", JSON.stringify(data.user));
        } catch (error) {
          console.error("Token validation failed:", error);
          localStorage.removeItem("authToken");
          localStorage.removeItem("currentUser");
          setCurrentUser(null);
        }
      }

      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  useEffect(() => {
    if (currentUser?.role === "ADMIN") {
      fetchTotalStats();
    }
  }, [currentUser?.id, currentUser?.role]);

  // Fetch user-specific data when currentUser changes
  useEffect(() => {
    if (currentUser) {
      fetchUserApplications();
      fetchAllUsersApplications();
      fetchUserSubmissions();
      fetchZcashParams();
      fetchMyBounties();
      fetchUsers();
      if (currentUser.role === "ADMIN") {
        fetchTeams();
        fetchAllSubmissions().then(setAllSubmissions);
      }
    } else {
      setApplications([]);
      setAllApplications([]);
      setSubmissions([]);
      setAllSubmissions([]);
      setAllSubmissions([]);
      setZcashParams([]);
      setTeams([]);
      setMyBounties([]);
      setSyncStatus(null);
      setSyncStatusError(null);
    }
  }, [currentUser]);

  // WebSocket connection
  useEffect(() => {
    if (!currentUser) return;

    let ws: WebSocket;
    let retryDelay = 1000;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let destroyed = false;

    const userId = currentUser.id;
    const userName = displayName(currentUser);

    function connect() {
      ws = new WebSocket(`${backendWebSpocketUrl}`);

      ws.onopen = () => {
        retryDelay = 1000; // reset backoff on successful connect
        ws.send(
          JSON.stringify({
            type: "join",
            userId,
            userName,
          }),
        );
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "new_bounties":
            setBounties((prev) =>
              prev.some((b) => b.id === msg.payload.id)
                ? prev // already have it (e.g. creator's own optimistic add)
                : [msg.payload, ...prev],
            );
            fetchTotalStats();
            break;

          case "bounty_updated":
            setBounties((prev) =>
              prev.map((bounty) =>
                bounty.id === msg.payload.id ? msg.payload : bounty,
              ),
            );
            break;

          case "bounty_status_changed":
            setBounties((prev) =>
              prev.map((bounty) =>
                bounty.id === msg.payload.id ? msg.payload : bounty,
              ),
            );
            break;

          case "bounty_approved":
            setBounties((prev) =>
              prev.map((bounty) =>
                bounty.id === msg.payload.id ? msg.payload : bounty,
              ),
            );
            break;

          case "application_created":
            if (msg.payload.applicantId === currentUser?.id) {
              setApplications((prev) => [...prev, msg.payload]);
            }
            setAllApplications((prev) => [...prev, msg.payload]);
            setBountyApplications((prev) => ({
              ...prev,
              [msg.payload.bountyId]: [
                ...(prev[msg.payload.bountyId] || []),
                msg.payload,
              ],
            }));
            break;

          case "application_updated":
            setApplications((prev) =>
              prev.map((app) =>
                app.id === msg.payload.id ? msg.payload : app,
              ),
            );
            setAllApplications((prev) =>
              prev.map((app) =>
                app.id === msg.payload.id ? msg.payload : app,
              ),
            );
            setBountyApplications((prev) => ({
              ...prev,
              [msg.payload.bountyId]: (prev[msg.payload.bountyId] || []).map(
                (app) => (app.id === msg.payload.id ? msg.payload : app),
              ),
            }));
            fetchBounties();
            break;

          case "application_deleted":
            setApplications((prev) =>
              prev.filter((app) => app.id !== msg.payload.id),
            );
            setAllApplications((prev) =>
              prev.filter((app) => app.id !== msg.payload.id),
            );
            setBountyApplications((prev) => ({
              ...prev,
              [msg.payload.bountyId]: (prev[msg.payload.bountyId] || []).filter(
                (app) => app.id !== msg.payload.id,
              ),
            }));
            break;

          case "payment_authorized":
            setBounties((prev) =>
              prev.map((bounty) =>
                bounty.id === msg.payload.id ? msg.payload : bounty,
              ),
            );
            break;

          case "payment_processed":
            fetchTransactionHashes();
            fetchBounties();
            break;

          case "balance_updated":
            setBalance(msg.payload.balance);
            break;

          case "work_submitted":
            fetchBounties();
            // Mirror application_created pattern
            if (msg.payload.submittedBy === currentUser?.id) {
              setSubmissions((prev) => [...prev, msg.payload]);
            }
            setAllSubmissions((prev) => {
              const exists = prev.some((s) => s.id === msg.payload.id);
              return exists ? prev : [msg.payload, ...prev];
            });
            setBountySubmissions((prev) => ({
              ...prev,
              [msg.payload.bountyId]: [
                ...(prev[msg.payload.bountyId] || []),
                msg.payload,
              ],
            }));
            break;

          case "submission_reviewed":
            // Mirror application_updated pattern
            setSubmissions((prev) =>
              prev.map((s) => (s.id === msg.payload.id ? msg.payload : s)),
            );
            setAllSubmissions((prev) =>
              prev.map((s) => (s.id === msg.payload.id ? msg.payload : s)),
            );
            setBountySubmissions((prev) => ({
              ...prev,
              [msg.payload.bountyId]: (prev[msg.payload.bountyId] || []).map(
                (s) => (s.id === msg.payload.id ? msg.payload : s),
              ),
            }));
            fetchBounties();
            break;

          case "category_created":
            setCategories((prev) => [...prev, msg.payload]);
            break;

          case "category_updated":
            setCategories((prev) =>
              prev.map((cat) =>
                cat.id === msg.payload.id ? msg.payload : cat,
              ),
            );
            break;

          case "category_deleted":
            setCategories((prev) =>
              prev.filter((cat) => cat.id !== msg.payload.id),
            );
            break;

          case "transactions_fetched":
            break;

          case "balance_fetched":
            setBalance(msg.payload.balance);
            break;

          case "sync_status":
            setSyncStatus(msg.payload.data);
            setSyncStatusError(null);
            break;

          case "account_created":
            fetchZcashParams();
            break;

          case "addresses_fetched":
            setAddress(msg.payload.addresses?.encoded_address);
            break;

          case "bounty_payment_authorized":
            setBounties((prev) =>
              prev.map((bounty) =>
                bounty.id === msg.payload.id ? msg.payload : bounty,
              ),
            );
            break;

          case "batch_payment_processed":
            fetchBounties();
            fetchTransactionHashes();
            fetchBalance();
            break;

          case "instant_payment_processed":
            fetchBounties();
            fetchTransactionHashes();
            fetchBalance();
            break;

          case "bounty_marked_paid":
            setBounties((prev) =>
              prev.map((bounty) =>
                bounty.id === msg.payload.id ? msg.payload : bounty,
              ),
            );
            break;

          case "bounty_paid":
            fetchBounties();
            fetchTransactionHashes();
            fetchBalance();
            break;

          case "bounty_assignees_updated":
            fetchBounties();
            break;

          case "team_created":
            setTeams((prev) => [msg.payload, ...prev]);
            break;

          case "team_updated":
            setTeams((prev) =>
              prev.map((t) => (t.id === msg.payload.id ? msg.payload : t)),
            );
            break;

          case "team_deleted":
            setTeams((prev) => prev.filter((t) => t.id !== msg.payload.id));
            fetchZcashParams();
            fetchTeams();
            break;

          case "team_members_updated":
            setTeams((prev) =>
              prev.map((t) => {
                if (t.id !== msg.payload.teamId) return t;
                const merged = [
                  ...t.members.filter(
                    (m) =>
                      !msg.payload.members.find(
                        (nm: TeamMember) => nm.userId === m.userId,
                      ),
                  ),
                  ...msg.payload.members,
                ];
                return { ...t, members: merged };
              }),
            );
            // Re-fetch params in case team wallet was auto-assigned to new members
            fetchZcashParams();
            break;

          case "team_member_removed":
            setTeams((prev) =>
              prev.map((t) =>
                t.id !== msg.payload.teamId
                  ? t
                  : {
                      ...t,
                      members: t.members.filter(
                        (m) => m.userId !== msg.payload.userId,
                      ),
                    },
              ),
            );
            break;

          case "team_wallet_created":
          case "team_wallet_imported":
            setTeams((prev) =>
              prev.map((t) =>
                t.id !== msg.payload.teamId
                  ? t
                  : { ...t, wallet: msg.payload.wallet },
              ),
            );
            fetchZcashParams();
            fetchTeams();
            break;

          case "team_wallet_deleted":
            setTeams((prev) =>
              prev.map((t) =>
                t.id !== msg.payload.teamId ? t : { ...t, wallet: null },
              ),
            );
            break;

          case "user_updated":
            if (msg.payload.id === currentUser?.id) {
              setCurrentUser((prev) =>
                prev ? { ...prev, ...msg.payload } : prev,
              );
              localStorage.setItem(
                "currentUser",
                JSON.stringify({
                  ...currentUser,
                  ...msg.payload,
                }),
              );
            }
            fetchBounties();
            fetchUsers();
            break;

          case "submission_edited":
            setSubmissions((prev) =>
              prev.map((s) => (s.id === msg.payload.id ? msg.payload : s)),
            );
            setAllSubmissions((prev) =>
              prev.map((s) => (s.id === msg.payload.id ? msg.payload : s)),
            );
            setBountySubmissions((prev) => ({
              ...prev,
              [msg.payload.bountyId]: (prev[msg.payload.bountyId] || []).map(
                (s) => (s.id === msg.payload.id ? msg.payload : s),
              ),
            }));
            break;

          case "submissions_rejected_others":
            setAllSubmissions((prev) =>
              prev.map((s) =>
                s.bountyId === msg.payload.bountyId &&
                s.id !== msg.payload.keptSubmissionId &&
                s.status === "pending"
                  ? { ...s, status: "rejected" }
                  : s,
              ),
            );
            setBountySubmissions((prev) => ({
              ...prev,
              [msg.payload.bountyId]: (prev[msg.payload.bountyId] || []).map(
                (s) =>
                  s.id !== msg.payload.keptSubmissionId &&
                  s.status === "pending"
                    ? { ...s, status: "rejected" }
                    : s,
              ),
            }));
            break;
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.onclose = () => {
        if (destroyed) return; // don't reconnect if the component unmounted
        retryTimeout = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30000); // cap at 30s
          connect();
        }, retryDelay);
      };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(retryTimeout);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [currentUser?.id]);

  // Fetch bounties — CLIENT: MAIN only; ADMIN: ALL (so admin Test/Main toggle still works)
  const fetchBounties = async (
    reset = true,
    chain?: "MAIN" | "TEST" | "ALL",
  ) => {
    setBountiesLoading(true);
    try {
      const page = reset ? 1 : bountiesPage;

      // Explicit chain wins; otherwise admin gets ALL, everyone else MAIN
      const resolvedChain =
        chain ?? (currentUser?.role === "ADMIN" ? "ALL" : "MAIN");

      const res = await fetch(
        `${backendUrl}/api/bounties?page=${page}&limit=${BOUNTIES_PER_PAGE}&chain=${resolvedChain}`,
        { headers: getAuthHeaders() },
      );

      if (!res.ok) throw new Error("Failed to fetch bounties");

      const data = await res.json();
      const incoming: Bounty[] = Array.isArray(data) ? data : (data.data ?? []);
      const total: number = data.total ?? incoming.length;

      if (reset) {
        setBounties(incoming);
        setBountiesPage(2); // next load-more will fetch page 2
      } else {
        setBounties((prev) => {
          const existingIds = new Set(prev.map((b) => b.id));
          const fresh = incoming.filter((b) => !existingIds.has(b.id));
          return [...prev, ...fresh];
        });
        setBountiesPage((p) => p + 1);
      }

      // If we got fewer than a full page, there's nothing more to load
      setHasMoreBounties(
        incoming.length === BOUNTIES_PER_PAGE &&
          bounties.length + incoming.length < total,
      );
    } catch (error) {
      console.error("Failed to fetch bounties:", error);
    } finally {
      setBountiesLoading(false);
    }
  };

  /** Appends the next page of bounties to the existing list */
  const loadMoreBounties = async () => {
    if (!hasMoreBounties || bountiesLoading) return;
    await fetchBounties(false);
  };

  const fetchMyBounties = async () => {
    if (!currentUser) return;
    setMyBountiesLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/bounties/mine`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch your bounties");
      const data = await res.json();
      setMyBounties(data.data ?? []);
    } catch (error) {
      console.error("Failed to fetch my bounties:", error);
    } finally {
      setMyBountiesLoading(false);
    }
  };

  const fetchTotalStats = async () => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    try {
      const res = await fetch(`${backendUrl}/api/bounties/stats/totals`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setTotalBountyAmount(data.totalBountyAmount ?? 0);
      setTotalBountyCount(data.totalBountyCount ?? 0);
      setTotalActiveCount(
        (data.statusCounts?.IN_PROGRESS ?? 0) +
          (data.statusCounts?.IN_REVIEW ?? 0),
      );
      setStatusCounts(data.statusCounts ?? {});
    } catch (error) {
      console.error("Failed to fetch bounty stats:", error);
    }
  };

  const fetchBountyById = async (id: string): Promise<Bounty | null> => {
    try {
      const res = await fetch(`${backendUrl}/api/bounties/${id}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (error) {
      console.error("Failed to fetch bounty:", error);
      return null;
    }
  };

  const createBounty = async (data: BountyFormData) => {
    if (!currentUser) return;

    try {
      const res = await fetch(`${backendUrl}/api/bounties`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          bountyAmount: data.bountyAmount,
          timeToComplete: data.timeToComplete,
          assignee:
            data.assignee === "none"
              ? currentUser.role === "ADMIN"
                ? null
                : currentUser.id
              : data.assignee,
          createdBy: currentUser.id,
          isApproved: currentUser.role === "ADMIN" ? true : false,
          categoryId: data.category,
          chain: data.chain,
        }),
      });

      if (!res.ok) throw new Error("Failed to create bounty");

      const created = await res.json();
      console.log(created);
      setBounties((prev) => [created, ...prev]);
    } catch (error) {
      console.error("Failed to create bounty:", error);
      throw error;
    }
  };

  const updateBounty = async (
    id: string,
    data: Partial<BountyFormData> & {
      userIds?: string[];
      notifyUsers?: boolean;
    },
  ) => {
    if (!currentUser) return;

    try {
      const res = await fetch(`${backendUrl}/api/bounties/${id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...(data.title && { title: data.title }),
          ...(data.description && { description: data.description }),
          ...(data.bountyAmount && { bountyAmount: data.bountyAmount }),
          ...(data.timeToComplete && { timeToComplete: data.timeToComplete }),
          ...(data.chain && { chain: data.chain }),
          notifyUsers: data.notifyUsers ?? false,
        }),
      });

      if (!res.ok) throw new Error("Failed to update bounty");

      if (data.userIds !== undefined) {
        const assignRes = await fetch(
          `${backendUrl}/api/bounties/${id}/assignees`,
          {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
              userIds: data.userIds,
              notifyUsers: data.notifyUsers ?? false,
            }),
          },
        );
        if (!assignRes.ok) {
          const errData = await assignRes.json();
          throw new Error(errData.error || "Failed to update assignees");
        }
      }

      const fresh = await fetchBountyById(id);
      if (fresh) {
        setBounties((prev) =>
          prev.map((bounty) => (bounty.id === id ? fresh : bounty)),
        );
      }
    } catch (error) {
      console.error("Failed to update bounty:", error);
      throw error;
    }
  };

  const updateBountyStatus = async (
    id: string,
    status: Bounty["status"],
    winnerId?: string,
  ) => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    try {
      const res = await fetch(`${backendUrl}/api/bounties/${id}/status`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status,
          ...(winnerId && { winnerId }),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        // Surface the requiresWinner signal so the UI can react
        if (errorData.requiresWinner) {
          throw Object.assign(new Error("Winner selection required"), {
            requiresWinner: true,
            assignees: errorData.assignees,
          });
        }
        throw new Error(errorData.error || "Failed to update bounty status");
      }

      const updated = await res.json();
      setBounties((prev) =>
        prev.map((bounty) => (bounty.id === id ? updated : bounty)),
      );
      await fetchTotalStats();
    } catch (error) {
      console.error("Failed to update bounty status:", error);
      throw error;
    }
  };

  const approveBounty = async (id: string, approved: boolean) => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    try {
      const res = await fetch(`${backendUrl}/api/bounties/${id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ isApproved: approved }),
      });

      if (!res.ok) throw new Error("Failed to approve bounty");

      const updated = await res.json();

      // Re-fetch bounties so assignees array is fresh
      await fetchBounties();
    } catch (error) {
      console.error("Failed to approve bounty:", error);
      throw error;
    }
  };

  const deleteBounty = async (id: string) => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    try {
      const res = await fetch(`${backendUrl}/api/bounties/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Failed to delete bounty");

      setBounties((prev) => prev.filter((bounty) => bounty.id !== id));
    } catch (error) {
      console.error("Failed to delete bounty:", error);
      throw error;
    }
  };

  const login = async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; user?: any }> => {
    try {
      const res = await fetch(`${backendUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        return { success: false };
      }

      const data = await res.json();

      localStorage.setItem("authToken", data.token);
      localStorage.setItem("currentUser", JSON.stringify(data.user));

      setCurrentUser(data.user);

      await Promise.all([
        fetchBounties(),
        fetchUsers(),
        fetchCategories(),
        fetchTotalStats(),
      ]);

      return { success: true, user: data.user };
    } catch (err) {
      console.error("Login failed:", err);
      return { success: false };
    }
  };

  const logout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("currentUser");
    setCurrentUser(null);
    setApplications([]);
    setAllApplications([]);
    setZcashParams([]);
    setSyncStatus(null);
    setSyncStatusError(null);
    fetchBounties();
    fetchCategories();
    fetchUsers();
  };

  const applyToBounty = async (bountyId: string, message: string) => {
    if (!currentUser) return;

    try {
      const res = await fetch(`${backendUrl}/api/bounties/apply`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          bountyId,
          applicantId: currentUser.id,
          message,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to apply");
      }

      const newApplication = await res.json();
      setApplications((prev) => [...prev, newApplication]);
      setAllApplications((prev) => [...prev, newApplication]);

      await fetchBounties();
    } catch (error) {
      console.error("Failed to apply to bounty:", error);
      throw error;
    }
  };

  const editBounty = (id: string, data: Partial<BountyFormData>) => {
    updateBounty(id, data);
  };

  const verifyZaddress = async (z_address: string) => {
    if (!currentUser) return;

    try {
      const res = await fetch(`${backendUrl}/auth/verify-zaddress`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ z_address }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to verify zaddress");
      }

      const data = await res.json();
      return data.isVerified as boolean;
    } catch (error) {
      console.error("Failed to verify zaddress:", error);
      return false;
    }
  };

  const verifyUaddress = async (z_address: string) => {
    if (!currentUser) return;

    try {
      const res = await fetch(`${backendUrl}/auth/verify-uaddress`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ z_address }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to verify zaddress");
      }

      const data = await res.json();
      return data.isVerified as boolean;
    } catch (error) {
      console.error("Failed to verify zaddress:", error);
      return false;
    }
  };

  const zAddressUpdate = async (z_address: string) => {
    if (!currentUser) return;

    try {
      const res = await fetch(`${backendUrl}/auth/update-zaddress`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ z_address }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to add zaddress");
      }

      return true;
    } catch (error) {
      console.error("Failed to add zaddress:", error);
      return false;
    }
  };

  const nicknameUpdate = async (nickname: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${backendUrl}/auth/update-nickname`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ nickname }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update nickname");
      }
      const data = await res.json();
      setCurrentUser(data.user);
      localStorage.setItem("currentUser", JSON.stringify(data.user));
      return true;
    } catch (error) {
      console.error("Failed to update nickname:", error);
      return false;
    }
  };

  const uaAddressUpdate = async (UA_address: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${backendUrl}/auth/update-ua-address`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ UA_address }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update UA address");
      }
      return true;
    } catch (error) {
      console.error("Failed to update UA address:", error);
      return false;
    }
  };

  const fetchExportPayments = async (
    from?: string,
    to?: string,
  ): Promise<any[]> => {
    if (!currentUser || currentUser.role !== "ADMIN") return [];
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const res = await fetch(
        `${backendUrl}/api/bounties/export-payments?${params.toString()}`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) throw new Error("Failed to fetch export data");
      const data = await res.json();
      return data.data || [];
    } catch (error) {
      console.error("Failed to fetch export payments:", error);
      return [];
    }
  };

  const fetchExportCompleted = async (): Promise<any[]> => {
    if (!currentUser || currentUser.role !== "ADMIN") return [];
    try {
      const res = await fetch(`${backendUrl}/api/bounties/export-completed`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch completed bounties");
      const data = await res.json();
      return data.data || [];
    } catch (error) {
      console.error("Failed to fetch completed bounties:", error);
      return [];
    }
  };

  const updateUserOfac = async (
    userId: string,
    ofacVerified: boolean,
  ): Promise<void> => {
    if (!currentUser || currentUser.role !== "ADMIN") return;
    const res = await fetch(`${backendUrl}/auth/users/${userId}/ofac`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ ofacVerified }),
    });
    if (!res.ok) throw new Error("Failed to update OFAC status");
    // Refresh users list so the toggle reflects in other parts of the app
    await fetchUsers();
  };

  // Populate user data in bounties
  const populatedBounties = useMemo(
    () =>
      bounties.map((bounty) => ({
        ...bounty,
        userApplication: applications.find((app) => app.bountyId === bounty.id),
      })),
    [bounties, applications],
  );

  const requestRecoveryOtp = async (): Promise<{
    message: string;
    email: string;
  }> => {
    const res = await fetch(`${backendUrl}/auth/recovery/request-otp`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to send OTP");
    }
    return res.json();
  };

  const verifyRecoveryOtp = async (
    otp: string,
    accountName: string,
  ): Promise<RecoveryData> => {
    const res = await fetch(`${backendUrl}/auth/recovery/verify-otp`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ otp, accountName }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Verification failed");
    }
    const { data } = await res.json();
    return data;
  };

  return (
    <BountyContext.Provider
      value={{
        currentUser,
        isLoading,
        login,
        logout,
        setCurrentUser,
        switchRole,
        isSwitchingRole,
        requestRecoveryOtp,
        verifyRecoveryOtp,
        nicknameUpdate,
        categories,
        categoriesLoading,
        fetchCategories,
        createCategory,
        updateCategory,
        deleteCategory,
        bounties: populatedBounties,
        bountiesLoading,
        createBounty,
        updateBounty,
        updateBountyStatus,
        approveBounty,
        authorizePayment,
        paymentIDs,
        paymentChain,
        paymentServerUrl,
        submissions,
        bountySubmissions,
        fetchUserSubmissions,
        fetchBountySubmissions,
        getUserSubmissionForBounty,
        getAllSubmissionsForBounty,
        fetchTransactionHashes,
        authorizeDuePayment,
        deleteBounty,
        fetchBounties,
        loadMoreBounties,
        hasMoreBounties,
        bountiesPage,
        totalBountyAmount,
        totalBountyCount,
        totalActiveCount,
        statusCounts,
        fetchBountyById,
        applyToBounty,
        editBounty,
        users,
        nonAdminUsers,
        usersLoading,
        fetchUsers,
        applications,
        fetchUserApplications,
        fetchAllUsersApplications,
        allSubmissions,
        fetchAllSubmissions,
        getAllApplicationForBounty,
        fetchBountyApplications,
        getUserApplicationForBounty,
        getAllApplicationsForBounty,
        acceptApplication,
        rejectApplication,
        allApplications,
        bountyApplications,
        submitWork,
        fetchWorkSubmissions,
        reviewWorkSubmission,
        authorizeBatchPayment,
        processBatchPayments,
        getPendingBatchPayments,
        zAddressUpdate,
        uaAddressUpdate,
        verifyZaddress,
        verifyUaddress,
        balance,
        fetchBalance,
        address,
        addresses,
        fetchAddresses,
        emailNotificationsUpdate,
        syncStatus,
        syncStatusLoading,
        syncStatusError,
        rescanStatus,
        fetchSyncStatus,
        rescanWallet,
        rescanLoading,
        zcashParams,
        zcashParamsLoading,
        fetchZcashParams,
        fetchAllZcashParams,
        getZcashParam,
        createZcashParams,
        updateZcashParams,
        deleteZcashParams,
        upsertZcashParams,
        testZcashConnection,
        importWallet,
        setDefaultWallet,
        fetchExportPayments,
        fetchExportCompleted,
        updateUserOfac,
        teams,
        teamsLoading,
        fetchTeams,
        createTeam,
        updateTeam,
        deleteTeam,
        addTeamMembers,
        updateTeamMemberRole,
        removeTeamMember,
        createTeamWallet,
        importTeamWallet,
        deleteTeamWallet,
        currentTeam,
        editSubmission,
        rejectOtherSubmissions,
        fetchMyBounties,
        myBounties,
        myBountiesLoading,
      }}
    >
      {children}
    </BountyContext.Provider>
  );
}

export function useBounty() {
  const context = useContext(BountyContext);
  if (context === undefined) {
    throw new Error("useBounty must be used within a BountyProvider");
  }
  return context;
}
