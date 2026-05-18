/**
 * ShieldMe UI primitives — thin wrappers around design-system classes.
 * All components are Preact-friendly and rely on styles.css.
 */
import type { ComponentChildren } from "preact";

/* ── Button ─────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "ghost" | "danger";

export function Button({
  variant = "ghost",
  block,
  children,
  disabled,
  onClick,
  "aria-label": ariaLabel,
}: {
  variant?: ButtonVariant;
  block?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  "aria-label"?: string;
  children: ComponentChildren;
}) {
  const classes = [
    "sm-btn",
    `sm-btn--${variant}`,
    block ? "sm-btn--block" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      class={classes}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

/* ── Card ───────────────────────────────────────────────────── */

export function Card({
  title,
  desc,
  children,
  interactive,
  onClick,
}: {
  title?: string;
  desc?: string;
  children?: ComponentChildren;
  interactive?: boolean;
  onClick?: () => void;
}) {
  const classes = ["sm-card", interactive ? "sm-card--interactive" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <section class={classes} onClick={onClick}>
      {title ? <div class="sm-card__title">{title}</div> : null}
      {desc ? <p class="sm-card__desc">{desc}</p> : null}
      {children}
    </section>
  );
}

/* ── Switch ─────────────────────────────────────────────────── */

export function Switch({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <label class="sm-switch">
      <input
        type="checkbox"
        role="switch"
        aria-label={ariaLabel}
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
      />
      <span class="sm-switch__track" />
      <span class="sm-switch__thumb" />
    </label>
  );
}

/* ── Row (labeled item with optional trailing control) ──────── */

export function Row({
  icon,
  title,
  desc,
  trailing,
}: {
  icon?: ComponentChildren;
  title: string;
  desc?: string;
  trailing?: ComponentChildren;
}) {
  return (
    <div class="sm-row">
      {icon ? <span class="sm-row__icon" aria-hidden="true">{icon}</span> : null}
      <div class="sm-row__body">
        <span class="sm-row__title">{title}</span>
        {desc ? <span class="sm-row__desc">{desc}</span> : null}
      </div>
      {trailing}
    </div>
  );
}

/* ── Field (label + input/select) ───────────────────────────── */

export function Field({
  label,
  children,
}: {
  label: string;
  children: ComponentChildren;
}) {
  // Wrap children inside <label> for implicit label association (WCAG 4.1.2).
  // This works for single inputs and selects wrapped by Field.
  return (
    <div class="sm-field">
      <label class="sm-field__label">
        {label}
        {children}
      </label>
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────────── */

export function Badge({
  variant = "free",
  children,
}: {
  variant?: "free" | "soon" | "pro" | "success" | "warning" | "critical";
  children: ComponentChildren;
}) {
  return <span class={`sm-badge sm-badge--${variant}`}>{children}</span>;
}

/* ── Header ─────────────────────────────────────────────────── */

export function Header({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header class="sm-header">
      {eyebrow ? <span class="sm-header__eyebrow">{eyebrow}</span> : null}
      <h2 class="sm-header__title">{title}</h2>
      {subtitle ? <p class="sm-header__subtitle">{subtitle}</p> : null}
    </header>
  );
}

/* ── SectionTitle ───────────────────────────────────────────── */

export function SectionTitle({ children }: { children: ComponentChildren }) {
  return <div class="sm-section-title">{children}</div>;
}
