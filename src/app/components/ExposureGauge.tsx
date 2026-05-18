/**
 * ExposureGauge — animated circular score ring.
 *
 * Renders an SVG ring that fills from 0 -> score with a smooth 1.2s
 * ease-out animation. Color tiers: green -> amber -> orange -> red.
 * Now centered and larger for the modern light UI.
 *
 * Privacy: pure presentation component, no side effects.
 */

import { useEffect, useRef } from "preact/hooks";

interface Props {
  /** Exposure score 0-100. Higher = more exposed. */
  score: number;
  /** Ring diameter in px. Default 120. */
  size?: number;
  /** Stroke width. Default 8. */
  strokeWidth?: number;
}

function tierClass(score: number): string {
  if (score <= 20) return "sm-score-ring--excellent";
  if (score <= 40) return "sm-score-ring--good";
  if (score <= 60) return "sm-score-ring--moderate";
  if (score <= 80) return "sm-score-ring--poor";
  return "sm-score-ring--critical";
}

function tierLabel(score: number): string {
  if (score <= 20) return "Excellent";
  if (score <= 40) return "Good";
  if (score <= 60) return "Moderate";
  if (score <= 80) return "Poor";
  return "Critical";
}

function tierColor(score: number): string {
  if (score <= 20) return "#10B981";
  if (score <= 40) return "#10B981";
  if (score <= 60) return "#F59E0B";
  if (score <= 80) return "#F97316";
  return "#EF4444";
}

export default function ExposureGauge({ score, size = 120, strokeWidth = 8 }: Props) {
  const ringRef = useRef<SVGCircleElement>(null);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score)) / 100;
  const offset = circumference * (1 - pct);
  const center = size / 2;
  const color = tierColor(score);

  useEffect(() => {
    const el = ringRef.current;
    if (!el) return;
    // Start fully hidden, then animate to target
    el.style.strokeDashoffset = String(circumference);
    // Force reflow so the browser registers the initial value
    void el.getBoundingClientRect();
    el.style.strokeDashoffset = String(offset);
  }, [score, circumference, offset]);

  return (
    <div
      class="sm-hero__gauge"
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Exposure score: ${score} out of 100 — ${tierLabel(score)}`}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        class={`sm-score-ring ${tierClass(score)}`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background ring */}
        <circle
          class="sm-score-ring__bg"
          cx={center}
          cy={center}
          r={r}
          strokeWidth={strokeWidth}
        />
        {/* Animated fill ring */}
        <circle
          ref={ringRef}
          class="sm-score-ring__fill"
          cx={center}
          cy={center}
          r={r}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
        />
      </svg>
      {/* Score number centered inside the ring */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${size}px`,
          height: `${size}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontSize: `${Math.round(size * 0.28)}px`,
            fontWeight: 800,
            color,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.04em",
          }}
        >
          {score}
        </span>
        <span
          style={{
            fontSize: `${Math.round(size * 0.09)}px`,
            fontWeight: 600,
            color: "var(--sm-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginTop: "2px",
          }}
        >
          / 100
        </span>
      </div>
    </div>
  );
}

export { tierLabel };
