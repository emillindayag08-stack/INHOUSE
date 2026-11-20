import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "./AuthContext.jsx";

// Shared unread-notification count so the Sidebar badge and the Notifications
// page stay in sync — without this, marking a notification read on the page
// has no way to tell the Sidebar (which only fetched its count once on mount).
const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    api
      .get("/dashboard/notifications")
      .then((res) => setUnreadCount(res.data.filter((n) => !n.isRead).length))
      .catch(() => setUnreadCount(0));
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, refresh }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
