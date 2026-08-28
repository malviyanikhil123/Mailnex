import { useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  FileText,
  Send,
  ScrollText,
  BarChart3,
  Settings as SettingsIcon,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useTheme } from "../store/theme";
import { useAuth } from "../store/auth";
import { PwaInstallBanner } from "../components/PwaInstallBanner";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/templates", label: "Templates", icon: FileText },
  { to: "/campaign", label: "Campaign", icon: Send },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppLayout() {
  const { dark, toggle } = useTheme();
  const { user, clear } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logout = () => {
    clear();
    navigate("/login");
  };

  const closeMobile = () => setMobileOpen(false);

  const navContent = (
    <>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#CBF1F5]/60 dark:border-[#164549] md:border-none">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-[#71C9CE] to-[#36888e] text-white font-black text-base shadow-xs">
            M
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-[#71C9CE] to-[#24666b] dark:from-[#A6E3E9] dark:to-[#71C9CE] bg-clip-text text-transparent">
            Mailnex
          </span>
        </div>
        <button
          onClick={closeMobile}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-[#CBF1F5]/50 dark:hover:bg-[#164549] md:hidden"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-3 overflow-y-auto">
        {nav.map(({ to, label, icon: Icon, end }) => {
          const isActive = end
            ? location.pathname === to
            : location.pathname.startsWith(to);

          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={closeMobile}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-[#E3FDFD] text-[#144b50] dark:bg-[#164549] dark:text-[#E3FDFD] font-semibold border-l-3 border-[#71C9CE]"
                  : "text-gray-600 hover:bg-[#CBF1F5]/40 dark:text-gray-300 dark:hover:bg-[#164549]/60"
              }`}
            >
              <Icon size={18} className={isActive ? "text-[#71C9CE] dark:text-[#A6E3E9]" : ""} />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <PwaInstallBanner />

      <div className="border-t border-[#CBF1F5]/60 p-3 dark:border-[#164549]">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 dark:text-gray-300 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition"
        >
          <LogOut size={18} /> Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-screen bg-[#f4fcfc] dark:bg-[#091517]">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r border-[#CBF1F5] bg-white dark:border-[#164549] dark:bg-[#0e2124] shrink-0">
        {navContent}
      </aside>

      {/* Mobile Slide-over Drawer & Backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={closeMobile}
          />
          <div className="relative flex w-4/5 max-w-xs flex-1 flex-col bg-white dark:bg-[#0e2124] shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {navContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top Header */}
        <header className="flex h-14 items-center justify-between border-b border-[#CBF1F5] bg-white px-4 sm:px-6 dark:border-[#164549] dark:bg-[#0e2124] shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-gray-600 hover:bg-[#CBF1F5]/50 dark:text-gray-300 dark:hover:bg-[#164549] md:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            {/* User Profile Badge */}
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#CBF1F5] text-xs font-bold text-[#144b50] dark:bg-[#164549] dark:text-[#E3FDFD] shrink-0">
                {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[140px] sm:max-w-[240px]">
                {user?.name || user?.email}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="rounded-lg p-2 text-gray-600 hover:bg-[#CBF1F5]/50 dark:text-gray-300 dark:hover:bg-[#164549]"
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        {/* Page Content with Responsive Padding */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 md:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
