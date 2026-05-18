# Protection Presets

**One-click bundles of detectors curated for common user situations.** Presets exist so an everyday user doesn't have to toggle 40+ individual detectors — they pick the situation that matches them ("I live in Greece", "I handle payment cards at work") and the extension configures itself.

Derived from Microsoft Purview's [DLP Policy Templates](https://learn.microsoft.com/en-us/purview/dlp-policy-templates-include), re-expressed in plain consumer language. Users **never** see "HIPAA", "GDPR", "PCI-DSS", "PIPEDA", "APPI", "DLP", "policy template", or regulation names. They see their situation.

Detector IDs referenced below are defined in [detector-catalog.md](./detector-catalog.md).

---

## 1. How presets interact with Rules

A **Preset** is a named, versioned recipe that applies three changes to `Rules` (see [data-model.md §2](../specs/001-shieldme-mvp/data-model.md)):

1. **Category toggles** — sets `categories[*].enabled` (for the six consumer categories).
2. **Detector toggles** — sets `categories[*].detectors[detectorId]` for detector IDs in the preset.
3. **Locale hint** — stamps `rules.presetLocale` (e.g. `"gr"`, `"eu"`, `"global"`) used by the detector registry to filter country-scoped detectors.

Presets are **additive and non-destructive**:
- Applying a preset enables its detectors; it does **not** disable detectors already on from other presets.
- Users can stack presets: *"Greek Resident" + "I handle payment cards" + "EU Citizen"* = union of all three.
- Unapplying a preset disables detectors it enabled **and that no other active preset still enables** — tracked by `rules.activePresets: PresetId[]`.
- A user can always override individual detectors after applying a preset (Advanced panel). Manual overrides win over preset re-application.

**Free-tier behavior:** applying a preset is always allowed. The scan capacity limits (5 scans/month, 10 MB/file, etc.) still apply via `TierGate`. Presets that would require Premium-only detectors (currently none — all catalog entries ship at Free capacity) would gate individual detectors, never the preset itself.

---

## 2. First-run preset picker

On install, after the welcome screen, the user sees:

> **"Tell us about you — we'll turn on the right protections."**
>
> - Where do you live? *(country picker → single residency preset)*
> - Any of these apply to you? *(multi-select, optional)*
>   - ☐ I handle payment cards at work
>   - ☐ I work in healthcare
>   - ☐ I travel internationally
>   - ☐ I have children
>   - ☐ I'm a software developer or handle API keys
>
> [Use my picks] · [Skip — use recommended defaults]

"Skip" applies the **Global Default** preset (§3.1). Picks combine via union.

---

## 3. Preset Catalog

Each preset has:
- **ID** — stable, internal (e.g. `preset.residency.gr`).
- **Consumer title** — what the UI shows.
- **Short description** — one sentence, plain language.
- **Categories turned ON** — the six consumer categories.
- **Detector groups** — references to catalog sections (not individual detector IDs pasted here; the `PresetResolver` contract expands them).
- **Ship tier** — whether the preset ships in GA or Beta.

### 3.1 Global Default (fallback)

- **ID:** `preset.default.global`
- **Consumer title:** Recommended protections
- **Description:** The basics everyone should have watched — credit cards, passwords, and email addresses.
- **Categories ON:** My Money, My Identity, My Digital Life
- **Categories OFF:** My Health, My Family, My Location
- **Includes:** Credit/debit cards (§1.1), IBAN (§1.2), global SWIFT, passwords & API keys (§5.1), email addresses (§5.3), international phone numbers (§5.3)
- **Source:** n/a — ShieldMe curated baseline
- **Tier:** **GA**

### 3.2 Residency presets (one-pick)

One of these is selected by the country picker. They turn on the Money + Identity detectors for that country plus EU-wide detectors when applicable.

