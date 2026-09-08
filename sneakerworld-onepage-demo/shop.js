(() => {
  const STORAGE_KEY = 'sw_cart_v1';
  const SIZE_OPTIONS = ['39', '40', '41', '42', '43', '44', '45'];
  const SIZE_GRID = [
    { eu: '39', us: '6.5', uk: '6', cm: '24.5' },
    { eu: '40', us: '7', uk: '6.5', cm: '25' },
    { eu: '41', us: '8', uk: '7', cm: '26' },
    { eu: '42', us: '8.5', uk: '7.5', cm: '26.5' },
    { eu: '43', us: '9.5', uk: '8.5', cm: '27.5' },
    { eu: '44', us: '10', uk: '9', cm: '28' },
    { eu: '45', us: '11', uk: '10', cm: '29' },
  ];

  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

  const cart = loadCart();
  const draftSizes = new Set();
  let appliedSizes = [];
  let appliedPick = '';

  const els = {
    list: document.getElementById('cartList'),
    total: document.getElementById('cartTotal'),
    countTop: document.getElementById('cartCountTop'),
    countDock: document.getElementById('cartCountDock'),
    cartSheet: document.getElementById('cartSheet'),
    sizeSheet: document.getElementById('sizeSheet'),
    bg: document.getElementById('sheetBg'),
    toast: document.getElementById('toast'),
    sizePick: document.getElementById('sizePick'),
    gridBody: document.querySelector('#sizeGridTable tbody'),
    activeFilters: document.getElementById('activeFilters'),
    catalogEmpty: document.getElementById('catalogEmpty'),
    catalogList: document.getElementById('catalogList'),
    pickLabel: document.getElementById('pickLabel'),
  };

  function selectedSize(root) {
    const active = root.querySelector('.size.active');
    return active ? active.textContent.trim() : '';
  }

  function availSet(card) {
    return new Set(
      String(card.dataset.avail || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }

  function tagSet(card) {
    return new Set(
      String(card.dataset.tags || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }

  function showToast(text) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => els.toast.classList.remove('show'), 1600);
  }

  function renderCart() {
    if (!els.list) return;
    const count = cart.reduce((n, i) => n + i.qty, 0);
    if (els.countTop) els.countTop.textContent = String(count);
    if (els.countDock) els.countDock.textContent = String(count);
    if (!cart.length) {
      els.list.innerHTML = '<div class="cart-empty">Корзина пуста. Добавьте модель из каталога.</div>';
      if (els.total) els.total.textContent = '0 BYN';
      return;
    }
    els.list.innerHTML = cart
      .map(
        (i, idx) => `
      <div class="cart-item">
        <div>
          <div class="b">${i.name}</div>
          <div class="s">Размер ${i.size} · ${i.qty} шт.</div>
        </div>
        <div style="text-align:right">
          <div class="price">${i.price * i.qty} BYN</div>
          <button class="buy" type="button" data-remove="${idx}" style="margin-top:6px">Убрать</button>
        </div>
      </div>`
      )
      .join('');
    const sum = cart.reduce((n, i) => n + i.price * i.qty, 0);
    if (els.total) els.total.textContent = sum + ' BYN';
  }

  function openBg() {
    if (!els.bg) return;
    els.bg.classList.add('open');
    els.bg.setAttribute('aria-hidden', 'false');
  }

  function closeBgIfIdle() {
    if (!els.bg) return;
    const cartOpen = els.cartSheet && els.cartSheet.classList.contains('open');
    const sizeOpen = els.sizeSheet && els.sizeSheet.classList.contains('open');
    if (cartOpen || sizeOpen) return;
    els.bg.classList.remove('open');
    els.bg.setAttribute('aria-hidden', 'true');
  }

  function closeCart() {
    if (!els.cartSheet) return;
    els.cartSheet.classList.remove('open');
    els.cartSheet.setAttribute('aria-hidden', 'true');
    closeBgIfIdle();
  }

  function closeSize() {
    if (!els.sizeSheet) return;
    els.sizeSheet.classList.remove('open');
    els.sizeSheet.setAttribute('aria-hidden', 'true');
    closeBgIfIdle();
  }

  function closeAllSheets() {
    closeCart();
    closeSize();
  }

  function openCart() {
    if (!els.cartSheet) return;
    closeSize();
    els.cartSheet.classList.add('open');
    els.cartSheet.setAttribute('aria-hidden', 'false');
    openBg();
    renderCart();
  }

  function openSize() {
    if (!els.sizeSheet) return;
    closeCart();
    draftSizes.clear();
    appliedSizes.forEach((s) => draftSizes.add(s));
    renderSizePick();
    highlightGrid();
    els.sizeSheet.classList.add('open');
    els.sizeSheet.setAttribute('aria-hidden', 'false');
    openBg();
  }

  function renderSizePick() {
    if (!els.sizePick) return;
    els.sizePick.innerHTML = SIZE_OPTIONS.map(
      (sz) =>
        `<button type="button" class="size-pick${draftSizes.has(sz) ? ' on' : ''}" data-eu="${sz}">${sz}</button>`
    ).join('');
  }

  function renderGridTable() {
    if (!els.gridBody) return;
    els.gridBody.innerHTML = SIZE_GRID.map(
      (r) => `<tr data-eu="${r.eu}"><td>${r.eu}</td><td>${r.us}</td><td>${r.uk}</td><td>${r.cm}</td></tr>`
    ).join('');
  }

  function highlightGrid() {
    if (!els.gridBody) return;
    const active = draftSizes.size ? draftSizes : new Set(appliedSizes);
    els.gridBody.querySelectorAll('tr').forEach((tr) => {
      tr.classList.toggle('hl', active.has(tr.dataset.eu));
    });
  }

  function syncCardSizes(preferred) {
    document.querySelectorAll('.prod').forEach((card) => {
      const avail = availSet(card);
      const match = preferred.find((sz) => avail.has(sz));
      if (!match) return;
      const group = card.querySelector('[data-sizes]');
      if (!group) return;
      group.querySelectorAll('.size').forEach((btn) => {
        btn.classList.toggle('active', btn.textContent.trim() === match);
      });
    });
  }

  const PICK_TITLES = {
    white: 'Белые кроссовки',
    daily: 'На каждый день',
    jordan: 'Jordan',
    sale: 'Скидки',
    men: 'Мужские кроссовки',
    'men-apparel': 'Мужская одежда',
    women: 'Женские кроссовки',
    'women-apparel': 'Женская одежда',
  };

  function renderActiveFilters() {
    if (!els.activeFilters) return;
    const chips = [];
    if (appliedPick) {
      chips.push(
        `<span class="af-chip">${PICK_TITLES[appliedPick] || appliedPick} <button type="button" aria-label="Убрать подборку" data-clear-pick>✕</button></span>`
      );
    }
    appliedSizes.forEach((sz) => {
      chips.push(
        `<span class="af-chip">EU ${sz} <button type="button" aria-label="Убрать ${sz}" data-remove-size="${sz}">✕</button></span>`
      );
    });
    if (chips.length) {
      chips.push(
        `<span class="af-chip" style="background:var(--soft);border-color:var(--line);color:var(--muted)"><button type="button" id="clearSizesInline" style="all:unset;cursor:pointer;font-weight:800">Сбросить все</button></span>`
      );
    }
    els.activeFilters.innerHTML = chips.join('');
    if (els.pickLabel) {
      if (appliedPick) {
        els.pickLabel.textContent = PICK_TITLES[appliedPick] || appliedPick;
        els.pickLabel.hidden = false;
      } else {
        els.pickLabel.textContent = '';
        els.pickLabel.hidden = true;
      }
    }
  }

  function applyFilters() {
    const filter = new Set(appliedSizes);
    let visibleCatalog = 0;
    document.querySelectorAll('.prod').forEach((card) => {
      const avail = availSet(card);
      const tags = tagSet(card);
      const sizeOk = !filter.size || [...filter].some((sz) => avail.has(sz));
      const pickOk = !appliedPick || tags.has(appliedPick);
      const show = sizeOk && pickOk;
      card.classList.toggle('hidden-by-size', !show);
      if (show && els.catalogList && els.catalogList.contains(card)) visibleCatalog += 1;
    });
    if (els.catalogEmpty) {
      const anyFilter = filter.size > 0 || !!appliedPick;
      els.catalogEmpty.classList.toggle('show', anyFilter && visibleCatalog === 0);
    }
    renderActiveFilters();
    if (appliedSizes.length) syncCardSizes(appliedSizes);
  }

  function clearSizeFilter() {
    draftSizes.clear();
    appliedSizes = [];
    applyFilters();
    renderSizePick();
    highlightGrid();
  }

  function clearAllFilters() {
    appliedPick = '';
    clearSizeFilter();
    const url = new URL(window.location.href);
    url.searchParams.delete('pick');
    history.replaceState({}, '', url.pathname + url.search + url.hash);
  }

  // Cart UI
  document.querySelectorAll('[data-sizes]').forEach((group) => {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.size');
      if (!btn) return;
      group.querySelectorAll('.size').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.prod');
      if (!card) return;
      const size = selectedSize(card);
      if (!size) {
        showToast('Сначала выберите размер');
        return;
      }
      const id = card.dataset.id + '-' + size;
      const found = cart.find((i) => i.id === id);
      if (found) found.qty += 1;
      else {
        cart.push({
          id,
          name: card.dataset.name,
          price: Number(card.dataset.price || 0),
          size,
          qty: 1,
        });
      }
      saveCart(cart);
      renderCart();
      showToast('Добавлено в корзину');
    });
  });

  if (els.list) {
    els.list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      cart.splice(Number(btn.dataset.remove), 1);
      saveCart(cart);
      renderCart();
    });
  }

  const openCartTop = document.getElementById('openCartTop');
  const openCartDock = document.getElementById('openCartDock');
  if (openCartTop) openCartTop.addEventListener('click', openCart);
  if (openCartDock) openCartDock.addEventListener('click', openCart);
  if (els.bg) els.bg.addEventListener('click', closeAllSheets);

  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      if (!cart.length) {
        showToast('Корзина пуста');
        return;
      }
      showToast('Демо: оформление на сайте');
      closeCart();
    });
  }

  // Size panel (catalog only)
  if (els.sizeSheet) {
    renderGridTable();
    renderSizePick();

    if (els.sizePick) {
      els.sizePick.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-eu]');
        if (!btn) return;
        const sz = btn.dataset.eu;
        if (draftSizes.has(sz)) draftSizes.delete(sz);
        else draftSizes.add(sz);
        btn.classList.toggle('on', draftSizes.has(sz));
        highlightGrid();
      });
    }

    document.querySelectorAll('[data-size-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.sizeTab;
        document.querySelectorAll('[data-size-tab]').forEach((t) => {
          const on = t === tab;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.querySelectorAll('[data-size-pane]').forEach((pane) => {
          pane.classList.toggle('active', pane.dataset.sizePane === name);
        });
      });
    });

    const sizeApplyBtn = document.getElementById('sizeApplyBtn');
    const sizeClearBtn = document.getElementById('sizeClearBtn');
    const clearSizes = document.getElementById('clearSizes');
    const openSizePanel = document.getElementById('openSizePanel');
    const openSizePanelChip = document.getElementById('openSizePanelChip');

    if (sizeApplyBtn) {
      sizeApplyBtn.addEventListener('click', () => {
        appliedSizes = [...draftSizes].sort((a, b) => Number(a) - Number(b));
        applyFilters();
        closeSize();
        const catalog = document.getElementById('catalog');
        if (catalog) catalog.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast(
          appliedSizes.length ? 'Фильтр: EU ' + appliedSizes.join(', ') : 'Показаны все размеры'
        );
      });
    }
    if (sizeClearBtn) {
      sizeClearBtn.addEventListener('click', () => {
        clearSizeFilter();
        showToast('Фильтр размеров сброшен');
      });
    }
    if (clearSizes) {
      clearSizes.addEventListener('click', () => {
        clearAllFilters();
        showToast('Фильтр сброшен');
      });
    }
    if (openSizePanel) openSizePanel.addEventListener('click', openSize);
    if (openSizePanelChip) openSizePanelChip.addEventListener('click', openSize);

    if (els.activeFilters) {
      els.activeFilters.addEventListener('click', (e) => {
        if (e.target.closest('[data-clear-pick]')) {
          appliedPick = '';
          const url = new URL(window.location.href);
          url.searchParams.delete('pick');
          history.replaceState({}, '', url.pathname + url.search + url.hash);
          applyFilters();
          return;
        }
        const one = e.target.closest('[data-remove-size]');
        if (one) {
          appliedSizes = appliedSizes.filter((s) => s !== one.dataset.removeSize);
          draftSizes.clear();
          appliedSizes.forEach((s) => draftSizes.add(s));
          applyFilters();
          renderSizePick();
          highlightGrid();
          return;
        }
        if (e.target.closest('#clearSizesInline')) {
          clearAllFilters();
          showToast('Фильтр сброшен');
        }
      });
    }

    const params = new URLSearchParams(window.location.search);
    const pick = params.get('pick') || '';
    if (pick && PICK_TITLES[pick]) {
      appliedPick = pick;
    }
    applyFilters();
  }

  renderCart();
})();
