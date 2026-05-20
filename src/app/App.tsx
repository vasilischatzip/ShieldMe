/**
 * Application root — SPA routes for ShieldMe (web-app variant, post-pivot 2026-05-17).
 *
 * Each route is code-split via `lazy()` so the popup-initial bundle stays
 * small (Constitution §X — popup bundle ≤500 KB still applies as a
 * shell-bundle target).
 */
import { ErrorBoundary, lazy, Route, Router } from "preact-iso";
import { Layout } from "./Layout";
import { routePath } from "./base";

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
const Rules = lazy(() => import("./routes/Rules"));
const NotFound = lazy(() => import("./routes/NotFound"));

// Route paths must match `location.pathname` after preact-iso's trailing-slash
// normalization. `routePath()` handles this — see src/app/base.ts.
export function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Router>
          <Route path={routePath("/")} component={Dashboard} />
          <Route path={routePath("/rules")} component={Rules} />
          <Route path={routePath("/scan")} component={DocumentCheck} />
          <Route path={routePath("/email")} component={EmailScanner} />
          <Route path={routePath("/cloud")} component={CloudAudit} />
          <Route path={routePath("/radar")} component={Radar} />
          <Route path={routePath("/calendar")} component={CalendarRoute} />
          <Route path={routePath("/toolkit")} component={Toolkit} />
          <Route path={routePath("/settings")} component={Settings} />
          <Route path={routePath("/onboarding")} component={Onboarding} />
          <Route path={routePath("/pro")} component={Pro} />
          <Route path={routePath("/oauth/callback")} component={OAuthCallback} />
          <Route default component={NotFound} />
        </Router>
      </Layout>
    </ErrorBoundary>
  );
}

export default App;
