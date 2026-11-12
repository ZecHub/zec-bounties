import { expect, test, type Page, type Route } from "@playwright/test";
import { Backend, hunter } from "./fixtures";

const image = {
  name: "fixture.png", mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/R9sAAAAASUVORK5CYII=", "base64"),
};

async function openChat(page: Page) {
  const api = new Backend();
  await api.attach(page);
  const pending: Route[] = [];
  await page.route("**/api/bounties/sync-1/chat", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { messages: [] } });
    } else if (route.request().method() === "POST") {
      pending.push(route); // Deliberately withhold the response until the test releases it.
    } else {
      await route.fallback();
    }
  });
  await page.goto("/my-bounties");
  await page.getByText("Status bounty 1", { exact: true }).click();
  const chat = page.getByRole("region", { name: "Bounty chat", exact: true });
  await expect(chat.getByText("No messages yet. Start the conversation.")).toBeVisible();
  return { chat, pending };
}

for (const withImage of [false, true]) {
  test(`pending ${withImage ? "image" : "text"} send freezes the draft until acknowledgement`, async ({ page }, info) => {
    const { chat, pending } = await openChat(page);
    const input = chat.getByRole("textbox", { name: "Chat message" });
    const file = chat.getByLabel("Attach an image", { exact: true });
    await input.fill("Please review the attached work.");
    if (withImage) await file.setInputFiles(image);
    await chat.getByRole("button", { name: "Send message", exact: true }).click();
    await expect.poll(() => pending.length).toBe(1);

    // All ways of modifying the submitted draft must agree with the disabled Send button.
    await expect.soft(input).toBeDisabled();
    await expect.soft(file).toBeDisabled();
    await expect(chat.getByRole("button", { name: "Attach image", exact: true })).toBeDisabled();
    await expect(chat.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
    if (withImage) await expect.soft(chat.getByRole("button", { name: "Remove image" })).toBeDisabled();
    const acceptsEditsWhileSending = await input.isEnabled();
    if (acceptsEditsWhileSending) await input.fill("This unsent edit must not disappear.");
    await chat.screenshot({ path: info.outputPath("sending.png") });

    const submitted = pending[0].request().postDataJSON();
    expect(submitted.content).toBe("Please review the attached work.");
    expect(submitted.imageData).toBe(withImage ? `data:image/png;base64,${image.buffer.toString("base64")}` : null);
    await pending[0].fulfill({ json: { message: {
      id: "sent-fixture", bountyId: "sync-1", senderId: hunter.id, sender: hunter,
      createdAt: "2026-11-12T06:00:00.000Z", ...submitted,
    } } });
    await expect(chat.getByText(submitted.content, { exact: true })).toBeVisible();
    await expect(input).toBeEnabled();
    await expect.soft(input).toHaveValue(acceptsEditsWhileSending ? "This unsent edit must not disappear." : "");
    await expect(file).toBeEnabled();
    await expect(chat.getByRole("img", { name: "Selected image preview" })).toHaveCount(0);
    await input.fill("Next message is retained.");
    await expect(input).toHaveValue("Next message is retained.");
    expect(pending).toHaveLength(1);
    await chat.screenshot({ path: info.outputPath("acknowledged.png") });
  });
}

test("a failed send preserves text and image and lets the user edit and retry", async ({ page }, info) => {
  const { chat, pending } = await openChat(page);
  const input = chat.getByRole("textbox", { name: "Chat message" });
  const file = chat.getByLabel("Attach an image", { exact: true });
  await input.fill("Keep this draft on failure.");
  await file.setInputFiles(image);
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  await pending[0].fulfill({ status: 500, json: { error: "Fixture send failed" } });
  await expect(chat.getByRole("alert")).toHaveText("Fixture send failed");
  await expect(input).toHaveValue("Keep this draft on failure.");
  await expect(input).toBeEnabled();
  await expect(file).toBeEnabled();
  await expect(chat.getByRole("button", { name: "Remove image" })).toBeEnabled();
  await expect(chat.getByRole("img", { name: "Selected image preview" })).toBeVisible();
  await chat.screenshot({ path: info.outputPath("failed-draft-preserved.png") });
  await input.fill("Edited retry.");
  await chat.getByRole("button", { name: "Remove image" }).click();
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => pending.length).toBe(2);
  expect(pending[1].request().postDataJSON()).toEqual({ content: "Edited retry.", imageData: null });
  await pending[1].fulfill({ json: { message: {
    id: "retry-fixture", bountyId: "sync-1", senderId: hunter.id, sender: hunter,
    createdAt: "2026-11-12T06:00:01.000Z", content: "Edited retry.", imageData: null,
  } } });
  await expect(chat.getByText("Edited retry.", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(input).toBeEnabled();
});
