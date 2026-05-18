/**
 * Layout shell — header (logo + nav) + main content area.
 *
 * Keeps the chrome simple so the route content is the focus.
 * Severity colours, fonts, spacing all come from src/ui/tokens.
 */
import type { ComponentChildren } from "preact";
import { useLocation } from "preact-iso";

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/scan", label: "Document Check" },
  { href: "/email", label: "Email Scanner" },
  { href: "/cloud", label: "Cloud Audit" },
  { href: "/radar", label: "Exposure Radar" },
  { href: "/calendar", label: "Calendar Audit" },
  { href: "/toolkit", label: "Privacy Toolkit" },
  { href: "/settings", label: "Settings" },
];

export function Layout({ children }: { children: ComponentChildren }) {
  const loc = useLocation();
  return (
    <div class="app-shell">
      <header class="app-header" role="banner">
        <a href="/" class="app-header__brand" aria-label="ShieldMe — Home">
          <ShieldLogo />
          <span class="app-header__title">ShieldMe</span>
        </a>
        <nav class="app-nav" aria-label="Primary">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? loc.path === "/" : loc.path.startsWith(item.href);
            return (
              <a
                href={item.href}
                class={"app-nav__link" + (active ? " is-active" : "")}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      </header>
      <main class="app-main" role="main">
        {children}
      </main>
      <footer class="app-footer" role="contentinfo">
        <span>ShieldMe — client-side privacy audit. Nothing leaves your device.</span>
        <nav aria-label="Footer">
          <a href="/settings">Settings</a>
          <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
            Source
          </a>
        </nav>
      </footer>
    </div>
  );
}

function ShieldLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 2L4 6.5V13C4 19.35 8.28 25.22 14 27C19.72 25.22 24 19.35 24 13V6.5L14 2Z"
        fill="var(--brand-surface, #1F8C7C)"
      />
      <path
        d="M11 14L13.25 16.25L17.75 11.75"
        stroke="white"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
      />
    </svg>
  );
}

export default Layout;
