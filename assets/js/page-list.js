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
    let currentPage = 1;
    let activeItems = [];

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
            // Restore initial order for these specific filtered elements
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
        } else {
            container.classList.remove('list-view');
        }

        if (pageInfo) {
            pageInfo.textContent = activeItems.length > 0
                ? `第 ${currentPage} 頁，共 ${totalPages} 頁（${activeItems.length} 篇文章）`
                : '無符合條件的內容';
        }

        if (paginationControls) {
            paginationControls.innerHTML = '';
            if (totalPages <= 1) return;

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

function initCarousel() {
    const carousels = document.querySelectorAll('.card-carousel');
    carousels.forEach(carousel => {
        const slides = carousel.querySelectorAll('.carousel-slide');
        if (slides.length <= 1) return;

        const prevBtn = document.createElement('a');
        prevBtn.href = '#';
        prevBtn.className = 'carousel-prev';
        prevBtn.innerHTML = '&#10094;';

        const nextBtn = document.createElement('a');
        nextBtn.href = '#';
        nextBtn.className = 'carousel-next';
        nextBtn.innerHTML = '&#10095;';

        carousel.appendChild(prevBtn);
        carousel.appendChild(nextBtn);

        let slideIndex = 0;
        slides[slideIndex].classList.add('active');

        function showSlide(index) {
            slides.forEach(s => s.classList.remove('active'));
            if (index >= slides.length) slideIndex = 0;
            if (index < 0) slideIndex = slides.length - 1;
            slides[slideIndex].classList.add('active');
        }

        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            slideIndex--;
            showSlide(slideIndex);
        });

        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            slideIndex++;
            showSlide(slideIndex);
        });
    });
}

/**
 * 無封面卡片：補上「簡介主視覺」文字區（舊版「沒圖用標題」結構，文字改為 summary）。
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

    Array.from(container.querySelectorAll('article.note-item')).forEach((article) => {
        // 清除舊版字首／漸層佔位
        article.querySelectorAll('.card-media-zone--placeholder').forEach((zone) => zone.remove());

        const hasRealMedia =
            article.querySelector('.card-carousel') ||
            article.querySelector('.card-media-zone img') ||
            article.querySelector('a.image.fit img');

        if (hasRealMedia) {
            article.classList.add('note-item--has-cover');
            article.classList.remove('note-item--no-cover');
            article.setAttribute('data-has-cover', '1');
            return;
        }

        article.classList.add('note-item--no-cover');
        article.classList.remove('note-item--has-cover');
        article.setAttribute('data-has-cover', '0');

        const body = article.querySelector('.card-body');
        const header = article.querySelector('header');
        if (!body) {
            const wrap = document.createElement('div');
            wrap.className = 'card-body';
            Array.from(article.children).forEach((child) => {
                if (child === header || child.classList.contains('list-index')) return;
                if (child.classList && child.classList.contains('card-media-zone')) return;
                wrap.appendChild(child);
            });
            article.appendChild(wrap);
        }

        if (article.classList.contains('is-thought')) return;
        if (article.querySelector('.card-text-cover')) return;

        const titleLink = article.querySelector('header h2 a');
        const href = (titleLink && titleLink.getAttribute('href')) || '#';
        const summaryEl = article.querySelector('.card-body > p');
        const summaryText =
            (summaryEl && summaryEl.textContent) ||
            article.getAttribute('data-title') ||
            (titleLink && titleLink.textContent) ||
            '閱讀文章';

        const zone = document.createElement('div');
        zone.className = 'card-media-zone card-media-zone--text';
        const link = document.createElement('a');
        link.href = href;
        link.className = 'card-text-cover';
        const span = document.createElement('span');
        span.className = 'card-text-cover__text';
        span.textContent = clampText(summaryText, 140);
        link.appendChild(span);
        zone.appendChild(link);

        const cardBody = article.querySelector('.card-body');
        if (cardBody) article.insertBefore(zone, cardBody);
        else if (header && header.nextSibling) article.insertBefore(zone, header.nextSibling);
        else article.appendChild(zone);

        // 簡介已進主視覺區，避免 card-body 再重複一段
        if (summaryEl) summaryEl.remove();
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
});
