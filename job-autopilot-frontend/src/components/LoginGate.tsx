import React, { useState } from "react";
import { Radar, ArrowRight, ShieldCheck } from "lucide-react";
import { api } from "../services/api";
import type { Me } from "../types";

interface LoginGateProps {
  onSuccess: (user: Me) => void;
}

export const LoginGate: React.FC<LoginGateProps> = ({ onSuccess }) => {
  const [isJoining, setIsJoining] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isJoining) {
        if (!fullName.trim()) throw new Error("Please tell us your name");
        if (password.length < 10) throw new Error("Password must be at least 10 characters");
        const res = await api.signup(fullName.trim(), email.trim(), password);
        onSuccess(res.me);
      } else {
        const res = await api.login(email.trim(), password);
        onSuccess(res.me);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[85vh]">
      <div className="frame w-full max-w-[460px] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="brand-logo-mark">
            <Radar size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold font-caps tracking-wider text-white uppercase m-0">
              {isJoining ? "Create Account" : "Sign In to Autopilot"}
            </h2>
            <div className="text-xs font-mono text-dim">
              Unified authentication with Mailnex
            </div>
          </div>
        </div>

        <p className="text-sm text-dim mb-6">
          {isJoining
            ? "One account opens both Autopilot and Mailnex. Choose a secure password you have not used elsewhere."
            : "Sign in with your Mailnex credentials — one sign-in manages both platforms."}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-mono rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isJoining && (
            <div className="form-group">
              <label className="form-label" htmlFor="fullName">
                Your Full Name
              </label>
              <input
                id="fullName"
                type="text"
                className="form-control"
                placeholder="e.g. Alex Morgan"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required={isJoining}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Work or Personal Email
            </label>
            <input
              id="email"
              type="email"
              className="form-control"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password {isJoining && <span className="text-faint">(min 10 chars)</span>}
            </label>
            <input
              id="password"
              type="password"
              className="form-control"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isJoining ? "new-password" : "current-password"}
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full justify-center py-2.5 mt-2"
            disabled={loading}
          >
            {loading ? (
              "Authenticating..."
            ) : (
              <>
                <span>{isJoining ? "Create my account" : "Sign In"}</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800 text-center text-xs font-mono text-faint">
          {isJoining ? "Already have an account?" : "New to the platform?"}{" "}
          <button
            type="button"
            className="text-aqua underline hover:text-white ml-1 bg-transparent border-0 p-0 cursor-pointer"
            onClick={() => {
              setIsJoining(!isJoining);
              setError("");
            }}
          >
            {isJoining ? "Sign in instead" : "Create an account"}
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] font-mono text-slate-500">
          <ShieldCheck size={12} />
          <span>bcrypt hashed · end-to-end encrypted session</span>
        </div>
      </div>
    </div>
  );
};
