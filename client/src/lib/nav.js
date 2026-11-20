import {
  DashboardIcon,
  CasesIcon,
  FilePlusIcon,
  UserPlusIcon,
  CalendarIcon,
  BellIcon,
  SettingsIcon,
  ChartIcon,
  HistoryIcon,
  FolderIcon,
  UserIcon,
  MessageIcon,
} from "../components/icons.jsx";

// Role-aware navigation. Every entry maps to a real, working route so there
// are no dead links. `roles: null` means visible to everyone.
export const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: DashboardIcon, roles: null, end: true },
  {
    to: "/complaints/new",
    label: "File a Complaint",
    icon: FilePlusIcon,
    roles: ["PARTY"],
  },
  { to: "/cases", label: "Cases", icon: CasesIcon, roles: null },
  {
    to: "/reports",
    label: "Reports",
    icon: ChartIcon,
    roles: ["SECRETARIAT", "CHAIRPERSON", "COMMITTEE", "DISCIPLINING_AUTHORITY"],
  },
  {
    // Every file on the system, as a body of records rather than scattered
    // through cases. Staff only — the listing crosses cases.
    to: "/records",
    label: "Records",
    icon: FolderIcon,
    roles: ["SECRETARIAT", "CHAIRPERSON", "COMMITTEE"],
  },
  {
    // Oversight: the Chairperson reviews what was done, the Secretariat is
    // accountable for the record. Nobody else, including the Committee.
    to: "/audit",
    label: "Audit Log",
    icon: HistoryIcon,
    roles: ["CHAIRPERSON", "SECRETARIAT"],
  },
  {
    // Who tried to sign in, and whether it worked. Same two roles as the audit log.
    to: "/login-attempts",
    label: "Login Attempts",
    icon: UserIcon,
    roles: ["CHAIRPERSON", "SECRETARIAT"],
  },
  {
    to: "/accounts",
    label: "Committee Accounts",
    icon: UserPlusIcon,
    roles: ["SECRETARIAT"],
  },
  {
    // The questions KODI answers. Everyone reads them; the Secretariat edits them.
    to: "/faqs",
    label: "FAQs",
    icon: MessageIcon,
    roles: ["SECRETARIAT"],
  },
  {
    to: "/calendar",
    label: "Calendar",
    icon: CalendarIcon,
    roles: ["PARTY", "SECRETARIAT", "CHAIRPERSON", "COMMITTEE"],
  },
  { to: "/notifications", label: "Notifications", icon: BellIcon, roles: null },
  { to: "/settings", label: "Settings", icon: SettingsIcon, roles: null },
];

export function navForRole(role) {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
