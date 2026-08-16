/**
 * page-list.js
 * 
 * Logic for directory.html and literature.html
 * - PDF/MD file checking
 * - Filtering
 * - Sorting
 * - Pagination
 */

function checkFilesExistAndRender() {
    if (window.location.protocol === 'file:') {
        console.warn("Local file:// protocol detected. Auto-hide file checks are disabled to prevent CORS blocking.");
        return;
    }

    const articles = document.querySelectorAll('article.note-item');
    articles.forEach(article => {
        const mdButton = article.querySelector('a[href*="?file="].button') || article.querySelector('a[href*="?lit="].button');
        const pdfButton = article.querySelector('a[href*="?pdf="].button');
        const titleLink = article.querySelector('header h2 a');
        const imageLink = article.querySelector('a.image');

        let mdExists = true;
        let pdfExists = true;
        let promises = [];

        if (mdButton) {
            const href = mdButton.getAttribute('href');
            let paramType = href.includes('?file=') ? '?file=' : '?lit=';
            let folder = paramType === '?file=' ? 'notes' : 'literature';

            const match = href.match(new RegExp(`\\${paramType}([^&]+)`));
            if (match) {
                const decodedPath = decodeURIComponent(match[1]);
                promises.push(
                    fetch(`${folder}/${decodedPath}.md`, { method: 'HEAD' })
                        .then(res => {
                            if (!res.ok) mdExists = false;
                        }).catch(() => {
                            mdExists = false;
                        })
                );
            }
        }

        if (pdfButton) {
            const href = pdfButton.getAttribute('href');
            const match = href.match(/\?pdf=([^&]+)/);
            if (match) {
                const decodedPath = decodeURIComponent(match[1]);
                promises.push(
                    fetch(`pdfs/${decodedPath}.pdf`, { method: 'HEAD' })
                        .then(res => {
                            if (!res.ok) pdfExists = false;
                        }).catch(() => {
                            pdfExists = false;
                        })
                );
            } else {
                pdfExists = false;
            }
        } else {
            pdfExists = false;
        }

        Promise.all(promises).then(() => {
            if (!mdExists && pdfExists) {
                if (mdButton) {
                    if (mdButton.closest('li')) mdButton.closest('li').remove();
                    else mdButton.remove();
                }
                const pdfHref = pdfButton.getAttribute('href');
                if (titleLink) titleLink.setAttribute('href', pdfHref);
                if (imageLink) imageLink.setAttribute('href', pdfHref);
            }
            if (!pdfExists && pdfButton) {
                if (pdfButton.closest('li')) pdfButton.closest('li').remove();
                else pdfButton.remove();
            }
        });
    });
}

/**
 * V6.1 — source-order shortest-column masonry for #posts-container.
 * Packing only — never re-sorts articles by height.
 */
