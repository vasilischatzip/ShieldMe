# Web-App Information Architecture — Options

**Status:** pre-decision · **Date:** 2026-05-20  
**Context:** Priority-0 task from handoff brief. Current layout is a popup shell at 1440px — 9 horizontal nav pills, single-column content, `app-main` not centered. The brief asks for 2-3 IA directions before any code is written.

---

## Diagnosis first

The current code has three structural problems, not cosmetic ones:

1. **`app-nav` is a horizontal pill row with 9 items.** This is correct at 380px popup width. At 1440px it's a single narrow band of pills marooned in a top strip. Modern CSS handles the overflow with `overflow-x: auto` on mobile but on desktop it just looks thin — 9 items in a 14px font consuming maybe 80px of a 900px header row.

2. **`app-main` has `max-width: 1180px` but no `margin: auto`.** The content left-aligns and leaves a dead right gutter on every wide monitor. This is one line to fix but it exposes the bigger issue: even if you center it, the Dashboard is still a single column of stacked cards. At 1180px wide, a single column is ~640px of content with empty space on both sides unless you restructure into multi-column layouts.

3. **Dashboard is a popup expanded in place.** `sm-hero` + `sm-stats` + `sm-stack` + plan badge are all stacked vertically. At full width this looks like a narrow receipt in the middle of the screen. The gauge ring at 120px–168px is a popup-sized element; on a 14" monitor it looks like a coin next to a dinner table.

The visual energy from `styles.modern.css` (dark, gradient accents, glass surfaces) is solid. That's not the problem. The composition — how the modules fill a 1280px canvas — is what's broken.

---

## Option A: Persistent Left Rail (sidebar) — Recommended

**Pattern:** 1Password 8, Bitwarden web vault, Dashlane web app, Vercel dashboard, Linear.

The left rail becomes the permanent navigation surface. The main canvas fills the remaining width.

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ ●  ShieldMe     [sidebar, 240px]   │   [main canvas]     │
│                                    │                     │
│  ○ Dashboard                       │                     │
│  ○ Protection Rules                │   [route content,   │
│  ○ Document Check                  │    full width,      │
│  ○ Email Scanner                   │    multi-column     │
│  ○ Cloud Audit                     │    where sensible]  │
│  ○ Exposure Radar                  │                     │
│  ○ Calendar Audit                  │                     │
│  ○ Privacy Toolkit                 │                     │
│  ─────────────────                 │                     │
│  ○ Settings                        │                     │
└──────────────────────────────────────────────────────────┘
```

Nav items get icons (Lucide, already a dep). Settings pinned at bottom. Sidebar has a subtle glass background matching the header aesthetic.

**Dashboard with sidebar:**
```
┌─────────────────┬────────────────────────────────────────┐
│ [sidebar]       │  OVERVIEW                              │
│                 │  ┌───────────────────┬───────────────┐ │
│                 │  │   Exposure Score  │ Quick actions │ │
│                 │  │   [gauge + score] │               │ │
│                 │  │                  │  > Scan file   │ │
│                 │  │   74             │  > Drive audit │ │
│                 │  │   Cautious       │  > Breach chk  │ │
│                 │  └───────────────────┴───────────────┘ │
│                 │  ┌─────────┬─────────┬────────────────┐│
│                 │  │Critical │ Warning │  Info          ││
│                 │  └─────────┴─────────┴────────────────┘│
│                 │  ┌─────────────────────────────────────┐│
│                 │  │  Last scan results                  ││
│                 │  └─────────────────────────────────────┘│
└─────────────────┴────────────────────────────────────────┘
```

**Why this is the right answer for ShieldMe:**

Security and privacy tools benefit from a permanent orientation anchor. When you're looking at a breach result or a Drive finding and you want to cross-reference your protection rules, you need one click from anywhere — not a back-button hunt. Bitwarden and 1Password figured this out because their users do exactly this: find an exposed password, then check if another vault item uses the same credential. ShieldMe users will do the same: find a Drive exposure, then check which protection rules cover it.

The 9-item nav problem disappears. Vertical nav scales indefinitely; horizontal pill nav doesn't.

The main canvas opens up. Routes like Cloud Audit and Exposure Radar can use a 2-column grid (findings list on left, detail panel on right) — exactly the pattern users know from every decent web app.

**Tradeoffs:**
- Costs 240px of horizontal space. At 1280px this leaves ~1040px for content — still generous.
- Mobile requires a hamburger + slide-out drawer. One extra interaction vs. horizontal overflow scroll. Both are standard; the drawer is more intentional.
- More markup / CSS than Options B or C. Still ~300–400 lines total.

---

## Option B: Compact Top Nav + Command Palette

**Pattern:** Notion, GitHub Codespaces, Raycast.

Keep a horizontal top nav but reduce it to 4–5 primary items by grouping. Add Cmd-K for everything else.

**Groups:**
- **Scan** (covers Document Check + Email Scanner — same action: "run a scan on something")  
- **Cloud** (Cloud Audit + Calendar Audit — same flow: "connect account, get report")  
- **Radar** (Exposure Radar standalone)  
- **Toolkit** (Privacy Toolkit standalone)  
- **Settings** (icon only, right-justified)

Command palette handles Protection Rules, individual module access, settings, and keyboard-first navigation.

**Dashboard recomposited as a 3-column grid:**
```
┌─────────────────────────────────────────────────────────┐
│  ShieldMe  [Scan] [Cloud] [Radar] [Toolkit]    [⚙ ][⌘K]│
├─────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │ Score card │  │ Last scan  │  │   Module status    │ │
│  │   [gauge]  │  │ C/W/I      │  │ Drive: not audited │ │
│  │   74 / 100 │  │            │  │ Radar: not checked │ │
│  └────────────┘  └────────────┘  │ Calendar: off      │ │
│                                  └────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Quick actions                                      │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Honest assessment:**

