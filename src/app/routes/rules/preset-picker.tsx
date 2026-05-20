/**
 * PresetPickerCard — FR-R7.
 *
 * Shows a catalog of built-in presets. Selecting one renders a preview panel
 * with consumer-copy only ("turns on N protections, turns off M") before
 * the user confirms (FR-R7.2).
 *
 * Applying mutates rules via applyPreset/unapplyPreset from ~/core/rules.
 * Active presets listed with Remove action (FR-R7.4).
 *
 * No regulation names (GDPR/HIPAA/etc.) appear in any string — enforced by
 * copy linter (scripts/lint-copy.mjs).
 */
import { signal } from "@preact/signals";
import { Button, Card, Badge } from "~/app/ui";
import { presetResolver } from "~/core/preset-resolver";
import { rulesState, applyPreset, unapplyPreset } from "~/core/rules";
import { ALL_PRESETS } from "~/data/presets/index";
import type { PresetDefinition, PresetDiff } from "~/detectors/types";

/* ── Local state ─────────────────────────────────────────────── */
const selectedPreset = signal<PresetDefinition | null>(null);
const pendingDiff    = signal<PresetDiff | null>(null);
const applying       = signal(false);

function selectPreset(preset: PresetDefinition) {
  const diff = presetResolver.preview(preset, rulesState.value);
  selectedPreset.value = preset;
  pendingDiff.value    = diff;
}

function clearSelection() {
  selectedPreset.value = null;
  pendingDiff.value    = null;
}

async function confirmApply() {
  const preset = selectedPreset.value;
  if (!preset) return;
  applying.value = true;
  try {
    await applyPreset(preset.id);
  } finally {
    applying.value = false;
    clearSelection();
  }
}

async function handleUnapply(presetId: string) {
  await unapplyPreset(presetId);
}

/* ── Subcomponents ───────────────────────────────────────────── */

function DiffSummary({ diff }: { diff: PresetDiff }) {
  const added   = diff.detectorsEnabled.length;
  const removed = diff.detectorsDisabled.length;
  return (
    <p class="sm-card__desc" aria-live="polite">
      Turns on {added} {added === 1 ? "protection" : "protections"},
      turns off {removed}.
    </p>
  );
}

function ActivePresets({ activeIds }: { activeIds: string[] }) {
  if (activeIds.length === 0) return null;
  return (
    <div class="sm-active-presets" role="list" aria-label="Active presets">
      {activeIds.map((id) => {
        const preset = ALL_PRESETS.find((p) => p.id === id);
        const label = preset?.titleI18nKey ?? id;
        return (
          <div class="sm-card" role="listitem" key={id}>
            <span>{label}</span>
            <Button
              variant="ghost"
              aria-label={`Remove preset ${label}`}
              onClick={() => void handleUnapply(id)}
            >
              Remove
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function PresetPickerCard() {
  const state      = rulesState.value;
  const activeIds  = state.activePresets;
  const selected   = selectedPreset.value;
  const diff       = pendingDiff.value;
  const isApplying = applying.value;

  // Partition presets into residency and situation groups for display.
  const residencyPresets  = ALL_PRESETS.filter((p) => p.id.startsWith("preset.residency."));
  const situationPresets  = ALL_PRESETS.filter((p) =>
    p.id.startsWith("preset.work.") || p.id.startsWith("preset.life."),
  );

  return (
    <section aria-label="Protection presets" class="sm-card">
      <div class="sm-card__title">Ready-made protection sets</div>
      <p class="sm-card__desc">
        Pick your country and situation. We enable the right checks automatically.
      </p>

      {/* Active presets */}
      <ActivePresets activeIds={activeIds} />

      {/* Residency section */}
      <div class="sm-section-title">Where you live</div>
      <div class="sm-preset-grid" role="list">
        {residencyPresets.map((preset) => {
          const isActive = activeIds.includes(preset.id);
          return (
            <button
              type="button"
              key={preset.id}
              role="listitem"
              class={"sm-preset-card" + (isActive ? " sm-preset-card--active" : "")}
              onClick={() => selectPreset(preset)}
              aria-pressed={isActive}
            >
              <span class="sm-preset-card__title">{preset.titleI18nKey}</span>
              {isActive && <Badge variant="success">Active</Badge>}
            </button>
          );
        })}
      </div>

      {/* Situation section */}
      <div class="sm-section-title">Your situation</div>
      <div class="sm-preset-grid" role="list">
        {situationPresets.map((preset) => {
          const isActive = activeIds.includes(preset.id);
          return (
            <button
              type="button"
              key={preset.id}
              role="listitem"
              class={"sm-preset-card" + (isActive ? " sm-preset-card--active" : "")}
              onClick={() => selectPreset(preset)}
              aria-pressed={isActive}
            >
              <span class="sm-preset-card__title">{preset.titleI18nKey}</span>
              {isActive && <Badge variant="success">Active</Badge>}
            </button>
          );
        })}
      </div>

      {/* Preview panel — shown when a preset is selected */}
      {selected && diff && (
        <div
          class="sm-preview-panel sm-card"
          role="dialog"
          aria-modal="false"
          aria-label="Preset preview"
        >
          <div class="sm-card__title">{selected.titleI18nKey}</div>
          <DiffSummary diff={diff} />
          <div class="sm-btn-row">
            <Button
              variant="primary"
              disabled={isApplying}
              onClick={() => void confirmApply()}
            >
              {isApplying ? "Applying…" : "Apply"}
            </Button>
            <Button variant="ghost" onClick={clearSelection} disabled={isApplying}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
