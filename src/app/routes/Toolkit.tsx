/**
 * Privacy Toolkit route — five tools shipping incrementally.
 */
type Tool = { title: string; intent: string; status: "v1.0" | "v1.1" };

const TOOLS: Tool[] = [
  {
    title: "Data Export Request",
    intent: "Generate a data-export-request letter for any service.",
    status: "v1.1",
  },
  {
    title: "Browser Extension Audit",
    intent: "See which of your installed extensions request the most data.",
    status: "v1.1",
  },
  {
    title: "Takeout Review",
    intent: "Drop a Google Takeout zip — we'll list what's in it.",
    status: "v1.1",
  },
  {
    title: "Subscription Audit",
    intent: "Find every service that's emailed you a receipt this year.",
    status: "v1.1",
  },
  {
    title: "Travel Mode",
    intent: "Heightened protection while you're abroad. Auto-reverts.",
    status: "v1.1",
  },
];

export default function Toolkit() {
  return (
    <section class="route route-toolkit">
      <header>
        <h1>Privacy Toolkit</h1>
        <p>One-shot tools to take direct action on your exposure.</p>
      </header>
      <ul class="toolkit-grid">
        {TOOLS.map((tool) => (
          <li class="toolkit-card">
            <h2>{tool.title}</h2>
            <p>{tool.intent}</p>
            <span class={"badge badge--" + tool.status}>{tool.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
