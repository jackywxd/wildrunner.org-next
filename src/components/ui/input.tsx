import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The members area's text inputs.
 *
 * WHY THIS EXISTS: the string
 * `border border-input bg-background px-3 py-2 text-sm` was hand-copied 17
 * times across 8 files, so `src/components/ui/` held exactly one component
 * (`button`) while every form built its own controls out of the same
 * remembered classes. Changing the focus ring, the disabled state or the
 * height meant finding all 17 — and a copy that had drifted was invisible
 * until somebody put two forms side by side.
 *
 * Deliberately not a design system. It carries the classes that were already
 * being repeated, plus the two things they were missing everywhere: a visible
 * focus ring, and a disabled state that looks disabled. `rounded-none` is
 * explicit rather than inherited, matching `buttonVariants` — the whole
 * members area is square-cornered on purpose and a default radius would show
 * up as one control quietly out of family.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      className={cn(
        "block w-full rounded-none border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "block w-full rounded-none border border-input bg-background px-3 py-2 text-sm",
      "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/** The `<span>` above a control. Its own component only because the size and
 *  colour were being remembered per form alongside the input classes. */
function FieldLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <span className="block text-sm">
      {children}
      {hint && <span className="ml-2 text-xs text-foreground/50">{hint}</span>}
    </span>
  );
}

export { FieldLabel, Input, Textarea };
