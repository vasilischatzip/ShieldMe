/**
 * ShieldMe SPA root entry.
 *
 * Post-pivot 2026-05-17 — web-app variant.
 * Mounts <App/> into #app and registers the preact-iso location provider.
 */
import { render } from "preact";
import { LocationProvider } from "preact-iso";
import { App } from "./app/App";
import { BASE } from "./app/base";
import "./app/styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("ShieldMe: #app root element missing");

// `scope` ensures preact-iso only intercepts clicks on links inside the app's
// base path (e.g. /ShieldMe/*). External links and the GitHub link in the
// footer fall through to normal browser navigation.
render(
  <LocationProvider scope={BASE || undefined}>
    <App />
  </LocationProvider>,
  root,
);