| ID | Consumer title | Description | Catalog groups | Source (Microsoft DLP template) | Tier |
|---|---|---|---|---|---|
| `preset.residency.us` | I live in the United States | Watches your SSN, driver's license, state ID, U.S. bank info, and health insurance number. | §1.2 US bank, §1.3 SSN/ITIN, §2.1 US passport, §2.2 state DL, §3.1 US MBI | U.S. State Breach Notification Laws · U.S. Enhanced · U.S. PII | **GA** |
| `preset.residency.uk` | I live in the United Kingdom | Watches your National Insurance number, NHS number, UK driver's licence, and UK bank details. | §1.2 UK bank, §1.3 UK NINO/UTR, §2.1 UK passport, §2.2 UK DL, §3.1 NHS | United Kingdom Data Protection Act · UK PII · UK Financial Data | **GA** |
| `preset.residency.de` | I live in Germany | Watches your Personalausweis, German tax ID, bank details, and Krankenversichertennummer. | §1.2 IBAN, §1.3 DE Tax ID, §2.1 DE passport, §2.1 Personalausweis, §2.2 DE DL, §3.1 DE insurance | Germany Financial Data · Germany PII | **GA** |
| `preset.residency.fr` | I live in France | Watches your CNI, INSEE (Social Security), French tax ID, and bank details. | §1.2 IBAN, §1.3 FR INSEE/TIN, §2.1 FR passport, §2.1 CNI, §2.2 FR DL, §3.1 FR AMELI | France Data Protection Act · France PII · France Financial Data | **GA** |
| `preset.residency.it` | I live in Italy | Watches your Codice Fiscale, Italian ID card, driver's licence, and bank details. | §1.2 IBAN, §1.3 IT CF/VAT, §2.1 IT passport, §2.1 IT identity card, §2.2 IT DL | Italy Data Protection Act · Italy PII · Italy Financial Data | **GA** |
| `preset.residency.es` | I live in Spain | Watches your DNI/NIE, Spanish passport, driver's licence, and bank details. | §1.2 IBAN, §1.3 ES DNI/NIF, §2.1 ES passport, §2.1 DNI, §2.2 ES DL, §3.1 ES SSN | Spain PII · Spain Financial Data | **GA** |
| `preset.residency.pt` | I live in Portugal | Watches your NIF, Cartão de Cidadão, passport, and bank details. | §1.2 IBAN, §1.3 PT NIF, §2.1 PT passport, §2.1 PT ID card, §2.2 PT DL | Portugal PII · Portugal Financial Data | **GA** |
| `preset.residency.gr` | I live in Greece | Watches your AFM, AMKA (social security), ΑΔΤ (ID card), Greek passport, and bank details. | §1.2 IBAN, §1.3 GR AFM, §2.1 GR passport, §2.1 GR ΑΔΤ, §2.2 GR DL, §3.1 AMKA | Greece PII (Microsoft) — extended with AMKA per local research | **GA** |
| `preset.residency.nl` | I live in the Netherlands | Watches your BSN, Dutch passport, driver's licence, and IBAN. | §1.2 IBAN, §1.3 NL Tax ID/VAT, §2.1 NL passport, §2.1 BSN, §2.2 NL DL | Netherlands PII · Netherlands Financial Data | **GA** |
| `preset.residency.au` | I live in Australia | Watches your Tax File Number, Medicare number, driver's licence, and Australian bank details. | §1.2 AU bank, §1.3 AU TFN/ABN, §2.1 AU passport, §2.2 AU DL, §3.1 AU Medicare | Australia Financial Data · Australia PII · Australia Privacy Act | **GA** |
| `preset.residency.ca` | I live in Canada | Watches your Social Insurance Number, Canadian passport, driver's licence, health card, and bank details. | §1.2 CA bank, §1.3 CA SIN, §2.1 CA passport, §2.2 CA DL, §3.1 CA PHIN | Canada PIPEDA · Canada PII · Canada Financial Data | **GA** |
| `preset.residency.jp` | I live in Japan | Watches your My Number (individual), bank details, residence card, and driver's licence. | §1.2 JP bank, §1.3 JP My Number / corporate, §2.1 JP passport, §2.2 JP DL | Japan PII · Japan Financial Data (APPI-aligned) | **GA** |

