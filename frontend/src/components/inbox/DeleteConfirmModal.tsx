import { AlertTriangle } from "lucide-react";
import { Button } from "../ui/primitives";
import { Modal } from "../ui/Modal";
import type { InboxDeleteResult } from "../../types/api";

/**
 * Delete confirmation.
 *
 * A real dialog rather than window.confirm, because it has to state exactly what
 * happens: this is the only action Mailnex ever performs inside the user's Gmail, and
 * they should not have to guess whether sorting has been touching their mail all along.
 *
 * On a partial failure the dialog STAYS OPEN and names what failed — those messages
 * are back in the inbox and the user needs to know which ones.
 */
export function DeleteConfirmModal({
  count,
  pending,
  result,
  onConfirm,
  onClose,
}: {
  count: number;
  pending: boolean;
  result: InboxDeleteResult | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const hasFailures = !!result && result.failed > 0;

  return (
    <Modal
      title={hasFailures ? "Some emails could not be moved" : `Move ${count} email${count === 1 ? "" : "s"} to Gmail Trash?`}
      onClose={onClose}
    >
      {hasFailures ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {result!.trashed > 0
              ? `${result!.trashed} moved to Trash. ${result!.failed} could not be moved and are back in your inbox.`
              : `None of them could be moved. All ${result!.failed} are back in your inbox — nothing was lost.`}
          </p>
          <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            {result!.failures.map((f) => (
              <li key={f.id} className="flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>{f.error}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button variant="danger" onClick={onConfirm} disabled={pending}>
              {pending ? "Retrying…" : "Try again"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            They will leave your Mailnex inbox and stay recoverable in Gmail&apos;s Trash for 30 days.
          </p>
          <p className="rounded-lg border border-[#BAE6FD] bg-[#E0F2FE] p-3 text-xs text-gray-700 dark:border-[#164549] dark:bg-[#091517] dark:text-gray-400">
            This is the only action Mailnex ever takes inside your Gmail — sorting creates no
            labels and moves nothing else.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm} disabled={pending}>
              {pending ? "Moving…" : "Move to Trash"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
