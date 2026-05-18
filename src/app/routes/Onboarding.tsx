/**
 * Onboarding route — shown once on first install.
 *
 * Step 1: Welcome message.
 * Step 2: Preset picker — country dropdown + situation checkboxes.
 *
 * "Use my picks"  → applies selected presets → marks onboarded → Dashboard.
 * "Skip"          → applies preset.default.global → marks onboarded → Dashboard.
 *
 * Constitution §IV: zero regulatory jargon in copy.
 * Constitution §VIII: first-run ≤5 clicks to first protection.
 */
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { t } from "~/core/i18n";
import { applyPreset } from "~/core/rules";
import { presetResolver } from "~/core/preset-resolver";
import { localStore } from "~/core/storage";
import {
  RESIDENCY_PRESET_IDS,
  SITUATION_PRESET_IDS,
} from "~/data/presets/ui-constants";
import { Button, Field } from "../ui";

/* ── Storage key ─────────────────────────────────────────────── */

export const ONBOARDED_KEY = "onboarded";

/* ── Local signals ───────────────────────────────────────────── */

const step             = signal<1 | 2>(1);
const selectedResidency = signal("");
const selectedSituations = signal<Set<string>>(new Set());
const applying         = signal(false);

/* ── Helpers ─────────────────────────────────────────────────── */

async function finishOnboarding(onComplete: () => void) {
  applying.value = true;
  try {
    const residency   = selectedResidency.value;
    const situations  = selectedSituations.value;

    if (residency) await applyPreset(residency);
    for (const id of situations) await applyPreset(id);

    // If nothing was selected, apply the recommended global default
    if (!residency && situations.size === 0) {
      await applyPreset("preset.default.global");
    }

    await localStore.set(ONBOARDED_KEY, true);
    onComplete();
  } finally {
    applying.value = false;
  }
}

async function skipOnboarding(onComplete: () => void) {
  applying.value = true;
  try {
    await applyPreset("preset.default.global");
    await localStore.set(ONBOARDED_KEY, true);
    onComplete();
  } finally {
    applying.value = false;
  }
}

function toggleSituation(id: string, checked: boolean) {
  const next = new Set(selectedSituations.value);
  if (checked) next.add(id); else next.delete(id);
  selectedSituations.value = next;
}

/* ── Step 1: Welcome ─────────────────────────────────────────── */

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "32px 24px",
        gap: "16px",
      }}
    >
      <div style={{ fontSize: "48px", lineHeight: 1 }}>🛡️</div>
      <h1
        style={{
          fontSize: "var(--sm-fs-lg)",
          fontWeight: 700,
          margin: 0,
        }}
      >
        {t("onboarding_welcome")}
      </h1>
      <p class="sm-caption" style={{ maxWidth: "280px" }}>
        ShieldMe watches your documents and emails for personal information
        before it leaves your hands.
      </p>
      <Button
        variant="primary"
        block
        aria-label="Get started"
        onClick={onNext}
      >
        Get started →
      </Button>
    </div>
  );
}

/* ── Step 2: Preset picker ───────────────────────────────────── */

function PresetPickerStep({
  onApply,
  onSkip,
}: {
  onApply: () => void;
  onSkip: () => void;
}) {
  return (
    <div style={{ padding: "16px" }}>
      <h2
        style={{
          fontSize: "var(--sm-fs-md)",
          fontWeight: 700,
          margin: "0 0 4px",
        }}
      >
        {t("onboarding_presetPicker_title")}
      </h2>

      {/* Residency dropdown */}
      <div style={{ marginTop: "16px" }}>
        <Field label={t("onboarding_presetPicker_residency")}>
          <select
            class="sm-select"
            aria-label={t("onboarding_presetPicker_residency")}
            value={selectedResidency.value}
            onChange={(e) => {
              selectedResidency.value = (e.target as HTMLSelectElement).value;
            }}
            disabled={applying.value}
          >
            <option value="">{t("settings_presets_residency_none")}</option>
            {RESIDENCY_PRESET_IDS.map((id) => {
              let label = id;
              try { label = t(presetResolver.get(id).titleI18nKey); } catch {}
              return <option key={id} value={id}>{label}</option>;
            })}
          </select>
        </Field>
      </div>

      {/* Situation checkboxes */}
      <p
        style={{
          fontSize: "var(--sm-fs-xs)",
          fontWeight: 600,
          color: "var(--sm-text-subtle)",
          margin: "16px 0 8px",
        }}
      >
        {t("settings_presets_also")}
      </p>
      <div class="sm-stack--sm">
        {SITUATION_PRESET_IDS.map((id) => {
          let label = id;
          try { label = t(presetResolver.get(id).titleI18nKey); } catch {}
          const checked = selectedSituations.value.has(id);
          return (
            <label
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                fontSize: "var(--sm-fs-sm)",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={applying.value}
                onChange={(e) =>
                  toggleSituation(id, (e.target as HTMLInputElement).checked)
                }
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              {label}
            </label>
          );
        })}
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginTop: "20px",
        }}
      >
        <Button
          variant="primary"
          block
          aria-label={t("onboarding_presetPicker_apply")}
          disabled={applying.value}
          onClick={onApply}
        >
          {applying.value ? "Applying…" : t("onboarding_presetPicker_apply")}
        </Button>
        <Button
          variant="ghost"
          block
          aria-label={t("onboarding_presetPicker_skip")}
          disabled={applying.value}
          onClick={onSkip}
        >
          {t("onboarding_presetPicker_skip")}
        </Button>
      </div>
    </div>
  );
}

/* ── Root Onboarding component ───────────────────────────────── */

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  // Reset local state each time the component mounts (fresh onboarding session)
  useEffect(() => {
    step.value              = 1;
    selectedResidency.value = "";
    selectedSituations.value = new Set();
    applying.value          = false;
  }, []);

  if (step.value === 1) {
    return (
      <WelcomeStep
        onNext={() => { step.value = 2; }}
      />
    );
  }

  return (
    <PresetPickerStep
      onApply={() => finishOnboarding(onComplete)}
      onSkip={() => skipOnboarding(onComplete)}
    />
  );
}
