/**
 * ShieldMe SPA root entry.
 *
 * Post-pivot 2026-05-17 - web-app variant.
 * Mounts <App/> into #app and registers the preact-iso location provider.
 */
import { render } from "preact";
import { LocationProvider } from "preact-iso";
import { App } from "./app/App";
import { BASE } from "./app/base";
import { initI18n } from "./core/i18n";
import "./app/styles.css";
import "./app/styles.modern.css";

const root = document.getElementById("app");
if (!root) throw new Error("ShieldMe: #app root element missing");

// Boot i18n before first render so t() resolves translations, not raw keys.
// initI18n detects navigator.language and loads the appropriate locale JSON.
void initI18n().then(() => {
  // `scope` ensures preact-iso only intercepts clicks on links inside the app's
  // base path (e.g. /ShieldMe/*). External links and the GitHub link in the
  // footer fall through to normal browser navigation.
  render(
    <LocationProvider {...(BASE ? { scope: BASE } : {})}>
      <App />
    </LocationProvider>,
    root!,
  );
});
