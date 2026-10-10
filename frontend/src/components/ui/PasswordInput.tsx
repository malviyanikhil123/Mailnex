import { forwardRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./primitives";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Accessible name of the toggle, e.g. "Show app password". */
  toggleLabel?: string;
};

/** Password field with a show/hide toggle. Forwards its ref so react-hook-form's register() works. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className = "", toggleLabel = "Show password", ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input ref={ref} type={visible ? "text" : "password"} className={`pr-10 ${className}`} {...props} />
        <button
          type="button"
          // Keep focus (and the caret) in the input on mouse clicks; keyboard users can still tab here.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setVisible((v) => !v)}
          aria-label={toggleLabel}
          aria-pressed={visible}
          title={visible ? "Hide" : "Show"}
          disabled={props.disabled}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-gray-500 transition hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60A5FA]/60 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100 dark:focus-visible:ring-[#71C9CE]/60"
        >
          {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = "PasswordInput";
