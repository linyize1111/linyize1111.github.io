const fs = require('fs');

const htmlFiles = ['index.html', 'about.html', 'directory.html', 'literature.html', 'note.html'];

const fontLinks = `    <!-- Google Fonts: loaded as <link> to avoid render-blocking @import -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,700;1,300;1,700&family=Source+Sans+Pro:wght@900&display=swap">
    <!-- Site Custom CSS: dark mode + image styles -->
    <link rel="stylesheet" href="assets/css/site-custom.css" />`;

const noTransitionScript = `    <!-- Prevent flash on initial dark mode load -->
    <script>
        (function() {
            var saved = localStorage.getItem('colorTheme');
            var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        })();
    </script>`;

for (let file of htmlFiles) {
    if (!fs.existsSync(file)) {
        console.warn('Skipping missing file:', file);
        continue;
    }

    let content = fs.readFileSync(file, 'utf8');

    // 1. Add font links + site-custom.css before </head> if not already present
    if (!content.includes('site-custom.css')) {
        content = content.replace('</head>', fontLinks + '\n</head>');
    }

    // 2. Add the no-transition dark theme detection script right after <body class="is-preload">
    if (!content.includes('data-theme')) {
        content = content.replace(/(<body\s[^>]*>)/, '$1\n' + noTransitionScript);
    }

    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated:', file);
}
