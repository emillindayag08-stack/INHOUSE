import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { navForRole } from "../lib/nav.js";
import { accountLabel } from "../lib/constants.js";
import { XIcon } from "./icons.jsx";

// Track the lg breakpoint in JS so the off-canvas transform is only ever
// applied on mobile. Composing Tailwind's `-translate-x-full` with a
// `lg:translate-x-0` override is unreliable (both mutate the same
// --tw-translate-x variable), so on desktop we apply no translate class at all.
function useIsDesktop() {
  const query = "(min-width: 1024px)";
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export default function Sidebar({ open, onClose, unreadCount = 0 }) {
  const { user } = useAuth();
  const items = navForRole(user.role);
  const isDesktop = useIsDesktop();
  const offCanvas = isDesktop ? "" : open ? "translate-x-0" : "-translate-x-full";

  return (
    <>
      {/* Mobile scrim */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-gradient-to-b from-maroon-light via-maroon to-maroon-dark text-white transition-transform duration-300 lg:static ${offCanvas}`}
      >
        {/* Logo + close button */}
        <div className="flex items-center justify-between px-6 py-6">
          <div className="flex flex-col items-center gap-2 w-full">
            <img
              src="/bulsu-logo.png"
              alt="Bulacan State University"
              className="h-16 w-16 object-contain"
            />
            <p className="text-sm font-bold tracking-wide">CODI-IS</p>
          </div>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-md p-1 text-white/80 hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
          >
            <XIcon />
          </button>
        </div>

        {/* Nav */}
        <nav className="mt-2 flex-1 space-y-1 px-4">
          {items.map((item) => {
            const Icon = item.icon;
            const showBadge = item.to === "/notifications" && unreadCount > 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? "bg-white text-maroon shadow-sm"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-maroon">
                    {unreadCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Role footer */}
        <div className="border-t border-white/15 px-6 py-4">
          <p className="text-xs text-white/60">Signed in as</p>
          <p className="truncate text-sm font-medium">{accountLabel(user)}</p>
        </div>
      </aside>
    </>
  );
}