**Beta residency presets** (same structure, not corpus-gated): Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia, Finland, Hungary, Iceland, Ireland, Latvia, Liechtenstein, Lithuania, Luxembourg, Malta, Norway, Poland, Romania, Slovakia, Slovenia, Sweden, Switzerland, Argentina, Brazil, Chile, China, Ecuador, Hong Kong, India, Indonesia, Israel, Malaysia, Mexico, New Zealand, Philippines, Qatar, Russia, Saudi Arabia, Singapore, South Africa, South Korea, Taiwan, Thailand, Turkey, U.A.E., Ukraine. IDs: `preset.residency.{iso2}`.

### 3.3 Regional union presets

Activate **alongside** a residency preset when users cross borders.

| ID | Consumer title | Description | Catalog groups | Source | Tier |
|---|---|---|---|---|---|
| `preset.region.eu` | I'm a European Union citizen | Adds EU-wide protections for debit cards, passports and driver's licences accepted across the EU. | §1.1 EU debit card, §2.1 EU passport, §2.2 EU DL | General Data Protection Regulation (GDPR) Enhanced | **GA** |
| `preset.region.traveler` | I travel internationally | Adds passports and driver's licences for the countries you're most likely to visit. | §2.1 all Tier-1 passports, §2.2 Tier-1 DLs | n/a — ShieldMe curated | **GA** |

### 3.4 Situation presets (multi-select)

Independent add-ons. Each answers a "this is part of my life" question.

| ID | Consumer title | Description | Categories touched | Catalog groups | Source (Microsoft DLP) | Tier |
|---|---|---|---|---|---|---|
| `preset.work.payments` | I handle payment cards at work | Watches credit card numbers, card + holder-name combos, CVV proximity. Protects you from accidentally emailing cardholder data. | My Money | §1.1 all cards, §1.4 cardholder-context keywords | PCI Data Security Standard (PCI DSS) | **GA** |
| `preset.work.healthcare` | I work in healthcare | Watches medical record numbers, diagnoses, medications, and patient identifiers. Flagged as Critical and **redacted** in reports by default. | My Health | §3.1 all regional medical IDs, §3.2 ICD-10, §3.3 medications, §3.4 lab terms, §3.5 procedures | U.S. HIPAA · UK Access to Medical Reports Act · Canada Health Information Act · Japan APPI (Health) | **GA** |
| `preset.work.developer` | I'm a software developer | Watches API keys, cloud credentials, private keys, connection strings, and SSH/PGP material. | My Digital Life | §5.1 credentials & secrets, §5.2 cloud keys (AWS/Azure/GCP/GitHub/Slack/etc.) | n/a — ShieldMe curated (extends Azure connection-string SITs) | **GA** |
| `preset.life.parent` | I have children | Watches minor-name + school-or-age combos, children's identifiers, and family address blocks. | My Family | §4.1 minor+school, §4.2 spouse/child cross-ref, §4.3 emergency contact | n/a — ShieldMe original | **GA** |
| `preset.life.traveler` | I travel a lot | Adds passports for countries you commonly visit plus home-address + itinerary proximity detectors. | My Identity, My Location | §2.1 all Tier-1 passports, §2.6 addresses | n/a — ShieldMe curated | **GA** |
| `preset.life.privacy-max` | Maximum privacy | Turns on every detector in every category — highest sensitivity. Expect more warnings. | All six | All GA detectors + opt-in to Beta | n/a — ShieldMe curated | **GA** |

### 3.5 Breach & broker preset (Radar)

| ID | Consumer title | Description | Module | Tier |
|---|---|---|---|---|
| `preset.radar.essentials` | Essential exposure checks | Runs a password breach check and opens the 20-site data-broker opt-out checklist. | Exposure Radar | **GA** |

