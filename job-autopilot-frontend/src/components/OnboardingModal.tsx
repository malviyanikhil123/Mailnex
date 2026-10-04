import React, { useState, useRef } from "react";
import { UploadCloud, FileText, CheckCircle, X, ArrowRight, Loader2 } from "lucide-react";
import { api } from "../services/api";
import type { Profile, Settings } from "../types";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFinished: (profile: Profile, settings: Settings) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onFinished,
}) => {
  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");
  const [resumeText, setResumeText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (file: File) => {
    setError("");
    setSelectedFile(file);
    setLoading(true);

    try {
      const res = await api.uploadResumeFile(file);
      onFinished(res.profile, res.settings);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to process resume file");
    } finally {
      setLoading(false);
    }
  };

  const handleTextSubmit = async () => {
    if (resumeText.trim().length < 150) {
      setError("Please paste a complete resume with your work history and skills.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await api.submitResumeText(resumeText.trim());
      onFinished(res.profile, res.settings);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to read resume words");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="frame-head">
          <h2>Autonomous Candidate Ingestion</h2>
          <button className="btn-quiet p-1 border-0 hover:text-white" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="frame-body space-y-6">
          <p className="text-sm text-dim m-0">
            Feed your resume into the LLM intelligence engine. It extracts your target role family,
            seniority bracket, years of experience, and hard knockout constraints.
          </p>

          {/* Mode Switcher */}
          <div className="flex gap-2 border-b border-line pb-2">
            <button
              className={`nav-btn ${activeTab === "file" ? "active" : ""}`}
              onClick={() => setActiveTab("file")}
            >
              <UploadCloud size={14} /> Upload Document (.pdf, .docx, .txt)
            </button>
            <button
              className={`nav-btn ${activeTab === "paste" ? "active" : ""}`}
              onClick={() => setActiveTab("paste")}
            >
              <FileText size={14} /> Paste Plain Text
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-mono rounded">
              {error}
            </div>
          )}

          {activeTab === "file" ? (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />

              <div
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud size={36} className="mx-auto text-aqua mb-2 opacity-80" />
                <div className="text-sm font-semibold text-white">
                  {selectedFile ? selectedFile.name : "Click to select or drag your resume file here"}
                </div>
                <div className="text-xs font-mono text-faint mt-1">
                  Supports PDF, Microsoft Word (.docx), or plain text (.txt)
                </div>
              </div>

              {loading && (
                <div className="p-3 text-center text-xs font-mono text-aqua flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Extracting facts, roles and knockout parameters with Gemini...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <textarea
                className="form-control font-mono text-xs h-64 leading-relaxed"
                placeholder="Paste the raw text of your resume here..."
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                disabled={loading}
              />

              <div className="flex items-center justify-end">
                <button
                  className="btn-primary"
                  onClick={handleTextSubmit}
                  disabled={loading || !resumeText.trim()}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Parsing...
                    </span>
                  ) : (
                    <>
                      <span>Analyze Resume Words</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
