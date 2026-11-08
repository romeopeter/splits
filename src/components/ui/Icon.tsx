import { ICONS } from "./assets";

export interface IconProps {
  name: string;
  size?: number;
  /** Only when the icon stands alone and carries meaning. */
  title?: string;
  strokeWidth?: number;
  className?: string;
}

/** The Spits icon set: 24px grid, 1.5px stroke, `currentColor`. */
export function Icon({ name, size = 20, title, strokeWidth = 1.5, className }: IconProps) {
  const [markup, filled] = ICONS[name] ?? ["", 0];
  return (
    <svg
      className={["sp-icon", className].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
