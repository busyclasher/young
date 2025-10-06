(() => {
  const MAX_PDF_BYTES = 15728640; // 15 MB guardrail for PDFs.
  const MAX_PAGE_SCAN = 6; // Limit pages to keep parsing responsive.
  const TEXT_SAMPLE_LENGTH = 600;

  let pdfWorkerInitialised = false;

  function ensurePdfEngine() {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('pdf.js runtime unavailable');
    }

    if (!pdfWorkerInitialised && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/vendor/pdfjs/pdf.worker.min.js');
      pdfWorkerInitialised = true;
    }

    return pdfjsLib;
  }

  async function fetchPdfBuffer(url) {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF (${response.status})`);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_PDF_BYTES) {
      throw new Error('PDF exceeds 15 MB parse limit');
    }

    return buffer;
  }

  async function extractTextSlices(pdfjs, arrayBuffer) {
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdfDocument = await loadingTask.promise;

    const pageCount = pdfDocument.numPages;
    const scanPages = Math.min(pageCount, MAX_PAGE_SCAN);

    const pageTexts = [];
    for (let pageNumber = 1; pageNumber <= scanPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      const normalised = pageText.replace(/\s+/g, ' ').trim();
      if (normalised.length) {
        pageTexts.push({ pageNumber, text: normalised });
      }
    }

    const metadata = await pdfDocument.getMetadata().catch(() => ({ info: {}, metadata: {} }));

    await loadingTask.destroy();

    return {
      pageCount,
      scannedPages: scanPages,
      metadata,
      pageTexts,
    };
  }

  function extractStructuredFacts(pageTexts, metadata, stats) {
    const combinedText = pageTexts.map((entry) => entry.text).join('\n');
    const searchableText = combinedText.toLowerCase();

    const fields = [];
    const highlights = [];
    const actions = [];
    const warnings = [];

    const addField = (label, value) => {
      if (!value) return;
      fields.push({ label, value });
    };

    const matchFirst = (patterns, target) => {
      for (const pattern of patterns) {
        const result = target.match(pattern);
        if (result && result[1]) {
          return result[1].replace(/\s+/g, ' ').trim();
        }
      }
      return null;
    };

    const policyNumber = matchFirst([
      /policy number[:#\s]*([a-z0-9\-]+)/i,
      /policy no\.?[:#\s]*([a-z0-9\-]+)/i,
    ], combinedText);
    addField('Policy Number', policyNumber);

    const insuredName = matchFirst([
      /insured(?: person| name)?[:\s]*([a-z,'\- ]+)/i,
      /policy owner[:\s]*([a-z,'\- ]+)/i,
    ], combinedText);
    addField('Insured / Owner', insuredName);

    const effectiveDate = matchFirst([
      /effective date[:\s]*([a-z0-9,\/\-]+)/i,
      /coverage effective[:\s]*([a-z0-9,\/\-]+)/i,
    ], combinedText);
    addField('Effective Date', effectiveDate);

    const issueDate = matchFirst([
      /issue date[:\s]*([a-z0-9,\/\-]+)/i,
      /policy date[:\s]*([a-z0-9,\/\-]+)/i,
    ], combinedText);
    addField('Issue Date', issueDate);

    const coverageAmount = matchFirst([
      /coverage amount[:\s]*([$\u00a3\u20ac]?[0-9,]+(?:\.[0-9]{2})?)/i,
      /face amount[:\s]*([$\u00a3\u20ac]?[0-9,]+(?:\.[0-9]{2})?)/i,
      /sum assured[:\s]*([$\u00a3\u20ac]?[0-9,]+(?:\.[0-9]{2})?)/i,
    ], combinedText);
    addField('Coverage Amount', coverageAmount);

    const premium = matchFirst([
      /premium(?: amount)?[:\s]*([$\u00a3\u20ac]?[0-9,]+(?:\.[0-9]{2})?)/i,
      /modal premium[:\s]*([$\u00a3\u20ac]?[0-9,]+(?:\.[0-9]{2})?)/i,
    ], combinedText);
    addField('Premium', premium);

    const beneficiary = matchFirst([
      /primary beneficiary[:\s]*([a-z,'\- ]+)/i,
      /beneficiary name[:\s]*([a-z,'\- ]+)/i,
    ], combinedText);
    addField('Beneficiary', beneficiary);

    const riders = [];
    const riderMatches = combinedText.match(/([a-z0-9 ,\-\/]+?) rider/gi);
    if (riderMatches) {
      riderMatches.forEach((entry) => {
        const cleaned = entry.replace(/rider$/i, '').replace(/[:\-]+$/g, '').trim();
        if (cleaned && !riders.includes(cleaned)) {
          riders.push(cleaned);
        }
      });
    }
    if (riders.length) {
      fields.push({ label: 'Riders', value: riders.join(', ') });
    }

    const coverageSignals = [];
    const coverageKeywords = [
      'term life',
      'whole life',
      'universal life',
      'variable life',
      'critical illness',
      'disability income',
      'accidental death',
      'long term care',
      'waiver of premium',
    ];
    coverageKeywords.forEach((keyword) => {
      if (searchableText.includes(keyword) && !coverageSignals.includes(keyword)) {
        coverageSignals.push(keyword);
      }
    });
    if (coverageSignals.length) {
      fields.push({ label: 'Coverage Signals', value: coverageSignals.join(', ') });
    }

    const rawExperience = pageTexts[0]?.text ?? '';
    const textSample = rawExperience.slice(0, TEXT_SAMPLE_LENGTH).replace(/\s+/g, ' ').trim();

    if (!policyNumber) {
      actions.push('Policy number not detected automatically – confirm manually.');
    }
    if (!coverageAmount) {
      actions.push('Coverage amount missing from auto extraction – review PDF.');
    }
    if (!effectiveDate && !issueDate) {
      actions.push('Effective or issue date not found – capture during intake.');
    }

    if (!fields.length) {
      warnings.push('No structured fields extracted. PDF may be scanned or unstructured.');
    }

    if (metadata?.info?.Title) {
      addField('Document Title', metadata.info.Title);
    }

    highlights.push(
      `Parsed ${stats.scannedPages} of ${stats.pageCount} pages (${formatBytes(stats.byteLength)}).`
    );

    return {
      fields,
      highlights,
      actions,
      warnings,
      textSample,
      riders,
      coverageSignals,
    };
  }

  function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${Math.round(size * 10) / 10} ${units[unitIndex]}`;
  }

  async function parsePolicyPdfFromUrl(url) {
    const pdfjs = ensurePdfEngine();
    const buffer = await fetchPdfBuffer(url);
    const slices = await extractTextSlices(pdfjs, buffer);
    const structured = extractStructuredFacts(slices.pageTexts, slices.metadata, {
      pageCount: slices.pageCount,
      scannedPages: slices.scannedPages,
      byteLength: buffer.byteLength,
    });

    return {
      pageCount: slices.pageCount,
      scannedPages: slices.scannedPages,
      byteLength: buffer.byteLength,
      metadata: slices.metadata,
      fields: structured.fields,
      highlights: structured.highlights,
      actions: structured.actions,
      warnings: structured.warnings,
      textSample: structured.textSample,
      coverageSignals: structured.coverageSignals,
      riders: structured.riders,
    };
  }

  self.PolicyPrismPdfIngest = {
    parsePolicyPdfFromUrl,
  };
})();
