/**
 * Pro route — Coming Soon page for premium features.
 *
 * Shows what users get with ShieldMe Pro and captures
 * "notify me" intent for launch notifications.
 */
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { Header, Button, Badge } from "../ui";
import { localStore } from "~/core/storage";

const NOTIFY_KEY = "pro.notifyIntent";
const notifyIntent = signal(false);

async function captureNotifyIntent(): Promise<void> {
  await localStore.set(NOTIFY_KEY, true);
  notifyIntent.value = true;
}

const PRO_FEATURES = [
  {
    icon: "🔍",
    title: "Unlimited scans",
    desc: "Scan as many files and texts as you need — no monthly cap.",
  },
  {
    icon: "📂",
    title: "Full Drive audit",
    desc: "Audit all your Google Drive files, not just the top 100.",
  },
  {
    icon: "📧",
    title: "Email breach monitoring",
    desc: "Continuous monitoring for new breaches affecting your email.",
  },
  {
    icon: "🤖",
    title: "Automated data removal",
    desc: "We send removal requests to data brokers on your behalf.",
  },
  {
    icon: "📊",
    title: "Advanced analytics",
    desc: "Exposure trends over time and detailed category breakdowns.",
  },
  {
    icon: "⚡",
    title: "Priority support",
    desc: "Get help faster when you need it.",
  },
];

export default function Pro() {
  useEffect(() => {
    localStore.get<boolean>(NOTIFY_KEY).then((v) => {
      if (v) notifyIntent.value = true;
    });
  }, []);

  return (
    <>
      <Header
        eyebrow="Upgrade"
        title="ShieldMe Pro"
        subtitle="Unlock the full power of personal data protection."
      />

      {/* Hero card */}
      <div
        class="sm-card"
        style={{
          background: "linear-gradient(135deg, #6366F1 0%, #818CF8 100%)",
          border: "none",
          color: "white",
          textAlign: "center",
          padding: "28px 20px",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "4px" }}>
          <svg aria-hidden="true" focusable="false" width="48" height="48" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2L4 6.5V13C4 19.35 8.28 25.22 14 27C19.72 25.22 24 19.35 24 13V6.5L14 2Z" fill="rgba(255,255,255,0.2)" stroke="white" stroke-width="1.5" />
            <path d="M10 14L12.5 16.5L18 11" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Coming Soon
        </div>
        <p style={{ fontSize: "14px", opacity: 0.9, maxWidth: "260px", margin: "0 auto" }}>
          We're building the premium experience. Be the first to know when it launches.
        </p>
        {notifyIntent.value ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(255,255,255,0.2)",
              borderRadius: "999px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              margin: "0 auto",
            }}
          >
            <span>&#10003;</span> We'll notify you at launch
          </div>
        ) : (
          <Button
            variant="ghost"
            onClick={captureNotifyIntent}
            aria-label="Notify me when Pro launches"
          >
            <span
              style={{
                color: "white",
                background: "rgba(255,255,255,0.2)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "12px",
                padding: "8px 20px",
                fontSize: "13px",
                fontWeight: 600,
                display: "inline-block",
              }}
            >
              Notify me when available
            </span>
          </Button>
        )}
      </div>

      {/* Feature list */}
      <div class="sm-stack">
        {PRO_FEATURES.map((feat) => (
          <div class="sm-pro-card" key={feat.title}>
            <div class="sm-pro-card__icon">{feat.icon}</div>
            <div class="sm-pro-card__body">
              <div class="sm-pro-card__title">{feat.title}</div>
              <div class="sm-pro-card__desc">{feat.desc}</div>
            </div>
            <Badge variant="pro">Pro</Badge>
          </div>
        ))}
      </div>

      {/* Current plan info */}
      <div class="sm-card" style={{ background: "var(--sm-bg-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: "var(--sm-fs-md)" }}>Current plan</div>
            <p class="sm-caption" style={{ marginTop: "2px" }}>
              5 scans/month &middot; 10 MB max &middot; Top 100 Drive files
            </p>
          </div>
          <Badge variant="free">Free</Badge>
        </div>
      </div>
    </>
  );
}
