# Portal Inventory & DOM/API Mapping (v0)

This note captures the first pass at insurer portals targeted by the Policy Prism prototype. It collates public domain entry points, known UI frameworks, likely DOM anchors, and hypotheses about underlying APIs so the engineering team can prioritise instrumentation and data capture work. All observations require validation in a lower environment or with non-production demo accounts before production rollout.

## Target Carrier Portals

| Carrier | Primary Domains | Agent Portal Label | Key Surfaces To Cover |
|---------|-----------------|--------------------|------------------------|
| Prudential | `*.prudential.com`, `*.prudential.com.sg` | PRUForce / PRUaccess Plus | Policy dashboard, claim submission, document repository |
| MetLife | `*.metlife.com`, `*.metlife.com.hk` | MetLife Agent Virtual Assistant (AVA) | Policy inquiry, claim upload, billing history |
| AIA | `*.aia.com`, `*.aia.com.hk` | iPoS / AIA Connect | Customer portfolio, benefit illustrations, e-form downloads |
| Manulife | `*.manulife.com`, `*.manulife.ca` | Manulife Advisor Portal | Policy details, illustration PDFs, correspondence |
| Sun Life | `*.sunlife.com`, `slfservind.*` | Sun Life Advisor Portal | Coverage overview, forms library, claim status |

## Prudential (PRUForce / PRUaccess Plus)

- **Login characteristics**: SSO with corporate identity (Okta / Ping); MFA by SMS or authenticator app. Expect iFrame-wrapped dashboards post-login.
- **Front-end stack**: React + Salesforce Lightning (Aura components) for PRUForce; DOM relies on `lightning-` custom elements and `data-aura-class` attributes.
- **DOM landmarks to watch**:
  - Policy list cards: `lightning-tile.slds-media` with policy number in `.slds-truncate` span.
  - Document tables rendered via `lightning-datatable` ? actual rows materialise as native `<tr>` with `data-row-key-value`.
  - Download buttons dispatch `lightning__recordAction` events; intercept via DOM event listener on container `div[data-aura-rendered-by]`.
- **Network/API access**:
  - GraphQL gateway at `/services/data/vXX.X/graphql` (Salesforce) returning JSON payloads with policy metadata.
  - REST endpoints under `/services/apexrest/pru/claims/*` for claim submissions. Require session cookie `sid` and CSRF token from `LightningContextConfig`.
  - Documents fetched through signed URLs `/sfc/servlet.shepherd/document/download/*` (requires attaching `sid`).
- **Instrumentation plan**:
  - Use `MutationObserver` to detect when `lightning-datatable` renders, then extract row data.
  - Hook `fetch` to capture GraphQL responses containing `policyNumber`, `benefitDescription`, `exclusionText`.
  - For PDFs triggered through `window.open`, intercept `beforeunload` or override `window.open` to log the generated URL before navigation.

## MetLife (Agent Virtual Assistant)

- **Login characteristics**: Microsoft Azure AD SSO for corporate users; embedded frame for older regions. 2FA frequently enforced by SMS OTP.
- **Front-end stack**: Angular 12+ with extensive usage of `mat-` components; UI modules lazy-loaded.
- **DOM landmarks**:
  - Policy summary: `<mat-card class="policy-card">` with nested `<mat-expansion-panel>` for riders.
  - Claim document upload area built on `<input type="file" multiple>` hidden behind a `mat-button` with `aria-label="Upload"`.
  - Table results use `<table mat-table>`; selectors like `[data-column='exclusions']` output textual clauses.
- **Network/API access**:
  - REST API base `/api/v1/policy/...` returning JSON (secured with bearer token stored in `sessionStorage.metlife-token`).
  - Document download endpoints under `/api/v1/document/{docId}`; require passing `Authorization` header.
  - Claims service uses SignalR hub `/claimHub` for real-time status updates.
- **Instrumentation plan**:
  - Capture `sessionStorage` token via content script (requires host permissions); pass to background for API fetch proxy if permitted.
  - Observe Angular router events: watch `window.ng` debug hooks if available; fallback to URL change listener.
  - Monitor `fetch` to stash policy payloads; convert to normalised schema for display.

## AIA (iPoS / AIA Connect)

