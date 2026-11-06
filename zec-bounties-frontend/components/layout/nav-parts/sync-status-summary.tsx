import type { SyncStatus } from "@/lib/bounty-context";

export function SyncStatusSummary({ status }: { status: SyncStatus | null }) {
  if (!status) {
    return <p className="text-muted-foreground">No sync data yet.</p>;
  }
  const pct =
    status.percentage_total_blocks_scanned ||
    status.percentage_total_outputs_scanned;
  const done = pct === 100 || status.in_progress === false;
  return (
    <div className="space-y-1 font-mono">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Status</span>
        <span className={done ? "text-emerald-500" : "text-amber-400"}>
          {pct != null
            ? `${Number(pct).toFixed(2)}%`
            : status.in_progress
              ? "In progress"
              : "Idle"}
        </span>
      </div>
      {status.synced_blocks != null && status.total_blocks != null && (
        <div className="flex items-center justify-between text-muted-foreground/70">
          <span>Blocks</span>
          <span>
            {status.synced_blocks}/{status.total_blocks}
          </span>
        </div>
      )}
    </div>
  );
}