(function () {
    const BP = 760;
    const COLS = 2;
    let masonryFrame = null;
    let cardObserver = null;
    let containerObserver = null;
    let lastContainerWidth = 0;
    let lastHeights = new WeakMap();
    let firstLayoutDone = false;
    let layingOut = false;

    function getContainer() {
        return document.getElementById('posts-container');
    }

    function isListView(container) {
        return !!(container && container.classList.contains('list-view'));
    }

    function isMobile() {
        return window.matchMedia('(max-width: ' + (BP - 1) + 'px)').matches;
    }

    function readGap(container) {
        // Resolve clamp()/calc() via margin — width:var(--gap) can be overridden by
        // legacy .posts > * width rules and return a bogus pixel size.
        const probe = document.createElement('div');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText =
            'position:absolute;visibility:hidden;pointer-events:none;margin:0;padding:0;border:0;height:0;width:0;margin-left:var(--masonry-gap)';
        container.appendChild(probe);
        const resolved = parseFloat(getComputedStyle(probe).marginLeft);
        probe.remove();
        if (Number.isFinite(resolved) && resolved > 0) return resolved;

        const raw = getComputedStyle(container).getPropertyValue('--masonry-gap').trim();
        const n = parseFloat(raw);
        if (Number.isFinite(n) && /rem$/i.test(raw)) {
            const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            return n * rootPx;
        }
        if (Number.isFinite(n) && /px$/i.test(raw)) return n;
        return 16;
    }

    function visibleCards(container) {
        return Array.from(container.querySelectorAll('article.note-item')).filter((card) => {
            if (card.hidden) return false;
            if (card.style.display === 'none') return false;
            const cs = getComputedStyle(card);
            return cs.display !== 'none' && cs.visibility !== 'hidden';
        });
    }

    function clearCardPlacement(card) {
        card.style.removeProperty('transform');
        card.style.width = '';
        card.style.removeProperty('--masonry-x');
        card.style.removeProperty('--masonry-y');
        card.style.top = '';
        card.style.left = '';
    }

    function destroyArticleMasonry() {
        const container = getContainer();
        if (!container) return;
        container.classList.remove('masonry-active', 'masonry-ready', 'masonry-measuring', 'masonry-laying-out');
        container.style.height = '';
        container.style.removeProperty('--masonry-column-width');
        Array.from(container.querySelectorAll('article.note-item')).forEach(clearCardPlacement);
        if (cardObserver) {
            cardObserver.disconnect();
            cardObserver = null;
        }
        // keep containerObserver for width; only tear card observers
        firstLayoutDone = false;
        lastHeights = new WeakMap();
    }

    function bindCardObservers(container) {
        if (typeof ResizeObserver === 'undefined') return;
        if (cardObserver) cardObserver.disconnect();
        cardObserver = new ResizeObserver((entries) => {
            if (layingOut) return;
            let changed = false;
            for (const entry of entries) {
                const h = entry.contentRect.height;
                const prev = lastHeights.get(entry.target);
                if (prev == null || Math.abs(prev - h) > 0.5) {
                    lastHeights.set(entry.target, h);
                    changed = true;
                }
            }
            if (changed) scheduleArticleMasonry();
        });
        visibleCards(container).forEach((card) => cardObserver.observe(card));
    }

    function ensureContainerObserver(container) {
        if (typeof ResizeObserver === 'undefined' || containerObserver) return;
        containerObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = entry.contentRect.width;
                if (Math.abs(w - lastContainerWidth) < 0.5) continue;
                lastContainerWidth = w;
                scheduleArticleMasonry();
            }
        });
        containerObserver.observe(container);
        lastContainerWidth = container.clientWidth;
    }

    function layoutArticleMasonry() {
        const container = getContainer();
        if (!container) return;

        if (isListView(container) || isMobile()) {
            destroyArticleMasonry();
            // Mobile still wants flow; ensure no leftover absolute styles
            if (!isListView(container) && isMobile()) {
                container.classList.add('masonry-active'); // CSS switches to relative flow
                container.style.height = '';
                visibleCards(container).forEach(clearCardPlacement);
            }
            return;
        }

        layingOut = true;
        const gap = readGap(container);
        const cards = visibleCards(container);

        if (!cards.length) {
            container.classList.add('masonry-active');
            container.classList.remove('masonry-measuring', 'masonry-laying-out');
            container.classList.add('masonry-ready');
            container.style.height = '0px';
            layingOut = false;
            return;
        }

        const cardSig = cards.map((c) => c.id || c.getAttribute('data-title') || '').join('|');
        if (cardSig !== container.__masonryCardSig) {
            firstLayoutDone = false;
            container.__masonryCardSig = cardSig;
        }
        if (!firstLayoutDone) {
            container.classList.add('masonry-measuring');
            container.classList.remove('masonry-ready');
        }

        // Kill transitions during measure/write so we never sample mid-flight x/y
        container.classList.add('masonry-active', 'masonry-laying-out');

        const containerWidth = container.clientWidth;
        const columnWidth = (containerWidth - gap) / COLS;
        container.style.setProperty('--masonry-column-width', columnWidth + 'px');

        // Phase 1 — READ: set column width only (do NOT reset transform to 0 —
        // that animates through intermediate x and breaks measurement/tests)
        cards.forEach((card) => {
            card.style.width = columnWidth + 'px';
        });
        void container.offsetHeight;

        const heights = cards.map((card) => {
            const h = card.offsetHeight;
            lastHeights.set(card, h);
            return h;
        });

        // Phase 2 — CALCULATE: shortest-column packing (source order preserved)
        const columnHeight = [0, 0];
        const placements = [];
        let nextTie = 0;

        cards.forEach((card, i) => {
            const h = heights[i];
            let target;
            const diff = Math.abs(columnHeight[0] - columnHeight[1]);
            if (diff < 8) {
                target = nextTie % 2;
                nextTie++;
            } else {
                target = columnHeight[0] <= columnHeight[1] ? 0 : 1;
            }
            const x = target === 0 ? 0 : columnWidth + gap;
            const y = columnHeight[target];
            placements.push({ card, x, y });
            columnHeight[target] += h + gap;
        });

        // Phase 3 — WRITE: transforms + container height
        placements.forEach(({ card, x, y }) => {
            card.style.setProperty('--masonry-x', x + 'px');
            card.style.setProperty('--masonry-y', y + 'px');
            card.style.setProperty('transform', 'translate3d(' + x + 'px, ' + y + 'px, 0)', 'important');
            card.style.width = columnWidth + 'px';
        });

        Array.from(container.querySelectorAll('article.note-item')).forEach((card) => {
            if (cards.indexOf(card) === -1) clearCardPlacement(card);
        });

        const totalH = Math.max(columnHeight[0], columnHeight[1], 0);
        container.style.height = Math.max(0, totalH - gap) + 'px';

        container.classList.remove('masonry-measuring', 'masonry-laying-out');
        container.classList.add('masonry-ready');
        firstLayoutDone = true;

        bindCardObservers(container);
        ensureContainerObserver(container);
        layingOut = false;
    }

    function scheduleArticleMasonry() {
        if (masonryFrame) return;
        masonryFrame = requestAnimationFrame(() => {
            masonryFrame = null;
            layoutArticleMasonry();
        });
    }

    function initArticleMasonry() {
        const container = getContainer();
        if (!container) return;
        ensureContainerObserver(container);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => scheduleArticleMasonry()).catch(() => {});
        }
        scheduleArticleMasonry();
    }

    window.layoutArticleMasonry = layoutArticleMasonry;
    window.scheduleArticleMasonry = scheduleArticleMasonry;
    window.destroyArticleMasonry = destroyArticleMasonry;
    window.initArticleMasonry = initArticleMasonry;
})();

