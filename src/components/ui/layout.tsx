import type { KeyboardEvent, ReactNode } from "react";
import { IconButton, type IconButtonProps } from "./controls";
import { LOGO } from "./assets";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Vertical toolbar; Up/Down/Home/End move between items. */
export function ToolRail({ label = "Tools", children }: { label?: string; children: ReactNode }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "Home" && k !== "End") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const n = k === "ArrowDown" ? i + 1 : k === "ArrowUp" ? i - 1 : k === "Home" ? 0 : items.length - 1;
    items[(n + items.length) % items.length]?.focus();
    e.preventDefault();
  };
  return (
    <div className="sp-rail" role="toolbar" aria-orientation="vertical" aria-label={label} onKeyDown={onKey}>
      {children}
    </div>
  );
}

export function ToolRailItem(p: IconButtonProps) {
  return <IconButton size="lg" {...p} className={cx("sp-rail__item", p.className)} />;
}

export function Panel({ title, onCollapse, children, className }: { title: string; onCollapse?: () => void; children: ReactNode; className?: string }) {
  return (
    <section className={cx("sp-panel", className)} aria-label={title}>
      <header className="sp-panel__head">
        <h2 className="sp-panel__title">{title}</h2>
        {onCollapse && <IconButton icon="collapse" label={`Collapse ${title.toLowerCase()} panel`} size="sm" onClick={onCollapse} />}
      </header>
      <div className="sp-panel__body">{children}</div>
    </section>
  );
}

export function PanelSection({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("sp-panel__section", className)}>{children}</div>;
}

export function PanelRow({ label, inline, children }: { label: string; inline?: boolean; children: ReactNode }) {
  return (
    <div className={cx("sp-row", inline && "sp-row--inline")} role="group" aria-label={label}>
      <div className="sp-row__label" aria-hidden="true">
        {label}
      </div>
      <div className={cx("sp-row__body", inline && "sp-row__body--inline")}>{children}</div>
    </div>
  );
}

/** The Spits logo. Ink follows `text-primary`, blue follows `text-link`. */
export function Logo({ variant = "wordmark", height }: { variant?: "wordmark" | "mark" | "app-icon"; height?: number }) {
  const h = height ?? (variant === "wordmark" ? 36 : 40);
  const common = { className: "sp-logo", role: "img" as const, "aria-label": "Spits", focusable: "false" as const };
  if (variant === "mark")
    return <svg {...common} viewBox="0 0 56 58" height={h} width={(h * 56) / 58} dangerouslySetInnerHTML={{ __html: LOGO.mark }} />;
  if (variant === "app-icon")
    return <svg {...common} viewBox="0 0 256 256" height={h} width={h} dangerouslySetInnerHTML={{ __html: LOGO.icon }} />;
  return <svg {...common} viewBox={LOGO.wmvb} height={h} width={h * LOGO.ratio} dangerouslySetInnerHTML={{ __html: LOGO.wm }} />;
}
