"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check, Loader2 } from "lucide-react";
import { backendUrl } from "@/lib/configENV";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBounty } from "@/lib/bounty-context";
import { useRouter } from "next/navigation";

interface InboxNotification {
  id: string;
  title: string;
  body: string;
  bountyId: string | null;
  readAt: string | null;
  createdAt: string;
}

async function fetchInbox() {
  const token = localStorage.getItem("authToken");
  if (!token) throw new Error("Sign in to view notifications");
  const response = await fetch(`${backendUrl}/api/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load notifications");
  return data as { notifications: InboxNotification[]; unreadCount: number };
}

export function NotificationsInbox({ fullWidth = false }: { fullWidth?: boolean }) {
  const { currentUser } = useBounty();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    const refresh = async () => {
      try {
        const inbox = await fetchInbox();
        if (active) {
          setNotifications(inbox.notifications);
          setUnreadCount(inbox.unreadCount);
        }
      } catch (error) {
        console.error("Failed to load notifications:", error);
      }
    };
    const handleNewNotification = () => void refresh();
    void refresh();
    window.addEventListener("bounty-notification", handleNewNotification);
    return () => {
      active = false;
      window.removeEventListener("bounty-notification", handleNewNotification);
    };
  }, [currentUser?.id]);

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen || !currentUser) return;
    setIsLoading(true);
    try {
      const inbox = await fetchInbox();
      setNotifications(inbox.notifications);
      setUnreadCount(inbox.unreadCount);
    } catch (error) {
      console.error("Failed to refresh notifications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const markAllRead = async () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    const response = await fetch(`${backendUrl}/api/notifications/read-all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    const readAt = new Date().toISOString();
    setNotifications((previous) => previous.map((item) => ({ ...item, readAt })));
    setUnreadCount(0);
  };

  const openNotification = async (item: InboxNotification) => {
    const token = localStorage.getItem("authToken");
    if (!item.readAt && token) {
      await fetch(`${backendUrl}/api/notifications/${item.id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((previous) =>
        previous.map((notification) =>
          notification.id === item.id
            ? { ...notification, readAt: new Date().toISOString() }
            : notification,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    }
    setOpen(false);
    if (item.bountyId) router.push(`/bounty/${item.bountyId}`);
  };

  if (!currentUser) return null;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={fullWidth ? "outline" : "ghost"}
          size={fullWidth ? "default" : "icon"}
          className={fullWidth ? "w-full justify-start gap-2" : "relative h-9 w-9"}
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {fullWidth && <span>Notifications</span>}
          {unreadCount > 0 && (
            <span className={`flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground ${fullWidth ? "ml-auto h-4" : "absolute -right-1 -top-1 h-4"}`}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <DropdownMenuLabel className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void markAllRead();
              }}
            >
              <Check className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[60vh] overflow-y-auto p-1">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading
            </div>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              You’re all caught up.
            </p>
          ) : (
            notifications.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className="items-start gap-2.5 whitespace-normal px-3 py-2.5"
                onSelect={(event) => {
                  event.preventDefault();
                  void openNotification(item);
                }}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-primary"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="mt-0.5 block wrap-break-word text-xs text-muted-foreground">{item.body}</span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </span>
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}