export function getFileName(href) {
  try {
    const url = new URL(href);
    const parts = url.pathname.split('/');
    return decodeURIComponent(parts.pop() || 'document');
  } catch (error) {
    return href;
  }
}

export function describeFile(href) {
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

export function truncate(value, length) {
  if (!value) return '';
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
}

export function extractKeywords(text = '') {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'shall', 'hereby', 'will', 'have',
    'within', 'each', 'into', 'your', 'their', 'which', 'policy', 'claim', 'benefit', 'life',
  ]);

  const frequency = new Map();

  tokens.forEach((token) => {
    if (token.length < 4 || stopWords.has(token)) return;
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  });

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
}