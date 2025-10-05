const enabledToggle = document.getElementById('toggle-enabled');
const autoRunToggle = document.getElementById('toggle-autorun');
const carrierList = document.getElementById('carrier-list');
const optionsBtn = document.getElementById('open-options');
const versionEl = document.getElementById('extension-version');

let state = {
  config: null,
  carriers: [],
  version: '0',
};

document.addEventListener('DOMContentLoaded', initialise);

async function initialise() {
  state = await readState();
  bindUI();
}

function bindUI() {
  if (state.config) {
    enabledToggle.checked = state.config.enabled;
    autoRunToggle.checked = state.config.autoRun;
  }

  renderCarriers(state);

  versionEl.textContent = `v${state.version}`;

  enabledToggle.addEventListener('change', () => {
    persistConfig({ enabled: enabledToggle.checked });
  });

  autoRunToggle.addEventListener('change', () => {
    persistConfig({ autoRun: autoRunToggle.checked });
  });

  optionsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  });
}

function renderCarriers(state) {
  carrierList.innerHTML = '';
  const { carriers, config } = state;
  carriers.forEach((carrier) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = carrier.label;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = config.carriers.includes(carrier.id);
    checkbox.addEventListener('change', () => {
      const next = new Set(config.carriers);
      if (checkbox.checked) {
        next.add(carrier.id);
      } else {
        next.delete(carrier.id);
      }
      persistConfig({ carriers: Array.from(next) });
    });

    li.appendChild(label);
    li.appendChild(checkbox);
    carrierList.appendChild(li);
  });
}

async function readState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'POLICY_PRISM_GET_STATE' });
    return response;
  } catch (error) {
    console.error('[PolicyPrism popup] Failed to read state', error);
    return {
      config: { enabled: true, autoRun: true, carriers: [] },
      carriers: [],
      version: 'unknown',
    };
  }
}

async function persistConfig(patch) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'POLICY_PRISM_UPDATE_CONFIG',
      patch,
    });
    if (response?.success) {
      state.config = response.config;
      state.config.carriers = response.config.carriers;
      renderCarriers(state);
    }
  } catch (error) {
    console.error('[PolicyPrism popup] Failed to update config', error);
  }
}