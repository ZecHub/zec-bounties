"use client";

import type React from "react";
import { createContext, useContext, useState, useEffect } from "react";
import type {
  User,
  Bounty,
  BountyFormData,
  BountyApplication,
  WorkSubmission,
  ZcashParamsFormData,
} from "./types";
import { backendUrl, backendWebSpocketUrl } from "./configENV";

interface BountyCategory {
  id: number;
  name: string;
}

interface ZcashParams {
  id: number;
  chain: string;
  serverUrl: string;
  accountName: string;
  ownerId: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  owner?: {
    id: string;
    name: string;
    email: string;
  };
}

interface ImportWalletData {
  accountName: string;
  seedPhrase: string;
  chain: string;
  serverUrl: string;
  birthdayHeight?: number;
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
  updateBounty: (id: string, data: Partial<BountyFormData>) => Promise<void>;
  updateBountyStatus: (id: string, status: Bounty["status"]) => Promise<void>;
  approveBounty: (id: string, approved: boolean) => Promise<void>;
  authorizePayment: (id: string) => Promise<void>;
  paymentIDs: string[] | undefined;
  authorizeDuePayment: (bountyIds: string[]) => Promise<{
    success: boolean;
    paidCount: number;
    skipped: Array<{ id: string; title: string; reason: string }>;
  }>;
  deleteBounty: (id: string) => Promise<void>;
  zAddressUpdate: (z_address: string) => Promise<boolean | undefined>;
  verifyZaddress: (z_address: string) => Promise<boolean | undefined>;
  fetchBounties: () => Promise<void>;
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
  balance: number | undefined;
  fetchBalance: () => Promise<void>;
  address: string | undefined;
  fetchAddresses: () => Promise<void>;

  // Applications
  applications: BountyApplication[];
  allApplications: BountyApplication[];
  bountyApplications: Record<string, BountyApplication[]>;

  // Fetch methods
  fetchUserApplications: () => Promise<void>;
  fetchAllUsersApplications: () => Promise<void>;
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
  setDefaultWallet: (accountName: string) => Promise<void>;
}

const BountyContext = createContext<BountyContextType | undefined>(undefined);

