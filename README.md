# Policy Prism Extension (Prototype)

Policy Prism is a Chromium-based browser extension prototype that helps life-insurance agents review policy documentation from multiple carriers on a single, uniform summary surface. It installs a lightweight claim-policy insight panel directly on insurer portals and orchestrates background parsing and summarisation flows.

## Repo layout

```
extension/
  manifest.json          # Extension entry point (Manifest V3)
  background/
    index.js             # Service worker: ingestion pipeline + carrier registry
    pdf-ingest.js        # PDF parsing helpers bootstrapped into the worker
  content/
    index.js             # Content script: injects and manages the summary panel
    panel.css            # Styling for the injected UI surface
    panel.html           # HTML template cloned into carrier pages
  lib/
    vendor/pdfjs/        # Bundled pdf.js runtime (3.11.174)
    carriers.js          # Carrier registry helpers
    doc-utils.js         # Shared document helpers
    messages.js          # Message type constants
  popup.html/.js/.css    # Quick controls for manual triggers & debugging
  options.html/.js/.css  # Persistent configuration (carrier scopes, API keys, etc.)
  icons/                 # Placeholder icons (1x1 transparent PNGs)
```

## Getting started

1. Load `extension/` as an unpacked extension in Chrome/Edge (chrome://extensions).
2. Toggle **Allow access to file URLs** if you want to test with local PDFs.
3. Visit a supported carrier domain (Prudential, MetLife, AIA, Manulife, Sun Life) and the Policy Prism panel should slide in automatically.

## PDF parsing pipeline

Policy Prism now embeds pdf.js (3.11.174) inside the background service worker to recover structured fields from carrier PDFs.

- Up to two PDFs per portal view are fetched with credentials, capped at 15 MB and the first six pages to keep the worker responsive.
- Heuristics capture policy numbers, coverage amounts, effective dates, riders, and coverage signals; missing fields surface as warnings in the panel.
- The content panel renders extracted fields, previews, and parser warnings under **Detected Documents** so agents can validate at a glance.
- Additional PDFs remain linked, and unparsed documents are flagged for manual review.

## Next steps

- Wire MedLM/Google Health AI via secure backend proxy.
- Harden PDF heuristics with carrier-specific templates and OCR fallback for scanned uploads.
- Expand carrier registry with per-portal DOM adapters.
- Harden PHI safeguards (masking, audit logs) and role-based access controls.
- Implement telemetry + feedback loop for agent corrections.

This prototype intentionally focuses on client-side scaffolding to visualise the workflow before integrating regulated data services.# young
