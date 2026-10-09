"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, CheckCheck, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBounty } from "@/lib/bounty-context";
import { backendUrl } from "@/lib/configENV";
import {
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSubscriptionState,
} from "@/lib/push";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

export function NotificationCenter({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { currentUser } = useBounty();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pushState, setPushState] =
    useState<PushSubscriptionState>("available");
  const [pushBusy, setPushBusy] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      const res = await fetch(`${backendUrl}/api/notifications?limit=30`, {
        headers: authHeaders(),
      });

      if (!res.ok) {
        throw new Error("Failed to load notifications");
      }

      const data = (await res.json()) as NotificationResponse;
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (error) {
      console.error("Notification load failed:", error);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, currentUser]);

  const refreshPushState = useCallback(async () => {
    try {
      setPushState(await getPushSubscriptionState());
    } catch (error) {
      console.error("Push state check failed:", error);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    loadNotifications();
    refreshPushState();

    const interval = window.setInterval(loadNotifications, 60_000);
    const handleFocus = () => loadNotifications();
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [currentUser?.id, loadNotifications, refreshPushState]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      loadNotifications();
      refreshPushState();
    }
  };

  const markRead = async (notification: NotificationItem) => {
    if (notification.readAt) return;

    const readAt = new Date().toISOString();
    setNotifications((items) =>
      items.map((item) =>
        item.id === notification.id ? { ...item, readAt } : item,
      ),
    );
    setUnreadCount((count) => Math.max(0, count - 1));

    try {
      const res = await fetch(
        `${backendUrl}/api/notifications/${notification.id}/read`,
        {
          method: "PATCH",
          headers: authHeaders(),
        },
      );

      if (!res.ok) throw new Error("Failed to mark notification as read");
    } catch (error) {
      console.error(error);
      loadNotifications();
    }
  };

  const markAllRead = async () => {
    if (!unreadCount) return;

    const previousNotifications = notifications;
    const previousCount = unreadCount;
    const readAt = new Date().toISOString();

    setNotifications((items) =>
      items.map((item) => (item.readAt ? item : { ...item, readAt })),
    );
    setUnreadCount(0);

    try {
      const res = await fetch(`${backendUrl}/api/notifications/read-all`, {
        method: "PATCH",
        headers: authHeaders(),
      });

      if (!res.ok) throw new Error("Failed to mark all notifications as read");
    } catch (error) {
      console.error(error);
      setNotifications(previousNotifications);
      setUnreadCount(previousCount);
      toast.error("Could not mark notifications as read");
    }
  };

  const openNotification = (notification: NotificationItem) => {
    markRead(notification);
    setOpen(false);
    onNavigate?.();

    if (notification.url?.startsWith("/")) {
      router.push(notification.url);
    }
  };

  const enableBrowserAlerts = async () => {
    setPushBusy(true);
    try {
      await subscribeToPush();
      await refreshPushState();
      toast.success("Browser notifications enabled");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not enable notifications";
      toast.error(message);
      await refreshPushState();
    } finally {
      setPushBusy(false);
    }
  };

  const disableBrowserAlerts = async () => {
    setPushBusy(true);
    try {
      await unsubscribeFromPush();
      await refreshPushState();
      toast.success("Browser notifications disabled");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not disable notifications";
      toast.error(message);
      await refreshPushState();
    } finally {
      setPushBusy(false);
    }
  };

  const pushCopy = {
    subscribed: "Browser alerts enabled",
    available: "Browser alerts are off",
    blocked: "Browser alerts are blocked",
    unsupported: "Browser alerts are unsupported",
  }[pushState];

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={mobile ? "outline" : "ghost"}
          size={mobile ? "default" : "icon"}
          className={cn(
            "relative",
            mobile ? "w-full gap-2 justify-start" : "h-9 w-9",
          )}
          aria-label={
            unreadCount
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Bell className="h-4 w-4" />
          {mobile && <span>Notifications</span>}
          {unreadCount > 0 && (
            <span
              className={cn(
                "flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground",
                mobile
                  ? "ml-auto"
                  : "absolute -right-0.5 -top-0.5 border-2 border-background",
              )}
              aria-hidden="true"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(92vw,390px)] p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Notifications</h2>
            <p className="text-xs text-muted-foreground">
              {unreadCount
                ? `${unreadCount} unread`
                : "You're all caught up"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={markAllRead}
            disabled={!unreadCount}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>

        <ScrollArea className="h-[min(55vh,360px)]">
          {loading && notifications.length === 0 ? (
            <div className="flex h-28 items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex h-28 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
              <Bell className="h-5 w-5" />
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={cn(
                    "relative w-full px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    !notification.readAt && "bg-primary/5",
                  )}
                >
                  <div className="flex gap-3">
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        notification.readAt
                          ? "bg-muted-foreground/25"
                          : "bg-primary",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">
                        {notification.title}
                      </p>
                      {notification.body && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {notification.body}
                        </p>
                      )}
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium">{pushCopy}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {pushState === "blocked"
                  ? "Allow notifications in your browser settings to retry."
                  : pushState === "subscribed"
                    ? "You can receive alerts even when this tab is closed."
                    : "Enable alerts for bounty updates outside the app."}
              </p>
            </div>

            {pushState === "subscribed" ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={disableBrowserAlerts}
                disabled={pushBusy}
              >
                {pushBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Disable"
                )}
              </Button>
            ) : pushState === "available" ? (
              <Button
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={enableBrowserAlerts}
                disabled={pushBusy}
              >
                {pushBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Enable"
                )}
              </Button>
            ) : (
              <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
