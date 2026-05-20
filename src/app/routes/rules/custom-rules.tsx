/**
 * CustomRules — keyword / pattern / combination custom rule editor.
 *
 * FR-R3: Free tier max 3 active custom rules.
 * When adding a 4th rule on free tier, shows upsell CTA instead (AC-R3).
 *
 * TierGate.check("custom-rules:max", { value: activeCount }) gates additions.
 */
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { Button, Card, Badge, Row } from "~/app/ui";
import { TierGate, FREE_LIMITS } from "~/core/tier-gate";
import type { TierCheckResult } from "~/core/tier-gate";

export type CustomRuleMode = "keyword" | "pattern" | "combination";

export interface CustomRule {
  id: string;
  mode: CustomRuleMode;
  value: string;
  active: boolean;
}

/** Injected tier gate — default to the module singleton. */
const defaultGate = new TierGate();

/* ── Local state ─────────────────────────────────────────────── */
const rules     = signal<CustomRule[]>([]);
const addError  = signal<TierCheckResult | null>(null);
const draftValue = signal("");
const draftMode  = signal<CustomRuleMode>("keyword");

export function CustomRules({ tierGate = defaultGate }: { tierGate?: TierGate }) {
  const activeCount = rules.value.filter((r) => r.active).length;

  async function handleAdd() {
    const val = draftValue.value.trim();
    if (!val) return;
    const result = await tierGate.check("custom-rules:max", { value: activeCount });
    if (!result.allowed) {
      addError.value = result;
      return;
    }
    addError.value = null;
    const newRule: CustomRule = {
      id:     crypto.randomUUID(),
      mode:   draftMode.value,
      value:  val,
      active: true,
    };
    rules.value = [...rules.value, newRule];
    draftValue.value = "";
  }

  function handleRemove(id: string) {
    rules.value = rules.value.filter((r) => r.id !== id);
    addError.value = null;
  }

  const blocked = addError.value !== null && !addError.value.allowed;

  return (
    <section aria-label="Custom rules" class="sm-card">
      <div class="sm-card__title">Your custom checks</div>
      <p class="sm-card__desc">
        Add keywords or patterns to watch for in your documents.
        {" "}Free plan: up to {FREE_LIMITS.customRulesMax} active checks.
      </p>

      {/* Rule list */}
      {rules.value.map((rule) => (
        <Row
          key={rule.id}
          title={rule.value}
          desc={rule.mode}
          trailing={
            <Button
              variant="danger"
              aria-label={`Remove rule ${rule.value}`}
              onClick={() => handleRemove(rule.id)}
            >
              Remove
            </Button>
          }
        />
      ))}

      {/* Add form */}
      <div class="sm-field">
        <label class="sm-field__label">
          Check type
          <select
            value={draftMode.value}
            onChange={(e) =>
              (draftMode.value = (e.target as HTMLSelectElement).value as CustomRuleMode)
            }
          >
            <option value="keyword">Keyword</option>
            <option value="pattern">Pattern</option>
            <option value="combination">Combination</option>
          </select>
        </label>
      </div>

      <div class="sm-field">
        <label class="sm-field__label">
          Value
          <input
            type="text"
            value={draftValue.value}
            onInput={(e) => (draftValue.value = (e.target as HTMLInputElement).value)}
            placeholder="e.g. employee ID or pattern"
          />
        </label>
      </div>

      {blocked && (
        <div role="alert" class="sm-upsell-card" aria-live="polite">
          <Badge variant="pro">Pro</Badge>
          <span>
            Free plan supports up to {FREE_LIMITS.customRulesMax} active checks.
            Upgrade to add more.
          </span>
        </div>
      )}

      <Button variant="primary" onClick={() => void handleAdd()}>
        Add check
      </Button>
    </section>
  );
}
