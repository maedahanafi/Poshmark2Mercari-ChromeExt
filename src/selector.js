// selector.js — injected into every page
(function () {
  if (window.__lsInitialized) return;
  window.__lsInitialized = true;

  // ── STATE ──
  let selectionMode = false;
  let selectedElements = new Map(); // el -> extracted data
  let checkBadges = new WeakMap();

  // ── LISTEN FOR MESSAGES FROM POPUP ──
  chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
    if (msg.type === 'LS_TOGGLE_SELECTION') {
      toggleSelectionMode(msg.active);
      sendResponse({ ok: true });
    }
    if (msg.type === 'LS_GET_SELECTED') {
      sendResponse({ items: getSelectedData() });
    }
    if (msg.type === 'LS_CLEAR') {
      clearAll();
      sendResponse({ ok: true });
    }
    if (msg.type === 'LS_GET_COUNT') {
      sendResponse({ count: selectedElements.size, active: selectionMode });
    }
    return true;
  });

  // ── TOOLBAR (floating bottom bar shown on page) ──
  function buildToolbar() {
    if (document.getElementById('ls-toolbar')) return;

    const bar = document.createElement('div');
    bar.id = 'ls-toolbar';
    bar.innerHTML = `
      <span id="ls-toolbar-label"><strong>0</strong> selected</span>
      <button class="ls-tb-btn" id="ls-btn-view">👁 View</button>
      <button class="ls-tb-btn" id="ls-btn-clear">✕ Clear</button>
    `;
    document.body.appendChild(bar);

    document.getElementById('ls-btn-view').addEventListener('click', openModal);
    document.getElementById('ls-btn-clear').addEventListener('click', clearAll);
  }

  function buildModeIndicator() {
    if (document.getElementById('ls-mode-indicator')) return;
    const ind = document.createElement('div');
    ind.id = 'ls-mode-indicator';
    ind.innerHTML = `<div class="ls-pulse"></div> Click items to select them`;
    document.body.appendChild(ind);
  }

  function updateToolbar() {
    const bar = document.getElementById('ls-toolbar');
    const label = document.getElementById('ls-toolbar-label');
    if (!bar) return;

    const count = selectedElements.size;
    if (label) label.innerHTML = `<strong>${count}</strong> selected`;

    if (count > 0) {
      bar.classList.add('ls-visible');
    } else {
      bar.classList.remove('ls-visible');
    }
  }

  // ── SELECTION MODE ──
  function toggleSelectionMode(active) {
    selectionMode = active;
    buildToolbar();
    buildModeIndicator();

    const indicator = document.getElementById('ls-mode-indicator');

    if (active) {
      document.body.style.cursor = 'crosshair';
      if (indicator) indicator.classList.add('ls-visible');
      attachHoverListeners();
    } else {
      document.body.style.cursor = '';
      if (indicator) indicator.classList.remove('ls-visible');
      detachHoverListeners();
    }
  }

  // Candidate elements: anything that looks like a listing/product card
  function getCandidates() {
    const selectors = [
      // Generic product/listing card patterns
      '[class*="card"]',
      '[class*="listing"]',
      '[class*="product"]',
      '[class*="item"]',
      '[class*="tile"]',
      '[class*="grid-cell"]',
      'article',
      'li[class]',
      // E-commerce patterns
      '[data-id]',
      '[data-listing-id]',
      '[data-product-id]',
      '[data-item-id]',
    ];

    const candidates = new Set();
    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          // Filter: must be reasonably sized, visible, and have some content
          const rect = el.getBoundingClientRect();
          if (rect.width > 80 && rect.height > 80 && isVisible(el)) {
            candidates.add(el);
          }
        });
      } catch (e) {}
    });

    return [...candidates];
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  // ── HOVER LISTENERS ──
  function onMouseOver(e) {
    if (!selectionMode) return;
    const target = findListingTarget(e.target);
    if (target && !selectedElements.has(target)) {
      target.classList.add('ls-selectable');
    }
  }

  function onMouseOut(e) {
    if (!selectionMode) return;
    const target = findListingTarget(e.target);
    if (target && !selectedElements.has(target)) {
      target.classList.remove('ls-selectable');
    }
  }

  function onClick(e) {
    if (!selectionMode) return;
    const target = findListingTarget(e.target);
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    if (selectedElements.has(target)) {
      deselect(target);
    } else {
      select(target);
    }
  }

  function attachHoverListeners() {
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
  }

  function detachHoverListeners() {
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);
  }

  // ── FIND THE BEST LISTING CONTAINER ──
  function findListingTarget(el) {
    // Walk up the DOM to find the best "listing-like" container
    let node = el;
    const maxDepth = 8;
    let depth = 0;

    while (node && node !== document.body && depth < maxDepth) {
      if (node === document.getElementById('ls-toolbar') ||
          node === document.getElementById('ls-modal-backdrop') ||
          node === document.getElementById('ls-mode-indicator')) {
        return null;
      }

      const tag = node.tagName?.toLowerCase();
      const cls = node.className && typeof node.className === 'string'? (node.className).toLowerCase(): '';
      const rect = node.getBoundingClientRect();

      const isCardLike =
        //tag === 'article' ||
        //tag === 'li' ||
        cls.includes('card') ||
        cls.includes('listing') ||
        cls.includes('product') ||
        cls.includes('item') ||
        cls.includes('tile') ||
        node.hasAttribute('data-listing-id') ||
        node.hasAttribute('data-product-id') ||
        node.hasAttribute('data-id');

      if (isCardLike && rect.width > 80 && rect.height > 80) {
        return node;
      }

      node = node.parentElement;
      depth++;
    }

    return null;
  }

  // ── SELECT / DESELECT ──
  function select(el) {
    el.classList.remove('ls-selectable');
    el.classList.add('ls-selected');
    el.style.position = el.style.position || 'relative';

    const badge = document.createElement('div');
    badge.className = 'ls-check-badge';
    badge.textContent = '✓';
    el.appendChild(badge);
    checkBadges.set(el, badge);

    const data = extractData(el);
    selectedElements.set(el, data);
    updateToolbar();
    notifyPopup();
  }

  function deselect(el) {
    el.classList.remove('ls-selected');
    el.classList.remove('ls-selectable');
    selectedElements.delete(el);

    const badge = checkBadges.get(el);
    if (badge) { badge.remove(); checkBadges.delete(el); }

    updateToolbar();
    notifyPopup();
  }

  function clearAll() {
    selectedElements.forEach((_, el) => {
      el.classList.remove('ls-selected', 'ls-selectable');
      const badge = checkBadges.get(el);
      if (badge) { badge.remove(); checkBadges.delete(el); }
    });
    selectedElements.clear();
    updateToolbar();
    notifyPopup();
  }

  // ── EXTRACT DATA FROM ELEMENT ──
  function extractData(el) {
    // Title
    const titleEl = el.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="name"], [itemprop="name"]');
    const title = titleEl?.textContent?.trim() || el.getAttribute('aria-label') || '';

    // Price
    const priceEl = el.querySelector('[class*="price"], [itemprop="price"], [class*="cost"], [class*="amount"]');
    const price = priceEl?.textContent?.trim() || '';

    // Image
    const imgEl = el.querySelector('img');
    const image = imgEl?.src || imgEl?.dataset?.src || imgEl?.dataset?.lazySrc || '';

    // Link
    const linkEl = el.querySelector('a') || (el.tagName === 'A' ? el : null);
    const url = linkEl?.href || '';

    // Tags / badges
    const tagEl = el.querySelector('[class*="badge"], [class*="tag"], [class*="label"], [class*="status"]');
    const tag = tagEl?.textContent?.trim() || '';

    // Description fallback
    const descEl = el.querySelector('[class*="desc"], p');
    const description = descEl?.textContent?.trim() || '';

    return { title, price, image, url, tag, description };
  }

  function getSelectedData() {
    return [...selectedElements.values()].map((d, i) => ({ ...d, index: i + 1 }));
  }

  // ── NOTIFY POPUP OF COUNT CHANGE ──
  function notifyPopup() {
    chrome.storage.local.set({ lsCount: selectedElements.size });
  }

  // ── MODAL ──
  function openModal() {
    if (document.getElementById('ls-modal-backdrop')) return;
    const items = getSelectedData();
    if (items.length === 0) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'ls-modal-backdrop';

    backdrop.innerHTML = `
      <div id="ls-modal">
        <div id="ls-modal-header">
          <div class="ls-modal-icon">📋</div>
          <div>
            <div id="ls-modal-title">Selected Listings</div>
            <div id="ls-modal-subtitle">${items.length} item${items.length !== 1 ? 's' : ''} from ${location.hostname}</div>
          </div>
          <button id="ls-modal-close" aria-label="Close">×</button>
        </div>
        <div id="ls-modal-grid">
          ${items.map((item, i) => renderCard(item, i)).join('')}
        </div>
        <div id="ls-modal-footer">
          <span id="ls-footer-info">${items.length} listing${items.length !== 1 ? 's' : ''} selected</span>
          <button class="ls-footer-btn" id="ls-btn-crosspost-mercari">🔂 Crosspost To Mercari</button>
          <button class="ls-footer-btn" id="ls-btn-copy">📋 Copy All</button>
          <button class="ls-footer-btn" id="ls-btn-done">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeModal();
    });
    document.getElementById('ls-modal-close').addEventListener('click', closeModal);
    document.getElementById('ls-btn-done').addEventListener('click', closeModal);
    document.getElementById('ls-btn-copy').addEventListener('click', copyAll);
    document.getElementById('ls-btn-crosspost-mercari').addEventListener('click', crosspostToMercari);

    // Staggered card animation
    document.querySelectorAll('.ls-card').forEach((card, i) => {
      card.style.animationDelay = `${i * 0.05}s`;
    });
  }

  function renderCard(item, i) {
    const imgHtml = item.image
      ? `<img class="ls-card-img" src="${item.image}" alt="${escHtml(item.title)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
      : '';

    const placeholderStyle = item.image ? 'display:none' : '';

    return `
      <div class="ls-card">
        <div class="ls-card-img-wrap">
          ${imgHtml}
          <div class="ls-card-img-placeholder" style="${placeholderStyle}">🏷️</div>
          <div class="ls-card-num">#${i + 1}</div>
        </div>
        <div class="ls-card-body">
          <div class="ls-card-title">${item.title ? escHtml(item.title) : '<em style="color:#666">No title</em>'}</div>
          <div class="ls-card-meta">
            ${item.price ? `<span class="ls-card-price">${escHtml(item.price)}</span>` : '<span></span>'}
            ${item.tag ? `<span class="ls-card-tag">${escHtml(item.tag)}</span>` : ''}
          </div>
          ${item.url ? `<a class="ls-card-link" href="${item.url}" target="_blank" rel="noopener">View ↗</a>` : ''}
        </div>
      </div>
    `;
  }

  function closeModal() {
    document.getElementById('ls-modal-backdrop')?.remove();
  }

  function copyAll() {
    const items = getSelectedData();
    const text = items.map((item, i) =>
      `#${i + 1} ${item.title}${item.price ? ' — ' + item.price : ''}${item.url ? '\n' + item.url : ''}`
    ).join('\n\n');

    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('ls-btn-copy');
      if (btn) {
        btn.textContent = '✓ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = '📋 Copy All';
          btn.classList.remove('copied');
        }, 2000);
      }
    });
  }

  function crosspostToMercari() {
    const items = getSelectedData();
    /*const text = items.map((item, i) =>
      `#${i + 1} ${item.title}${item.price ? ' — ' + item.price : ''}${item.url ? '\n' + item.url : ''}`
    ).join('\n\n');*/

    // TODO ? To autofill many automatically
    // Saving listing data to storage before opening the tab
    //chrome.storage.local.set({ pendingListing: listingObject });
    //chrome.tabs.create({ url: 'https://www.mercari.com/sell/' });
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Keyboard shortcut: Escape closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

})();
