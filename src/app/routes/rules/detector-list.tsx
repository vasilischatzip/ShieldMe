/**
 * DetectorList — renders per-detector toggles inside an expanded category.
 * Beta detectors are only rendered when showBeta is true (AC-R7, FR-R2).
 */
import { Switch, Row } from "~/app/ui";
import type { CategoryDef } from "~/core/rules";
import { rulesState, toggleDetector } from "~/core/rules";
import { registry } from "~/detectors/registry";

export function DetectorList({
  id,
  category,
  categoryEnabled,
  showBeta,
}: {
  id: string;
  category: CategoryDef;
  categoryEnabled: boolean;
  showBeta: boolean;
}) {
  // Fetch registered detectors for this category so we can check shipTier.
  // CATEGORIES from rules.ts holds the static defs; registry holds runtime defs.
  const registeredDetectors = registry.byCategory(category.id);
  const betaIds = new Set(
    registeredDetectors
      .filter((d) => d.shipTier === "beta")
      .map((d) => d.id),
  );

  const state = rulesState.value;

  return (
    <div id={id} class="sm-detector-list" role="group" aria-label={`${category.id} detectors`}>
      {category.detectors.map((det) => {
        const isBeta = betaIds.has(det.id);
        // AC-R7: Beta detectors hidden from DOM when showBeta is false
        if (isBeta && !showBeta) return null;

        const checked = state.detectors[det.id] ?? categoryEnabled;

        return (
          <Row
            key={det.id}
            title={det.id}
            trailing={
              <Switch
                checked={checked}
                onChange={(next) => void toggleDetector(det.id, next)}
                ariaLabel={`Toggle ${det.id}`}
                disabled={!categoryEnabled}
              />
            }
          />
        );
      })}
    </div>
  );
}
