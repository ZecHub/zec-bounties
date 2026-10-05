"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useBounty } from "@/lib/bounty-context";
import type { SubmissionReviewMessage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function SubmissionReviewThread({
  submissionId,
  submitterId,
  canPost = true,
}: {
  submissionId: string;
  submitterId: string;
  canPost?: boolean;
}) {
  const { fetchReviewThread, postReviewMessage } = useBounty();
  const [messages, setMessages] = useState<SubmissionReviewMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetchReviewThread(submissionId)
      .then((items) => { if (active) setMessages(items); })
      .catch((err) => { if (active) setError(err.message || "Failed to load review history"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [submissionId]);

  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const message = await postReviewMessage(submissionId, body);
      setMessages((current) => [...current, message].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      ));
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-2 border-t border-border pt-3" aria-label="Submission review discussion">
      <h4 className="text-xs font-semibold">Review discussion</h4>
      {loading ? (
        <p className="text-xs text-muted-foreground" role="status">Loading review history…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No review messages yet.</p>
      ) : (
        <ol className="space-y-2">
          {messages.map((message) => (
            <li key={message.id} className="rounded-md border border-border bg-muted/20 p-2.5 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-semibold">
                  {message.author.nickname || message.author.name} · {message.authorId === submitterId ? "Contributor" : "Reviewer"}
                </span>
                <time className="text-muted-foreground" dateTime={message.createdAt}>
                  {format(new Date(message.createdAt), "MMM d, yyyy 'at' p")}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {canPost && !loading && (
        <div className="space-y-2">
          <label htmlFor={`review-message-${submissionId}`} className="text-xs font-medium">Message</label>
          <Textarea
            id={`review-message-${submissionId}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            rows={3}
            placeholder="Add feedback or reply…"
          />
          <Button size="sm" type="button" onClick={send} disabled={sending || !body.trim()}>
            {sending ? "Sending…" : "Send message"}
          </Button>
        </div>
      )}
    </section>
  );
}
