// mercari-autofill.js
// Content script — runs on https://www.mercari.com/sell/*
// Reads listing data from chrome.storage and fills the Mercari sell form.

(function () {
  if (window.__mercariFillerInit) return;
  window.__mercariFillerInit = true;

  // ─────────────────────────────────────────────
  // CONDITION MAP  (Poshmark → Mercari labels)
  // ─────────────────────────────────────────────
  const CONDITION_MAP = {
    'nwt':               'New',
    'new with tags':     'New',
    'nwot':              'New',
    'new without tags':  'New',
    'new':               'New',
    'like new':          'Like New',
    'excellent':         'Like New',
    'good':              'Good',
    'fair':              'Fair',
    'poor':              'Fair',
    'play condition':    'Fair',
  };

  // ─────────────────────────────────────────────
  // ENTRY POINT — wait for storage data
  // ─────────────────────────────────────────────
  chrome.storage.local.get(['pendingListing'], ({ pendingListing }) => {
    if (!pendingListing) return; // nothing to fill
    // Just dont unset it like wtf ai
    //chrome.storage.local.remove('pendingListing');
    waitForForm(pendingListing);
  });

  // ─────────────────────────────────────────────
  // WAIT FOR MERCARI'S REACT FORM TO MOUNT
  // ─────────────────────────────────────────────
  function waitForForm(listing, attempts = 0) {
    if (attempts > 60) {
      showToast('⚠️ Form not found — try refreshing.', 'error');
      return;
    }

    // Mercari's title input is a reliable "form is ready" signal
    const titleInput = findByPlaceholder('input', 'What are you selling') ||
                       findByLabel('Product name') ||
                       document.querySelector('input[data-testid="ItemName"]') ||
                       document.querySelector('input[name="name"]');

    if (!titleInput) {
      setTimeout(() => waitForForm(listing, attempts + 1), 400);
      return;
    }

    // Small extra delay so React finishes hydrating
    setTimeout(() => runFill(listing, titleInput), 300);
  }

  // ─────────────────────────────────────────────
  // MAIN FILL ROUTINE
  // ─────────────────────────────────────────────
  async function runFill(listing, titleInput) {
    showPanel(listing);

    await sleep(150);

    // 1. TITLE
    fill(titleInput, listing.title || '');
    await sleep(120);

    // 2. DESCRIPTION
    const descInput = findByPlaceholder('textarea', 'Describe') ||
                      findByLabel('Description') ||
                      document.querySelector('textarea[name="description"]') ||
                      document.querySelector('textarea[data-testid="ItemDescription"]');
    if (descInput) {
      fill(descInput, buildDescription(listing));
      await sleep(120);
    }

    // 3. PRICE  (Mercari has no buyer fee shown to seller — suggest ~10% lower)
    const priceInput = document.querySelector('input[data-testid="ItemPrice"]') ||
                       findByPlaceholder('input', 'Price') ||
                       findByLabel('Price') ||
                       document.querySelector('input[name="price"]');
    if (priceInput && listing.price) {
      const suggested = Math.max(1, Math.floor(listing.price * 0.9));
      fill(priceInput, String(suggested));
      await sleep(120);
    }

    // 4. CONDITION  (click the correct radio / button)
    await sleep(200);
    fillCondition(listing.condition);

    // 5. BRAND
    await sleep(200);
    const brandInput = findByPlaceholder('input', 'Brand') ||
                       findByLabel('Brand') ||
                       document.querySelector('input[data-testid="ItemBrand"]') ||
                       document.querySelector('input[name="brand"]');
    if (brandInput && listing.brand) {
      fill(brandInput, listing.brand);
      await sleep(120);
    }

    // 6. SIZE  (best-effort text fill; Mercari uses a dropdown)
    const sizeInput = findByPlaceholder('input', 'Size') ||
                      findByLabel('Size') ||
                      document.querySelector('input[data-testid="ItemSize"]');
    if (sizeInput && listing.size) {
      fill(sizeInput, listing.size);
      await sleep(120);
    }

    updatePanelStatus('filled');
  }

  // ─────────────────────────────────────────────
  // BUILD DESCRIPTION
  // ─────────────────────────────────────────────
  function buildDescription(listing) {
    const lines = [];

    if (listing.description) lines.push(listing.description.trim());

    const meta = [];
    if (listing.brand)     meta.push(`Brand: ${listing.brand}`);
    if (listing.size)      meta.push(`Size: ${listing.size}`);
    if (listing.condition) meta.push(`Condition: ${listing.condition}`);
    if (listing.color)     meta.push(`Color: ${listing.color}`);

    if (meta.length) {
      if (lines.length) lines.push('');
      lines.push(...meta);
    }

    lines.push('');
    lines.push('Cross-listed from Poshmark.');

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────
  // CONDITION FILL
  // ─────────────────────────────────────────────
  function fillCondition(rawCondition) {
    if (!rawCondition) return;

    const normalized = (rawCondition || '').toLowerCase().trim();
    const mercariLabel = CONDITION_MAP[normalized] ||
      (normalized.includes('new') ? 'New' :
       normalized.includes('like') ? 'Like New' :
       normalized.includes('good') ? 'Good' : 'Good');

    // Mercari renders condition as clickable buttons/labels
    const candidates = [
      ...document.querySelectorAll('button, label, [role="radio"], [role="button"]')
    ];

    for (const el of candidates) {
      const text = el.textContent?.trim();
      if (!text) continue;

      if (
        text === mercariLabel ||
        (mercariLabel === 'New' && (text === 'New' || text === 'New with tags')) ||
        (mercariLabel === 'Like New' && (text === 'Like new' || text === 'Like New')) ||
        (mercariLabel === 'Good' && text === 'Good') ||
        (mercariLabel === 'Fair' && (text === 'Fair' || text === 'Poor'))
      ) {
        el.click();
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
        break;
      }
    }
  }

  // ─────────────────────────────────────────────
  // REACT-SAFE INPUT SETTER
  // Sets value and fires both React synthetic + native events
  // ─────────────────────────────────────────────
  function fill(el, value) {
    if (!el) return;

    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }

    // Fire events React listens to
    ['input', 'change', 'blur'].forEach(type => {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    });
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    el.dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true, key: 'End' }));
  }

  // ─────────────────────────────────────────────
  // FINDER HELPERS
  // ─────────────────────────────────────────────
  function findByPlaceholder(tag, partial) {
    return [...document.querySelectorAll(tag)].find(
      el => el.placeholder?.toLowerCase().includes(partial.toLowerCase())
    ) || null;
  }

  function findByLabel(labelText) {
    const labels = [...document.querySelectorAll('label')];
    for (const label of labels) {
      if (label.textContent.trim().toLowerCase().includes(labelText.toLowerCase())) {
        const forId = label.getAttribute('for');
        if (forId) return document.getElementById(forId);
        const nested = label.querySelector('input, textarea, select');
        if (nested) return nested;
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────
  // SIDE PANEL UI
  // ─────────────────────────────────────────────
  let panelEl = null;

  function showPanel(listing) {
    if (document.getElementById('mf-panel')) return;

    const thumb = listing.images?.[0] || listing.image || '';
    const price = listing.price ? `$${listing.price}` : '';

    panelEl = document.createElement('div');
    panelEl.id = 'mf-panel';
    panelEl.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');

        #mf-panel {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 2147483647;
          width: 300px;
          background: #0d0d12;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.03),
            0 32px 64px rgba(0,0,0,0.7),
            0 0 60px rgba(16,185,129,0.06);
          font-family: 'Outfit', system-ui, sans-serif;
          animation: mf-slide-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
        }

        @keyframes mf-slide-in {
          from { opacity: 0; transform: translateX(40px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)  scale(1); }
        }

        #mf-header {
          background: linear-gradient(135deg, #0d1f18 0%, #0d0d12 100%);
          padding: 14px 16px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          gap: 10px;
        }

        #mf-logo {
          width: 30px; height: 30px;
          border-radius: 8px;
          background: linear-gradient(135deg, #10b981, #059669);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(16,185,129,0.35);
          flex-shrink: 0;
        }

        #mf-title {
          font-size: 13px; font-weight: 800;
          color: #f0fdf4; letter-spacing: -0.2px;
        }

        #mf-subtitle {
          font-size: 11px; color: #6b7280; margin-top: 1px;
        }

        #mf-close {
          margin-left: auto;
          width: 26px; height: 26px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 50%;
          color: #6b7280;
          cursor: pointer;
          font-size: 15px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
          flex-shrink: 0;
          line-height: 1;
        }
        #mf-close:hover { background: rgba(239,68,68,0.15); color: #ef4444; }

        #mf-thumb-row {
          display: flex; gap: 10px; align-items: center;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.01);
        }

        #mf-thumb {
          width: 52px; height: 52px;
          border-radius: 10px; object-fit: cover; flex-shrink: 0;
          background: #1a1a24;
        }

        #mf-listing-name {
          font-size: 12px; font-weight: 700; color: #f9fafb;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          margin-bottom: 3px;
        }

        #mf-listing-meta {
          font-size: 11px; color: #6b7280;
          display: flex; gap: 8px; flex-wrap: wrap;
        }

        #mf-listing-meta span { color: #10b981; font-weight: 700; }

        #mf-steps {
          padding: 10px 14px;
          display: flex; flex-direction: column; gap: 6px;
        }

        .mf-step {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 10px;
          transition: all 0.3s ease;
        }

        .mf-step.done {
          border-color: rgba(16,185,129,0.25);
          background: rgba(16,185,129,0.06);
        }

        .mf-step.active {
          border-color: rgba(16,185,129,0.4);
          background: rgba(16,185,129,0.1);
        }

        .mf-step-icon {
          width: 22px; height: 22px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; flex-shrink: 0;
          background: rgba(255,255,255,0.06);
          color: #6b7280;
          transition: all 0.3s;
        }

        .mf-step.done .mf-step-icon {
          background: #10b981; color: #fff;
          box-shadow: 0 0 10px rgba(16,185,129,0.4);
        }

        .mf-step.active .mf-step-icon {
          background: rgba(16,185,129,0.2);
          color: #10b981;
          animation: mf-pulse 1s ease infinite;
        }

        @keyframes mf-pulse {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(1.15); }
        }

        .mf-step-text { font-size: 12px; font-weight: 600; color: #9ca3af; }
        .mf-step.done .mf-step-text { color: #d1fae5; }
        .mf-step.active .mf-step-text { color: #a7f3d0; }

        #mf-footer {
          padding: 10px 14px 14px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        #mf-status-bar {
          font-size: 11px; color: #6b7280; text-align: center;
          margin-bottom: 8px; min-height: 16px;
          transition: color 0.3s;
        }

        #mf-status-bar.filling { color: #10b981; }
        #mf-status-bar.done { color: #4ade80; font-weight: 700; }
        #mf-status-bar.error { color: #f87171; }

        #mf-progress {
          height: 3px; background: rgba(255,255,255,0.06);
          border-radius: 100px; overflow: hidden; margin-bottom: 10px;
        }

        #mf-progress-bar {
          height: 100%; width: 0%;
          background: linear-gradient(90deg, #10b981, #34d399);
          border-radius: 100px;
          transition: width 0.5s ease;
          box-shadow: 0 0 8px rgba(16,185,129,0.5);
        }

        #mf-btn-photos {
          width: 100%;
          padding: 9px;
          background: rgba(16,185,129,0.1);
          border: 1px solid rgba(16,185,129,0.2);
          border-radius: 10px;
          color: #34d399;
          font-family: 'Outfit', system-ui, sans-serif;
          font-size: 12px; font-weight: 700;
          cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }

        #mf-btn-photos:hover {
          background: rgba(16,185,129,0.18);
          box-shadow: 0 0 16px rgba(16,185,129,0.15);
        }

        /* PHOTO DRAWER */
        #mf-photo-drawer {
          border-top: 1px solid rgba(255,255,255,0.05);
          padding: 10px 14px;
          display: none;
          flex-direction: column; gap: 6px;
        }

        #mf-photo-drawer.open { display: flex; }

        .mf-photo-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.8px; color: #4b5563; margin-bottom: 2px;
        }

        .mf-photo-row {
          display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px;
        }

        .mf-photo-row img {
          width: 56px; height: 56px; border-radius: 8px; object-fit: cover;
          flex-shrink: 0; cursor: pointer; border: 2px solid transparent;
          transition: border-color 0.15s;
        }

        .mf-photo-row img:hover { border-color: #10b981; }

        .mf-photo-hint {
          font-size: 10px; color: #4b5563; line-height: 1.4;
        }
      </style>

      <div id="mf-header">
        <div id="mf-logo">⚡</div>
        <div>
          <div id="mf-title">Mercari Auto-Fill</div>
          <div id="mf-subtitle">Filling your listing now…</div>
        </div>
        <button id="mf-close">×</button>
      </div>

      ${thumb || listing.title ? `
      <div id="mf-thumb-row">
        ${thumb ? `<img id="mf-thumb" src="${thumb}" onerror="this.style.display='none'">` : ''}
        <div style="min-width:0;flex:1">
          <div id="mf-listing-name">${esc(listing.title || 'Untitled')}</div>
          <div id="mf-listing-meta">
            ${price ? `<span>${price}</span>` : ''}
            ${listing.brand ? esc(listing.brand) : ''}
            ${listing.size ? `· Size ${esc(listing.size)}` : ''}
          </div>
        </div>
      </div>` : ''}

      <div id="mf-steps">
        <div class="mf-step active" id="mf-step-title">
          <div class="mf-step-icon">✦</div>
          <div class="mf-step-text">Title</div>
        </div>
        <div class="mf-step" id="mf-step-desc">
          <div class="mf-step-icon">✦</div>
          <div class="mf-step-text">Description</div>
        </div>
        <div class="mf-step" id="mf-step-price">
          <div class="mf-step-icon">✦</div>
          <div class="mf-step-text">Price</div>
        </div>
        <div class="mf-step" id="mf-step-condition">
          <div class="mf-step-icon">✦</div>
          <div class="mf-step-text">Condition</div>
        </div>
        <div class="mf-step" id="mf-step-details">
          <div class="mf-step-icon">✦</div>
          <div class="mf-step-text">Brand / Size</div>
        </div>
      </div>

      <div id="mf-footer">
        <div id="mf-progress"><div id="mf-progress-bar"></div></div>
        <div id="mf-status-bar" class="filling">Filling in your listing…</div>
        <button id="mf-btn-photos">📷 View Poshmark Photos</button>
      </div>

      ${(listing.images?.length || listing.image) ? `
      <div id="mf-photo-drawer">
        <div class="mf-photo-label">Your Poshmark Photos — right-click → Save to upload</div>
        <div class="mf-photo-row">
          ${(listing.images || [listing.image]).filter(Boolean).slice(0, 10).map(
            src => `<img src="${esc(src)}" title="Right-click → Save image" draggable="true">`
          ).join('')}
        </div>
        <div class="mf-photo-hint">📌 Photos can't be uploaded automatically. Save each image, then upload to Mercari manually.</div>
      </div>` : ''}
    `;

    document.body.appendChild(panelEl);

    // Close
    document.getElementById('mf-close').addEventListener('click', () => panelEl.remove());

    // Photo drawer toggle
    const btnPhotos = document.getElementById('mf-btn-photos');
    const drawer = document.getElementById('mf-photo-drawer');
    if (btnPhotos && drawer) {
      btnPhotos.addEventListener('click', () => {
        drawer.classList.toggle('open');
        btnPhotos.textContent = drawer.classList.contains('open')
          ? '▲ Hide Photos'
          : '📷 View Poshmark Photos';
      });
    } else if (btnPhotos) {
      btnPhotos.style.display = 'none';
    }

    // Animate steps with progress
    animateSteps(listing);
  }

  async function animateSteps(listing) {
    const steps = ['title', 'desc', 'price', 'condition', 'details'];
    const bar = document.getElementById('mf-progress-bar');

    for (let i = 0; i < steps.length; i++) {
      const key = steps[i];
      const stepEl = document.getElementById(`mf-step-${key}`);
      if (!stepEl) continue;

      // Mark previous done
      if (i > 0) {
        const prev = document.getElementById(`mf-step-${steps[i - 1]}`);
        prev?.classList.remove('active');
        prev?.classList.add('done');
        if (prev) prev.querySelector('.mf-step-icon').textContent = '✓';
      }

      stepEl.classList.add('active');
      if (bar) bar.style.width = `${((i + 1) / steps.length) * 100}%`;

      await sleep(350);
    }

    // All done
    steps.forEach(key => {
      const el = document.getElementById(`mf-step-${key}`);
      el?.classList.remove('active');
      el?.classList.add('done');
      if (el) el.querySelector('.mf-step-icon').textContent = '✓';
    });

    if (bar) bar.style.width = '100%';
  }

  function updatePanelStatus(state) {
    const statusEl = document.getElementById('mf-status-bar');
    const subtitle = document.getElementById('mf-subtitle');
    if (!statusEl) return;

    if (state === 'filled') {
      statusEl.textContent = '✅ All fields filled! Review, add photos & publish.';
      statusEl.className = 'done';
      if (subtitle) subtitle.textContent = 'Review & publish when ready';
    } else if (state === 'error') {
      statusEl.textContent = '⚠️ Some fields may not have filled. Please check.';
      statusEl.className = 'error';
    }
  }

  // ─────────────────────────────────────────────
  // TOAST (lightweight fallback notification)
  // ─────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    const existing = document.getElementById('mf-toast');
    if (existing) existing.remove();

    const colors = { info: '#6366f1', success: '#10b981', error: '#ef4444' };
    const toast = document.createElement('div');
    toast.id = 'mf-toast';
    toast.style.cssText = `
      position:fixed; top:20px; left:50%; transform:translateX(-50%);
      background:#0d0d12; color:#f9fafb;
      padding:10px 20px; border-radius:100px;
      z-index:2147483647; font-family:'Outfit',system-ui,sans-serif;
      font-size:13px; font-weight:600;
      box-shadow:0 4px 24px rgba(0,0,0,.6);
      border:1px solid ${colors[type]}44;
      border-left:3px solid ${colors[type]};
      white-space:nowrap; pointer-events:none;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  // ─────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────
  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
