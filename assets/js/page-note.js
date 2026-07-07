/**
 * page-note.js
 * 
 * Logic for note.html
 * - Parameter parsing
 * - PDF/MD rendering
 * - Error states
 * - Frontmatter stripping
 */

document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    // 若帶有 ?id=（Supabase 動態文章），交給 cms-public.js 處理
    if (urlParams.get('id')) return;
    const fileName = urlParams.get('file');
    const pdfName = urlParams.get('pdf');
    const litName = urlParams.get('lit');

    const titleEl = document.getElementById('note-title');
    const statusEl = document.getElementById('note-status');
    const contentEl = document.getElementById('markdown-container');

    if (!fileName && !pdfName && !litName) {
        titleEl.innerText = '系統錯誤';
        statusEl.innerText = '未提供檔案參數 (Missing URL Parameter)';
        contentEl.innerHTML = '<p>請從首頁目錄選擇要閱讀的筆記或簡報。</p>';
        return;
    }

    if (pdfName) {
        // PDF mode
        const decodedPdf = decodeURIComponent(pdfName);
        const displayTitle = decodedPdf.replace(/_/g, ' ');
        titleEl.innerText = displayTitle.toUpperCase();
        statusEl.innerText = `檔案路徑: /pdfs/${decodedPdf}.pdf`;

        contentEl.innerHTML = `
            <div style="width: 100%; height: 85vh; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                <iframe src="pdfs/${decodedPdf}.pdf" width="100%" height="100%" style="border: none;"></iframe>
            </div>
        `;
    } else if (fileName || litName) {
        // MD mode
        const rawTarget = fileName || litName;
        const decodedTarget = decodeURIComponent(rawTarget);
        const folderName = fileName ? 'notes' : 'literature';
        const displayTitle = decodedTarget.replace(/_/g, ' ');

        titleEl.innerText = displayTitle.toUpperCase();
        statusEl.innerText = `檔案路徑: /${folderName}/${decodedTarget}.md`;

        if (typeof marked !== 'undefined') {
            marked.setOptions({
                gfm: true,
                breaks: true
            });
        }

        fetch(`${folderName}/${decodedTarget}.md`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.text();
            })
            .then(markdownText => {
                let cleanMarkdown = markdownText.trim();

                // robust frontmatter parsing (only if at very start of file)
                if (cleanMarkdown.startsWith('---')) {
                    const nextDashIndex = cleanMarkdown.indexOf('---', 3);
                    if (nextDashIndex !== -1) {
                        cleanMarkdown = cleanMarkdown.slice(nextDashIndex + 3).trimStart();
                    }
                }

                if (typeof marked !== 'undefined') {
                    contentEl.innerHTML = `<div class="markdown-body" style="background: transparent; color: inherit; padding: 2em;">${marked.parse(cleanMarkdown)}</div>`;
                } else {
                    contentEl.innerHTML = `<pre style="white-space: pre-wrap;">${cleanMarkdown}</pre>`;
                }

                const firstH1 = contentEl.querySelector('h1');
                if (firstH1) {
                    titleEl.innerText = firstH1.textContent;
                    firstH1.remove(); // Remove duplicate title from body
                }

                if (window.renderMathInElement) {
                    window.renderMathInElement(contentEl, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '$', right: '$', display: false }
                        ],
                        throwOnError: false
                    });
                }
            })
            .catch(error => {
                console.error('Fetch error:', error);
                if (window.location.protocol === 'file:') {
                    titleEl.innerText = '本機檔案安全限制 (CORS)';
                    statusEl.innerText = 'Local File Restriction';
                    contentEl.innerHTML = `<p>您目前因為直接點擊開啟 HTML 檔案 (使用 <code>file://</code> 協議)，導致瀏覽器的安全機制 (CORS) 阻擋了讀取 <strong>/${folderName}/${decodedTarget}.md</strong> 的請求。</p><p>請使用伺服器啟動來檢視。</p>`;
                } else {
                    titleEl.innerText = '404 檔案未找到';
                    statusEl.innerText = 'File Not Found';
                    contentEl.innerHTML = `<p>無法載入筆記。請確認 <strong>/${folderName}/${decodedTarget}.md</strong> 檔案是否存在於您的專案目錄中，且檔名大小寫相符。</p>`;
                }
            });
    }
});
