"use client";
import {
  BountyEditModal,
  type BountyEditModalProps,
} from "@/components/bounty-edit-modal";

// Put this at the path where TeamsEditBountyModal currently lives (keep its file name).
export function TeamsEditBountyModal(
  props: Omit<BountyEditModalProps, "variant">,
) {
  return <BountyEditModal variant="team" {...props} />;
}
