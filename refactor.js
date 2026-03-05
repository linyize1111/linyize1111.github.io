const fs = require('fs');

const files = ['index.html', 'about.html', 'directory.html', 'literature.html', 'note.html'];

for (let file of files) {
    if (!fs.existsSync(file)) continue;

    let content = fs.readFileSync(file, 'utf8');

    // 1. Add Loading Screen
    if (!content.includes('id="loading-screen"')) {
        content = content.replace(/(<body\s+class="is-preload">)/, '$1\n\n    <!-- 真正的 Loading Screen -->\n    <div id="loading-screen"></div>');
    }

    // 2. Remove Media Script
    content = content.replace(/<script>\s*document\.addEventListener\('DOMContentLoaded', function \(\) \{\s*var video = document\.getElementById\('bg-video'\);[\s\S]*?\}\);\s*<\/script>/, '');

    // 3. Remove Sakura Script
    content = content.replace(/<!--\s*純 Canvas 2D 櫻花特效.*?-->\s*<script>\s*\(function \(\) \{\s*var canvas = document\.getElementById\('sakura-canvas'\);[\s\S]*?\(\)\);\s*<\/script>/, '');

    // 4. Remove spa.js and the 5000ms delay script
    content = content.replace(/<script src="assets\/js\/spa\.js"><\/script>\s*<script>\s*window\.addEventListener\('load', function\(\) \{[\s\S]*?<\/script>/, '<script src="assets/js/common.js"></script>');

    // Optional: Just in case spa.js is absent but the delay is there:
    // (We replaced the combined chunk, which works based on view_file output)

    // 5. Specifics
    if (file === 'directory.html' || file === 'literature.html') {
        content = content.replace(/<!-- 🔍 動態檢查檔案是否存在 -->\s*<script>[\s\S]*?<\/script>/, '');
        content = content.replace(/<!-- 📂 文章排序與篩選邏輯 -->\s*<script>[\s\S]*?<\/script>/, '');

        // Sometimes the original didn't have spa.js script combined. Let's make sure common.js is there.
        if (content.includes('<script src="assets/js/common.js"></script>')) {
            content = content.replace('<script src="assets/js/common.js"></script>', '<script src="assets/js/common.js"></script>\n    <script src="assets/js/page-list.js"></script>');
        } else {
            // Fallback inject before </body>
            content = content.replace('</body>', '    <script src="assets/js/common.js"></script>\n    <script src="assets/js/page-list.js"></script>\n</body>');
        }
    }

    if (file === 'note.html') {
        content = content.replace(/<script>\s*document\.addEventListener\("DOMContentLoaded", \(\) => \{\s*const urlParams[\s\S]*?<\/script>/, '');
        if (content.includes('<script src="assets/js/common.js"></script>')) {
            content = content.replace('<script src="assets/js/common.js"></script>', '<script src="assets/js/common.js"></script>\n    <script src="assets/js/page-note.js"></script>');
        } else {
            // Fallback inject before </body>
            content = content.replace('</body>', '    <script src="assets/js/common.js"></script>\n    <script src="assets/js/page-note.js"></script>\n</body>');
        }
    }

    // Also remove the "let slideIndex = 0..." inline script from literature.html if we want to extract it
    // Wait, let's keep the slide logic or merge it into page-list.js?
    // The slide logic in literature.html was:
    // <script>document.addEventListener('DOMContentLoaded', () => { const carousels = document.querySelectorAll('.card-carousel'); ...
    // Let's also remove this and drop it into page-list.js

    fs.writeFileSync(file, content, 'utf8');
}
