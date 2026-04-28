// crosspost-button.js
// Injects a floating crosspost button on Poshmark listing detail pages.
// When clicked, scrapes the listing and opens Mercari's sell form pre-filled.

async function init() {
  if (window.__crosspostInit) return;
  window.__crosspostInit = true;

  // ─── Only run on individual listing pages ───
  const isListingPage = async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_URL' });
    const actualUrl = response.url;
    console.log('Checking URL for listing page:', actualUrl);
    return /poshmark\.com\/listing\//.test(actualUrl) ||
      /poshmark\.com\/closet\/.+/.test(actualUrl)
  };

  const isPageAListing = await isListingPage();
  if (!isPageAListing) return;

  // ─── Inject styles ───
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');

    #cp-btn-wrap {
      position: fixed;
      bottom: 32px;
      right: 28px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      pointer-events: none;
    }

    /* ── DESTINATION CHIPS (appear on hover) ── */
    #cp-destinations {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 7px;
      pointer-events: none;
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
    }

    #cp-btn-wrap:hover #cp-destinations,
    #cp-btn-wrap.expanded #cp-destinations {
      opacity: 1;
      transform: translateY(0);
      pointer-events: all;
    }

    .cp-dest {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 9px 16px 9px 12px;
      border-radius: 100px;
      border: none;
      cursor: pointer;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.1px;
      color: #fff;
      pointer-events: all;
      white-space: nowrap;
      transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
      position: relative;
      overflow: hidden;
    }

    .cp-dest::before {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(255,255,255,0.12);
      opacity: 0;
      transition: opacity 0.15s;
    }

    .cp-dest:hover::before { opacity: 1; }
    .cp-dest:hover { transform: scale(1.04) translateX(-3px); }
    .cp-dest:active { transform: scale(0.97); }

    .cp-dest.mercari {
      background: linear-gradient(135deg, #e9372b, #c0282d);
      box-shadow: 0 6px 20px rgba(233,55,43,0.45), 0 2px 6px rgba(0,0,0,0.3);
      animation: cp-chip-in 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.05s both;
    }

    @keyframes cp-chip-in {
      from { opacity: 0; transform: translateX(20px) scale(0.85); }
      to   { opacity: 1; transform: translateX(0)    scale(1); }
    }

    .cp-dest-logo {
      width: 22px; height: 22px;
      border-radius: 6px;
      background: rgba(255,255,255,0.18);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px;
      flex-shrink: 0;
    }

    .cp-dest-label { line-height: 1; }
    .cp-dest-sub {
      font-size: 10px;
      font-weight: 400;
      opacity: 0.7;
      display: block;
      margin-top: 1px;
    }

    /* ── MAIN FAB ── */
    #cp-fab {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      pointer-events: all;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #111118;
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.08),
        0 8px 28px rgba(0,0,0,0.55),
        0 0 0 0px rgba(255,255,255,0.15);
      transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1),
                  box-shadow 0.3s ease;
      animation: cp-fab-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
    }

    @keyframes cp-fab-in {
      from { opacity: 0; transform: scale(0) rotate(-180deg); }
      to   { opacity: 1; transform: scale(1) rotate(0deg); }
    }

    #cp-fab:hover {
      transform: scale(1.1);
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.12),
        0 12px 36px rgba(0,0,0,0.6),
        0 0 40px rgba(255,255,255,0.05);
    }

    #cp-fab:active { transform: scale(0.95); }

    /* Rotating border gradient */
    #cp-fab::before {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 50%;
      background: conic-gradient(
        from 0deg,
        #e9372b, #f97316, #facc15, #4ade80,
        #06b6d4, #6366f1, #e9372b
      );
      animation: cp-spin 3s linear infinite;
      z-index: -1;
    }

    #cp-fab::after {
      content: '';
      position: absolute;
      inset: 2px;
      border-radius: 50%;
      background: #111118;
      z-index: -1;
    }

    @keyframes cp-spin {
      to { transform: rotate(360deg); }
    }

    #cp-fab-icon {
      font-size: 22px;
      transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s;
      position: absolute;
    }

    #cp-fab-icon.rotated {
      transform: rotate(45deg);
    }

    /* ── TOOLTIP ── */
    #cp-tooltip {
      position: absolute;
      right: calc(100% + 12px);
      top: 50%;
      transform: translateY(-50%);
      background: #111118;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 6px 12px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: #e5e5e5;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }

    #cp-tooltip::after {
      content: '';
      position: absolute;
      right: -5px; top: 50%;
      transform: translateY(-50%);
      width: 9px; height: 9px;
      background: #111118;
      border-right: 1px solid rgba(255,255,255,0.08);
      border-top: 1px solid rgba(255,255,255,0.08);
      transform: translateY(-50%) rotate(45deg);
    }

    #cp-fab:hover + #cp-tooltip,
    #cp-btn-wrap:not(.expanded) #cp-fab:hover ~ #cp-tooltip { opacity: 1; }

    /* ── CONFIRM TOAST ── */
    #cp-toast {
      position: fixed;
      bottom: 108px;
      right: 28px;
      z-index: 2147483647;
      background: #111118;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 12px 16px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: #e5e5e5;
      max-width: 240px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      pointer-events: none;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
      line-height: 1.5;
    }

    #cp-toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    #cp-toast .cp-toast-icon {
      font-size: 18px;
      display: block;
      margin-bottom: 4px;
    }

    /* ── SCRAPING PULSE ── */
    #cp-fab.loading::before {
      animation: cp-spin 0.6s linear infinite;
    }

    #cp-fab.loading #cp-fab-icon {
      opacity: 0.4;
    }
  `;
  document.head.appendChild(style);

  // ─── Build the FAB ───
  const wrap = document.createElement('div');
  wrap.id = 'cp-btn-wrap';
  wrap.innerHTML = `
    <div id="cp-destinations">
      <button class="cp-dest mercari" data-platform="mercari">
        <div class="cp-dest-logo">🏪</div>
        <div class="cp-dest-label">
          Mercari
          <span class="cp-dest-sub">Auto-fill sell form</span>
        </div>
      </button>
    </div>

    <button id="cp-fab" aria-label="Crosspost this listing">
      <span id="cp-fab-icon">⚡</span>
    </button>
    <div id="cp-tooltip">Crosspost listing</div>
  `;

  document.body.appendChild(wrap);

  // ─── FAB click — toggle expanded ───
  const fab = document.getElementById('cp-fab');
  const fabIcon = document.getElementById('cp-fab-icon');

  fab.addEventListener('click', () => {
    wrap.classList.toggle('expanded');
    fabIcon.classList.toggle('rotated');
    fabIcon.textContent = wrap.classList.contains('expanded') ? '✕' : '⚡';
  });

  // ─── Destination click ───
  document.querySelectorAll('.cp-dest').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const platform = btn.dataset.platform;
      await handleCrosspost(platform);
    });
  });

  // ─── SCRAPE current listing page ───
  async function scrapeListing() {
    fab.classList.add('loading');

    const listingInfo = document.querySelector('div[class*="listing__info"]');

    // Title
    const title =
      //document.querySelector('h1[itemprop="name"]')?.textContent?.trim() ||
      //document.querySelector('.listing__title h1')?.textContent?.trim() ||
      //document.querySelector('[class*="listing-title"] h1')?.textContent?.trim() ||
      //document.querySelector('h1')?.textContent?.trim() || 
      listingInfo.querySelector('h1[class*="listing__title"]')?.textContent?.trim() || '';

    // Description
    const description =
      //document.querySelector('[itemprop="description"]')?.textContent?.trim() ||
      //document.querySelector('[class*="description__text"]')?.textContent?.trim() ||
      //document.querySelector('[data-test="listing-description"]')?.textContent?.trim() ||
      //document.querySelector('[class*="listing-description"]')?.textContent?.trim() || 
      listingInfo.querySelector('[class*="listing__description"]')?.textContent?.trim() || '';

    // Price
    const priceEl =
      //document.querySelector('[itemprop="price"]') ||
      //document.querySelector('[class*="listing-price"]') ||
      //document.querySelector('[data-test="listing-price"]') ||
      listingInfo.querySelector('div[class*="listing__ipad-centered"]');
    const priceText = priceEl?.getAttribute('content') || priceEl?.textContent || '';
    const priceNums = priceText.replaceAll("$", "").match(/[\d,.]+/g);
    const price = parseFloat((priceNums && priceNums.length > 0 ? priceNums[0] : '') || '0');
    console.log('Extracted price text:', priceText, priceNums, price);

    // Size
    const size = extractDetail(['size', 'sz']) ||
      document.querySelector('[class*="size-tag"]')?.textContent?.trim() || '';

    // Brand 
    const brand = extractDetail(['brand']) ||
      //document.querySelector('[class*="brand"] a')?.textContent?.trim() || 
      listingInfo.querySelector('a[class*="listing__brand"]')?.textContent?.trim() || '';

    // Condition
    const condition = extractDetail(['condition', 'nwt', 'nwot', 'used', 'like new']) ||
      document.querySelector('[class*="condition"]')?.textContent?.trim() || '';

    // Color
    const color = extractDetail(['color', 'colour']) || '';

    // Category breadcrumbs
    const category = Array.from(
      document.querySelectorAll('div[data-et-name="listing_details_category"]')
    ).map(a => a.textContent.trim()).filter(Boolean).join(' > ');

    // Images — grab full-res sources
    const images = [];
    document
      .querySelector('div[class*="slideshow"]')
      .querySelectorAll(
        '[class*="image-gallery"] img, [class*="listing-img"] img, [class*="media"] img, picture img'
      ).forEach(img => {
        const src = img.src || img.dataset.src;
        if (src && !src.includes('avatar') && !src.includes('placeholder') && !images.includes(src)) {
          images.push(src.replace(/w=\d+/, 'w=1200').replace(/h=\d+/, 'h=1200'));
        }
      });

    // Listing ID from URL
    const id = location.pathname.match(/listing\/([^/?]+)/)?.[1] || '';

    fab.classList.remove('loading');

    return { id, title, description, price, size, brand, condition, color, category, images, url: location.href, source: 'poshmark' };
  }

  async function cacheImages(imageUrls) {
    const cached = [];

    for (const url of imageUrls.slice(0, 12)) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const base64 = await blobToBase64(blob);
        cached.push({ url, base64, type: blob.type });
      } catch (e) {
        console.warn('Failed to fetch image:', url);
      }
    }

    await chrome.storage.local.set({ pendingImages: cached });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result); // "data:image/jpeg;base64,..."
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Scan structured detail rows (Poshmark uses key-value pairs in the listing sidebar)
  function extractDetail(keywords) {
    const rows = document.querySelectorAll(
      '[class*="listing-details"] li, [class*="details"] tr, [class*="detail-row"], dl dt, .listing__detail-list li'
    );

    for (const row of rows) {
      const text = row.textContent.toLowerCase();
      if (keywords.some(k => text.includes(k))) {
        // Try to get the value part only
        const val = row.querySelector('span:last-child, dd, td:last-child, a') ||
          row.querySelector('[class*="value"]');
        return (val?.textContent || row.textContent).trim();
      }
    }
    return '';
  }

  // ─── Platform handlers ───
  async function handleCrosspost(platform) {
    showToast('⚡', 'Scraping listing…');
    const listing = await scrapeListing();
    await cacheImages(listing.images);
    await chrome.storage.local.set({ pendingListing: listing });

    // Collapse FAB
    wrap.classList.remove('expanded');
    fabIcon.classList.remove('rotated');
    fabIcon.textContent = '⚡';

    if (platform === 'mercari') {
      console.log('Scraped listing data:', listing);
      chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: 'https://www.mercari.com/sell/' });
      showToast('🚀', `Opening Mercari…\nYour listing data is ready to fill.`);

    } 
  }

  // ─── Toast ───
  function showToast(icon, message) {
    let toast = document.getElementById('cp-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cp-toast';
      document.body.appendChild(toast);
    }

    toast.innerHTML = `<span class="cp-toast-icon">${icon}</span>${message}`;
    toast.classList.add('show');

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

  // ─── Close expanded menu when clicking outside ───
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target) && wrap.classList.contains('expanded')) {
      wrap.classList.remove('expanded');
      fabIcon.classList.remove('rotated');
      fabIcon.textContent = '⚡';
    }
  });

    // ── LISTEN FOR MESSAGES FROM POPUP ──
  chrome.runtime.onMessage.addListener(async (msg, _, sendResponse) => {
    
    if (msg.type === 'CP_PENDING_LISTING') {
      chrome.storage.local.get(['pendingListing'], ({ pendingListing }) => {
        console.log('Retrieved pending listing from storage:', pendingListing);
        if (!pendingListing) return; // nothing to fill
        sendResponse({ pendingListing });
      });
    }

    if (msg.type === 'CP_SCRAPE_LISTING') {
      showToast('⚡', 'Scraping listing…');
      const listing = await scrapeListing();
      await chrome.storage.local.set({ pendingListing: listing });
      sendResponse({ pendingListing: listing });
    }

    return true;
  });

};

init();