import { expect, type Page, type Route, type WebSocketRoute } from "@playwright/test";

export const hunter = { id: "sync-hunter", name: "Sync Hunter", role: "HUNTER", UA_address: "fixture-only" };
export const creator = { ...hunter, id: "sync-creator", name: "Sync Creator" };
export const admin = { ...hunter, id: "sync-admin", name: "Sync Admin", role: "ADMIN" };

export function bounty(index: number, status = "IN_PROGRESS") {
  return {
    id: "sync-" + index,
    title: "Status bounty " + index,
    description: "Isolated status synchronization fixture",
    createdBy: creator.id, createdByUser: creator,
    assignee: hunter.id as string | null, assigneeUser: hunter,
    assignees: [{ userId: hunter.id, user: hunter }],
    bountyAmount: 0.01, status, isApproved: status !== "TO_DO",
    isPaid: false, isPrivate: false, paymentAuthorized: false,
    dateCreated: new Date(Date.UTC(2026, 9, 1, 12, -index)).toISOString(),
    updatedAt: "2026-10-01T12:00:00.000Z",
    timeToComplete: "2099-10-06T12:00:00.000Z",
    difficulty: "EASY", categoryId: "Development", chain: "MAIN",
  };
}

type Row = ReturnType<typeof bounty>;
export const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

// This emulates the API contract, including broadcasts excluding the actor.
// Every backend request is intercepted; these tests never contact production.
export class Backend {
  rows: Row[];
  submissions: any[] = [];
  sockets = new Map<Page, WebSocketRoute>();
  calls = new Map<Page, { method: string; path: string; page: number }[]>();
  users = new Map<Page, typeof hunter>();
  staleDetails = new Map<string, Row>();
  held = new Map<Page, { route: Route; json: unknown; finish: () => void }>();
  hold = new Map<Page, string>();
  sequence = 0;

  constructor(count = 1) {
    this.rows = Array.from({ length: count }, (_, i) => bounty(i + 1));
  }

  broadcast(type: string, payload: unknown, actor?: string) {
    for (const [page, ws] of this.sockets) {
      if (this.users.get(page)?.id !== actor) ws.send(JSON.stringify({ type, payload }));
    }
  }

  change(id: string, status: string) {
    const index = this.rows.findIndex(b => b.id === id);
    const updated = { ...this.rows[index], status, isApproved: status !== "TO_DO",
      updatedAt: new Date(Date.UTC(2026, 9, 1, 13, 0, ++this.sequence)).toISOString() };
    this.rows[index] = updated;
    return updated;
  }

  async release(page: Page) {
    const pending = this.held.get(page)!;
    await pending.route.fulfill({ json: pending.json });
    pending.finish();
    this.held.delete(page);
  }

  async respond(page: Page, route: Route, json: unknown) {
    if (this.hold.get(page) === new URL(route.request().url()).pathname) {
      this.hold.delete(page);
      await new Promise<void>(finish => this.held.set(page, { route, json: copy(json), finish }));
      return;
    }
    await route.fulfill({ json });
  }

  listCalls(page: Page) {
    return this.calls.get(page)!.filter(c => c.path === "/api/bounties");
  }

