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
      "bg-[#60A5FA] hover:bg-[#3B82F6] text-white font-semibold shadow-xs transition active:scale-[0.99] dark:bg-[#71C9CE] dark:hover:bg-[#51b2b8] dark:text-gray-950",
    secondary:
      "bg-[#BAE6FD] hover:bg-[#E0F2FE] text-gray-900 border border-[#BAE6FD] font-medium dark:bg-[#164549] dark:text-[#E3FDFD] dark:hover:bg-[#24666b] dark:border-transparent",
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
      className={`rounded-xl border border-[#BAE6FD] bg-[#F1F5F9] p-5 shadow-xs dark:border-[#164549] dark:bg-[#0e2124] ${className}`}
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
      className={`w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm outline-none focus:border-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA]/30 dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100 dark:focus:border-[#71C9CE] dark:focus:ring-[#71C9CE]/30 ${className}`}
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
      className={`w-full rounded-lg border border-[#BAE6FD] bg-[#F1F5F9] px-3 py-2 text-sm outline-none focus:border-[#60A5FA] focus:ring-2 focus:ring-[#60A5FA]/30 dark:border-[#164549] dark:bg-[#12282c] dark:text-gray-100 dark:focus:border-[#71C9CE] dark:focus:ring-[#71C9CE]/30 ${className}`}
      {...props}
    />
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#BAE6FD] border-t-[#60A5FA] dark:border-[#164549] dark:border-t-[#71C9CE]" />
    </div>
  );
}

const statusColors: Record<string, string> = {
  PENDING: "bg-[#BAE6FD] text-[#0F172A] border border-[#7dd3fc] dark:bg-[#122b2f] dark:text-[#A6E3E9] dark:border-transparent",
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
  const color = statusColors[status] ?? "bg-[#BAE6FD] text-[#0F172A]";
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
