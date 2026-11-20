import { useState } from "react";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import KodiFaq from "./KodiFaq.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";

// fill: the page fills the window instead of growing past it, so its own
// panels scroll rather than the whole layout sliding out of view. Opt-in and
// only from lg up — on a phone a fitted layout would just trap content.
// main is relative so absolutely positioned children (sr-only labels) stay
// inside its scroll area instead of stretching the whole document.
export default function Layout({ children, fill = false }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { unreadCount } = useNotifications();

  return (
    <div className="flex h-dvh overflow-hidden bg-maroon-dark">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        unreadCount={unreadCount}
      />
      <div className="flex flex-1 flex-col overflow-hidden bg-neutral-100">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main
          className={`relative flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 ${
            fill ? "lg:overflow-hidden" : ""
          }`}
        >
          <div className={`mx-auto max-w-6xl ${fill ? "lg:flex lg:h-full lg:min-h-0 lg:flex-col" : ""}`}>
            {children}
          </div>
        </main>
      </div>
      <KodiFaq />
    </div>
  );
}
