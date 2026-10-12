import { useId } from "react";
import { PasswordInput } from "../ui/PasswordInput";
import { APP_PASSWORDS_URL } from "./appPassword";

/** Gmail app password input with Google's "create one" link, the 2-Step hint and an inline error. */
export function AppPasswordField({
  value,
  onChange,
  onBlur,
  error,
  label = "App password",
  placeholder = "App password (16 letters)",
  autoFocus,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <PasswordInput
        aria-label={label}
        toggleLabel="Show app password"
        autoComplete="new-password"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      <p id={`${id}-help`} className="mt-1 text-xs text-gray-500">
        <a
          href={APP_PASSWORDS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#3B82F6] hover:underline dark:text-[#71C9CE]"
        >
          Create an app password
        </a>
        {" · "}Needs 2-Step Verification. Copy the 16-letter password Google shows you.
      </p>
    </div>
  );
}
