# LYZ V5 visual/runtime repair

Prepared 2026-08-07.

Files:
- `assets/js/common.js`: fast loader, resilient background, glass mode, opt-in reading focus, lighter sakura/runtime.
- `assets/css/presentation-v3.css`: redesigned cards, visible micro-post identity, glass/background overrides, complete-image-first media styling.
- `assets/js/article-media.js`: image-ratio analysis, ambient image backdrop, contain-first covers, gallery/swipe/lightbox.

No article data, Supabase rows, titles, summaries, or migrations are modified by this package.

Known deployment issue discovered during audit:
- public `directory.html` is still serving stale static academic cards and does not match current `main`.
- GitHub connector write calls return HTTP 403 `Resource not accessible by integration`, so files could not be pushed from this session.
