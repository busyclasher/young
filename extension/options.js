const statusEl = document.getElementById('status');
const carrierContainer = document.getElementById('carriers');
const resetBtn = document.getElementById('reset');

let viewState = {
  config: null,
  carriers: [],
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  viewState = await readState();
  render(viewState);
  bindEvents();
}

function bindEvents() {
  resetBtn.addEventListener('click', async () => {
    const carrierIds = viewState.carriers.map((carrier) => carrier.id);
    const response = await persistConfig({
      enabled: true,
      autoRun: true,
      carriers: carrierIds,
    });
    viewState.config = response;
    render(viewState);
  });
}

function render(state) {
  const { config, carriers } = state;
  if (config) {
    statusEl.textContent = `Extension is ${config.enabled ? 'enabled' : 'disabled'} • Auto-run ${config.autoRun ? 'on' : 'off'} • Last updated ${new Date(config.lastUpdated).toLocaleString()}`;
  }

  carrierContainer.innerHTML = '';

  carriers.forEach((carrier) => {
    const card = document.createElement('label');
    card.className = 'carrier-card';

    const span = document.createElement('span');
    span.textContent = carrier.label;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = config.carriers.includes(carrier.id);
    checkbox.addEventListener('change', async () => {
      const next = new Set(config.carriers);
      if (checkbox.checked) {
        next.add(carrier.id);
      } else {
        next.delete(carrier.id);
      }
      const updated = await persistConfig({ carriers: Array.from(next) });
      viewState.config = updated;
      render(viewState);
    });

    card.appendChild(span);
    card.appendChild(checkbox);
    carrierContainer.appendChild(card);
  });
}

async function readState() {
  try {
    return await chrome.runtime.sendMessage({ type: 'POLICY_PRISM_GET_STATE' });
  } catch (error) {
    console.error('[PolicyPrism options] Failed to load state', error);
    return { config: { enabled: true, autoRun: true, carriers: [] }, carriers: [] };
  }
}

async function persistConfig(patch) {
  const response = await chrome.runtime.sendMessage({ type: 'POLICY_PRISM_UPDATE_CONFIG', patch });
  if (!response?.success) {
    throw new Error(response?.error ?? 'Unknown config persistence error');
  }
  return response.config;
}