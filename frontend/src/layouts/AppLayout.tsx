import { useState, useEffect, useRef } from "react";
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

  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  const mainRef = useRef<HTMLElement>(null);

  const logout = () => {
    clear();
    navigate("/login");
  };

  // Scroll detection to auto-hide navbar on scroll down and reveal on scroll up
  useEffect(() => {
    const handleScroll = (scrollTop: number) => {
      const currentScrollY = Math.max(0, scrollTop);
      const diff = currentScrollY - lastScrollY.current;

      if (currentScrollY <= 20) {
        setNavVisible(true);
      } else if (diff > 8) {
        // Scrolling down -> hide navbar
        setNavVisible(false);
      } else if (diff < -8) {
        // Scrolling up -> show navbar
        setNavVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    const onWindowScroll = () => handleScroll(window.scrollY || document.documentElement.scrollTop);
    const onContainerScroll = () => {
      if (mainRef.current) handleScroll(mainRef.current.scrollTop);
    };

    window.addEventListener("scroll", onWindowScroll, { passive: true });
    const mainEl = mainRef.current;
    if (mainEl) {
      mainEl.addEventListener("scroll", onContainerScroll, { passive: true });
    }

    return () => {
      window.removeEventListener("scroll", onWindowScroll);
      if (mainEl) {
        mainEl.removeEventListener("scroll", onContainerScroll);
      }
    };
  }, []);

  // Always show navbar on route change
  useEffect(() => {
    setNavVisible(true);
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  const desktopNavContent = (
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
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 dark:text-gray-300 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition cursor-pointer"
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
        {desktopNavContent}
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 relative">
        {/* Top Header */}
        <header className="flex h-14 items-center justify-between border-b border-[#CBF1F5] bg-white px-4 sm:px-6 dark:border-[#164549] dark:bg-[#0e2124] shrink-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile Brand Logo */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-[#71C9CE] to-[#36888e] text-white font-black text-sm shadow-xs">
                M
              </div>
              <span className="text-base font-bold bg-gradient-to-r from-[#71C9CE] to-[#24666b] dark:from-[#A6E3E9] dark:to-[#71C9CE] bg-clip-text text-transparent">
                Mailnex
              </span>
            </div>

            {/* User Profile Badge */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#CBF1F5] text-xs font-bold text-[#144b50] dark:bg-[#164549] dark:text-[#E3FDFD] shrink-0">
                {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[140px] sm:max-w-[240px]">
                {user?.name || user?.email}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile user initial avatar */}
            <div className="flex sm:hidden h-7 w-7 items-center justify-center rounded-full bg-[#CBF1F5] text-xs font-bold text-[#144b50] dark:bg-[#164549] dark:text-[#E3FDFD] shrink-0">
              {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
            </div>

            <button
              onClick={toggle}
              className="rounded-lg p-2 text-gray-600 hover:bg-[#CBF1F5]/50 dark:text-gray-300 dark:hover:bg-[#164549] transition"
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              onClick={logout}
              className="md:hidden rounded-lg p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 dark:text-gray-300 dark:hover:text-red-400 dark:hover:bg-red-950/40 transition"
              aria-label="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Page Content with Responsive Padding (extra bottom padding for mobile navbar) */}
        <main ref={mainRef} className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 pb-24 sm:pb-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>

        {/* Mobile Floating Island Capsule Navbar */}
        <nav
          aria-label="Mobile Navigation"
          className={`fixed bottom-4 left-0 right-0 mx-auto z-40 w-[92%] max-w-[420px] md:hidden transition-all duration-300 ease-in-out ${
            navVisible ? "translate-y-0 opacity-100 scale-100" : "translate-y-28 opacity-0 pointer-events-none scale-95"
          }`}
        >
          <div className="flex items-center justify-around bg-[#1e293b]/95 dark:bg-[#081518]/95 backdrop-blur-xl border border-slate-700/60 dark:border-[#164549] shadow-2xl rounded-3xl p-1.5 px-2">
            {nav.map(({ to, label, icon: Icon, end }) => {
              const isActive = end
                ? location.pathname === to
                : location.pathname.startsWith(to);

              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  aria-label={label}
                  className={`relative flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-200 ${
                    isActive
                      ? "bg-[#0284c7] dark:bg-[#71C9CE] text-white dark:text-[#061e20] shadow-md scale-105"
                      : "text-slate-400 hover:text-white dark:text-slate-400 dark:hover:text-[#E3FDFD] active:scale-90"
                  }`}
                >
                  <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
                  {isActive && (
                    <span className="absolute -bottom-1 h-1 w-1 rounded-full bg-white dark:bg-[#061e20]" />
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

