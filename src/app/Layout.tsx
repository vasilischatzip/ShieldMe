/**
 * Layout shell — persistent left sidebar + main canvas.
 *
 * Desktop: 240 px sticky sidebar with sectioned nav + brand mark.
 * Mobile (≤768px): sidebar slides in from the left; hamburger in topbar.
 * Colours, fonts, and spacing come from src/ui/tokens via styles.modern.css.
 */
import type { ComponentChildren, JSX } from "preact";
import { useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { link, stripBase } from "./base";

type NavEntry = { path: string; label: string; Icon: () => JSX.Element };
type NavSection = { label: string; items: NavEntry[] };

const SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { path: "/", label: "Dashboard", Icon: IcoHome },
    ],
  },
  {
    label: "Scan",
    items: [
      { path: "/scan",  label: "Document Check", Icon: IcoFile },
      { path: "/email", label: "Email Scanner",  Icon: IcoMail },
    ],
  },
  {
    label: "Cloud",
    items: [
      { path: "/cloud",    label: "Cloud Audit",    Icon: IcoCloud },
      { path: "/calendar", label: "Calendar Audit", Icon: IcoCalendar },
    ],
  },
  {
    label: "Monitor & Configure",
    items: [
      { path: "/radar",   label: "Exposure Radar",   Icon: IcoRadar },
      { path: "/rules",   label: "Protection Rules", Icon: IcoShield },
      { path: "/toolkit", label: "Privacy Toolkit",  Icon: IcoTool },
    ],
  },
];

export function Layout({ children }: { children: ComponentChildren }) {
  const loc = useLocation();
  const here = stripBase(loc.path);
  const [open, setOpen] = useState(false);

  function active(path: string) {
    return path === "/" ? here === "/" : here.startsWith(path);
  }

  function NavLink({ path, label, Icon }: NavEntry) {
    const isActive = active(path);
    return (
      <a
        href={link(path)}
        class={"app-sidebar__link" + (isActive ? " is-active" : "")}
        aria-current={isActive ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <span class="app-sidebar__icon" aria-hidden="true"><Icon /></span>
        {label}
      </a>
    );
  }

  return (
    <div class="app-shell">

      {/* ── Mobile topbar (hidden on desktop) ─────────────── */}
      <div class="app-topbar" aria-label="Mobile header">
        <button
          type="button"
          class="app-topbar__menu"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="app-sidebar"
          onClick={() => setOpen(o => !o)}
        >
          {open ? <IcoX /> : <IcoMenu />}
        </button>
        <a href={link("/")} class="app-topbar__brand" aria-label="ShieldMe — Home">
          <ShieldLogo />
          <span class="app-topbar__brand-text">ShieldMe</span>
        </a>
      </div>

      {/* ── Mobile sidebar overlay ─────────────────────────── */}
      {open && (
        <div
          class="app-sidebar-overlay"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside
        id="app-sidebar"
        class={"app-sidebar" + (open ? " is-open" : "")}
        aria-label="Primary navigation"
      >
        <a
          href={link("/")}
          class="app-sidebar__brand"
          aria-label="ShieldMe — Home"
          onClick={() => setOpen(false)}
        >
          <ShieldLogo />
          <span class="app-sidebar__brand-text">ShieldMe</span>
        </a>

        <nav class="app-sidebar__nav" aria-label="Primary">
          {SECTIONS.map(({ label, items }) => (
            <div class="app-sidebar__group">
              <span class="app-sidebar__group-label">{label}</span>
              {items.map(entry => <NavLink key={entry.path} {...entry} />)}
            </div>
          ))}
        </nav>

        <div class="app-sidebar__bottom">
          <NavLink path="/settings" label="Settings" Icon={IcoSettings} />
          <p class="app-sidebar__tagline">Nothing leaves your device.</p>
        </div>
      </aside>

      {/* ── Main canvas ────────────────────────────────────── */}
      <main class="app-main" role="main">
        {children}
      </main>

    </div>
  );
}

/* ── Brand mark ──────────────────────────────────────────── */

function ShieldLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="26"
      height="26"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 2L4 6.5V13C4 19.35 8.28 25.22 14 27C19.72 25.22 24 19.35 24 13V6.5L14 2Z"
        fill="var(--sm-brand, #7CEDFF)"
        opacity="0.9"
      />
      <path
        d="M11 14L13.25 16.25L17.75 11.75"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/* ── Nav icons (18×18 Lucide-style stroked SVGs) ─────────── */

function IcoHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IcoFile() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IcoMail() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function IcoCloud() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

function IcoCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IcoRadar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
      <path d="M4 6h.01" />
      <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
      <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
      <path d="M12 18h.01" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IcoShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IcoTool() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function IcoSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IcoMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IcoX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6"  x2="6"  y2="18" />
      <line x1="6"  y1="6"  x2="18" y2="18" />
    </svg>
  );
}

export default Layout;