  async attach(page: Page, user = hunter) {
    this.users.set(page, user);
    this.calls.set(page, []);
    await page.addInitScript(user => {
      localStorage.setItem("authToken", "status-fixture-token");
      localStorage.setItem("currentUser", JSON.stringify(user));
      localStorage.setItem("zecBountiesPushAttempted", String(Date.now()));
    }, user);
    await page.routeWebSocket("ws://localhost:9000/**", ws => this.sockets.set(page, ws));
    await page.route("**/*", async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin === "http://127.0.0.1:3128") return route.continue();
      if (url.origin !== "http://localhost:9000") return route.abort();
      const method = req.method();
      const pathname = url.pathname;
      const pageNumber = Number(url.searchParams.get("page")) || 1;
      this.calls.get(page)!.push({ method, path: pathname, page: pageNumber });
      let json: any = [];
      if (method !== "GET") {
        const input = req.postDataJSON() ?? {};
        const statusMatch = pathname.match(/^\/api\/bounties\/(sync-\d+)\/status$/);
        const submitMatch = pathname.match(/^\/api\/bounties\/(sync-\d+)\/submit$/);
        const reviewMatch = pathname.match(/^\/api\/bounties\/submissions\/([^/]+)\/review$/);
        const editMatch = pathname.match(/^\/api\/bounties\/submissions\/([^/]+)$/);
        if (method === "PATCH" && statusMatch) {
          json = this.change(statusMatch[1], input.status);
          this.broadcast("bounty_status_changed", json, user.id);
        } else if (method === "POST" && submitMatch) {
          const updated = this.change(submitMatch[1], "IN_REVIEW");
          const submission = { id: "submission-" + updated.id, bountyId: updated.id, submittedBy: user.id,
            submitterUser: user, status: "pending", submittedAt: new Date().toISOString(), ...input };
          this.submissions.push(submission);
          this.broadcast("work_submitted", submission, user.id);
          this.broadcast("bounty_updated", updated, user.id);
          json = { workSubmission: submission, bounty: updated };
        } else if (method === "PATCH" && reviewMatch) {
          const submission = this.submissions.find(s => s.id === reviewMatch[1]);
          Object.assign(submission, input);
          const updated = this.change(submission.bountyId, input.status === "approved" ? "DONE" : "IN_PROGRESS");
          if (input.status === "rejected") {
            updated.assignee = null;
            updated.assignees = [];
          }
          this.broadcast("submission_reviewed", submission, user.id);
          this.broadcast("bounty_updated", updated, user.id);
          json = { submission, bounty: updated };
        } else if (method === "PATCH" && editMatch) {
          const submission = this.submissions.find(s => s.id === editMatch[1]);
          Object.assign(submission, input, { status: "pending", submittedAt: new Date().toISOString() });
          const updated = this.change(submission.bountyId, "IN_REVIEW");
          this.broadcast("submission_edited", submission, user.id);
          this.broadcast("bounty_updated", updated, user.id);
          json = { workSubmission: submission, bounty: updated };
        } else {
          return route.abort();
        }
        return this.respond(page, route, json);
      }
      if (pathname === "/auth/me") json = { user };
      if (pathname === "/api/zcash/params") json = { data: [{ id: "fixture-wallet", accountName: "Fixture wallet", isDefault: true, chain: "MAIN" }] };
      if (pathname === "/api/bounties/categories") json = [{ id: "Development", name: "Development" }];
      if (pathname === "/api/bounties") {
        const limit = Number(url.searchParams.get("limit")) || 10;
        json = { data: copy(this.rows.slice((pageNumber - 1) * limit, pageNumber * limit)), total: this.rows.length, page: pageNumber, limit };
      }
      if (pathname === "/api/bounties/mine") {
        json = { data: copy(this.rows.filter(b => b.createdBy === user.id || b.assignee === user.id || b.assignees.some(a => a.userId === user.id))) };
      }
      if (pathname === "/api/bounties/mine/quota") json = { used: 0, limit: 5, remaining: 5 };
      if (pathname === "/api/bounties/stats/totals") json = {
        totalBountyCount: this.rows.length,
        statusCounts: Object.fromEntries(["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE"].map(status =>
          [status, this.rows.filter(b => b.status === status).length])),
      };
      if (["/api/bounties/my-submissions", "/api/bounties/submissions/all"].includes(pathname)) json = this.submissions;
      const row = this.rows.find(b => pathname === "/api/bounties/" + b.id);
      if (row) json = this.staleDetails.get(row.id) ?? row;
      const subs = pathname.match(/^\/api\/bounties\/(sync-\d+)\/submissions$/);
      if (subs) json = this.submissions.filter(s => s.bountyId === subs[1]);
      await this.respond(page, route, json);
    });
  }

  async open(page: Page, path = "/home", user = hunter) {
    await this.attach(page, user);
    await page.goto(path);
    await expect(page.getByText(this.rows[0].title, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect.poll(() => this.sockets.has(page)).toBe(true);
    await page.waitForLoadState("networkidle");
  }
}

export const cards = (page: Page) => page.locator(".snap-start").getByText(/^Status bounty \d+$/);
export const column = (page: Page, name: string) => page.locator(".snap-start").filter({ has: page.getByText(name, { exact: true }) });
export const pill = (page: Page, name: string) => page.getByRole("button", { name: new RegExp("^" + name + "\\s*\\d+$"), includeHidden: true });

export async function loadTwenty(page: Page) {
  await expect(cards(page)).toHaveCount(10);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(cards(page)).toHaveCount(20);
  await page.evaluate(() => window.scrollTo(0, 0));
}
