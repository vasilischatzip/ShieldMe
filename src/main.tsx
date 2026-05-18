/**
 * ShieldMe SPA root entry.
 *
 * Post-pivot 2026-05-17 — web-app variant.
 * Mounts <App/> into #app and registers the preact-iso location provider.
 */
import { render } from "preact";
import { LocationProvider } from "preact-iso";
import { App } from "./app/App";
import "./app/styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("ShieldMe: #app root element missing");

render(
  <LocationProvider>
    <App />
  </LocationProvider>,
  root,
);
