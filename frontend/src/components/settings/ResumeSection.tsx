import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../../services/settings.api";
import { Button, Card, Input, Spinner } from "../ui/primitives";
import { toast } from "../../store/toast";
import { SectionHeader } from "./shared";

export function ResumeSection({ fileName: _fileName, onSaved }: { fileName: string | null; onSaved: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [resumeName, setResumeName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: resumes = [], isLoading } = useQuery({
    queryKey: ["resumes"],
    queryFn: settingsApi.listResumes,
  });

  const upload = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error("No file selected");
      return settingsApi.uploadResumeFile(selectedFile, resumeName.trim() || undefined);
    },
    onSuccess: () => {
      toast.success("Resume uploaded successfully");
      setResumeName("");
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["resumes"] });
      onSaved();
    },
    onError: () => toast.error("Failed to upload resume"),
  });

  const remove = useMutation({
    mutationFn: (id: number) => settingsApi.deleteResume(id),
    onSuccess: () => {
      toast.success("Resume deleted");
      qc.invalidateQueries({ queryKey: ["resumes"] });
      qc.invalidateQueries({ queryKey: ["templates"] });
      onSaved();
    },
    onError: () => toast.error("Failed to delete resume"),
  });

  return (
    <Card>
      <SectionHeader
        title="Resumes & CVs"
        badge={resumes.length > 0 ? `${resumes.length} Uploaded` : "No resumes"}
      />
      <p className="text-xs text-gray-500 mb-4">
        Upload multiple targeted resumes (e.g., Full Stack, Backend, Frontend). You can link specific resumes to specific templates in the Templates tab.
      </p>

      {/* Upload Box */}
      <div className="rounded-xl border border-dashed border-[#BAE6FD] bg-[#F1F5F9] p-4 dark:border-[#164549] dark:bg-[#0e2124]/40 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Resume Label / Role
            </label>
            <Input
              placeholder="e.g. Full Stack Developer"
              value={resumeName}
              onChange={(e) => setResumeName(e.target.value)}
            />
          </div>

          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              PDF Document
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])}
            />
            <Button
              variant="secondary"
              className="w-full truncate text-xs"
              onClick={() => fileRef.current?.click()}
            >
              {selectedFile ? `📄 ${selectedFile.name}` : "Choose PDF…"}
            </Button>
          </div>

          <div className="sm:col-span-1">
            <Button
              className="w-full text-xs"
              disabled={upload.isPending || !selectedFile}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? "Uploading…" : "+ Add Resume"}
            </Button>
          </div>
        </div>
      </div>

      {/* Resumes List */}
      {isLoading ? (
        <Spinner />
      ) : resumes.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-500">
          No resumes uploaded yet. Add your first resume above to connect it with outreach templates.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {resumes.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between p-3 rounded-lg border border-[#BAE6FD]/70 bg-[#F1F5F9] dark:border-gray-800 dark:bg-gray-800/40"
            >
              <div className="min-w-0 flex-1 pr-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">📄</span>
                  <span className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">
                    {r.name}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">
                  {r.fileName} • {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>

              <button
                type="button"
                onClick={() => confirm(`Delete resume "${r.name}"?`) && remove.mutate(r.id)}
                className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
