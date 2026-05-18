# Detector Catalog

Authoritative mapping from **consumer-facing labels** (what users see in the extension) to **internal detector IDs** (what engineers implement). Derived from two Microsoft Purview sources:

- [DLP Policy Templates](https://learn.microsoft.com/en-us/purview/dlp-policy-templates-include)
- [SIT Entity Definitions](https://learn.microsoft.com/en-us/purview/sit-sensitive-information-type-entity-definitions)

**Users never see** the SIT names, regulation names ("HIPAA", "GDPR", "PIPEDA"), or terms like "regex" / "classifier". They see one of our six **Categories** (My Money, My Identity, My Health, My Family, My Digital Life, My Location) and — optionally, as a one-click bundle — a [Protection Preset](./protection-presets.md).

---

## Ship Tiers

Each detector has one of:

| Badge | Meaning | Corpus gate applies? |
|---|---|---|
| **GA** | Ships in first Chrome Web Store release. Default-available. | Yes (FPR ≤2%, recall ≥95%) |
| **Beta** | Implemented; opt-in via "Include detectors for other countries". | Best-effort corpus; no recall gate |
| **Planned** | Catalogued for the roadmap. Not yet implemented. | — |

**Tier 1 (GA) countries:** United States · United Kingdom · Germany · France · Italy · Spain · Portugal · Greece · Netherlands · Australia · Canada · Japan · plus EU-wide and global patterns.

**Tier 2 (Beta):** Austria, Belgium, Bulgaria, Croatia, Cyprus, Czech Republic, Denmark, Estonia, Finland, Hungary, Iceland, Ireland, Latvia, Liechtenstein, Lithuania, Luxembourg, Malta, Norway, Poland, Romania, Slovakia, Slovenia, Sweden, Switzerland, Argentina, Brazil, Chile, China, Ecuador, Hong Kong, India, Indonesia, Israel, Malaysia, Mexico, New Zealand, Philippines, Qatar, Russia, Saudi Arabia, Singapore, South Africa, South Korea, Taiwan, Thailand, Turkey, U.A.E., Ukraine.

---

## 1. My Money

**Framing:** *"Your cards, bank details, tax IDs and crypto — we'll catch them before they leak."*

### 1.1 Credit & debit cards

| Consumer label | Internal detector | Region | Validator | Tier |
|---|---|---|---|---|
| Credit or debit card number | `money.card.generic` | Global (Visa/MC/Amex/Discover/Diners/JCB) | Luhn | **GA** |
| EU debit card number | `money.card.eu-debit` | EU | Luhn | **GA** |

Maps SIT: *Credit card number · EU debit card number*.

### 1.2 Bank accounts

| Consumer label | Internal detector | Region | Validator | Tier |
|---|---|---|---|---|
| Bank account number (IBAN) | `money.bank.iban` | 70+ countries | Mod-97 | **GA** |
| Bank account number — US | `money.bank.us-account` | US | — | **GA** |
| ABA routing number | `money.bank.us-aba` | US | Checksum | **GA** |
| Bank account number — UK | `money.bank.uk-account` | UK | Sort-code + account | **GA** |
| Bank account number — Canada | `money.bank.ca-account` | CA | Institution + transit | **GA** |
| Bank account number — Australia | `money.bank.au-account` | AU | BSB + account | **GA** |
| Bank account number — Japan | `money.bank.jp-account` | JP | — | **GA** |
| Bank account number — Israel | `money.bank.il-account` | IL | — | Beta |
| Bank account number — New Zealand | `money.bank.nz-account` | NZ | — | Beta |
| SWIFT/BIC code | `money.bank.swift` | Global | Format | **GA** |

Maps SIT: *International banking account number (IBAN) · U.S. bank account number · ABA routing number · Canada bank account number · Australia bank account number · Japan bank account number · Israel bank account number · New Zealand bank account number · SWIFT code*.

### 1.3 Tax IDs (country-specific)

| Consumer label | Internal detector | Country | Validator | Tier |
|---|---|---|---|---|
| U.S. Social Security Number (SSN) | `money.tax.us-ssn` | US | Area-number blacklist | **GA** |
| U.S. Taxpayer ID (ITIN) | `money.tax.us-itin` | US | Format | **GA** |
| UK Unique Taxpayer Reference | `money.tax.uk-utr` | UK | 10-digit format | **GA** |
| UK National Insurance (NINO) | `money.tax.uk-nino` | UK | Prefix blacklist | **GA** |
| Greek Tax ID (ΑΦΜ / AFM) | `money.tax.gr-afm` | GR | AFM checksum | **GA** |
| German Tax ID | `money.tax.de-tin` | DE | 11-digit checksum | **GA** |
| French Tax ID | `money.tax.fr-tin` | FR | 13-digit | **GA** |
| French INSEE (Social Security) | `money.tax.fr-insee` | FR | INSEE checksum | **GA** |
| Italian Codice Fiscale | `money.tax.it-cf` | IT | Checksum | **GA** |
| Italian VAT | `money.tax.it-vat` | IT | Format | **GA** |
| Spanish DNI | `money.tax.es-dni` | ES | Letter checksum | **GA** |
| Spanish Tax ID (NIF) | `money.tax.es-nif` | ES | Letter checksum | **GA** |
| Portuguese Tax ID (NIF) | `money.tax.pt-nif` | PT | NIF checksum | **GA** |
| Netherlands Tax ID | `money.tax.nl-tin` | NL | Format | **GA** |
| Netherlands VAT | `money.tax.nl-vat` | NL | Format | **GA** |
| Australia Tax File Number | `money.tax.au-tfn` | AU | Checksum | **GA** |
| Australia Business Number (ABN) | `money.tax.au-abn` | AU | Checksum | **GA** |
| Canada Social Insurance Number (SIN) | `money.tax.ca-sin` | CA | Luhn | **GA** |
| Japan Corporate Number (My Number — Corporate) | `money.tax.jp-mnc` | JP | — | **GA** |
| EU-wide Tax ID (generic) | `money.tax.eu-tin` | EU | — | **GA** |
| Austria Tax ID | `money.tax.at-tin` | AT | — | Beta |
| Austria VAT | `money.tax.at-vat` | AT | — | Beta |
| Belgium VAT | `money.tax.be-vat` | BE | — | Beta |
| Cyprus Tax ID | `money.tax.cy-tin` | CY | — | Beta |
| Germany VAT | `money.tax.de-vat` | DE | — | Beta |
| France VAT | `money.tax.fr-vat` | FR | — | Beta |
| Hungary Tax ID | `money.tax.hu-tin` | HU | — | Beta |
| Hungary VAT | `money.tax.hu-vat` | HU | — | Beta |
| Malta Tax ID | `money.tax.mt-tin` | MT | — | Beta |
| Poland Tax ID | `money.tax.pl-tin` | PL | — | Beta |
| Slovenia Tax ID | `money.tax.si-tin` | SI | — | Beta |
| Sweden Tax ID | `money.tax.se-tin` | SE | — | Beta |
| India PAN | `money.tax.in-pan` | IN | Format | Beta |
| India GST | `money.tax.in-gst` | IN | Format | Beta |
| Brazil CPF | `money.tax.br-cpf` | BR | Checksum | Beta |
| Brazil CNPJ | `money.tax.br-cnpj` | BR | Checksum | Beta |
| Argentina CUIT/CUIL | `money.tax.ar-cuit` | AR | Checksum | Beta |

Maps SIT: *U.S. social security number · U.S. individual taxpayer identification number (ITIN) · U.K. Unique Taxpayer Reference · U.K. national insurance number (NINO) · Greece tax identification number · Germany tax identification number · France tax identification number · France INSEE · Italy fiscal code · Italy VAT · Spain DNI · Spain tax identification number · Portugal tax identification number · Netherlands tax identification number · Netherlands VAT · Australia tax file number · Australia business number · Canada social insurance number · Japan My Number - Corporate · EU Tax identification number · Austria tax identification number · Austria VAT · Belgium VAT · Cyprus tax identification number · Germany VAT · France VAT · Hungary tax identification number · Hungary VAT · Malta tax identification number · Poland tax identification number · Slovenia tax identification number · Sweden tax identification number · India PAN · India GST · Brazil CPF · Brazil CNPJ · Argentina CUIT/CUIL*.

### 1.4 Crypto wallets

| Consumer label | Internal detector | Format | Tier |
|---|---|---|---|
| Crypto wallet address | `money.crypto.btc` | Bitcoin (1/3/bc1) | **GA** |
| Crypto wallet address | `money.crypto.eth` | Ethereum (0x) | **GA** |
| Crypto wallet address | `money.crypto.altcoin` | Litecoin, Monero, Solana, XRP, common altcoins | **GA** |

Not covered by Microsoft's SIT set — ShieldMe-original detector.

### 1.5 Financial keywords in context

| Consumer label | Internal detector | Trigger | Tier |
|---|---|---|---|
| Financial keywords near numbers | `money.context.keywords` | "salary", "income", "net worth", "loan amount", "mortgage" adjacent to monetary values | **GA** |

ShieldMe-original; used to raise confidence on otherwise-ambiguous numbers.

---

## 2. My Identity

**Framing:** *"Passports, ID cards, driver's licenses, date of birth, your full name paired with your address."*

### 2.1 National IDs

| Consumer label | Internal detector | Country | Tier |
|---|---|---|---|
| Greek ID (ΑΔΤ) | `identity.nat.gr-adt` | GR | **GA** |
| UK national insurance (identity use) | `identity.nat.uk-ni` | UK | **GA** |
| German Personalausweis | `identity.nat.de-pa` | DE | **GA** |
| French CNI | `identity.nat.fr-cni` | FR | **GA** |
| Italian fiscal code (identity use) | `identity.nat.it-cf` | IT | **GA** |
| Spanish DNI | `identity.nat.es-dni` | ES | **GA** |
| Portuguese Citizen Card | `identity.nat.pt-ccc` | PT | **GA** |
| Netherlands BSN | `identity.nat.nl-bsn` | NL | **GA** |
| US Social Security Number | `identity.nat.us-ssn` | US | **GA** |
| Canada Social Insurance Number | `identity.nat.ca-sin` | CA | **GA** |
| Australia Tax File Number (identity use) | `identity.nat.au-tfn` | AU | **GA** |
| Japan My Number (Personal) | `identity.nat.jp-mn` | JP | **GA** |
| EU-wide national ID (generic) | `identity.nat.eu-generic` | EU | **GA** |
| EU SSN or equivalent | `identity.nat.eu-ssn` | EU | **GA** |
| Austria SSN | `identity.nat.at-ssn` | AT | Beta |
| Austria identity card | `identity.nat.at-id` | AT | Beta |
| Belgium national number | `identity.nat.be-nn` | BE | Beta |
| Bulgaria uniform civil number | `identity.nat.bg-ucn` | BG | Beta |
| Croatia OIB | `identity.nat.hr-oib` | HR | Beta |
| Croatia identity card | `identity.nat.hr-id` | HR | Beta |
| Cyprus identity card | `identity.nat.cy-id` | CY | Beta |
| Czech personal identity | `identity.nat.cz-pid` | CZ | Beta |
| Denmark personal ID | `identity.nat.dk-cpr` | DK | Beta |
| Estonia personal ID code | `identity.nat.ee-pic` | EE | Beta |
| Finland national ID | `identity.nat.fi-hetu` | FI | Beta |
| Hungary personal ID | `identity.nat.hu-pid` | HU | Beta |
| Hungary social security (TAJ) | `identity.nat.hu-taj` | HU | Beta |
| Ireland PPS | `identity.nat.ie-pps` | IE | Beta |
| Israel national ID | `identity.nat.il-id` | IL | Beta |
| Latvia personal code | `identity.nat.lv-pc` | LV | Beta |
| Lithuania personal code | `identity.nat.lt-pc` | LT | Beta |
| Luxembourg national ID (natural person) | `identity.nat.lu-idnat` | LU | Beta |
| Malta identity card | `identity.nat.mt-id` | MT | Beta |
| Norway national ID | `identity.nat.no-nin` | NO | Beta |
| Poland PESEL | `identity.nat.pl-pesel` | PL | Beta |
| Poland identity card | `identity.nat.pl-id` | PL | Beta |
| Romania CNP | `identity.nat.ro-cnp` | RO | Beta |
| Slovakia personal number | `identity.nat.sk-pn` | SK | Beta |
| Slovenia EMŠO | `identity.nat.si-umcn` | SI | Beta |
| Spain SSN | `identity.nat.es-ssn` | ES | Beta |
| Sweden national ID | `identity.nat.se-nin` | SE | Beta |
| Switzerland SSN (AHV) | `identity.nat.ch-ahv` | CH | Beta |
| Turkey national ID | `identity.nat.tr-tckn` | TR | Beta |
| Ukraine (domestic passport ID use) | `identity.nat.ua-dp` | UA | Beta |
| India Aadhaar | `identity.nat.in-aadhaar` | IN | Beta |
| India Voter ID | `identity.nat.in-voter` | IN | Beta |
| Indonesia KTP | `identity.nat.id-ktp` | ID | Beta |
| China Resident ID (PRC) | `identity.nat.cn-rid` | CN | Beta |
| Hong Kong HKID | `identity.nat.hk-id` | HK | Beta |
| Taiwan national ID | `identity.nat.tw-id` | TW | Beta |
| Taiwan residence cert (ARC/TARC) | `identity.nat.tw-arc` | TW | Beta |
| South Korea resident registration | `identity.nat.kr-rrn` | KR | Beta |
| Thailand population ID | `identity.nat.th-pid` | TH | Beta |
| Malaysia ID card | `identity.nat.my-mykad` | MY | Beta |
| Singapore NRIC | `identity.nat.sg-nric` | SG | Beta |
| Philippines national ID | `identity.nat.ph-id` | PH | Beta |
| Philippines UMID | `identity.nat.ph-umid` | PH | Beta |
| U.A.E. identity card | `identity.nat.ae-id` | AE | Beta |
| Qatar ID card | `identity.nat.qa-id` | QA | Beta |
| Saudi Arabia national ID | `identity.nat.sa-id` | SA | Beta |
| South Africa ID | `identity.nat.za-id` | ZA | Beta |
| Brazil RG | `identity.nat.br-rg` | BR | Beta |
| Japan resident registration | `identity.nat.jp-rrn` | JP | Beta |
| Japan residence card | `identity.nat.jp-rc` | JP | Beta |
| Mexico CURP | `identity.nat.mx-curp` | MX | Beta |
| Chile identity card | `identity.nat.cl-id` | CL | Beta |
| Argentina DNI | `identity.nat.ar-dni` | AR | Beta |
| Ecuador unique ID | `identity.nat.ec-id` | EC | Beta |

Maps SIT: all "* national identification / national ID / personal code / resident registration / identity card / PESEL / EMŠO / CPR / HETU / Aadhaar / HKID / NRIC / MyKad / CURP / DNI / CUIT / RG" entries, plus regional aggregates *EU national identification number · EU social security number or equivalent*.

### 2.2 Passports

| Consumer label | Internal detector | Country | Tier |
|---|---|---|---|
| Passport number | `identity.pass.us-uk` | US, UK combined (common format) | **GA** |
| Passport number — Germany | `identity.pass.de` | DE | **GA** |
| Passport number — France | `identity.pass.fr` | FR | **GA** |
| Passport number — Italy | `identity.pass.it` | IT | **GA** |
| Passport number — Spain | `identity.pass.es` | ES | **GA** |
| Passport number — Portugal | `identity.pass.pt` | PT | **GA** |
| Passport number — Greece | `identity.pass.gr` | GR | **GA** |
| Passport number — Netherlands | `identity.pass.nl` | NL | **GA** |
| Passport number — Australia | `identity.pass.au` | AU | **GA** |
| Passport number — Canada | `identity.pass.ca` | CA | **GA** |
| Passport number — Japan | `identity.pass.jp` | JP | **GA** |
| Passport number — EU generic | `identity.pass.eu` | EU | **GA** |
| (32 more countries) | `identity.pass.<cc>` | AT, BE, BG, HR, CY, CZ, DK, EE, FI, HU, IE, LT, LU, LV, MT, PL, RO, SK, SI, SE, CH (EEA) + IL, IN, ID, MY, PH, KR, TW, TR, UA-intl, UA-dom, RU-intl, RU-dom, SA, AE | Beta |

Maps SIT: all "* passport number" entries + *EU passport number*.

### 2.3 Driver's licenses

Same 40+ countries as passports, following Microsoft's SIT coverage. Consumer label: "Driver's license number" with internal detector `identity.dl.<cc>`. EU-generic detector `identity.dl.eu`.

Maps SIT: all "* driver's license number" entries + *EU driver's license number*.

### 2.4 Date of birth (in context)

| Consumer label | Internal detector | Trigger | Tier |
|---|---|---|---|
| Date of birth | `identity.dob.in-context` | DOB patterns near "born", "birthday", "DOB", "ημερομηνία γέννησης", "date de naissance", "Geburtsdatum" | **GA** |

### 2.5 Full name + address

| Consumer label | Internal detector | Tier |
|---|---|---|
| Your name paired with your address | `identity.name-address.combo` | **GA** |
| All full names (standalone NER) | `identity.name.all` | **GA** (context-gated; low-confidence on its own) |

Uses Microsoft's *All full names* SIT + country address SITs (below).

### 2.6 Physical addresses (per country)

| Consumer label | Internal detector | Country | Tier |
|---|---|---|---|
| Home address | `identity.addr.<cc>` | US, UK, DE, FR, IT, ES, PT, GR, NL, AU, CA, JP | **GA** |
| Home address (other countries) | `identity.addr.<cc>` | AT, BE, BG, HR, CY, CZ, DK, EE, FI, HU, IE, IS, LT, LU, LV, LI, MT, NO, NZ, PL, RO, SE, SI, SK, CH, TR + BR | Beta |
| Home address (global fallback) | `identity.addr.all` | — | **GA** |

Maps SIT: all "* physical addresses" entries, plus *All Physical Addresses*.

### 2.7 UK electoral roll

| `identity.other.uk-electoral-roll` | UK | Beta |

Maps SIT: *U.K. electoral roll number*.

### 2.8 Russia / Ukraine

Russia: `identity.pass.ru-dom`, `identity.pass.ru-int` — Beta.
Ukraine: `identity.pass.ua-dom`, `identity.pass.ua-int` — Beta.

---

## 3. My Health

**Framing:** *"Medical record numbers, health insurance IDs, diagnoses, prescriptions, lab results."*

Default **OFF** (opt-in) per privacy sensitivity.

### 3.1 Medical record / health insurance numbers

| Consumer label | Internal detector | Country | Tier |
|---|---|---|---|
| UK NHS number | `health.id.uk-nhs` | UK | **GA** |
| US Medicare (MBI) | `health.id.us-mbi` | US | **GA** |
| US DEA number (prescriptions) | `health.id.us-dea` | US | **GA** |
| France health insurance number | `health.id.fr-hi` | FR | **GA** |
| Greek AMKA | `health.id.gr-amka` | GR | **GA** |
| Canada health service number | `health.id.ca-hsn` | CA | **GA** |
| Canada Personal Health ID (PHIN) | `health.id.ca-phin` | CA | **GA** |
| Australia medical account number | `health.id.au-mai` | AU | **GA** |
| Finland European Health Insurance | `health.id.fi-ehic` | FI | **GA** |
| New Zealand Ministry of Health | `health.id.nz-moh` | NZ | Beta |
| Generic medical record number | `health.id.generic-mrn` | Global | **GA** |

Maps SIT: *U.K. national health service number · Medicare Beneficiary Identifier (MBI) card · Drug Enforcement Agency (DEA) number · France health insurance number · Greece AMKA · Canada health service number · Canada personal health identification number (PHIN) · Australia medical account number · Finland European health insurance number · New Zealand ministry of health number*.

### 3.2 Medical conditions, medications, procedures (content)

| Consumer label | Internal detector | Tier |
|---|---|---|
| Diagnoses / diseases | `health.content.diseases` (ICD-10 + ICD-9 names + common terms) | **GA** |
| Diseases list (structured) | `health.content.icd10` + `health.content.icd9` | **GA** |
| Medication names — brand | `health.content.meds-brand` | **GA** |
| Medication names — generic | `health.content.meds-generic` | **GA** |
| Lab test terms | `health.content.lab-tests` | **GA** |
| Blood test terms | `health.content.blood-tests` | **GA** |
| Surgical procedures | `health.content.surgeries` | **GA** |
| Medical specialties | `health.content.specialties` | **GA** |
| Lifestyle conditions | `health.content.lifestyles` | Beta |
| US Disability impairments (SSA list) | `health.content.us-disability` | Beta |
| All medical terms & conditions (aggregate) | `health.content.all` | **GA** |

Maps SIT: *Diseases · International classification of diseases (ICD-10-CM / ICD-9-CM) · Brand medication names · Generic medication names · Lab test terms · Blood test terms · Surgical procedures · Medical specialities · Lifestyles that relate to medical conditions · Impairments Listed In The U.S. Disability Evaluation Under Social Security · All medical terms and conditions*.

### 3.3 Presentation

Health findings are displayed with **extra discretion**: matched terms in the UI are redacted to "••••" by default with a "Reveal" affordance; health findings are omitted from Share Score card counts to avoid even coarse disclosure.

---

## 4. My Family

**Framing:** *"Children's info, spouse details, emergency contacts — things you want extra careful about."*

Default **OFF** (opt-in). No Microsoft SIT directly maps; these are ShieldMe-original composites that pair other detectors with relationship keywords.

| Consumer label | Internal detector | Tier |
|---|---|---|
| Children's info (name + school or age) | `family.minor.school-age` | **GA** |
| Spouse/partner/child cross-reference | `family.relations.cross-ref` | **GA** |
| Emergency contact block | `family.emergency.block` | **GA** |

---

## 5. My Digital Life

**Framing:** *"Passwords, API keys, login credentials, phone numbers, emails."*

Default **ON**. Not region-specific.

### 5.1 Credentials & secrets

| Consumer label | Internal detector | Tier |
|---|---|---|
| Passwords & generic secrets | `digital.cred.password-generic` | **GA** |
| Login credentials (email + password pairs) | `digital.cred.login-pair` | **GA** |
| All credentials (aggregate) | `digital.cred.all` | **GA** |
| User login credentials (aggregate) | `digital.cred.user-login` | **GA** |
| General password field | `digital.cred.general-password` | **GA** |
| HTTP Authorization header | `digital.cred.http-auth-header` | **GA** |
| API key / client secret (generic) | `digital.cred.api-key-generic` | **GA** |
| Symmetric key (generic) | `digital.cred.symmetric-key` | **GA** |
| X.509 certificate private key | `digital.cred.x509-privkey` | **GA** |
| PEM block | `digital.cred.pem-block` | **GA** |
| SSH key | `digital.cred.ssh-key` | **GA** |
| PGP block | `digital.cred.pgp-block` | **GA** |
| ASP.NET machine key | `digital.cred.aspnet-machinekey` | Beta |
| SQL Server connection string | `digital.cred.mssql-conn` | **GA** |

Maps SIT: *All credentials · User login credentials · General password · General Symmetric key · Client secret / API key · Http authorization header · ASP.NET machine Key · X.509 certificate private key · SQL Server connection string*.

### 5.2 Cloud provider keys

Detected as a cohort ("cloud API keys"). Users see one category toggle; internals are fine-grained so we can accurately describe which service leaked when found.

| Consumer label | Internal detector | Tier |
|---|---|---|
| Cloud service API key / token | all below | **GA** (bundle) |
| — AWS S3 access key | `digital.cloud.aws-s3` | **GA** |
| — GitHub Personal Access Token | `digital.cloud.github-pat` | **GA** |
| — Google API key | `digital.cloud.google-api` | **GA** |
| — Slack access token | `digital.cloud.slack-token` | **GA** |
| — Microsoft Bing Maps key | `digital.cloud.bing-maps` | **GA** |
| — Microsoft Entra client secret | `digital.cloud.entra-secret` | **GA** |
| — Microsoft Entra client access token | `digital.cloud.entra-token` | **GA** |
| — Microsoft Entra user credentials | `digital.cloud.entra-user` | **GA** |
| — Azure (30+ services) | `digital.cloud.azure-*` | **GA** (all 30+ Azure SITs in one bundle toggle) |

Microsoft Azure SIT coverage includes: App Service deployment password, Batch shared access key, Bot Framework secret, Bot service app secret, Cognitive Search/Services keys, Container Registry access key, Cosmos DB account key, Databricks personal access token, DevOps app secret / PAT, DocumentDB auth key, EventGrid access key, Function Master/API key, IAAS DB / SQL connection string, IoT connection string & shared key, Logic App SAS, Machine Learning web service key, Maps subscription key, Publish setting password, Redis cache connection string (+ password), SAS tokens, Service Bus connection string + SAS, Shared Access key / Web Hook token, SignalR access key, Storage account access key (+ generic), Storage account SAS (+ high-risk), Subscription management certificate.

Maps SIT: *Amazon S3 Client Secret Access Key · GitHub Personal Access Token · Google API key · Slack access token · Microsoft Bing maps key · Microsoft Entra client access token · Microsoft Entra client secret · Microsoft Entra user Credentials · Azure App Service deployment password · Azure Batch shared access key · Azure Bot Framework secret key · Azure Bot service app secret · Azure Cognitive Search API key · Azure Cognitive Service key · Azure Container Registry access key · Azure Cosmos DB account access key · Azure Databricks personal access token · Azure DevOps app secret · Azure DevOps personal access token · Azure DocumentDB auth key · Azure EventGrid access key · Azure Function Master / API key · Azure IAAS database connection string and Azure SQL connection string · Azure IoT connection string · Azure IoT shared access key · Azure Logic app shared access signature · Azure Machine Learning web service API key · Azure Maps subscription key · Azure publish setting password · Azure Redis cache connection string (+ password) · Azure SAS · Azure service bus connection string (+ SAS) · Azure Shared Access key / Web Hook token · Azure SignalR access key · Azure SQL connection string · Azure storage account access key (+ key, generic, SAS, SAS high-risk) · Azure subscription management certificate*.

### 5.3 Contact info

| Consumer label | Internal detector | Tier |
|---|---|---|
| Phone number | `digital.contact.phone-intl` | **GA** (US/UK/EU/AU prioritized; global formats supported) |
| Email address | `digital.contact.email` | **GA** |
| Multiple emails in shared doc | `digital.contact.email-many` | **GA** |
| IP address (v4) | `digital.contact.ip-v4` | **GA** |
| IP address (v6) | `digital.contact.ip-v6` | **GA** |
| IP address (generic) | `digital.contact.ip-any` | **GA** |

Maps SIT: *IP address · IP Address v4 · IP Address v6*.

---

## 6. My Location

**Framing:** *"Your home address, GPS coords, geotags in photos."*

Default **OFF** (opt-in). Home-address detectors are **shared** with My Identity (§2.6) but contribute to My Location when that category is active — same detector, different consumer narrative.

| Consumer label | Internal detector | Tier |
|---|---|---|
| Home address (via §2.6 detectors) | shared | **GA** for 12 countries |
| GPS coordinates | `location.gps.latlong` | **GA** |
| Plus code (Open Location Code) | `location.gps.pluscode` | **GA** |
| EXIF geotag in image | `location.exif.geotag` | **GA** (Document Check only — image parser exposes EXIF) |

---

## 7. Custom Rules (user-defined)

No changes from [spec.md](../specs/001-shieldme-mvp/spec.md) FR-R3: keyword, pattern, combination. Free tier: max 3 active.

---

## 8. Summary Counts

| Category | Tier 1 (GA) detectors | Tier 2 (Beta) detectors | Total catalogued |
|---|---|---|---|
| My Money | ~30 | ~18 | 48 |
| My Identity | ~28 | ~60 | 88 |
| My Health | ~20 | ~2 | 22 |
| My Family | 3 | 0 | 3 |
| My Digital Life | ~45 | ~2 | 47 |
| My Location | 4 | — (shared with Identity) | 4 |
| **Total** | **~130** | **~82** | **~212** |

Microsoft's full catalog is ~300 SITs; we explicitly exclude enterprise-only SITs (VAT numbers where not relevant to personal exposure — kept only where a consumer might share their own, enterprise connection strings with narrow vendor scope, etc.).

## 9. Governance

- New SITs Microsoft publishes are triaged quarterly against this catalog. A detector is **added** only if it fits one of the six categories and at least one consumer story ("I, as a user, would want to be alerted if this appeared in my file/email/Drive").
- A detector is **removed** only if Microsoft deprecates the underlying pattern or its FPR cannot be reduced below 2% despite corpus tuning.
- Every change to this catalog requires a corresponding update to [protection-presets.md](./protection-presets.md) if it affects a preset bundle.
- Consumer-facing labels are approved by product + copy-linter; never leaked into this catalog by mistake.

## 10. ShieldMe-original detectors (2026 additions, not Purview-derived)

Modern threat surfaces Microsoft Purview either doesn't cover or covers under enterprise-narrow SITs. Each ships as **GA** because the corpus is large and unambiguous (machine-generated keys with deterministic shapes).

### 10.1 Modern AI / API credentials

| Consumer label | Internal detector | Pattern | Tier |
|---|---|---|---|
| OpenAI API key | `digital.cloud.openai-key` | `sk-[A-Za-z0-9]{48}` + project keys `sk-proj-*` | **GA** |
| Anthropic API key | `digital.cloud.anthropic-key` | `sk-ant-api03-[A-Za-z0-9-_]{93}AA` | **GA** |
| Google AI / Gemini API key | `digital.cloud.gemini-key` | `AIza[0-9A-Za-z-_]{35}` (overlaps Google API; specialized matcher disambiguates) | **GA** |
| Hugging Face token | `digital.cloud.hf-token` | `hf_[A-Za-z0-9]{34}` | **GA** |
| Replicate API token | `digital.cloud.replicate-token` | `r8_[A-Za-z0-9]{40}` | **GA** |
| Mistral API key | `digital.cloud.mistral-key` | `[A-Za-z0-9]{32}` + Mistral header context | **GA** |

### 10.2 Modern infrastructure secrets

| Consumer label | Internal detector | Tier |
|---|---|---|
| Stripe publishable key | `digital.cloud.stripe-pub` | **GA** |
| Stripe secret key | `digital.cloud.stripe-secret` | **GA** |
| Stripe webhook secret | `digital.cloud.stripe-whsec` | **GA** |
| Twilio account SID + auth token pair | `digital.cloud.twilio-pair` | **GA** |
| SendGrid API key | `digital.cloud.sendgrid-key` | **GA** |
| Discord bot token | `digital.cloud.discord-bot` | **GA** |
| npm publish token | `digital.cloud.npm-token` | **GA** |
| Cloudflare API token | `digital.cloud.cloudflare-token` | **GA** |
| Vercel deployment token | `digital.cloud.vercel-token` | **GA** |
| Datadog API key | `digital.cloud.datadog-key` | **GA** |

### 10.3 Authentication artifacts (high-value, often pasted by mistake)

| Consumer label | Internal detector | Tier |
|---|---|---|
| JSON Web Token (JWT) — any | `digital.cred.jwt-any` | **GA** |
| TOTP authenticator seed (Base32) | `digital.cred.totp-seed` | **GA** |
| FIDO2/Passkey credential ID | `digital.cred.passkey-id` | Beta |
| OAuth refresh token (heuristic) | `digital.cred.oauth-refresh` | Beta |

### 10.4 EU eIDAS digital identity (2026)

| Consumer label | Internal detector | Tier |
|---|---|---|
| EU Digital Identity Wallet ID | `identity.nat.eu-eudiw` | Beta |
| EU eIDAS qualified signature | `identity.nat.eu-eidas-sig` | Beta |

### 10.5 Crypto exchange / wallet identifiers

| Consumer label | Internal detector | Tier |
|---|---|---|
| Coinbase user ID | `money.crypto.coinbase-uid` | Beta |
| Binance API key/secret pair | `money.crypto.binance-keypair` | **GA** |
| Kraken API key | `money.crypto.kraken-key` | **GA** |
| Hardware wallet recovery phrase (BIP-39, 12/24 words) | `money.crypto.bip39-mnemonic` | **GA** (highest priority — catastrophic if leaked) |

## 11. Purview parity scorecard

Tracked at `docs/purview-parity.json` and reviewed quarterly. Each Purview SIT (~300 published as of 2026-Q2) is in one of:

- **Covered** — ShieldMe has a detector mapped to this SIT.
- **Consumer-skipped** — enterprise-only SIT not relevant to consumer threat model (justified inline).
- **Planned** — on the roadmap (with target release).
- **Cannot-replicate** — ML-classifier-based, no static-pattern equivalent (e.g., Trainable Classifiers).

Coverage targets:
- 100% of consumer-relevant SITs at v1.0 launch.
- 100% of personal-finance, tax, and identity SITs across the 12 Tier-1 countries.
- ≥80% of all Purview SITs (excluding cannot-replicate) by year-1 anniversary.

Drift detection: a CI script (`scripts/check-purview-drift.mjs`) downloads Microsoft's published SIT list quarterly via their public docs URL; any new SIT not yet triaged blocks the next minor release.
