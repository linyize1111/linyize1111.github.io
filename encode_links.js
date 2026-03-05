const fs = require('fs');

const files = ['index.html', 'about.html', 'directory.html', 'literature.html', 'note.html'];

for (let file of files) {
    if (!fs.existsSync(file)) continue;

    let content = fs.readFileSync(file, 'utf8');

    // Matches href="note.html?something=something"
    content = content.replace(/href="note\.html\?([a-z]+)=([^"]+)"/g, (match, paramKey, paramValue) => {
        // Decode first to prevent double encoding if some are already encoded
        let decoded = decodeURIComponent(paramValue);
        let encoded = encodeURIComponent(decoded);
        return `href="note.html?${paramKey}=${encoded}"`;
    });

    fs.writeFileSync(file, content, 'utf8');
}
