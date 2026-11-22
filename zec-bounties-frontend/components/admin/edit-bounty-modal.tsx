"use client";
import {
  BountyEditModal,
  type BountyEditModalProps,
} from "@/components/bounty-edit-modal";

// Same name and props as before, so the admin dashboard imports don't change.
export function EditBountyModal(props: Omit<BountyEditModalProps, "variant">) {
  return <BountyEditModal variant="admin" {...props} />;
}
