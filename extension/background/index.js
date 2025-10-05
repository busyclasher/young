const CARRIER_REGISTRY = [
  {
    id: 'prudential',
    label: 'Prudential',
    domains: ['prudential.com'],
    summaryPrompts: {
      highlights: 'Identify riders, supplemental coverage, and accelerated benefit clauses.',
      exclusions: 'List notable exclusions, waiting periods, and suicide clauses.',
      actions: 'Recommend outstanding tasks for claim adjudication and underwriting review.',
    },
  },
  {
    id: 'metlife',
    label: 'MetLife',
    domains: ['metlife.com'],
    summaryPrompts: {
      highlights: 'Summarise life, disability, and accident riders in plain language.',
      exclusions: 'Point out exclusions for pre-existing conditions and contestability windows.',
      actions: 'Suggest follow-ups for clinical documentation and beneficiary confirmation.',
    },
  },
  {
    id: 'aia',
    label: 'AIA',
    domains: ['aia.com'],
    summaryPrompts: {
      highlights: 'Surface wellness benefits, bundled riders, and multi-policy perks.',
      exclusions: 'Note geographical or residency exclusions and health disclosures.',
      actions: 'Advise on required agency approvals and customer outreach.',
    },
  },
  {
    id: 'manulife',
    label: 'Manulife',
    domains: ['manulife.com'],
    summaryPrompts: {
      highlights: 'Capture savings components, investment riders, and payout structures.',
      exclusions: 'List market risk warnings and policy lapses triggers.',
      actions: 'Flag premium verification steps and tax documentation needs.',
    },
  },
  {
    id: 'sunlife',
    label: 'Sun Life',
    domains: ['sunlife.com'],
    summaryPrompts: {
      highlights: 'Outline health rider bundles and early payout options.',
      exclusions: 'Highlight claim waiting periods and occupational restrictions.',
      actions: 'Prompt validation of beneficiary distributions and wellness compliance.',
    },
  }
];

const EXT_VERSION = chrome.runtime.getManifest().version;

