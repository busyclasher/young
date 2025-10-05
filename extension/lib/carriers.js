export const CARRIER_REGISTRY = [
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

export function findCarrierByHostname(hostname = '') {
  if (!hostname) return null;
  return CARRIER_REGISTRY.find((carrier) =>
    carrier.domains.some((domain) => hostname.includes(domain))
  ) ?? null;
}

export function buildDefaultConfig() {
  return {
    enabled: true,
    carriers: CARRIER_REGISTRY.map(({ id }) => id),
    autoRun: true,
    lastUpdated: new Date().toISOString(),
  };
}

export function normaliseCarrierIds(ids = []) {
  const registry = new Set(CARRIER_REGISTRY.map(({ id }) => id));
  return ids.filter((id) => registry.has(id));
}

export function getCarrierLabel(id) {
  return CARRIER_REGISTRY.find((carrier) => carrier.id === id)?.label ?? id;
}