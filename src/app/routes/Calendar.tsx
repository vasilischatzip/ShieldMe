/**
 * Calendar Audit route — placeholder for the v1.1 Google/Outlook Calendar scan.
 * The provider abstraction (contracts/calendar-providers.md) is unimplemented at v1.0.
 */
export default function Calendar() {
  return (
    <section class="route route-calendar">
      <header>
        <h1>Calendar Audit</h1>
        <p>Scan your calendar events for personal information you may not want to share.</p>
      </header>
      <article class="empty-state">
        <h2>Coming soon</h2>
        <p>Google Calendar support ships in v1.1. Connect your Google account in Settings to get notified when it's available.</p>
      </article>
    </section>
  );
}
