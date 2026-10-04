import { useCallback, useEffect, useRef, useState } from "react";
import { inboxApi } from "../services/inbox.api";
import type { InboxJobProgress } from "../types/api";

const POLL_MS = 1000;

/**
 * Polls a backend job's progress.
 *
 * The important behavior is the 404 handling: job progress lives in an in-memory map
 * on the server, so a restart (or the 5-minute eviction) makes the entry vanish. A
 * naive poller spins forever on a spinner that will never resolve. Here a 404 means
 * "finished or lost" — we stop, report it, and let the caller refetch its data.
 */
export function useJobProgress(onFinished?: (p: InboxJobProgress | null) => void) {
  const [progress, setProgress] = useState<InboxJobProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setIsRunning(false);
  }, []);

  const start = useCallback(
    (jobId: string) => {
      stop();
      setProgress({ jobId, kind: "sync", phase: "starting", processed: 0, total: 0, done: false });
      setIsRunning(true);

      timer.current = setInterval(async () => {
        try {
          const p = await inboxApi.jobProgress(jobId);
          setProgress(p);
          if (p.done) {
            stop();
            finishedRef.current?.(p);
          }
        } catch {
          // 404 (or any read failure): the job is done or its record is gone. Either
          // way there is nothing left to wait for.
          stop();
          setProgress(null);
          finishedRef.current?.(null);
        }
      }, POLL_MS);
    },
    [stop],
  );

  // Never leave an interval running after the page unmounts.
  useEffect(() => stop, [stop]);

  return { start, stop, progress, isRunning };
}
