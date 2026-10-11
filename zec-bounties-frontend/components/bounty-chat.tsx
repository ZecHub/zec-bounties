"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { backendUrl } from "@/lib/configENV";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_IMAGE_BYTES = 512 * 1024;

interface ChatMessage {
  id: string;
  bountyId: string;
  senderId: string;
  content: string | null;
  imageData: string | null;
  createdAt: string;
  sender: { id: string; name: string; avatar?: string | null };
}

function authHeaders() {
  const token = localStorage.getItem("authToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read image"));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function openImageInNewTab(dataUrl: string) {
  const [metadata, encoded] = dataUrl.split(",", 2);
  const mimeType = metadata.match(/^data:(image\/[a-z0-9.+-]+);base64$/i)?.[1];
  if (!mimeType || !encoded) return;

  const bytes = Uint8Array.from(atob(encoded), (character) =>
    character.charCodeAt(0),
  );
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function BountyChat({
  bountyId,
  active,
  currentUserId,
  closed = false,
}: {
  bountyId: string;
  active: boolean;
  currentUserId: string;
  closed?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([]);
    setContent("");
    setSelectedImage(null);
    setPreviewUrl(null);
    setError("");
  }, [bountyId]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const loadMessages = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(`${backendUrl}/api/bounties/${bountyId}/chat`, {
          headers: authHeaders(),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load chat");
        if (!cancelled) setMessages(data.messages ?? []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load chat");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [active, bountyId]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!active) return;
    const handleIncomingMessage = (event: Event) => {
      const message = (event as CustomEvent<ChatMessage>).detail;
      if (message.bountyId !== bountyId) return;
      setMessages((previous) =>
        previous.some((item) => item.id === message.id)
          ? previous
          : [...previous, message],
      );
    };
    window.addEventListener("bounty-chat-message", handleIncomingMessage);
    const handleChatCleared = (event: Event) => {
      const detail = (event as CustomEvent<{ bountyId: string }>).detail;
      if (detail.bountyId !== bountyId) return;
      setMessages([]);
      setContent("");
      setSelectedImage(null);
      setPreviewUrl(null);
    };
    window.addEventListener("bounty-chat-cleared", handleChatCleared);
    return () => {
      window.removeEventListener("bounty-chat-message", handleIncomingMessage);
      window.removeEventListener("bounty-chat-cleared", handleChatCleared);
    };
  }, [active, bountyId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      setError("Choose a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Images must be 512 KB or smaller.");
      return;
    }
    setError("");
    setSelectedImage(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (closed || (!content.trim() && !selectedImage) || isSending) return;

    setIsSending(true);
    setError("");
    try {
      const response = await fetch(`${backendUrl}/api/bounties/${bountyId}/chat`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          content,
          imageData: selectedImage ? await readAsDataUrl(selectedImage) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send message");
      setMessages((previous) =>
        previous.some((item) => item.id === data.message.id)
          ? previous
          : [...previous, data.message],
      );
      setContent("");
      setSelectedImage(null);
      setPreviewUrl(null);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send message");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="mt-5 border-t pt-4" aria-label="Bounty chat">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Bounty chat</h3>
          <p className="text-xs text-muted-foreground">Admin and assigned users</p>
        </div>
      </div>

      <div
        className="max-h-64 min-h-24 space-y-3 overflow-y-auto rounded-md border bg-muted/20 p-3"
        aria-live="polite"
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No messages yet. Start the conversation.
          </p>
        ) : (
          messages.map((message) => {
            const isOwnMessage = message.senderId === currentUserId;
            return (
              <article
                key={message.id}
                className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] space-y-1 rounded-lg border px-3 py-2 ${
                    isOwnMessage
                      ? "border-primary/20 bg-primary/10"
                      : "bg-background"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-xs font-semibold">
                      {isOwnMessage ? "You" : message.sender.name}
                    </span>
                    <time className="shrink-0 text-[10px] text-muted-foreground">
                      {format(new Date(message.createdAt), "MMM d, p")}
                    </time>
                  </div>
                  {message.content && (
                    <p className="whitespace-pre-wrap wrap-break-word text-sm">
                      {message.content}
                    </p>
                  )}
                  {message.imageData && (
                    <button
                      type="button"
                      className="block cursor-zoom-in text-left"
                      aria-label="Open shared image in a new tab"
                      onClick={() => openImageInNewTab(message.imageData!)}
                    >
                      <img
                        src={message.imageData}
                        alt={`Image shared by ${message.sender.name}`}
                        className="max-h-44 max-w-full rounded border object-contain"
                      />
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {closed ? (
        <p className="mt-3 rounded-md border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
          Chat is closed. Messages were cleared when this bounty was completed.
        </p>
      ) : (
        <>
      {previewUrl && (
        <div className="mt-2 flex items-start gap-2 rounded-md border bg-muted/20 p-2">
          <img
            src={previewUrl}
            alt="Selected image preview"
            className="h-20 w-20 rounded border object-cover"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Remove image"
            onClick={() => {
              setSelectedImage(null);
              setPreviewUrl(null);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}

      <form onSubmit={handleSend} className="mt-2 flex items-end gap-2">
        <label className="sr-only" htmlFor={`chat-image-${bountyId}`}>
          Attach an image
        </label>
        <input
          id={`chat-image-${bountyId}`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={handleImageChange}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label="Attach image"
          title="Attach image (512 KB max)"
          onClick={() => document.getElementById(`chat-image-${bountyId}`)?.click()}
          disabled={isSending}
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write a message..."
          className="min-h-10 max-h-24 resize-y text-sm"
          maxLength={2000}
          rows={1}
          aria-label="Chat message"
        />
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label="Send message"
          disabled={isSending || (!content.trim() && !selectedImage)}
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
        </>
      )}
    </section>
  );
}