function initSortingAndFiltering() {
    const filterCategory = document.getElementById('filter-category');
    const sortBy = document.getElementById('sort-by');
    const container = document.getElementById('posts-container');
    const paginationControls = document.getElementById('pagination-controls');
    const pageInfo = document.getElementById('page-info');

    if (!filterCategory || !sortBy || !container) return; // Guard for other pages

    const allItems = Array.from(container.getElementsByClassName('note-item'));
    const initialOrder = allItems.slice();
    // 6–10 區間取 8：桌機一屏可掃完、手機仍不至於過長
    const ITEMS_PER_PAGE = 8;
    let currentPage = container.__v6Page || 1;
    let activeItems = [];

    function rebuildCategoryOptions() {
        const prev = filterCategory.value || 'all';
        const cats = new Set();
        allItems.forEach((item) => {
            const c = (item.dataset.category || '').trim();
            if (c) cats.add(c);
        });
        const ordered = Array.from(cats).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
        filterCategory.innerHTML = '';
        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = '所有分類';
        filterCategory.appendChild(allOpt);
        ordered.forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            filterCategory.appendChild(opt);
        });
        if (Array.from(filterCategory.options).some((o) => o.value === prev)) {
            filterCategory.value = prev;
        } else {
            filterCategory.value = 'all';
        }
    }

    rebuildCategoryOptions();

    function getFilteredSorted() {
        const category = filterCategory.value;
        const sortType = sortBy.value;

        let filtered = allItems.filter(item => {
            if (category === 'all') return true;
            const itemCat = item.dataset.category || '';
            if (category === '隨想') return itemCat === '隨想' || itemCat === '短思';
            if (category === '短思') return itemCat === '隨想' || itemCat === '短思';
            return itemCat === category;
        });

        if (sortType !== 'default' && sortType !== 'list') {
            filtered.sort((a, b) => {
                if (sortType === 'upload-desc') return new Date(b.dataset.upload) - new Date(a.dataset.upload);
                if (sortType === 'upload-asc') return new Date(a.dataset.upload) - new Date(b.dataset.upload);
                if (sortType === 'edit-desc') return new Date(b.dataset.edit) - new Date(a.dataset.edit);
                if (sortType === 'title-asc') return a.dataset.title.localeCompare(b.dataset.title, 'zh-TW');
                if (sortType === 'title-desc') return b.dataset.title.localeCompare(a.dataset.title, 'zh-TW');
                return 0;
            });
        } else {
            filtered = initialOrder.filter(item => filtered.includes(item));
        }

        // Pin 隨想 / fragment / quote cards after serious creative work.
        function isLowPriorityCard(el) {
            if (!el) return false;
            const pres = el.dataset.presentation || '';
            const cat = el.dataset.category || '';
            return (
                pres === 'fragment' ||
                pres === 'quote' ||
                cat === '隨想' ||
                cat === '短思' ||
                el.classList.contains('is-thought') ||
                el.classList.contains('is-fragment')
            );
        }
        filtered.sort((a, b) => {
            const aLow = isLowPriorityCard(a);
            const bLow = isLowPriorityCard(b);
            if (aLow === bLow) return 0;
            return aLow ? 1 : -1;
        });
        return filtered;
    }

    function renderPage() {
        const totalPages = Math.max(1, Math.ceil(activeItems.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) currentPage = totalPages;

        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;

        activeItems.forEach((item, i) => {
            item.style.display = (i >= start && i < end) ? '' : 'none';
            if (item.style.display !== 'none') {
                let idx = item.querySelector('.list-index');
                if (!idx) {
                    idx = document.createElement('span');
                    idx.className = 'list-index';
                    item.insertBefore(idx, item.firstChild);
                }
                idx.textContent = (i + 1) + ".";
            }
            container.appendChild(item); // Ensure it's re-appended in correct sorted order
        });

        // Toggle list mode css classes
        if (sortBy.value === 'list') {
            container.classList.add('list-view');
            if (typeof window.destroyArticleMasonry === 'function') {
                window.destroyArticleMasonry();
            }
        } else {
            container.classList.remove('list-view');
            if (typeof window.initArticleMasonry === 'function') {
                window.initArticleMasonry();
            } else if (typeof window.scheduleArticleMasonry === 'function') {
                window.scheduleArticleMasonry();
            }
        }
        container.__v6Page = currentPage;

        if (pageInfo) {
            pageInfo.textContent = activeItems.length > 0
                ? `第 ${currentPage} 頁，共 ${totalPages} 頁（${activeItems.length} 篇文章）`
                : '無符合條件的內容';
        }

        if (paginationControls) {
            paginationControls.innerHTML = '';
            paginationControls.classList.add('pagination-controls');
            if (totalPages > 1) {
                const compact = document.createElement('div');
                compact.className = 'pagination-compact';
                const btnPrev = makeBtn('← 上一頁', currentPage - 1, currentPage === 1, false);
                btnPrev.classList.add('pagination-nav');
                const status = document.createElement('span');
                status.className = 'pagination-status';
                status.textContent = currentPage + ' / ' + totalPages;
                const btnNext = makeBtn('下一頁 →', currentPage + 1, currentPage === totalPages, false);
                btnNext.classList.add('pagination-nav');
                compact.appendChild(btnPrev);
                compact.appendChild(status);
                compact.appendChild(btnNext);
                paginationControls.appendChild(compact);

                // Desktop still gets numbered buttons for quick jumps
                const desktop = document.createElement('div');
                desktop.className = 'pagination-desktop';
                const btnFirst = makeBtn('<<', 1, currentPage === 1, false);
                desktop.appendChild(btnFirst);
                desktop.appendChild(makeBtn('<', currentPage - 1, currentPage === 1, false));
                for (let p = 1; p <= totalPages; p++) {
                    if (totalPages > 7) {
                        if (p !== 1 && p !== totalPages && Math.abs(p - currentPage) > 1) {
                            if (p === 2 || p === totalPages - 1) {
                                const ellipsis = document.createElement('span');
                                ellipsis.textContent = '...';
                                ellipsis.className = 'pagination-ellipsis';
                                desktop.appendChild(ellipsis);
                            }
                            continue;
                        }
                    }
                    desktop.appendChild(makeBtn(p.toString(), p, false, p === currentPage));
                }
                desktop.appendChild(makeBtn('>', currentPage + 1, currentPage === totalPages, false));
                desktop.appendChild(makeBtn('>>', totalPages, currentPage === totalPages, false));
                paginationControls.appendChild(desktop);
            }
        }
    }

    function makeBtn(label, page, disabled, isActive) {
        const btn = document.createElement('button');
        btn.textContent = label;
        if (disabled) btn.disabled = true;
        if (isActive) btn.classList.add('active');
        btn.addEventListener('click', function () {
            currentPage = page;
            renderPage();
            const filterPanel = document.getElementById('sort-filter-controls');
            if (filterPanel) {
                const y = filterPanel.getBoundingClientRect().top + window.scrollY - 80;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        });
        return btn;
    }

    function updateView() {
        activeItems = getFilteredSorted();
        currentPage = 1;
        // Hide ALL first, then renderPage restores the visible ones
        allItems.forEach(item => item.style.display = 'none');
        renderPage();
    }

    filterCategory.addEventListener('change', updateView);
    sortBy.addEventListener('change', updateView);

    enhanceMobileFilterChrome();

    // ?cat=隨想 或 #thoughts → 預設只看隨想
    try {
        const params = new URLSearchParams(window.location.search);
        let cat = params.get('cat') || params.get('category');
        if (!cat && /thoughts?|隨想|短思/i.test(window.location.hash || '')) cat = '隨想';
        if (cat === '短思') cat = '隨想';
        if (cat) {
            const opt = Array.from(filterCategory.options).find(o => o.value === cat);
            if (opt) filterCategory.value = cat;
        }
    } catch (e) {}

    // Provide initial view
    updateView();
}

function enhanceMobileFilterChrome() {
    const panel = document.getElementById('sort-filter-controls');
    const filterCategory = document.getElementById('filter-category');
    const sortBy = document.getElementById('sort-by');
    if (!panel || !filterCategory || !sortBy || panel.dataset.v7Enhanced === '1') return;
    panel.dataset.v7Enhanced = '1';
    panel.classList.add('sort-filter-controls--v7');

    // Compact mobile bar
    let bar = panel.querySelector('.filter-compact-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'filter-compact-bar';
        bar.innerHTML =
            '<button type="button" class="filter-compact-btn" id="btn-open-filter" aria-haspopup="dialog" aria-expanded="false">篩選</button>' +
            '<label class="filter-compact-sort"><span class="sr-only">排序</span>' +
            '<select id="sort-by-mobile" aria-label="排序方式"></select></label>' +
            '<button type="button" class="filter-view-toggle" id="btn-view-toggle" aria-label="切換列表檢視" title="列表／卡片">▦</button>';
        panel.insertBefore(bar, panel.firstChild);
    }

    const sortMobile = document.getElementById('sort-by-mobile');
    const viewToggle = document.getElementById('btn-view-toggle');
    const openFilter = document.getElementById('btn-open-filter');

    // Mirror sort options without "list"
    if (sortMobile) {
        sortMobile.innerHTML = '';
        Array.from(sortBy.options).forEach(function (opt) {
            if (opt.value === 'list') return;
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.textContent
                .replace('上傳時間 (新到舊)', '最新')
                .replace('上傳時間 (舊到新)', '最舊')
                .replace('最後編輯 (新到舊)', '最後編輯')
                .replace('名稱 (A-Z)', '名稱 A-Z')
                .replace('名稱 (Z-A)', '名稱 Z-A');
            sortMobile.appendChild(o);
        });
        sortMobile.value = sortBy.value === 'list' ? 'upload-desc' : sortBy.value;
        sortMobile.addEventListener('change', function () {
            sortBy.value = sortMobile.value;
            sortBy.dispatchEvent(new Event('change'));
            syncViewToggle();
        });
    }

    function syncViewToggle() {
        const isList = sortBy.value === 'list';
        if (viewToggle) {
            viewToggle.textContent = isList ? '☰' : '▦';
            viewToggle.setAttribute('aria-pressed', isList ? 'true' : 'false');
            viewToggle.title = isList ? '切換卡片檢視' : '切換列表檢視';
        }
        if (sortMobile && !isList) sortMobile.value = sortBy.value;
    }

    if (viewToggle) {
        viewToggle.addEventListener('click', function () {
            if (sortBy.value === 'list') {
                sortBy.value = (sortMobile && sortMobile.value) || 'upload-desc';
            } else {
                sortBy.value = 'list';
            }
            sortBy.dispatchEvent(new Event('change'));
            syncViewToggle();
        });
    }
    sortBy.addEventListener('change', syncViewToggle);
    syncViewToggle();

    // Filter bottom sheet
    let sheet = document.getElementById('mobile-filter-sheet');
    if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = 'mobile-filter-sheet';
        sheet.className = 'mobile-filter-sheet';
        sheet.hidden = true;
        sheet.innerHTML =
            '<div class="mobile-filter-sheet__panel" role="dialog" aria-label="分類篩選">' +
            '<div class="mobile-filter-sheet__head"><strong>分類</strong>' +
            '<button type="button" class="mobile-filter-sheet__close" aria-label="關閉">×</button></div>' +
            '<div class="mobile-filter-sheet__list" id="mobile-filter-list"></div>' +
            '<button type="button" class="mobile-filter-sheet__apply" id="mobile-filter-apply">套用</button>' +
            '</div>' +
            '<button type="button" class="mobile-filter-sheet__backdrop" aria-label="關閉篩選"></button>';
        document.body.appendChild(sheet);
    }

    function rebuildFilterList() {
        const list = document.getElementById('mobile-filter-list');
        if (!list) return;
        list.innerHTML = '';
        Array.from(filterCategory.options).forEach(function (opt) {
            const id = 'mf-' + String(opt.value || 'all').replace(/\s+/g, '-');
            const row = document.createElement('label');
            row.className = 'mobile-filter-option';
            row.innerHTML =
                '<input type="radio" name="mobile-filter-cat" value="' +
                opt.value.replace(/"/g, '&quot;') +
                '" id="' +
                id +
                '"' +
                (filterCategory.value === opt.value ? ' checked' : '') +
                ' /> <span>' +
                (opt.textContent || opt.value) +
                '</span>';
            list.appendChild(row);
        });
    }

    function openSheet() {
        rebuildFilterList();
        sheet.hidden = false;
        document.body.classList.add('mobile-filter-open');
        if (openFilter) openFilter.setAttribute('aria-expanded', 'true');
    }
    function closeSheet() {
        sheet.hidden = true;
        document.body.classList.remove('mobile-filter-open');
        if (openFilter) openFilter.setAttribute('aria-expanded', 'false');
    }

    if (openFilter) openFilter.addEventListener('click', openSheet);
    sheet.querySelector('.mobile-filter-sheet__close').addEventListener('click', closeSheet);
    sheet.querySelector('.mobile-filter-sheet__backdrop').addEventListener('click', closeSheet);
    document.getElementById('mobile-filter-apply').addEventListener('click', function () {
        const picked = sheet.querySelector('input[name="mobile-filter-cat"]:checked');
        if (picked) {
            filterCategory.value = picked.value;
            filterCategory.dispatchEvent(new Event('change'));
            if (openFilter) {
                openFilter.textContent =
                    picked.value === 'all' ? '篩選' : '篩選 · ' + (picked.parentNode.textContent || '').trim();
            }
        }
        closeSheet();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !sheet.hidden) closeSheet();
    });
}

