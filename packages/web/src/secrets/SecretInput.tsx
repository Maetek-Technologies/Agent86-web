import type { Ref } from "react";

/**
 * A masked entry for a secret's value. It is uncontrolled on purpose: the value lives only in the
 * DOM input until `takeValue` reads and clears it, so it never enters React state, props, or
 * anything that is rendered, logged, or saved. Autofill, autocorrect, and spellcheck are off, so
 * the browser neither suggests nor learns it.
 */
export function SecretInput({
  ref,
  id,
  label,
  disabled,
  onInput,
}: {
  ref: Ref<HTMLInputElement>;
  id: string;
  label: string;
  disabled?: boolean;
  onInput?: () => void;
}) {
  return (
    <input
      ref={ref}
      id={id}
      type="password"
      aria-label={label}
      autoComplete="new-password"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-1p-ignore
      data-lpignore="true"
      disabled={disabled}
      onInput={onInput}
      placeholder="value (hidden)"
      className="w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono text-sm disabled:opacity-50"
    />
  );
}

/** Read a masked entry's value and clear it at once. */
export function takeValue(input: HTMLInputElement | null): string {
  if (!input) return "";
  const value = input.value;
  input.value = "";
  return value;
}
