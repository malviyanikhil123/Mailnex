import React, { useState, useEffect } from "react";
import { KeyRound, RefreshCw, ExternalLink, Check, Ban } from "lucide-react";
import { api } from "../services/api";
import type { AccountsResponse, AccountNeeded } from "../types";

export const AccountsTab: React.FC = () => {
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadAccounts = async () => {
    try {
      const res = await api.getAccounts();
      setData(res);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await api.scanAccounts();
      setData({
        accounts: res.accounts,
        waiting: res.accounts.filter((x) => x.state === "asking").length,
        blocked: res.accounts
          .filter((x) => x.state === "asking")
          .reduce((n, x) => n + x.jobs_blocked, 0),
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleUpdate = async (id: number, state: "approved" | "created" | "skipped") => {
    setUpdatingId(id);
    try {
      const res = await api.updateAccount(id, state);
      setData({
        accounts: res.accounts,
        waiting: res.accounts.filter((x) => x.state === "asking").length,
        blocked: res.accounts
          .filter((x) => x.state === "asking")
          .reduce((n, x) => n + x.jobs_blocked, 0),
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const accounts = data?.accounts || [];
  const waiting = data?.waiting || 0;
  const blocked = data?.blocked || 0;

  return (
    <div className="space-y-6">
      <div className="frame">
        <div className="frame-head">
          <h2>
            <KeyRound size={15} className="text-warn" />
            Portal Sign-ups Standing in the Way
          </h2>
          <button
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
            onClick={handleScan}
            disabled={scanning}
          >
            <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
            <span>{scanning ? "Scanning Application Portals..." : "Check Again"}</span>
          </button>
        </div>

        <div className="frame-body">
          <p className="text-sm text-ink mb-6">
            {accounts.length ? (
              waiting > 0 ? (
                <>
                  <strong className="text-warn num text-base">{blocked.toLocaleString()}</strong> of
                  your matched jobs cannot be applied to automatically until these portal credentials
                  are configured. Ordered by impact — the number shows how many jobs each unlocked portal
                  grants access to.
                </>
              ) : (
                "All identified portals are settled. Click 'Check Again' after the next sweep to see if new company portals have emerged."
              )
            ) : (
              "No portal bottlenecks analyzed yet. Click 'Check Again' to analyze your matched job queue."
            )}
          </p>

          <div className="space-y-3">
            {accounts.map((acc) => {
              const isSettled = acc.state !== "asking";
              const statusLabel =
                acc.state === "created"
                  ? "Configured / Ready"
                  : acc.state === "approved"
                  ? "Approved"
                  : acc.state === "skipped"
                  ? "Skipped"
                  : "";

              return (
                <div
                  key={acc.id}
                  className={`p-4 rounded border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                    isSettled
                      ? "bg-field/40 border-line/50 opacity-70"
                      : "bg-field border-line hover:border-line-2"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-14 rounded bg-field-2 border border-line flex flex-col items-center justify-center font-mono">
                      <span className="text-xl font-bold text-aqua">
                        {acc.jobs_blocked.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-faint uppercase">jobs</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 font-medium text-white text-base">
                        <span>{acc.label}</span>
                        {isSettled && <span className="tag text-xs">{statusLabel}</span>}
                      </div>
                      <div className="text-xs text-dim mt-1 font-mono">{acc.note || "Required by employer ATS"}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
                    {acc.signup_url && (
                      <a
                        href={acc.signup_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-quiet text-xs py-1.5 px-3 flex items-center gap-1"
                      >
                        <span>Open Portal</span>
                        <ExternalLink size={12} />
                      </a>
                    )}

                    {!isSettled && (
                      <>
                        <button
                          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                          onClick={() => handleUpdate(acc.id, "created")}
                          disabled={updatingId === acc.id}
                        >
                          <Check size={13} />
                          <span>I Have an Account</span>
                        </button>

                        <button
                          className="btn-quiet text-xs py-1.5 px-3 flex items-center gap-1 text-bad hover:border-bad"
                          onClick={() => handleUpdate(acc.id, "skipped")}
                          disabled={updatingId === acc.id}
                        >
                          <Ban size={13} />
                          <span>Skip</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
