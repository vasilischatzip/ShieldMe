/**
 * Layout shell — header (logo + nav) + main content area.
 *
 * Keeps the chrome simple so the route content is the focus.
 * Severity colours, fonts, spacing all come from src/ui/tokens.
 */
import type { ComponentChildren } from "preact";
import { useLocation } from "preact-iso";
import { link, stripBase } from "./base";

type NavItem = { path: string; label: string };

// Logical (base-relative) paths. Rendered hrefs go through `link()` so the
// SPA works whether deployed at "/" or at a subdirectory like "/ShieldMe/".
const NAV: NavItem[] = [
  { path: "/", label: "Dashboard" },
  { path: "/rules", label: "Protection Rules" },
  { path: "/scan", label: "Document Check" },
  { path: "/email", label: "Email Scanner" },
  { path: "/cloud", label: "Cloud Audit" },
  { path: "/radar", label: "Exposure Radar" },
  { path: "/calendar", label: "Calendar Audit" },
  { path: "/toolkit", label: "Privacy Toolkit" },
  { path: "/settings", label: "Settings" },
];

export function Layout({ children }: { children: ComponentChildren }) {
  const loc = useLocation();
  // loc.path includes the deploy base (e.g. "/ShieldMe/toolkit") — strip it
  // before comparing against the logical nav paths.
  const here = stripBase(loc.path);
  return (
    <div class="app-shell">
      <header class="app-header" role="banner">
        <a href={link("/")} class="app-header__brand" aria-label="ShieldMe — Home">
          <ShieldLogo />
          <span class="app-header__title">ShieldMe</span>
        </a>
        <nav class="app-nav" aria-label="Primary">
          {NAV.map((item) => {
            const active = item.path === "/" ? here === "/" : here.startsWith(item.path);
            return (
              <a
                href={link(item.path)}
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
          <a href={link("/settings")}>Settings</a>
          <a
            href="https://github.com/vasilischatzip/ShieldMe"
            target="_blank"
            rel="noopener noreferrer"
          >
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
