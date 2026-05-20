/**
 * Rules — My Protection Rules module (FR-R1 through FR-R7).
 *
 * Exports:
 *   - default: Rules page component
 *   - ROADMAP_URL: public roadmap link for "Request a protection" (FR-R4)
 *
 * Route: /rules (registered in App.tsx)
 * Nav:   "Protection Rules" (registered in Layout.tsx)
 */
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { Header, Switch, SectionTitle, Button } from "../ui";
import { CATEGORIES, loadRules, rulesState } from "~/core/rules";
import type { CategoryId } from "~/core/rules";
import { CategoryToggle } from "./rules/category-toggle";
import { CustomRules } from "./rules/custom-rules";
import { PresetPickerCard } from "./rules/preset-picker";

/** FR-R4: "Request a protection" target. Configured via constant (no CDN, no env leak). */
export const ROADMAP_URL = "https://github.com/vasilischatzip/ShieldMe/issues";

/* ── Local UI state ──────────────────────────────────────────── */
const loaded         = signal(false);
const showBetaSwitch = signal(false);

export default function Rules() {
  // Load persisted rules on mount (FR-R5 — takes effect on next scan).
  useEffect(() => {
    void loadRules().then(() => {
      loaded.value = true;
    });
  }, []);

  const state      = rulesState.value;
  const showBeta   = showBetaSwitch.value;

  if (!loaded.value) {
    return (
      <div class="app-loading" role="status" aria-label="Loading protection rules">
        Loading…
      </div>
    );
  }

  return (
    <>
      <Header
        eyebrow="Module 1"
        title="My Protection Rules"
        subtitle="Choose what ShieldMe watches for in your documents and files."
      />

      {/* ── Protection Presets (FR-R7) ──────────────────────── */}
      <PresetPickerCard />

      {/* ── Category toggles (FR-R1) ───────────────────────── */}
      <SectionTitle>What ShieldMe watches</SectionTitle>

      {CATEGORIES.map((category) => (
        <CategoryToggle
          key={category.id}
          category={category}
          enabled={state.categories[category.id as CategoryId] ?? false}
          showBeta={showBeta}
        />
      ))}

      {/* ── Beta detector master switch (FR-R2 / AC-R7) ─────── */}
      <section class="sm-card" aria-label="Beta detector settings">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div class="sm-card__title">Include checks for other countries</div>
            <p class="sm-card__desc">
              Enable experimental checks that are still being refined. Off by default.
            </p>
          </div>
          <Switch
            checked={showBeta}
            onChange={(next) => {
              showBetaSwitch.value = next;
              // Persist the beta flag on the rules state
              rulesState.value = { ...rulesState.value, includeBetaDetectors: next };
            }}
            ariaLabel="Include checks for other countries"
          />
        </div>
      </section>

      {/* ── Custom Rules (FR-R3) ─────────────────────────────── */}
      <SectionTitle>Your custom checks</SectionTitle>
      <CustomRules />

      {/* ── Request a protection (FR-R4) ─────────────────────── */}
      <section class="sm-card" aria-label="Request a new protection">
        <div class="sm-card__title">Don't see what you need?</div>
        <p class="sm-card__desc">
          Tell us which type of information you'd like ShieldMe to watch for.
        </p>
        <Button
          variant="ghost"
          onClick={() => window.open(ROADMAP_URL, "_blank", "noopener,noreferrer")}
        >
          Request a protection
        </Button>
      </section>
    </>
  );
}
