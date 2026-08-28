import { forwardRef } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-[#71C9CE] hover:bg-[#51b2b8] text-gray-950 font-semibold shadow-xs transition active:scale-[0.99]",
    secondary:
      "bg-[#CBF1F5]/70 hover:bg-[#A6E3E9] text-[#144b50] font-medium dark:bg-[#164549] dark:text-[#E3FDFD] dark:hover:bg-[#24666b]",
    danger: "bg-red-600 hover:bg-red-700 text-white font-medium",
  };
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm transition disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[#CBF1F5] bg-white p-5 shadow-xs dark:border-[#164549] dark:bg-[#0e2124] ${className}`}
    >
      {children}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className = "", ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-[#CBF1F5] bg-white px-3 py-2 text-sm outline-none focus:border-[#71C9CE] focus:ring-2 focus:ring-[#71C9CE]/30 dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100 ${className}`}
      {...props}
    />
  );
});

Input.displayName = "Input";

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-[#CBF1F5] bg-white px-3 py-2 text-sm outline-none focus:border-[#71C9CE] focus:ring-2 focus:ring-[#71C9CE]/30 dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100 ${className}`}
      {...props}
    />
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#CBF1F5] border-t-[#71C9CE]" />
    </div>
  );
}

const statusColors: Record<string, string> = {
  PENDING: "bg-[#E3FDFD] text-[#164549] border border-[#A6E3E9] dark:bg-[#122b2f] dark:text-[#A6E3E9]",
  PROCESSING: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  SENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  BOUNCED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  PAUSED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  GENERATED: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  RETRY_SCHEDULED: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  SKIPPED: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export function StatusBadge({ status }: { status: string }) {
  const color = statusColors[status] ?? "bg-[#E3FDFD] text-[#164549]";
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}
    >
      {status}
    </span>
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
      {message ?? "Something went wrong."}
    </div>
  );
}
