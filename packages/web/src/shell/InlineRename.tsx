import { useEffect, useRef, useState } from "react";
import { cleanTitle, TITLE_MAX } from "../threads/storage.ts";

/** Where a new name is kept, for the editor's tooltip. */
export const RENAME_HINT =
  "Enter saves, Esc cancels. agent86 1.0.17 or later keeps the name; with older versions it is kept in this browser.";

/** A name being edited in place: Enter (or leaving the field) saves, Esc cancels. */
export function InlineRename({
  initial,
  label,
  onSave,
  onCancel,
  className = "",
}: {
  initial: string;
  label: string;
  onSave: (title: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const title = cleanTitle(value);
    if (save && title && title !== initial) onSave(title);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      aria-label={label}
      title={RENAME_HINT}
      value={value}
      maxLength={TITLE_MAX}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      onClick={(event) => event.stopPropagation()}
      className={`min-w-0 rounded border border-accent bg-bg px-1 text-sm text-text outline-none ${className}`}
    />
  );
}