export function BountyProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
  const [balance, setBalance] = useState<number | undefined>(undefined);
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [paymentIDs, setPaymentIDs] = useState<string[] | undefined>(undefined);
  const [categories, setCategories] = useState<BountyCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [zcashParams, setZcashParams] = useState<ZcashParams[]>([]);
  const [zcashParamsLoading, setZcashParamsLoading] = useState(false);

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

      // Refresh Zcash params
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

  const setDefaultWallet = async (accountName: string): Promise<void> => {
    if (!currentUser || currentUser.role !== "ADMIN") {
      throw new Error("Only admins can set a default wallet");
    }

    try {
      const res = await fetch(
        `${backendUrl}/api/zcash/params/${accountName}/set-default`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to set default wallet");
      }

      const response = await res.json();

      // Update local state — mark the new default, unmark all others
      setZcashParams((prev) =>
        prev.map((param) => ({
          ...param,
          isDefault: param.accountName === accountName,
        })),
      );
    } catch (error) {
      console.error("Failed to set default wallet:", error);
      throw error;
    }
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
          // Update existing
          return prev.map((param, idx) =>
            idx === existingIndex ? savedParam : param,
          );
        } else {
          // Add new
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
        data: response.data,
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

      // For instant payments, process immediately
      if (updated.paymentScheduled?.type === "instant") {
        await processInstantPayment(bountyId);
      }
    } catch (error) {
      console.error("Failed to authorize batch payment:", error);
      throw error;
    }
  };

  // Process instant payment separately
  const processInstantPayment = async (bountyId: string) => {
    const bounty = bounties.find((b) => b.id === bountyId);
    if (!bounty || !bounty.assigneeUser?.z_address) return;

    try {
      await fetch(`${backendUrl}/api/bounties/process-instant-payment`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          address: bounty.assigneeUser.z_address,
          amount: Math.floor(bounty.bountyAmount * 100000000), // Convert to zatoshis
          memo: `Bounty: ${bounty.title} (ID: ${bounty.id})`,
          bountyId: bountyId,
        }),
      });
    } catch (error) {
      console.error("Failed to process instant payment:", error);
    }
  };

  // Update the existing authorizePayment function
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
        throw new Error(errorData.error || "Failed to authorize payment");
      }

      const data = await res.json();

      // Refresh bounties to reflect paid status
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
        setPaymentIDs(data);
      }
    } catch (error) {
      console.error("Failed to fetch transaction hashes:", error);
    }
  };

  // Update the existing authorizePayment function
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

      // Process instant payment
      await processInstantPayment(id);
    } catch (error) {
      console.error("Failed to authorize payment:", error);
      throw error;
    }
  };

  // Function to get all pending batch payments for the backend
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
      amount: Math.floor(bounty.bountyAmount * 100000000), // Convert ZEC to zatoshis
      memo: `Bounty: ${bounty.title} (ID: ${bounty.id})`,
    }));
  };

  // Function to process batch payments
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

      // Mark bounties as paid if batch was successful
      if (result.success) {
        const batchBountyIds = bounties
          .filter(
            (bounty) =>
              bounty.paymentAuthorized &&
              bounty.paymentScheduled?.type === "sunday_batch" &&
              !bounty.isPaid,
          )
          .map((bounty) => bounty.id);

        // Update bounties to mark them as paid
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

        // Refresh bounties
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
        headers: getPublicHeaders(), // Changed from getAuthHeaders()
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

  // Create a new category
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

  // Update a category
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

  // Delete a category
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

  // Fetch all users (PUBLIC - no auth required for basic user list)
  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/bounties/users`, {
        headers: getPublicHeaders(), // Changed from getAuthHeaders()
      });

      if (!res.ok) throw new Error("Failed to fetch users");

      const data = await res.json();
      const nonAdminUsersData = data.filter(
        (user: User) => user.role !== "ADMIN",
      );
      setUsers(data);
      setNonAdminUsers(nonAdminUsersData);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setUsersLoading(false);
    }
  };

  // Fetch applications for a specific bounty (admin/creator only)
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

      // Store applications for this specific bounty
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

  // Fetch current user's applications only
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

  // Fetch all applications (admin only)
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

  // Get current user's application for a specific bounty
  const getUserApplicationForBounty = (
    bountyId: string,
  ): BountyApplication | null => {
    return applications.find((app) => app.bountyId === bountyId) || null;
  };

  // Get ALL applications for a specific bounty (returns array)
  const getAllApplicationsForBounty = (
    bountyId: string,
  ): BountyApplication[] => {
    // First check if we have applications cached for this bounty
    if (bountyApplications[bountyId]) {
      return bountyApplications[bountyId];
    }

    // Fallback: filter from all applications if available
    if (allApplications.length > 0) {
      return allApplications.filter((app) => app.bountyId === bountyId);
    }

    // If no applications found, try to fetch them
    fetchBountyApplications(bountyId);
    return [];
  };

  // Accept an application (admin/creator only)
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

      // Update local state
      const bountyId = updatedApplication.bountyId;

      // Refresh bounty applications for this bounty
      await fetchBountyApplications(bountyId);

      // Refresh bounties to update assignment
      await fetchBounties();

      return updatedApplication;
    } catch (error) {
      console.error("Failed to accept application:", error);
      throw error;
    }
  };

  // Reject an application (admin/creator only)
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

      // Update local state
      const bountyId = updatedApplication.bountyId;

      // Refresh bounty applications for this bounty
      await fetchBountyApplications(bountyId);

      return updatedApplication;
    } catch (error) {
      console.error("Failed to reject application:", error);
      throw error;
    }
  };

  // Submit work for a bounty (assignee only)
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

      // Refresh bounties to get updated data
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
        setAddress(data.encoded_address);
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  };

  // Review work submission (creator/admin only)
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

      // Refresh bounties to get updated data
      await fetchBounties();

      return await res.json();
    } catch (error) {
      console.error("Failed to review submission:", error);
      throw error;
    }
  };

  // Get all user's application for a specific bounty
  const getAllApplicationForBounty = (
    bountyId: string,
  ): BountyApplication | null => {
    return allApplications.find((app) => app.bountyId === bountyId) || null;
  };

  // Initialize auth and fetch PUBLIC data
  useEffect(() => {
    const initializeAuth = async () => {
      const savedToken = localStorage.getItem("authToken");

      // Always fetch public data (bounties, categories, users)
      await Promise.all([fetchBounties(), fetchUsers(), fetchCategories()]);

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

  // Fetch user applications when currentUser changes
  useEffect(() => {
    if (currentUser) {
      fetchUserApplications();
      fetchAllUsersApplications();
      fetchZcashParams();
    } else {
      setApplications([]);
      setAllApplications([]);
      setZcashParams([]);
    }
  }, [currentUser]);

  // WebSocket connection
  useEffect(() => {
    if (!currentUser) return;
    const ws = new WebSocket(`${backendWebSpocketUrl}`);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join",
          userId: currentUser.id,
          userName: currentUser.name,
        }),
      );
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case "new_bounty":
          setBounties((prev) => [...prev, msg.payload]);
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
          setApplications((prev) => [...prev, msg.payload]);
          setAllApplications((prev) => [...prev, msg.payload]);
          // Update bountyApplications for specific bounty
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
            prev.map((app) => (app.id === msg.payload.id ? msg.payload : app)),
          );
          setAllApplications((prev) =>
            prev.map((app) => (app.id === msg.payload.id ? msg.payload : app)),
          );
          // Update bountyApplications for specific bounty
          setBountyApplications((prev) => ({
            ...prev,
            [msg.payload.bountyId]: (prev[msg.payload.bountyId] || []).map(
              (app) => (app.id === msg.payload.id ? msg.payload : app),
            ),
          }));
          // Refresh bounties to update assignee
          fetchBounties();
          break;

        case "application_deleted":
          setApplications((prev) =>
            prev.filter((app) => app.id !== msg.payload.id),
          );
          setAllApplications((prev) =>
            prev.filter((app) => app.id !== msg.payload.id),
          );
          // Update bountyApplications for specific bounty
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
          break;

        case "submission_reviewed":
          fetchBounties();
          break;

        case "category_created":
          setCategories((prev) => [...prev, msg.payload]);
          break;

        case "category_updated":
          setCategories((prev) =>
            prev.map((cat) => (cat.id === msg.payload.id ? msg.payload : cat)),
          );
          break;

        case "category_deleted":
          setCategories((prev) =>
            prev.filter((cat) => cat.id !== msg.payload.id),
          );
          break;

        case "transactions_fetched":
          // Update transactions list in state if you have one
          // setTransactions(msg.payload.transactions);
          break;

        case "balance_fetched":
          setBalance(msg.payload.balance);
          break;

        case "sync_status_checked":
          // Handle sync status if needed
          break;

        case "account_created":
          // Handle new account creation
          // Optionally refresh Zcash params
          fetchZcashParams();
          break;

        case "addresses_fetched":
          setAddress(msg.payload.addresses?.encoded_address);
          break;

        case "payment_authorized":
          // Refresh bounties and transactions when payment is authorized
          fetchBounties();
          fetchTransactionHashes();
          break;

        case "bounty_payment_authorized":
          // Update specific bounty with payment authorization
          setBounties((prev) =>
            prev.map((bounty) =>
              bounty.id === msg.payload.id ? msg.payload : bounty,
            ),
          );
          break;

        case "batch_payment_processed":
          // Refresh bounties and show success notification
          fetchBounties();
          fetchTransactionHashes();
          fetchBalance();
          break;

        case "instant_payment_processed":
          // Refresh bounty and show success notification
          fetchBounties();
          fetchTransactionHashes();
          fetchBalance();
          break;

        case "bounty_marked_paid":
          // Update bounty to show it's been paid
          setBounties((prev) =>
            prev.map((bounty) =>
              bounty.id === msg.payload.id ? msg.payload : bounty,
            ),
          );
          break;

        case "bounty_paid":
          // Refresh bounties and transactions after payment
          fetchBounties();
          fetchTransactionHashes();
          fetchBalance();
          break;

        case "bounty_assignees_updated":
          fetchBounties();
          break;
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {};

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [currentUser?.id]);

  // Fetch all bounties (PUBLIC - no auth required)
  const fetchBounties = async () => {
    setBountiesLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/bounties`, {
        headers: getPublicHeaders(), // Changed from getAuthHeaders()
      });

      if (!res.ok) throw new Error("Failed to fetch bounties");

      const data = await res.json();
      setBounties(data);
    } catch (error) {
      console.error("Failed to fetch bounties:", error);
    } finally {
      setBountiesLoading(false);
    }
  };

  // Create a new bounty
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
        }),
      });

      if (!res.ok) throw new Error("Failed to create bounty");

      const created = await res.json();
      setBounties((prev) => [created, ...prev]);
    } catch (error) {
      console.error("Failed to create bounty:", error);
      throw error;
    }
  };

  // Update an existing bounty
  const updateBounty = async (id: string, data: Partial<BountyFormData>) => {
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
          ...(data.assignee !== undefined && {
            assignee: data.assignee === "none" ? null : data.assignee,
          }),
        }),
      });

      if (!res.ok) throw new Error("Failed to update bounty");

      const updated = await res.json();
      setBounties((prev) =>
        prev.map((bounty) => (bounty.id === id ? updated : bounty)),
      );
    } catch (error) {
      console.error("Failed to update bounty:", error);
      throw error;
    }
  };

  // Update bounty status
  const updateBountyStatus = async (id: string, status: Bounty["status"]) => {
    if (!currentUser || currentUser.role !== "ADMIN") return;

    try {
      const res = await fetch(`${backendUrl}/api/bounties/${id}/status`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });

      if (!res.ok) throw new Error("Failed to update bounty status");

      const updated = await res.json();
      setBounties((prev) =>
        prev.map((bounty) => (bounty.id === id ? updated : bounty)),
      );
    } catch (error) {
      console.error("Failed to update bounty status:", error);
      throw error;
    }
  };

  // Approve/reject a bounty
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
      setBounties((prev) =>
        prev.map((bounty) => (bounty.id === id ? updated : bounty)),
      );
    } catch (error) {
      console.error("Failed to approve bounty:", error);
      throw error;
    }
  };

  // Delete a bounty
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

  // Login function with bounty and user fetching
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
        const data = await res.json();
        return { success: false };
      }

      const data = await res.json();

      localStorage.setItem("authToken", data.token);
      localStorage.setItem("currentUser", JSON.stringify(data.user));

      setCurrentUser(data.user);

      // Fetch bounties, users, and categories after successful login
      await Promise.all([fetchBounties(), fetchUsers(), fetchCategories()]);

      return { success: true, user: data.user };
    } catch (err) {
      console.error("Login failed:", err);
      return { success: false };
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("currentUser");
    setCurrentUser(null);
    setApplications([]);
    setAllApplications([]);
    setZcashParams([]);
    fetchBounties();
    fetchCategories();
    fetchUsers();
  };

  // Apply to bounty
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

  // Legacy function for backward compatibility
  const editBounty = (id: string, data: Partial<BountyFormData>) => {
    updateBounty(id, data);
  };

  // Verify Z-address
  const verifyZaddress = async (z_address: string) => {
    if (!currentUser) return;

    try {
      const res = await fetch(`${backendUrl}/auth/verify-zaddress`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          z_address: z_address,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to verify zaddress");
      }

      const data = await res.json();
      const result: boolean = data.isVerified;
      return result;
    } catch (error) {
      console.error("Failed to verify zaddress:", error);
      return false;
    }
  };

  // Update Z-address
  const zAddressUpdate = async (z_address: string) => {
    if (!currentUser) return;

    try {
      const res = await fetch(`${backendUrl}/auth/update-zaddress`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          z_address: z_address,
        }),
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

  // Populate user data in bounties
  const populatedBounties = bounties.map((bounty) => ({
    ...bounty,
    createdByUser: users.find((u) => u.id === bounty.createdBy),
    assigneeUser: bounty.assignee
      ? nonAdminUsers.find((u) => u.id === bounty.assignee)
      : undefined,
    userApplication: applications.find((app) => app.bountyId === bounty.id),
  }));

  return (
    <BountyContext.Provider
      value={{
        currentUser,
        isLoading,
        login,
        logout,
        setCurrentUser,
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
        fetchTransactionHashes,
        authorizeDuePayment,
        deleteBounty,
        fetchBounties,
        applyToBounty,
        editBounty,
        users,
        nonAdminUsers,
        usersLoading,
        fetchUsers,
        applications,
        fetchUserApplications,
        fetchAllUsersApplications,
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
        verifyZaddress,
        balance,
        fetchBalance,
        address,
        fetchAddresses,
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
