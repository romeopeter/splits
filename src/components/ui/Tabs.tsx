/**
 * Tabs inside an inspector panel (AGENTS.md: the selection opens its panel,
 * with tabs for its properties).
 *
 * The design system has no Tabs component, so this one borrows the
 * SegmentedControl's look (`sp-seg`) but has tab semantics: a `tablist` of
 * `tab`s controlling one `tabpanel`, per the WAI-ARIA tabs pattern with
 * automatic activation. Left and Right (and Home and End) move between tabs
 * and show them at once; Tab moves on into the panel.
 *
 * The bar sticks to the top of the panel's scroll area, so the tabs stay in
 * reach on a long tab.
 */
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem<T extends string> {
  id: T;
  text: string;
}

export interface TabsProps<T extends string> {
  /** Names the tab list for assistive technology, such as "Clip settings". */
  label: string;
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Shown above the tab list inside the sticky bar, such as the clip's name and times. */
  header?: ReactNode;
  children: ReactNode;
}

export function Tabs<T extends string>({ label, tabs, value, onChange, header, children }: TabsProps<T>) {
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  const tabId = (id: T) => `${base}-tab-${id}`;
  const panelId = `${base}-panel`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = Math.max(0, tabs.findIndex((t) => t.id === value));
    const last = tabs.length - 1;
    const n = { ArrowLeft: i === 0 ? last : i - 1, ArrowRight: i === last ? 0 : i + 1, Home: 0, End: last }[e.key];
    if (n === undefined) return;
    // These keys belong to the tabs here, not to the timeline's shortcuts.
    e.preventDefault();
    e.stopPropagation();
    const next = tabs[n];
    if (!next) return;
    onChange(next.id);
    list.current?.querySelectorAll<HTMLElement>("[role=tab]")[n]?.focus();
  };

  return (
    <>
      <div className="sp-panel__section sp-tabs__bar">
        {header}
        <div ref={list} className="sp-seg sp-tabs__list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
          {tabs.map((t) => {
            const on = t.id === value;
            return (
              <button
                key={t.id}
                id={tabId(t.id)}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={panelId}
                tabIndex={on ? 0 : -1}
                className="sp-seg__item"
                onClick={() => onChange(t.id)}
              >
                {t.text}
              </button>
            );
          })}
        </div>
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(value)} className="sp-tabs__panel">
        {children}
      </div>
    </>
  );
}
