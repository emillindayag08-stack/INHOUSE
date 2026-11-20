import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import Layout from "../components/Layout.jsx";
import { BellIcon } from "../components/icons.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const { refresh: refreshUnreadCount } = useNotifications();

  useEffect(() => {
    api
      .get("/dashboard/notifications")
      .then((res) => setNotifications(res.data))
      .finally(() => setLoading(false));
  }, []);

  function markAsRead(id) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    api
      .patch(`/dashboard/notifications/${id}/read`)
      .then(refreshUnreadCount)
      .catch(() => {
        // Roll back the optimistic update if the request failed.
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)));
      });
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Notifications</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Updates on cases you're involved in.</p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Loading…</p>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <BellIcon className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium text-neutral-700">You're all caught up</p>
            <p className="mt-1 text-sm text-neutral-500">No notifications yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {notifications.map((n) => (
              <li
                key={n.id}
                onClick={() => !n.isRead && markAsRead(n.id)}
                className={`flex gap-2.5 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4 ${
                  n.isRead ? "" : "cursor-pointer hover:bg-neutral-50"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    n.isRead ? "bg-neutral-100 text-neutral-400" : "bg-maroon/10 text-maroon"
                  }`}
                >
                  <BellIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm text-neutral-800">{n.message}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
                    <span>{new Date(n.createdAt).toLocaleString()}</span>
                    {n.caseId && (
                      <Link to={`/cases/${n.caseId}`} className="font-medium text-maroon hover:underline">
                        View case
                      </Link>
                    )}
                  </div>
                </div>
                {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-maroon" />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