chrome.runtime.onInstalled.addListener(async () => {
  const defaults = buildDefaultConfig();
  const existing = await getConfig();

  if (!existing) {
    await setConfig(defaults);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;
  switch (type) {
    case 'POLICY_PRISM_SUMMARIZE': {
      Promise.resolve(handleSummariseRequest(message.context, sender))
        .then(sendResponse)
        .catch((error) => {
          console.error('[PolicyPrism] Summarise handler failed', error);
          sendResponse({
            headline: 'Policy Prism mock response',
            blurb: 'Encountered an error generating summary. Showing fallback guidance.',
            highlights: ['Review console logs for detailed error traces.'],
            exclusions: [],
            actions: ['Retry analysis once connectivity stabilises.'],
            documents: [],
            metadata: {
              generatedAt: new Date().toLocaleString(),
              carrier: message?.context?.carrier ?? 'unknown',
              pageTitle: message?.context?.pageTitle ?? sender?.tab?.title,
            },
          });
        });
      return true;
    }
    case 'POLICY_PRISM_GET_STATE': {
      Promise.all([getConfig()]).then(([config]) => {
        sendResponse({
          config: config ?? buildDefaultConfig(),
          carriers: CARRIER_REGISTRY,
          version: EXT_VERSION,
        });
      }).catch((error) => {
        console.warn('[PolicyPrism] Failed to read config', error);
        sendResponse({
          config: buildDefaultConfig(),
          carriers: CARRIER_REGISTRY,
          version: EXT_VERSION,
        });
      });
      return true;
    }
    case 'POLICY_PRISM_UPDATE_CONFIG': {
      Promise.resolve(updateConfig(message.patch)).then((config) => {
        sendResponse({ success: true, config });
      }).catch((error) => {
        console.error('[PolicyPrism] Config update failed', error);
        sendResponse({ success: false, error: error?.message });
      });
      return true;
    }
    default:
      return false;
  }
});

async function handleSummariseRequest(context = {}, sender) {
  const config = await getConfig() ?? buildDefaultConfig();

  if (!config.enabled) {
    return buildDisabledSummary(context);
  }

  if (config.carriers.length && context.carrier && !config.carriers.includes(context.carrier)) {
    return buildDisabledSummary(context);
  }

  const carrier = findCarrier(context);
  const baseline = buildBaselineSummary(context, carrier);
  const heuristics = derivePortalHeuristics(context);

  return {
    ...baseline,
    highlights: heuristics.highlights,
    exclusions: heuristics.exclusions,
    actions: heuristics.actions,
    documents: heuristics.documents,
  };
}

function findCarrier(context = {}) {
  if (!context.hostname) return null;
  return CARRIER_REGISTRY.find((carrier) =>
    carrier.domains.some((domain) => context.hostname.includes(domain))
  ) ?? null;
}

function buildBaselineSummary(context, carrier) {
  const carrierLabel = carrier?.label ?? 'Unknown carrier portal';
  const snippet = context?.textSnippets?.[0];

  return {
    headline: `${carrierLabel} insight preview`,
    blurb: snippet
      ? `Top portal excerpt: “${truncate(snippet, 220)}”.`
      : 'No rich text snippets captured yet. Upload a document or open a policy record.',
    highlights: [],
    exclusions: [],
    actions: [],
    documents: [],
    metadata: {
      generatedAt: new Date().toLocaleString(),
      carrier: carrier?.id ?? 'unknown',
      pageTitle: context?.pageTitle ?? '',
    },
  };
}

function derivePortalHeuristics(context = {}) {
  const docLinks = context.docLinks ?? [];
  const docSummaries = docLinks.map((href) => ({
    href,
    name: getFileName(href),
    type: describeFile(href),
  }));

  const highlights = [];
  const exclusions = [];
  const actions = [];

  if (docLinks.length === 0) {
    highlights.push('No supporting documents detected yet — upload policy PDFs or claim invoices.');
  } else {
    highlights.push(`${docLinks.length} document${docLinks.length === 1 ? '' : 's'} ready for ingestion.`);
  }

  if (context.textSnippets?.length) {
    const keywords = extractKeywords(context.textSnippets.join(' '));
    if (keywords.length) {
      highlights.push(`Keyword focus: ${keywords.slice(0, 5).join(', ')}.`);
    }
  }

  exclusions.push('Automated exclusion detection pending entity extraction service.');
  actions.push('Trigger MedLM summarisation once backend connector is live.');
  actions.push('Validate detected documents match the customer’s active policy.');

  return {
    highlights,
    exclusions,
    actions,
    documents: docSummaries,
  };
}

function extractKeywords(text = '') {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'shall', 'hereby', 'will', 'have', 'within', 'each', 'into']);
  const frequency = new Map();

  tokens.forEach((token) => {
    if (token.length < 4 || stopWords.has(token)) return;
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  });

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 8);
}

function buildDisabledSummary(context) {
  return {
    headline: 'Policy Prism disabled',
    blurb: 'Enable the extension via the popup to resume automated summaries.',
    highlights: [],
    exclusions: [],
    actions: ['Open the popup and toggle Policy Prism back on.'],
    documents: [],
    metadata: {
      generatedAt: new Date().toLocaleString(),
      carrier: context?.carrier ?? 'unknown',
      pageTitle: context?.pageTitle ?? '',
    },
  };
}

function buildDefaultConfig() {
  return {
    enabled: true,
    carriers: CARRIER_REGISTRY.map(({ id }) => id),
    autoRun: true,
    lastUpdated: new Date().toISOString(),
  };
}

async function getConfig() {
  return chrome.storage.local.get('policyPrismConfig').then((res) => res.policyPrismConfig).catch(() => null);
}

async function setConfig(config) {
  return chrome.storage.local.set({ policyPrismConfig: config });
}

async function updateConfig(patch = {}) {
  const current = await getConfig() ?? buildDefaultConfig();
  const next = {
    ...current,
    ...patch,
    lastUpdated: new Date().toISOString(),
  };
  await setConfig(next);
  return next;
}

function getFileName(href) {
  try {
    const url = new URL(href);
    const parts = url.pathname.split('/');
    return decodeURIComponent(parts.pop() || 'document');
  } catch (error) {
    return href;
  }
}

function describeFile(href) {
  const extension = (href.split('.').pop() || '').toLowerCase();
  const dictionary = {
    pdf: 'Policy PDF',
    doc: 'Word Doc',
    docx: 'Word Doc',
    xls: 'Spreadsheet',
    xlsx: 'Spreadsheet',
    csv: 'Data extract',
  };
  return dictionary[extension] || 'Document';
}

function truncate(value, length) {
  if (!value) return '';
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
}