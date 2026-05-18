# Contract — Calendar Providers

**Status:** binding · **Updated:** 2026-05-09

Defines the seam between Calendar Audit (Module 6) and any calendar backend. v1.0 launches with **Google Calendar**; **Outlook / Microsoft 365 Calendar** ships in M6 via Microsoft Graph.

---

## 1. Provider matrix

| Provider | Status | API | Auth |
|---|---|---|---|
| Google Calendar | v1.0 (M5) | Calendar API v3 | OAuth `calendar.readonly` (read), `calendar.events` (Pro redact) |
| Outlook / M365 Calendar | M6 | Microsoft Graph `/me/calendar/events` | OAuth `Calendars.Read` (read), `Calendars.ReadWrite` (Pro redact) |
| Apple iCloud Calendar | out of scope | — | No public consumer API |

## 2. CalendarProvider interface

```ts
// src/calendar/calendar-provider.ts

export type CalendarEvent = {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;       // ISO-8601
  endsAt: string;
  attendees: string[];    // email addresses
  visibility: "default" | "public" | "private" | "confidential";
  webViewUrl?: string;
};

export type CalendarChange = {
  eventId: string;
  kind: "added" | "modified" | "removed";
  event?: CalendarEvent;
};

export interface CalendarProvider {
  readonly providerId: "google-calendar" | "outlook-calendar";

  /** All events in a time range. */
  listEvents(opts: {
    timeMin: string;
    timeMax: string;
    pageSize?: number;
    abortSignal?: AbortSignal;
  }): AsyncIterable<CalendarEvent>;

  /** Incremental sync since `cursor`. */
  changesSince(cursor: string): AsyncIterable<CalendarChange>;

  currentCursor(): Promise<string>;

  /** Pro-only redact action. Rewrites title and description. */
  redactEvent(
    eventId: string,
    newTitle: string,
    newDescription?: string,
  ): Promise<void>;

  upgradeToWriteScope(): Promise<boolean>;
}
```

## 3. Scan model

The same `ScanEngine` from `contracts/detection-engine.md` runs against each event's `{title, description, location}` concatenated, with a synthetic `OffsetMap` that maps back to which field a finding came from. Sharing context (public visibility, external attendees) is cross-referenced with findings to elevate severity per FR-Cal3.

## 4. Frequency

| Tier | Re-audit frequency | Mechanism |
|---|---|---|
| Free | — | not available |
| Basic | weekly | service-worker alarm |
| Pro | daily | service-worker alarm; per-account fan-out for multi-account users |

## 5. Redact action contract (Pro)

1. User clicks `Redact` on a finding.
2. Modal shows current title/description and proposed redacted text (default: replace matched value with `[redacted]`).
3. User confirms; ShieldMe calls `redactEvent` via the provider with the new strings.
4. A local audit-log entry is stored: `{eventId, redactedAt, fieldsAffected, scanRunId}`. The original is **not** stored — once redacted, it's gone.

## 6. Egress allowlist additions

| Host | Provider | Phase |
|---|---|---|
| `https://www.googleapis.com/calendar/v3/*` | Google Calendar | v1.0 |
| `https://graph.microsoft.com/v1.0/me/calendar*` | Outlook | M6 |
