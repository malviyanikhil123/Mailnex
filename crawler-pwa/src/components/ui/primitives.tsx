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
  variant?: "primary" | "secondary" | "danger" | "success";
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-[#60A5FA] hover:bg-[#3B82F6] text-white font-semibold shadow-xs transition active:scale-[0.99] dark:bg-[#71C9CE] dark:hover:bg-[#51b2b8] dark:text-gray-950",
    secondary:
      "bg-[#BAE6FD] hover:bg-[#E0F2FE] text-gray-900 border border-[#BAE6FD] font-medium dark:bg-[#164549] dark:text-[#E3FDFD] dark:hover:bg-[#24666b] dark:border-transparent",
    danger: "bg-red-600 hover:bg-red-700 text-white font-medium",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white font-medium",
  };
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm transition disabled:opacity-50 cursor-pointer ${variants[variant]} ${className}`}
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
