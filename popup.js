// popup.js
let selectionActive = false;
let selectedCount = 0;
let pendingListing = null;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContent(msg) {
  const tab = await getActiveTab();
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    // Content script not ready — inject it
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/selector.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['src/selector.css'] });
      await sleep(200);
      return await chrome.tabs.sendMessage(tab.id, msg);
    } catch (e2) {
      console.warn('Could not inject content script:', e2);
      return null;
    }
  }
}

async function refreshCount() {
  const res = await sendToContent({ type: 'LS_GET_COUNT' });
  if (res) {
    selectedCount = res.count;
    selectionActive = res.active;
    updateUI();
  }
}

function updateUI() {
  const pendingListingView = document.getElementById('scraped-data-output');
  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const toggleDesc = document.getElementById('toggle-desc');
  const statCount = document.getElementById('stat-count');
  const btnView = document.getElementById('btn-view');
  const btnClear = document.getElementById('btn-clear');
  const toggle = document.getElementById('toggle-select');
  const tipText = document.getElementById('tip-text');

  if (pendingListing) {
    console.log('Displaying pending listing data:', pendingListing);
    pendingListingView.textContent = JSON.stringify(pendingListing, null, 2);
    pendingListingView.parentElement.style.display = 'block';
  }

  toggle.checked = selectionActive;

  statCount.textContent = selectedCount;
  statCount.classList.toggle('zero', selectedCount === 0);

  btnView.disabled = selectedCount === 0;
  btnClear.disabled = selectedCount === 0;

  if (selectionActive && selectedCount > 0) {
    dot.className = 'status-dot has-items';
    statusText.textContent = `${selectedCount} item${selectedCount !== 1 ? 's' : ''} selected`;
    statusText.className = 'status-text has-items';
    toggleDesc.textContent = 'Click items on the page to select/deselect';
    tipText.innerHTML = `<strong>✓ Active!</strong> Click listing cards on the page. Each click toggles selection. When done, click "View Selected Listings".`;
  } else if (selectionActive) {
    dot.className = 'status-dot active';
    statusText.textContent = 'Hover over items to select';
    statusText.className = 'status-text active';
    toggleDesc.textContent = 'Click any item on the page to select it';
    tipText.innerHTML = `<strong>Selection mode on.</strong> Go to the page and click any listing/product cards.`;
  } else if (selectedCount > 0) {
    dot.className = 'status-dot has-items';
    statusText.textContent = `${selectedCount} saved, mode off`;
    statusText.className = 'status-text has-items';
    toggleDesc.textContent = 'Turn on to select more items';
    tipText.innerHTML = `<strong>${selectedCount} listing${selectedCount !== 1 ? 's' : ''} saved.</strong> Click "View Selected Listings" to see them.`;
  } else {
    dot.className = 'status-dot';
    statusText.textContent = 'Selection mode off';
    statusText.className = 'status-text';
    toggleDesc.textContent = 'Turn on to click items on the page';
    tipText.innerHTML = `<strong>How to use:</strong> Toggle Selection Mode, then click any listing cards on the page to select them.`;
  }
}

// Set page hostname in stat
async function setPageStat() {
  const tab = await getActiveTab();
  const hostname = tab?.url ? new URL(tab.url).hostname.replace('www.', '') : '—';
  document.getElementById('stat-page').textContent = hostname.length > 10 ? hostname.slice(0, 9) + '…' : hostname;
}

// ── EVENT HANDLERS ──

document.getElementById('btn-refresh').addEventListener('click', async () =>  {
  // Retrieve pending listing data if coming from content script after scraping
  const res = await sendToContent({ type: 'CP_PENDING_LISTING' });
  if (res?.pendingListing) {
    pendingListing = res.pendingListing;
    updateUI();
  }
});

document.getElementById('toggle-select').addEventListener('change', async (e) => {
  selectionActive = e.target.checked;
  await sendToContent({ type: 'LS_TOGGLE_SELECTION', active: selectionActive });
  updateUI();

  // Close popup so user can interact with page
  if (selectionActive) window.close();
});

document.getElementById('btn-view').addEventListener('click', async () => {
  await sendToContent({ type: 'LS_TOGGLE_SELECTION', active: false });
  selectionActive = false;

  // Tell content script to open the modal
  const tab = await getActiveTab();
  if (tab?.id) {
    // Inject a small script to trigger the modal
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Find the toolbar's View button and click it, or dispatch custom event
        document.getElementById('ls-btn-view')?.click();
      }
    });
  }
  window.close();
});

document.getElementById('btn-clear').addEventListener('click', async () => {
  await sendToContent({ type: 'LS_CLEAR' });
  selectedCount = 0;
  updateUI();
});


// ── STORAGE LISTENER (updates count when page changes selections) ──
chrome.storage.onChanged.addListener((changes) => {
  if (changes.lsCount ) {
    selectedCount = changes.lsCount.newValue || 0;
    updateUI();
  }
});



function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── INIT ──
(async () => {
  await setPageStat();
  await refreshCount();
})();
