(() => {
  if (window.__policyPrismInjected) {
    return;
  }
  window.__policyPrismInjected = true;

  const state = {
    collapsed: false,
    lastContext: null,
    lastSummary: null,
  };

  let rootEl;
  let containerEl;
  let statusEl;
  let statusMessageEl;
  let summarySection;
  let summaryTextEl;
  let highlightListEl;
  let exclusionListEl;
  let actionListEl;
  let docListEl;
  let metaEl;

  document.addEventListener('DOMContentLoaded', init, { once: true });
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
  }

  async function init() {
    if (document.body?.dataset?.ppHasPanel) {
      return;
    }

    try {
      await injectPanel();
      await runAnalysis();
    } catch (error) {
      console.error('[PolicyPrism] Failed to initialise panel', error);
      updateStatus('Initialisation error. Open the extension popup for details.');
    }
  }

  async function injectPanel() {
    const template = await loadPanelTemplate();
    rootEl = document.createElement('div');
    rootEl.id = 'policy-prism-root';
    rootEl.innerHTML = template;
    document.body.appendChild(rootEl);
    document.body.dataset.ppHasPanel = 'true';

    containerEl = rootEl.querySelector('[data-pp-root]');
    statusEl = rootEl.querySelector('[data-pp-status]');
    statusMessageEl = rootEl.querySelector('.pp-status-message');
    summarySection = rootEl.querySelector('[data-pp-summary]');
    summaryTextEl = rootEl.querySelector('.pp-summary-text');
    highlightListEl = rootEl.querySelector('[data-pp-list="highlights"]');
    exclusionListEl = rootEl.querySelector('[data-pp-list="exclusions"]');
    actionListEl = rootEl.querySelector('[data-pp-list="actions"]');
    docListEl = rootEl.querySelector('[data-pp-doc-list]');
    metaEl = rootEl.querySelector('[data-pp-meta]');

    const collapseBtn = rootEl.querySelector('[data-pp-action="collapse"]');
    const expandBtn = rootEl.querySelector('[data-pp-action="expand"]');
    const refreshBtn = rootEl.querySelector('[data-pp-action="refresh"]');

    collapseBtn?.addEventListener('click', toggleCollapse, false);
    expandBtn?.addEventListener('click', toggleCollapse, false);
    refreshBtn?.addEventListener('click', () => runAnalysis(true), false);
  }

  async function loadPanelTemplate() {
    const url = chrome?.runtime?.getURL ? chrome.runtime.getURL('content/panel.html') : null;
    if (!url) {
      return document.querySelector('template[data-pp-template]')?.innerHTML ?? '<div>Policy Prism</div>';
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to load panel template');
    }
    return await response.text();
  }

  function toggleCollapse() {
    state.collapsed = !state.collapsed;
    containerEl?.setAttribute('data-pp-collapsed', String(state.collapsed));
    const expandBtn = rootEl.querySelector('[data-pp-action="expand"]');
    if (state.collapsed) {
      expandBtn?.removeAttribute('hidden');
    } else {
      expandBtn?.setAttribute('hidden', 'true');
    }
  }

  async function runAnalysis(forceRefresh = false) {
    updateStatus('Scanning portal for policy artefacts…');

    const context = collectContext();
    state.lastContext = context;

    if (!forceRefresh && state.lastSummary) {
      renderSummary(state.lastSummary);
      return;
    }

    try {
      const summary = await requestSummary(context);
      state.lastSummary = summary;
      renderSummary(summary);
    } catch (error) {
      console.error('[PolicyPrism] Summary request failed', error);
      updateStatus('Unable to build summary. Check console logs.', true);
    }
  }

  function collectContext() {
    const url = new URL(window.location.href);
    const carrier = detectCarrier(url.hostname);
    const docLinks = [...document.querySelectorAll('a[href]')]
      .map((anchor) => anchor.href)
      .filter((href) => /\.(pdf|docx?|xls|csv)$/i.test(new URL(href, url.href).pathname))
      .map((href) => new URL(href, url.href).href)
      .slice(0, 12);

    const textSnippets = extractTextSnippets();

    return {
      carrier,
      hostname: url.hostname,
      url: url.href,
      pageTitle: document.title,
      docLinks,
      textSnippets,
      timestamp: new Date().toISOString(),
    };
  }

  function detectCarrier(hostname) {
    if (!hostname) return 'unknown';
    const mapping = [
      { id: 'prudential', pattern: /prudential/i },
      { id: 'metlife', pattern: /metlife/i },
      { id: 'aia', pattern: /\.aia\./i },
      { id: 'manulife', pattern: /manulife/i },
      { id: 'sunlife', pattern: /sunlife/i },
    ];

    const match = mapping.find((entry) => entry.pattern.test(hostname));
    return match ? match.id : 'unknown';
  }

  function extractTextSnippets() {
    const paragraphs = [...document.querySelectorAll('p, li')]
      .map((node) => node.innerText.trim())
      .filter((text) => text.length > 110 && text.split(' ').length > 10)
      .slice(0, 6);

    return paragraphs;
  }

  function requestSummary(context) {
    return new Promise((resolve, reject) => {
      if (!chrome?.runtime?.sendMessage) {
        resolve(buildMockSummary(context));
        return;
      }

      chrome.runtime.sendMessage({
        type: 'POLICY_PRISM_SUMMARIZE',
        context,
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[PolicyPrism] Falling back to mock summary', chrome.runtime.lastError);
          resolve(buildMockSummary(context));
          return;
        }
        if (!response) {
          resolve(buildMockSummary(context));
          return;
        }
        resolve(response);
      });
    });
  }

  function buildMockSummary(context) {
    const docCount = context.docLinks.length;
    const sampleSnippet = context.textSnippets[0] ?? 'No rich text detected on this portal view yet.';
    const summary = {
      headline: `Prototype synthesis for ${context.carrier === 'unknown' ? 'carrier portal' : context.carrier}`,
      blurb: `${docCount} supporting document${docCount === 1 ? '' : 's'} detected. Sample text: “${truncate(sampleSnippet, 180)}”`,
      highlights: [
        'Awaiting MedLM summarisation pipeline hookup — values below are placeholders.',
        'Carrier-specific adapters will map riders and benefits into a normalized schema.',
      ],
      exclusions: [
        'Formal exclusion detection requires policy document parsing and entity extraction.',
      ],
      actions: [
        'Confirm all mandatory medical invoices are uploaded.',
        'Cross-check policy term durations against customer CRM record.',
      ],
      documents: context.docLinks.map((href) => ({ href, name: getFileName(href), type: describeFile(href) })),
      metadata: {
        generatedAt: new Date().toLocaleString(),
        carrier: context.carrier,
        pageTitle: context.pageTitle,
      },
    };

    return summary;
  }

  function renderSummary(payload) {
    if (!summarySection) return;

    summarySection.removeAttribute('hidden');
    summaryTextEl.textContent = payload.headline + '. ' + payload.blurb;

    renderList(highlightListEl, payload.highlights, '[No highlights produced]');
    rootEl.querySelector('[data-pp-highlights]')?.toggleAttribute('hidden', !payload.highlights?.length);

    renderList(exclusionListEl, payload.exclusions, 'No exclusions flagged by the mock engine.');
    rootEl.querySelector('[data-pp-exclusions]')?.toggleAttribute('hidden', !payload.exclusions?.length);

    renderList(actionListEl, payload.actions, 'No suggested actions yet.');
    rootEl.querySelector('[data-pp-actions]')?.toggleAttribute('hidden', !payload.actions?.length);

    renderDocuments(payload.documents);

    if (metaEl) {
      const { carrier, generatedAt } = payload.metadata ?? {};
      metaEl.textContent = `Carrier: ${carrier ?? 'unknown'} • Generated: ${generatedAt ?? 'n/a'}`;
    }

    statusEl?.setAttribute('hidden', 'true');
  }

  function renderList(container, items = [], emptyFallback) {
    if (!container) return;
    container.innerHTML = '';

    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = emptyFallback;
      li.classList.add('pp-muted');
      container.appendChild(li);
      return;
    }

    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item;
      container.appendChild(li);
    }
  }

    function renderDocuments(documents = []) {
    if (!docListEl) return;

    const docSection = rootEl.querySelector('[data-pp-documents]');
    docListEl.innerHTML = '';

    if (!documents.length) {
      docSection?.setAttribute('hidden', 'true');
      return;
    }

    docSection?.removeAttribute('hidden');

    documents.forEach((doc) => {
      const li = document.createElement('li');
      li.className = 'pp-doc-item';

      const header = document.createElement('div');
      header.className = 'pp-doc-header';

      const anchor = document.createElement('a');
      anchor.href = doc.href;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.textContent = doc.name;

      const meta = document.createElement('span');
      meta.className = 'pp-doc-meta';
      meta.textContent = buildDocMeta(doc);

      header.appendChild(anchor);
      header.appendChild(meta);
      li.appendChild(header);

      if (doc.structured?.fields?.length) {
        const fieldList = document.createElement('ul');
        fieldList.className = 'pp-doc-fields';
        doc.structured.fields.slice(0, 6).forEach((field) => {
          const item = document.createElement('li');
          item.textContent = `${field.label}: ${field.value}`;
          fieldList.appendChild(item);
        });
        li.appendChild(fieldList);
      }

      if (doc.preview) {
        const preview = document.createElement('p');
        preview.className = 'pp-doc-preview';
        preview.textContent = doc.preview;
        li.appendChild(preview);
      }

      const warningMessages = [...(doc.structured?.warnings ?? [])];
      if (doc.parseError) {
        warningMessages.unshift(doc.parseError);
      }
      if (warningMessages.length) {
        const warning = document.createElement('div');
        warning.className = 'pp-doc-warning';
        warning.textContent = warningMessages.join(' | ');
        li.appendChild(warning);
      }

      docListEl.appendChild(li);
    });
  }

  function buildDocMeta(doc) {
    const parts = [];
    if (doc.type) parts.push(doc.type);
    if (doc.pageCount) parts.push(`${doc.pageCount} pages`);
    if (doc.structured?.fields?.length) parts.push(`${doc.structured.fields.length} fields`);
    return parts.join(' | ') || 'Document';
  }

  function updateStatus(message, isError = false) {
    if (!statusMessageEl) return;
    statusMessageEl.textContent = message;
    statusMessageEl.style.color = isError ? '#f87171' : '';
    statusEl?.removeAttribute('hidden');
  }

  function truncate(value, maxLength) {
    if (!value) return '';
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength - 1).trimEnd() + '…';
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
})();