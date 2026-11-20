import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { accountLabel } from "../lib/constants.js";
import { ChevronDownIcon, LogOutIcon, MenuIcon, UserIcon } from "./icons.jsx";

export default function Topbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const initials = user.fullName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden"
        aria-label="Open menu"
      >
        <MenuIcon />
      </button>

      <div className="relative ml-auto" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-neutral-100"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-maroon text-xs font-medium text-white">
            {initials}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium text-neutral-800">{user.fullName}</span>
            <span className="block text-xs text-neutral-500">{accountLabel(user)}</span>
          </span>
          <ChevronDownIcon className="h-4 w-4 text-neutral-400" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
            <div className="border-b border-neutral-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-neutral-800">{user.fullName}</p>
              <p className="truncate text-xs text-neutral-500">{user.email}</p>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                navigate("/settings");
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              <UserIcon className="h-4 w-4" /> Profile &amp; Settings
            </button>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOutIcon className="h-4 w-4" /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
