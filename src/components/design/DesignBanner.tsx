/**
 * Marks every screen under /design-preview as what it is: a non-functional
 * clickable prototype for review, not a shipped feature. Gone once Phase D
 * replaces these routes with the real thing.
 */
export function DesignBanner({ title }: { title: string }) {
  return (
    <div className="border-b border-border bg-secondary px-4 py-2 text-xs text-secondary-foreground">
      設計原型 · 非正式功能 · {title}
    </div>
  );
}
