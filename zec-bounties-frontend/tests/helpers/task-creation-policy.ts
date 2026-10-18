import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Follow the application's global pause without importing its client-only hook.
// Fail loudly if the flag stops being a literal, rather than silently skipping tests.
const taskCreationSource = readFileSync(
  resolve(__dirname, "../../hooks/use-task-creation-blocked.ts"),
  "utf8",
);
const taskCreationFlag = taskCreationSource.match(
  /^export const FORCE_TASK_CREATION_BLOCKED = (true|false);$/m,
);
if (!taskCreationFlag) {
  throw new Error("Update the browser tests for the task-creation policy.");
}
export const taskCreationPaused = taskCreationFlag[1] === "true";

