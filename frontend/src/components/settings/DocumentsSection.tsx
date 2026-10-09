import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../../services/settings.api";
import { Button, Card, Input, Spinner } from "../ui/primitives";
import { toast } from "../../store/toast";
import type { DocumentLimits } from "../../types/api";
import { errorMessage, SectionHeader } from "./shared";

const MB = 1024 * 1024;
const formatMb = (bytes: number) => `${Number((bytes / MB).toFixed(1))} MB`;

/** Why a picked file can't be uploaded, or null. The server runs the same checks (and more). */
function fileProblem(file: File, limits: DocumentLimits): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (!limits.extensions.includes(ext)) {
    return `"${file.name}" isn't a supported file type. Allowed: ${limits.extensions.join(", ")}.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > limits.maxBytes) {
    return `"${file.name}" is ${formatMb(file.size)}. Documents can be up to ${formatMb(limits.maxBytes)}.`;
  }
  return null;
}

/** Files templates can attach to emails, with the per-user count and size limits. */
export function DocumentsSection() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["documents"],
    queryFn: settingsApi.listDocuments,
  });
  const documents = data?.documents ?? [];
  const limits = data?.limits;
  const full = !!limits && documents.length >= limits.maxDocuments;

  const clearFile = () => {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const pick = (picked: File | undefined) => {
    if (!picked || !limits) return;
    const problem = fileProblem(picked, limits);
    if (problem) {
      toast.error(problem);
      clearFile();
      return;
    }
    setFile(picked);
  };

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("No file selected");
      return settingsApi.uploadDocument(file, name.trim() || undefined);
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      setName("");
      clearFile();
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err) => {
      const tooLarge = (err as { response?: { status?: number } })?.response?.status === 413;
      toast.error(errorMessage(err, tooLarge ? "This file is too large." : "Upload failed"));
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => settingsApi.deleteDocument(id),
    onSuccess: () => {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to delete document")),
  });

  return (
    <Card>
      <SectionHeader
        title="Documents"
        badge={limits ? `${documents.length} / ${limits.maxDocuments} used` : undefined}
      />
      <p className="text-xs text-gray-500 mb-4">
        Files you can attach to emails: brochures, price lists, portfolios, CVs… Pick one for a template under
        Templates → Attach document.
        {limits &&
          ` Up to ${limits.maxDocuments} files, ${formatMb(limits.maxBytes)} each (${limits.extensions
            .map((e) => e.toUpperCase())
            .join(", ")}).`}
      </p>

      {isLoading ? (
        <Spinner />
      ) : isError || !limits ? (
        <div className="text-center py-6 text-xs text-red-600">Couldn't load your documents.</div>
      ) : (
        <>
          {/* Upload Box */}
          <div className="rounded-xl border border-dashed border-[#BAE6FD] bg-[#F1F5F9] p-4 dark:border-[#164549] dark:bg-[#0e2124]/40 mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-1">
                <label
                  htmlFor="document-name"
                  className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
                >
                  Document name
                </label>
                <Input
                  id="document-name"
                  placeholder="e.g. 2026 price list"
                  maxLength={100}
                  value={name}
                  disabled={full}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="sm:col-span-1">
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">File</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept={limits.extensions.map((e) => `.${e}`).join(",")}
                  className="hidden"
                  data-testid="document-file"
                  onChange={(e) => pick(e.target.files?.[0])}
                />
                <Button
                  variant="secondary"
                  className="w-full truncate text-xs"
                  disabled={full}
                  onClick={() => fileRef.current?.click()}
                >
                  {file ? `📄 ${file.name}` : "Choose file…"}
                </Button>
              </div>

              <div className="sm:col-span-1">
                <Button
                  className="w-full text-xs"
                  disabled={full || upload.isPending || !file}
                  onClick={() => upload.mutate()}
                >
                  {upload.isPending ? "Uploading…" : "+ Add document"}
                </Button>
              </div>
            </div>
            {full && (
              <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-400">
                You've reached the limit of {limits.maxDocuments} documents. Delete one to add another.
              </p>
            )}
          </div>

          {/* Documents List */}
          {documents.length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-500">
              No documents yet. Add a file above, then attach it to a template.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-[#BAE6FD]/70 bg-[#F1F5F9] dark:border-gray-800 dark:bg-gray-800/40"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">📄</span>
                      <span className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">
                        {d.name}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">
                      {d.fileName} • {new Date(d.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      confirm(`Delete "${d.name}"? Templates that attach it will send without an attachment.`) &&
                      remove.mutate(d.id)
                    }
                    className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