- **Login characteristics**: Region-specific; some sites enforce client certificates. Agent portals often run on Oracle WebCenter with custom JS.
- **Front-end stack**: Mixed legacy jQuery and newer Vue.js modules; heavy reliance on `<iframe>` for PDF previews.
- **DOM landmarks**:
  - Customer portfolio grid: `div#policyGrid` with rows as `<tr class="odd|even">` storing attributes like `policyStatus` in `data-*`.
  - Benefit illustration links within `.downloadSection a[data-type='pdf']`.
  - Exclusions appear inside collapsible `.disclaimer-section` blocks appended after benefit tables.
- **Network/API access**:
  - Ajax endpoints at `/AIAService/Service.svc/*` (SOAP-over-JSON) requiring `X-Requested-With: XMLHttpRequest` and portal session cookie.
  - Document fetch uses `/DownloadHandler.ashx?docId=...` with ephemeral tokens.
  - Some regions provide GraphQL `/gateway/agent/graphql` for policy metadata.
- **Instrumentation plan**:
  - Proxy `XMLHttpRequest` to capture SOAP payloads and parse XML for policy details.
  - Inject CSS to make hidden disclaimers visible, supporting summarisation.
  - For iframe-hosted PDFs, grab `src` attribute once frame loads; store alongside metadata.

## Manulife (Advisor Portal)

- **Login characteristics**: Global login via PingFederate, with SAML assertions to region-specific subdomains. Frequent forced password rotation.
- **Front-end stack**: React + Material-UI; micro-frontend architecture with `data-module` attributes.
- **DOM landmarks**:
  - Policy header: `div[data-module='policy-header']` containing `<h2>` with policy number.
  - Rider breakdown: `section[data-module='rider-summary'] li` with classes `rider-name`, `rider-benefit`.
  - Document centre table: `<table class='MuiTable-root'>` with `data-testid` attributes like `document-row`.
- **Network/API access**:
  - REST endpoints under `/advisor/api/policies/{policyId}` returning JSON with riders, exclusions, beneficiaries.
  - File downloads orchestrated by `/advisor/api/documents/{id}/download` returning pre-signed AWS S3 URLs.
  - Activity feed via GraphQL `/advisor/graphql`.
- **Instrumentation plan**:
  - Capture GraphQL responses using `chrome.debugger` protocol (optional) or `fetch` monkey patching.
  - Use dataset attributes to map sections to our standard schema.
  - Track download requests by overriding `URL.createObjectURL` to attach metadata to the panel list.

## Sun Life (Advisor Portal)

- **Login characteristics**: Mixed login stack; some regions on Salesforce Communities, others on custom portal. 2FA via email OTP / authenticator.
- **Front-end stack**: Lightning Web Components for North America; Angular in Asia.
- **DOM landmarks**:
  - Coverage overview cards: `.coverage-card` with `data-coverage-type` attribute.
  - Exclusions/caveats under `.accordion-item[data-section='exclusions']`.
  - Forms library: `<ul class='form-list'>` with `<a class='download-link'>`.
- **Network/API access**:
  - REST endpoints at `/services/apexrest/slf/coverage/*` (Salesforce) returning JSON.
  - Downloads via `/sfc/servlet.shepherd/document/*` similar to Prudential.
  - Activity logs available through `/services/data/vXX.X/ui-api/records`. Requires Salesforce session cookie.
- **Instrumentation plan**:
  - Reuse Salesforce adapter from Prudential (Lightning components behave similarly).
  - Monitor DOM for `lightning-accordion-section` events to capture expanded text.
  - For legacy Angular flows, reuse MetLife instrumentation (mat-table selectors, token capture).

## Cross-Portal Action Items

1. **Credential sandboxing**: Work with carrier partnerships to obtain demo credentials or leverage publicly documented staging portals. Never test against production without approvals.
2. **Session management**: Define secure channel between content script and backend for handling bearer tokens/session cookies; ensure tokens are never persisted beyond runtime.
3. **Document ingestion**: Standardise logic for detecting `<a>` downloads, hidden iframes, and API responses returning binary payload references.
4. **Structured schema**: Draft a `PolicySummary` interface capturing `policyNumber`, `insured`, `coverage`, `riders`, `exclusions`, `actionItems`, `documents`. Map each carrier’s DOM/API fields into this schema.
5. **Privacy & compliance**: Implement PHI redaction rules before data leaves the browser; log user actions using hashed identifiers.

## Next Validation Steps

- Schedule paired testing sessions with front-line agents to validate DOM assumptions per carrier.
- Build automated smoke scripts (Playwright) to capture HTML snapshots for regression and parser tuning.
- Prioritise two carriers (Prudential, MetLife) for first fully wired demo; treat others as stretch goals once ingestion pipeline stabilises.