The grouping has a problem: "Scan" vs "Cloud" is meaningful to someone who already knows ShieldMe. To a first-time user, it's opaque. Why is Calendar Audit under Cloud and not under Scan? Because it uses OAuth, not paste — but the user doesn't know that yet. You'd need tooltips or a first-run explanation, which erodes the "3 clicks to first scan" principle.

The command palette is genuinely powerful but it's an enhancement, not a substitute for navigation. Privacy-anxious users — ShieldMe's target audience — are not typically command-palette power users. They're careful people who want to understand every step. Hiding 4 out of 9 modules behind Cmd-K tells them the app is more complex than it looks, which is the wrong signal.

**Bottom line:** Option B would work, but it creates a grouping problem that doesn't exist in Option A, and the command palette is a great *enhancement* to add later, not the primary navigation model for v1.0.

---

## Option C: Module Hub (card-first mosaic)

**Pattern:** Cloudflare dashboard (product cards), iOS home screen, some fintech apps.

Abolish traditional nav entirely on desktop. The Dashboard IS the navigation: a mosaic of module cards, each showing live status, each clickable to enter the module. Navigation within a module session uses breadcrumbs + a floating back pill.

```
┌─────────────────────────────────────────────────────────┐
│  ShieldMe                              [Settings] [⌘K]  │
├─────────────────────────────────────────────────────────┤
│  PRIVACY AUDIT   ·  74 / 100   ·  Cautious              │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────┐ │
│  │  Document  │ │   Email   │ │   Cloud   │ │Calendar │ │
│  │   Check    │ │  Scanner  │ │   Audit   │ │  Audit  │ │
│  │  5 scans   │ │  not used │ │  not conn │ │  off    │ │
│  └───────────┘ └───────────┘ └───────────┘ └─────────┘ │
│  ┌───────────┐ ┌───────────┐ ┌─────────────────────────┐│
│  │  Exposure  │ │  Privacy  │ │  Protection Rules       ││
│  │   Radar    │ │  Toolkit  │ │  6 categories · 3 ON   ││
│  │  not used  │ │  not used │ └─────────────────────────┘│
│  └───────────┘ └───────────┘                            │
└─────────────────────────────────────────────────────────┘
```

**Honest assessment:**

This is the most visually distinctive option and has real appeal. The problem is that it optimizes for the dashboard over every route. Once you enter a module (say, Cloud Audit), you've left the card grid. The user's mental model shifts from "home grid" to "inside a module" — and returning to the home grid to navigate to Protection Rules requires a back button or breadcrumb, which is slower than a permanent sidebar. Privacy tool users will use Protection Rules and Cloud Audit in the same session constantly. The hub model penalizes exactly that workflow.

Also: Cloudflare makes this work because their modules are largely independent products (Pages, Workers, R2, D1). ShieldMe's modules aren't — they share the Protection Rules state and the Exposure Score, which means they're interconnected features of one tool, not a product suite. The hub metaphor implies independence that doesn't exist here.

**Bottom line:** Would look impressive in a Dribbble shot. Would frustrate users in practice. Defer to v1.5 as an optional home-screen mode if the core app gets traction.

---

## Recommendation: Option A

Build the left rail. It's the standard because it's correct for this category of app. The implementation is straightforward: ~200 lines of CSS restructuring `app-shell` from a column to a row, plus a `sidebar` element containing the nav. The routes don't need to change; they just get more horizontal space.

**After Option A is in place, add Command Palette as a v1.0 enhancement** (Cmd-K, not a replacement for nav). It's a great secondary affordance for keyboard users and adds perceived polish without the discoverability problem of Option B.

**Specific changes needed regardless of which option is chosen:**

1. `app-main` needs `margin-inline: auto` — this is not optional, it's broken today.
2. Dashboard needs a 2-column or 2+1 grid layout — stacked single column at 1180px is never acceptable for a primary dashboard.
3. The exposure gauge should grow: 120px is popup size; at least 180px–200px in a hero context.
4. Font bundling: Manrope and Inter fall back to system-ui currently (no WOFF2 in `public/fonts/`). The design intent in `styles.modern.css` is not materialized. This is a 30-minute task regardless of which IA is chosen.

---

## Questions for the user

1. **Which option?** A (sidebar — recommended), B (grouped top nav + command palette), or C (module hub), or a hybrid?
2. **Sidebar width:** 220px (tight, Bitwarden-style) or 260px (generous, Linear-style)?
3. **Font bundling:** Should I handle Manrope + Inter WOFF2 bundling as part of this redesign pass, or defer?
4. **Mobile:** Sidebar collapses to hamburger + slide-out drawer on ≤768px — confirmed?
