/**
 * CategoryToggle — one row per protection category with an on/off switch.
 * Clicking the row label expands the detector list (advanced fold, FR-R2).
 */
import { signal } from "@preact/signals";
import { Switch, Row } from "~/app/ui";
import type { CategoryDef, CategoryId } from "~/core/rules";
import { toggleCategory } from "~/core/rules";
import { DetectorList } from "./detector-list";

/** Tracks which category is expanded (only one at a time). */
export const expandedCategory = signal<CategoryId | null>(null);

export function CategoryToggle({
  category,
  enabled,
  showBeta,
}: {
  category: CategoryDef;
  enabled: boolean;
  showBeta: boolean;
}) {
  const isExpanded = expandedCategory.value === category.id;

  function handleToggle(next: boolean) {
    void toggleCategory(category.id, next);
  }

  function handleExpand() {
    expandedCategory.value = isExpanded ? null : category.id;
  }

  return (
    <div class="sm-card" data-category-id={category.id}>
      <Row
        icon={<span aria-hidden="true">{category.icon}</span>}
        title={category.id}
        trailing={
          <Switch
            checked={enabled}
            onChange={handleToggle}
            ariaLabel={`Toggle ${category.id}`}
          />
        }
      />
      <button
        type="button"
        class="sm-btn sm-btn--ghost"
        onClick={handleExpand}
        aria-expanded={isExpanded}
        aria-controls={`detector-list-${category.id}`}
      >
        {isExpanded ? "Hide detectors" : "Show detectors"}
      </button>
      {isExpanded && (
        <DetectorList
          id={`detector-list-${category.id}`}
          category={category}
          categoryEnabled={enabled}
          showBeta={showBeta}
        />
      )}
    </div>
  );
}