This preset doesn't toggle detectors — it pre-seeds Radar module state (`BrokerProgress` entries created in `unchecked` status). Included here so all first-run flows converge on a single "Presets" concept.

---

## 4. Preset schema

Presets live in code at `src/data/presets/<preset-id>.json`, compiled into the bundle. The runtime `PresetResolver` (contract in [detection-engine.md](../specs/001-shieldme-mvp/contracts/detection-engine.md)) expands a preset ID into concrete category and detector toggles.

```jsonc
{
  "id": "preset.residency.gr",
  "version": 1,
  "title.i18nKey": "preset.residency.gr.title",
  "description.i18nKey": "preset.residency.gr.desc",
  "locale": "gr",
  "categories": {
    "my-money":        { "enabled": true },
    "my-identity":     { "enabled": true },
    "my-digital-life": { "enabled": true },
    "my-health":       { "enabled": false },
    "my-family":       { "enabled": false },
    "my-location":     { "enabled": false }
  },
  "detectors": {
    "money.bank.iban":        true,
    "money.tax.gr-afm":       true,
    "identity.passport.gr":   true,
    "identity.national.gr-adt": true,
    "identity.dl.gr":         true,
    "health.medical-id.gr-amka": false
  },
  "shipTier": "GA",
  "sourceNote": "Greece PII (Microsoft DLP) + AMKA (local research)"
}
```

**Validation (enforced in CI by `scripts/verify-presets.mjs`):**
- Every `detectors[id]` key exists in the detector catalog.
- Exactly one residency preset can be active at a time (`PresetResolver` enforces at apply-time, not at schema level).
- `locale` is a valid ISO-3166-1 alpha-2 code, `"eu"`, or `"global"`.
- No preset references a detector whose ship tier is `Planned`.

---

## 5. UI surface

**Settings → My Protection Rules → Presets panel:**

```
┌──────────────────────────────────────────────────┐
│  Your situation                                  │
│  ─────────────────                               │
│  You live in:   [ Greece          ▾ ]           │
│                                                  │
│  Also:                                           │
│    ☑ I'm a European Union citizen                │
│    ☐ I handle payment cards at work              │
│    ☐ I work in healthcare                        │
│    ☐ I'm a software developer                    │
│    ☑ I have children                             │
│    ☐ I travel a lot                              │
│                                                  │
│  [ Apply presets ]   [ Reset to recommended ]    │
│                                                  │
│  Active presets: Greek Resident, EU Citizen,     │
│  I have children                                 │
└──────────────────────────────────────────────────┘
```

**Advanced panel** (collapsible) still lists individual categories and detectors; presets are a fast path, not a cage.

**Diff preview:** before clicking Apply, the panel shows *"This will turn on 18 protections and turn off 0"* with an expandable list using **consumer labels only** (no detector IDs).

---

## 6. Governance

- When Microsoft adds a DLP template relevant to consumers, evaluate it within **30 days**. If accepted, add or extend the matching preset and bump the preset's `version`.
- Preset changes across a minor version (e.g. adding a detector to an existing preset) **do not auto-apply** to users who had already applied the preset. They surface as a non-blocking banner: *"Your 'Greek Resident' protections have 2 new updates. [Review]"*.
- Preset **removals** (e.g. a country discontinues an ID scheme) prompt the user — they are not silent.
- Each preset's GA→Beta→deprecated transitions are logged in `docs/CHANGELOG.md` under a `Presets` section.

---

## 7. Out of scope for presets (v1)

- **No enterprise presets** (e.g. "SOX", "FISMA", "DFARS"). ShieldMe is consumer-first; those remain out of category.
- **No per-industry presets beyond the five in §3.4.** Adding "I'm a lawyer" / "I'm a teacher" is a v2 question pending user research.
- **Preset sharing/export** between users — privacy concern and not in MVP scope.
- **Preset auto-detection from document contents** — deliberately avoided; users opt into their situation, the extension does not profile them.
