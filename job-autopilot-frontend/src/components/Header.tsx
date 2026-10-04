import React, { useEffect, useState } from "react";
import { Radar, LogOut, Clock, Globe, Briefcase, Radio, KeyRound, User } from "lucide-react";
import type { Me } from "../types";

interface HeaderProps {
  currentView: string;
  onSelectView: (view: string) => void;
  user: Me;
  onLogout: () => void;
  waitingCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSelectView,
  user,
  onLogout,
  waitingCount,
}) => {
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      setTime(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="topbar">
      <div className="brand-section">
        <div className="brand-logo-mark">
          <Radar size={22} className="text-bg" />
        </div>
        <div className="brand-text">
          <h1>
            Job Autopilot
            <span className="led ok live" title="Autopilot active" />
          </h1>
          <div className="brand-sub">Autonomous Market Radar · Phase 1</div>
        </div>
      </div>

      <nav className="topbar-nav">
        <button
          className={`nav-btn ${currentView === "board" ? "active" : ""}`}
          onClick={() => onSelectView("board")}
        >
          <Globe size={14} />
          Overview
        </button>
        <button
          className={`nav-btn ${currentView === "jobs" ? "active" : ""}`}
          onClick={() => onSelectView("jobs")}
        >
          <Briefcase size={14} />
          Jobs
        </button>
        <button
          className={`nav-btn ${currentView === "sources" ? "active" : ""}`}
          onClick={() => onSelectView("sources")}
        >
          <Radio size={14} />
          Sources
        </button>
        <button
          className={`nav-btn ${currentView === "accounts" ? "active" : ""}`}
          onClick={() => onSelectView("accounts")}
        >
          <KeyRound size={14} />
          Sign-ups
          {waitingCount > 0 && <span className="badge-pip">{waitingCount}</span>}
        </button>
        <button
          className={`nav-btn ${currentView === "me" ? "active" : ""}`}
          onClick={() => onSelectView("me")}
        >
          <User size={14} />
          Profile
        </button>
      </nav>

      <div className="topbar-user">
        <div className="flex items-center gap-1.5 num text-aqua">
          <Clock size={13} />
          <span>{time}</span>
        </div>
        <span className="hidden md:inline text-dim">{user.email}</span>
        <button className="btn-quiet flex items-center gap-1" onClick={onLogout} title="Sign Out">
          <LogOut size={13} />
          <span>Out</span>
        </button>
      </div>
    </header>
  );
};