/* Prevent stacking listeners when cms-public re-inits after fetch */
const _origInitSortingAndFiltering = initSortingAndFiltering;
initSortingAndFiltering = function () {
    const filterCategory = document.getElementById('filter-category');
    const sortBy = document.getElementById('sort-by');
    if (filterCategory && filterCategory.dataset.v6Bound === '1') {
        // Soft re-init: clone selects to drop old listeners, then bind once
        const fc = filterCategory.cloneNode(true);
        const sb = sortBy.cloneNode(true);
        filterCategory.parentNode.replaceChild(fc, filterCategory);
        sortBy.parentNode.replaceChild(sb, sortBy);
        fc.dataset.v6Bound = '0';
        sb.dataset.v6Bound = '0';
    }
    _origInitSortingAndFiltering();
    const fc2 = document.getElementById('filter-category');
    const sb2 = document.getElementById('sort-by');
    if (fc2) fc2.dataset.v6Bound = '1';
    if (sb2) sb2.dataset.v6Bound = '1';
};

function initCarousel() {
    const carousels = document.querySelectorAll('.card-carousel');
    carousels.forEach(carousel => {
        const slides = carousel.querySelectorAll('.carousel-slide');
        if (slides.length <= 1) return;

        if (!carousel.querySelector('.carousel-prev')) {
            const prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.className = 'carousel-prev';
            prevBtn.setAttribute('aria-label', '上一張');
            prevBtn.innerHTML = '&#10094;';

            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'carousel-next';
            nextBtn.setAttribute('aria-label', '下一張');
            nextBtn.innerHTML = '&#10095;';

            carousel.appendChild(prevBtn);
            carousel.appendChild(nextBtn);
        }

        let dots = carousel.querySelectorAll('.carousel-dot');
        if (!dots.length) {
            const dotsWrap = document.createElement('div');
            dotsWrap.className = 'carousel-dots';
            slides.forEach((_, i) => {
                const d = document.createElement('button');
                d.type = 'button';
                d.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
                d.setAttribute('aria-label', '第 ' + (i + 1) + ' 張');
                dotsWrap.appendChild(d);
            });
            carousel.appendChild(dotsWrap);
            dots = carousel.querySelectorAll('.carousel-dot');
        }

        let slideIndex = 0;
        slides.forEach(s => s.classList.remove('active'));
        slides[slideIndex].classList.add('active');

        function showSlide(index) {
            if (index >= slides.length) slideIndex = 0;
            else if (index < 0) slideIndex = slides.length - 1;
            else slideIndex = index;
            slides.forEach(s => s.classList.remove('active'));
            slides[slideIndex].classList.add('active');
            dots.forEach((d, i) => d.classList.toggle('is-active', i === slideIndex));
        }

        const prevBtn = carousel.querySelector('.carousel-prev');
        const nextBtn = carousel.querySelector('.carousel-next');
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showSlide(slideIndex - 1);
        });
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showSlide(slideIndex + 1);
        });
        dots.forEach((d, i) => {
            d.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showSlide(i);
            });
        });
    });
}

