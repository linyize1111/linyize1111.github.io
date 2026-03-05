const fs = require('fs');

const htmlFiles = ['index.html', 'about.html', 'directory.html', 'literature.html', 'note.html'];

// New 3-mode FOUC prevention script
const newFoucScript = `    <!-- Theme FOUC prevention: apply saved theme before first paint -->
    <script>
        (function() {
            var saved = localStorage.getItem('colorTheme');
            // Default is 'light' — only apply if saved is 'dark' or 'glass'
            if (saved === 'dark' || saved === 'glass') {
                document.documentElement.setAttribute('data-theme', saved);
            }
        })();
    </script>`;

// Old pattern variants to replace
const oldFoucPatterns = [
    // original 2-mode script (dark only)
    /\s*<!-- Prevent flash on initial dark mode load -->[\s\S]*?<\/script>/,
    /\s*<!-- Theme FOUC prevention[\s\S]*?<\/script>/,
    // inline after <body>
    /\n\s*<script>\s*\(function\(\)\s*\{\s*var saved = localStorage\.getItem\('colorTheme'\)[\s\S]*?\}\)\(\);\s*<\/script>/
];

for (const file of htmlFiles) {
    if (!fs.existsSync(file)) { console.warn('Missing:', file); continue; }
    let content = fs.readFileSync(file, 'utf8');

    // 1. Remove all old FOUC scripts
    for (const pat of oldFoucPatterns) {
        content = content.replace(pat, '');
    }

    // 2. Insert new FOUC script after <body ...>
    // Only if not already present
    if (!content.includes('Theme FOUC prevention: apply saved')) {
        content = content.replace(/(<body\b[^>]*>)/, '$1\n' + newFoucScript);
    }

    // 3. Any reference to btn-darkmode → btn-theme (in case any remained)
    content = content.replace(/btn-darkmode/g, 'btn-theme');

    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated:', file);
}
console.log('Done.');
