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
    const BP = 960;
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
        const raw = getComputedStyle(container).getPropertyValue('--masonry-gap').trim();
        const n = parseFloat(raw);
        return Number.isFinite(n) ? n : 16;
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
        container.classList.remove('masonry-active', 'masonry-ready', 'masonry-measuring');
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
            container.classList.remove('masonry-measuring');
            container.classList.add('masonry-ready');
            container.style.height = '0px';
            layingOut = false;
            return;
        }

        const wasReady = container.classList.contains('masonry-ready');
        const cardSig = cards.map((c) => c.id || c.getAttribute('data-title') || '').join('|');
        if (cardSig !== container.__masonryCardSig) {
            firstLayoutDone = false;
            container.__masonryCardSig = cardSig;
        }
        if (!firstLayoutDone) {
            container.classList.add('masonry-measuring');
            container.classList.remove('masonry-ready');
        }

        container.classList.add('masonry-active');

        const containerWidth = container.clientWidth;
        const columnWidth = (containerWidth - gap) / COLS;
        container.style.setProperty('--masonry-column-width', columnWidth + 'px');

        // Phase 1 — prepare natural height measurement at column width
        cards.forEach((card) => {
            card.style.width = columnWidth + 'px';
            card.style.transform = 'translate3d(0,0,0)';
        });

        // Force layout once
        void container.offsetHeight;

        // Phase 1b — read heights
        const heights = cards.map((card) => {
            const h = card.offsetHeight;
            lastHeights.set(card, h);
            return h;
        });

        // Phase 2 — shortest-column packing (source order preserved)
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

        // Phase 3 — write transforms (inline; higher than non-!important CSS)
        placements.forEach(({ card, x, y }) => {
            card.style.setProperty('--masonry-x', x + 'px');
            card.style.setProperty('--masonry-y', y + 'px');
            card.style.setProperty('transform', 'translate3d(' + x + 'px, ' + y + 'px, 0)', 'important');
            card.style.width = columnWidth + 'px';
        });

        // Hide off-page cards stay display:none; clear their transform leftovers
        Array.from(container.querySelectorAll('article.note-item')).forEach((card) => {
            if (cards.indexOf(card) === -1) clearCardPlacement(card);
        });

        const totalH = Math.max(columnHeight[0], columnHeight[1], 0);
        // Remove trailing gap from the taller column
        container.style.height = Math.max(0, totalH - gap) + 'px';

        container.classList.remove('masonry-measuring');
        container.classList.add('masonry-ready');
        firstLayoutDone = true;
        if (!wasReady) {
            // first paint: no fly-in — already applied without relying on transition class timing
        }

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
            if (totalPages > 1) {
                const btnFirst = makeBtn('<<', 1, currentPage === 1, false);
                paginationControls.appendChild(btnFirst);

                const btnPrev = makeBtn('<', currentPage - 1, currentPage === 1, false);
                paginationControls.appendChild(btnPrev);

                for (let p = 1; p <= totalPages; p++) {
                    if (totalPages > 7) {
                        if (p !== 1 && p !== totalPages && Math.abs(p - currentPage) > 1) {
                            if (p === 2 || p === totalPages - 1) {
                                const ellipsis = document.createElement('span');
                                ellipsis.textContent = '...';
                                ellipsis.style.color = '#fff';
                                ellipsis.style.margin = '0 5px';
                                paginationControls.appendChild(ellipsis);
                            }
                            continue;
                        }
                    }
                    const pBtn = makeBtn(p.toString(), p, false, p === currentPage);
                    paginationControls.appendChild(pBtn);
                }

                const btnNext = makeBtn('>', currentPage + 1, currentPage === totalPages, false);
                paginationControls.appendChild(btnNext);

                const btnLast = makeBtn('>>', totalPages, currentPage === totalPages, false);
                paginationControls.appendChild(btnLast);
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
