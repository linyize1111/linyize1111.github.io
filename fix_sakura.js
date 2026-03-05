const fs = require('fs');

// The old inline sakura script in directory/literature was breaking because
// there was no <canvas id="sakura-canvas"> element in those pages.
// common.js's initSakuraIfPresent() is already guarded and correct,
// so we just need to:
// 1. Add the canvas element
// 2. Remove the old duplicate inline sakura script block

const files = ['directory.html', 'literature.html'];

for (const file of files) {
    if (!fs.existsSync(file)) { console.warn('Missing:', file); continue; }

    let content = fs.readFileSync(file, 'utf8');

    // 1. Add sakura canvas right before <!-- 全域導航器 --> or after <audio> block
    // Check if it's already there
    if (!content.includes('id="sakura-canvas"')) {
        // Insert after the <audio> close tag and blank lines
        content = content.replace(
            /(<\/audio>\s*\n)/,
            '$1\n    <!--  櫻花特效透明層（固定在最上層，不影響互動） -->\n    <canvas id="sakura-canvas"\n        style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;"></canvas>\n\n'
        );
        console.log(`Added sakura canvas to ${file}`);
    } else {
        console.log(`sakura-canvas already exists in ${file}`);
    }

    // 2. Remove the old inline sakura script (the IIFE that calls canvas.getContext directly)
    // It starts with <!-- 純 Canvas 2D 櫻花特效 --> and is followed by a <script> with IIFE
    content = content.replace(
        /\s*<!--\s*純\s*Canvas\s*2D\s*[^-]*?-->\s*<script>\s*\(function\s*\(\)\s*\{[\s\S]*?\}\)\(\);\s*<\/script>/,
        '\n    <!-- 櫻花特效由 common.js 的 initSakuraIfPresent() 統一初始化 -->'
    );

    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
}

console.log('Done.');