/**
 * 無封面卡片：改為 editorial typography card（無灰色假圖區）。
 * CMS 動態卡片已自帶；此函式照顧靜態 HTML fallback。
 */
function enhanceNoCoverCards() {
    const container = document.getElementById('posts-container');
    if (!container) return;

    const clampText = (text, maxLen) => {
        const s = String(text || '').replace(/\s+/g, ' ').trim();
        if (s.length <= maxLen) return s;
        return s.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
    };

    const toDotDate = (raw) => {
        const s = String(raw || '').trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10).replace(/-/g, '.');
        return s.replace(/^上傳:\s*/i, '').replace(/-/g, '.');
    };

    Array.from(container.querySelectorAll('article.note-item')).forEach((article, index) => {
        article.querySelectorAll('.card-media-zone--placeholder, .card-media-zone--text, .card-text-cover').forEach((zone) => {
            const parent = zone.closest('.card-media-zone') || zone;
            parent.remove();
        });

        const hasRealMedia =
            article.querySelector('.card-carousel') ||
            article.querySelector('.card-media-zone img') ||
            article.querySelector('a.image.fit img');

        if (hasRealMedia) {
            article.classList.add('note-item--has-cover');
            article.classList.remove('note-item--no-cover', 'note-item--text-only');
            article.setAttribute('data-has-cover', '1');
            return;
        }

        article.classList.add('note-item--no-cover', 'note-item--text-only');
        article.classList.remove('note-item--has-cover');
        article.setAttribute('data-has-cover', '0');

        if (article.classList.contains('is-thought')) return;
        if (article.querySelector('.note-card__content')) return;

        const titleLink = article.querySelector('header h2 a, h2 a, .note-card__title a');
        const href = (titleLink && titleLink.getAttribute('href')) || '#';
        const titleText = (titleLink && titleLink.textContent) || article.getAttribute('data-title') || '';
        const oldSummary = article.querySelector('.card-body > p, .note-card__excerpt');
        const summaryText = clampText(
            (oldSummary && oldSummary.textContent) || titleText || '閱讀文章',
            160
        );

        const catEl = article.querySelector('.meta-cat');
        const cat = (catEl && catEl.textContent) || article.getAttribute('data-category') || '';
        const uploadRaw = article.getAttribute('data-upload') || '';
        const pub = toDotDate(uploadRaw);

        Array.from(article.querySelectorAll('header, .card-body, ul.actions, .note-card__footer')).forEach((n) => n.remove());

        const meta = document.createElement('header');
        meta.className = 'note-card__meta';
        if (cat) {
            const catSpan = document.createElement('span');
            catSpan.className = 'meta-cat';
            catSpan.textContent = cat;
            meta.appendChild(catSpan);
        }
        if (pub) {
            const time = document.createElement('time');
            time.className = 'meta-pub';
            if (/^\d{4}\.\d{2}\.\d{2}$/.test(pub)) {
                time.setAttribute('datetime', pub.replace(/\./g, '-'));
            }
            time.textContent = pub;
            meta.appendChild(time);
        }

        const content = document.createElement('div');
        content.className = 'note-card__content';
        const h2 = document.createElement('h2');
        h2.className = 'note-card__title';
        const a = document.createElement('a');
        a.href = href;
        a.textContent = titleText;
        h2.appendChild(a);
        const rule = document.createElement('div');
        rule.className = 'note-card__rule';
        rule.setAttribute('aria-hidden', 'true');
        const excerpt = document.createElement('p');
        excerpt.className = 'note-card__excerpt';
        excerpt.textContent = summaryText;
        content.appendChild(h2);
        content.appendChild(rule);
        content.appendChild(excerpt);

        const idx = document.createElement('span');
        idx.className = 'note-card__index';
        idx.setAttribute('aria-hidden', 'true');
        idx.textContent = index + 1 < 10 ? '0' + (index + 1) : String(index + 1);

        const footer = document.createElement('div');
        footer.className = 'note-card__footer';
        const cta = document.createElement('a');
        cta.href = href;
        cta.className = 'note-card__cta';
        cta.innerHTML =
            '<span>閱讀文章</span><span class="note-card__cta-line" aria-hidden="true"></span><span class="note-card__cta-arrow" aria-hidden="true">→</span>';
        footer.appendChild(cta);

        article.appendChild(meta);
        article.appendChild(content);
        article.appendChild(idx);
        article.appendChild(footer);
    });
}

window.initSortingAndFiltering = initSortingAndFiltering;
window.initCarousel = initCarousel;
window.enhanceNoCoverCards = enhanceNoCoverCards;

document.addEventListener('DOMContentLoaded', function () {
    // 若 Supabase CMS 已啟用，改由 cms-public.js 動態渲染後再自行初始化，這裡讓路
    if (window.__CMS_DYNAMIC__) return;
    checkFilesExistAndRender();
    enhanceNoCoverCards();
    initSortingAndFiltering();
    initCarousel();
    if (typeof window.initArticleMasonry === 'function') window.initArticleMasonry();
});
