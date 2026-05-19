/**
 * Application root — SPA routes for ShieldMe (web-app variant, post-pivot 2026-05-17).
 *
 * Each route is code-split via `lazy()` so the popup-initial bundle stays
 * small (Constitution §X — popup bundle ≤500 KB still applies as a
 * shell-bundle target).
 */
import { ErrorBoundary, lazy, Route, Router } from "preact-iso";
import { Layout } from "./Layout";
import { link } from "./base";

const Dashboard = lazy(() => import("./routes/Dashboard"));
const DocumentCheck = lazy(() => import("./routes/DocumentCheck"));
const EmailScanner = lazy(() => import("./routes/EmailScanner"));
const CloudAudit = lazy(() => import("./routes/CloudAudit"));
const Radar = lazy(() => import("./routes/Radar"));
const CalendarRoute = lazy(() => import("./routes/Calendar"));
const Toolkit = lazy(() => import("./routes/Toolkit"));
const Settings = lazy(() => import("./routes/Settings"));
const Onboarding = lazy(() => import("./routes/Onboarding"));
const Pro = lazy(() => import("./routes/Pro"));
const OAuthCallback = lazy(() => import("./routes/OAuthCallback"));
const NotFound = lazy(() => import("./routes/NotFound"));

// Route paths must match `location.pathname` exactly, which on GitHub Pages
// includes the /ShieldMe/ prefix. `link()` handles dev (no prefix) vs prod.
export function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Router>
          <Route path={link("/")} component={Dashboard} />
          <Route path={link("/scan")} component={DocumentCheck} />
          <Route path={link("/email")} component={EmailScanner} />
          <Route path={link("/cloud")} component={CloudAudit} />
          <Route path={link("/radar")} component={Radar} />
          <Route path={link("/calendar")} component={CalendarRoute} />
          <Route path={link("/toolkit")} component={Toolkit} />
          <Route path={link("/settings")} component={Settings} />
          <Route path={link("/onboarding")} component={Onboarding} />
          <Route path={link("/pro")} component={Pro} />
          <Route path={link("/oauth/callback")} component={OAuthCallback} />
          <Route default component={NotFound} />
        </Router>
      </Layout>
    </ErrorBoundary>
  );
}

export default App;
