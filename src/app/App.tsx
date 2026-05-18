/**
 * Application root — SPA routes for ShieldMe (web-app variant, post-pivot 2026-05-17).
 *
 * Each route is code-split via `lazy()` so the popup-initial bundle stays
 * small (Constitution §X — popup bundle ≤500 KB still applies as a
 * shell-bundle target).
 */
import { ErrorBoundary, lazy, Route, Router } from "preact-iso";
import { Layout } from "./Layout";

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

export function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Router>
          <Route path="/" component={Dashboard} />
          <Route path="/scan" component={DocumentCheck} />
          <Route path="/email" component={EmailScanner} />
          <Route path="/cloud" component={CloudAudit} />
          <Route path="/radar" component={Radar} />
          <Route path="/calendar" component={CalendarRoute} />
          <Route path="/toolkit" component={Toolkit} />
          <Route path="/settings" component={Settings} />
          <Route path="/onboarding" component={Onboarding} />
          <Route path="/pro" component={Pro} />
          <Route path="/oauth/callback" component={OAuthCallback} />
          <Route default component={NotFound} />
        </Router>
      </Layout>
    </ErrorBoundary>
  );
}

export default App;
