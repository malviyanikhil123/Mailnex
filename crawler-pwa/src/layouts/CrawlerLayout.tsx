import { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  Compass,
  Sparkles,
  Activity,
  Users,
  Settings as SettingsIcon,
  Moon,
  Sun,
  LogOut,
} from "lucide-react";
import { useTheme } from "../store/theme.js";
import { useAuth } from "../store/auth.js";
import { PwaInstallBanner } from "../components/PwaInstallBanner.js";

const navItems = [
  { to: "/", label: "Dashboard", icon: Compass, end: true },
  { to: "/discover", label: "Discover", icon: Sparkles },
  { to: "/jobs", label: "Jobs", icon: Activity },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function CrawlerLayout() {
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

  useEffect(() => {
    const handleScroll = (scrollTop: number) => {
      const current = Math.max(0, scrollTop);
      const diff = current - lastScrollY.current;
      if (current <= 20) {
        setNavVisible(true);
      } else if (diff > 8) {
        setNavVisible(false);
      } else if (diff < -8) {
        setNavVisible(true);
      }
      lastScrollY.current = current;
    };

    const onWindowScroll = () => handleScroll(window.scrollY || document.documentElement.scrollTop);
    const onContainerScroll = () => {
      if (mainRef.current) handleScroll(mainRef.current.scrollTop);
    };

    window.addEventListener("scroll", onWindowScroll, { passive: true });
    const mainEl = mainRef.current;
    if (mainEl) mainEl.addEventListener("scroll", onContainerScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onWindowScroll);
      if (mainEl) mainEl.removeEventListener("scroll", onContainerScroll);
    };
  }, []);

  useEffect(() => {
    setNavVisible(true);
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [location.pathname]);

  const desktopNavContent = (
    <>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#BAE6FD] dark:border-[#164549] md:border-none">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#60A5FA] text-white font-black text-base shadow-xs dark:bg-[#71C9CE] dark:text-gray-950">
            <Compass size={20} />
          </div>
          <div>
            <span className="text-lg font-bold text-[#0F172A] dark:text-[#E3FDFD] block leading-tight">
              LeadCrawler
            </span>
            <span className="text-[10px] text-[#334155] dark:text-gray-400 font-medium block">
              Discovery Engine
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-3 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => {
          const isActive = end ? location.pathname === to : location.pathname.startsWith(to);

          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-[#BAE6FD] text-[#0F172A] font-semibold border-l-3 border-[#60A5FA] dark:bg-[#164549] dark:text-[#E3FDFD] dark:border-[#71C9CE]"
                  : "text-[#334155] hover:bg-[#E0F2FE] dark:text-gray-300 dark:hover:bg-[#164549]/60"
              }`}
            >
              <Icon size={18} className={isActive ? "text-[#60A5FA] dark:text-[#71C9CE]" : ""} />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <PwaInstallBanner />

      <div className="border-t border-[#BAE6FD] p-3 dark:border-[#164549]">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#334155] hover:bg-[#E0F2FE] hover:text-red-700 dark:text-gray-300 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition cursor-pointer"
        >
          <LogOut size={18} /> Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-screen bg-[#E0F2FE] dark:bg-[#091517]">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r border-[#BAE6FD] bg-[#F1F5F9] dark:border-[#164549] dark:bg-[#0e2124] shrink-0">
        {desktopNavContent}
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 relative">
        {/* Top Header */}
        <header className="flex h-14 items-center justify-between border-b border-[#BAE6FD] bg-[#F1F5F9] px-4 sm:px-6 dark:border-[#164549] dark:bg-[#0e2124] shrink-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile Brand Logo */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60A5FA] text-white shadow-xs dark:bg-[#71C9CE] dark:text-gray-950">
                <Compass size={16} />
              </div>
              <span className="text-base font-bold text-[#0F172A] dark:text-[#E3FDFD]">
                LeadCrawler
              </span>
            </div>

            {/* User Profile Badge */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E0F2FE] text-xs font-bold text-[#0F172A] border border-[#BAE6FD] dark:bg-[#164549] dark:text-[#E3FDFD] dark:border-transparent shrink-0">
                {(user?.name || user?.email || "C").charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[200px]">
                {user?.name || user?.email || "Admin User"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="rounded-lg p-2 text-gray-700 hover:bg-[#E0F2FE] dark:text-gray-300 dark:hover:bg-[#164549] transition cursor-pointer"
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              onClick={logout}
              className="md:hidden rounded-lg p-2 text-gray-700 hover:text-red-700 hover:bg-red-100 dark:text-gray-300 dark:hover:text-red-400 dark:hover:bg-red-950/40 transition cursor-pointer"
              aria-label="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Main Content View with Responsive Padding */}
        <main ref={mainRef} className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 pb-28 sm:pb-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>

        {/* Mobile Floating Island Capsule Navbar */}
        <nav
          aria-label="Mobile Navigation"
          className={`fixed bottom-4 left-0 right-0 mx-auto z-40 w-[92%] max-w-[440px] md:hidden transition-all duration-300 ease-in-out ${
            navVisible ? "translate-y-0 opacity-100 scale-100" : "translate-y-28 opacity-0 pointer-events-none scale-95"
          }`}
        >
          <div className="flex items-center justify-around bg-[#1e293b]/95 dark:bg-[#081518]/95 backdrop-blur-xl border border-slate-700/60 dark:border-[#164549] shadow-2xl rounded-3xl py-2 px-3">
            {navItems.map(({ to, label, icon: Icon, end }) => {
              const isActive = end ? location.pathname === to : location.pathname.startsWith(to);

              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  aria-label={label}
                  className={`relative flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-200 ${
                    isActive
                      ? "bg-[#BAE6FD] text-gray-950 shadow-md scale-105 dark:bg-[#71C9CE] dark:text-[#061e20]"
                      : "text-slate-400 hover:text-white dark:text-slate-400 dark:hover:text-[#E3FDFD] active:scale-90"
                  }`}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[10px] font-medium mt-0.5">{label}</span>
                  {isActive && (
                    <span className="absolute -bottom-1 h-1 w-1 rounded-full bg-gray-950 dark:bg-[#061e20]" />
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
