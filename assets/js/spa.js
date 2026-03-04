(function () {
    if (window._spaInit) return;
    window._spaInit = true;

    document.addEventListener("click", async (e) => {
        const a = e.target.closest("a");
        if (!a || !a.href) return;

        const url = new URL(a.href);
        if (url.origin !== window.location.origin) return; // external

        const isPdf = url.pathname.endsWith(".pdf");
        const isMd = url.pathname.endsWith(".md");
        if (isPdf || (isMd && !url.pathname.includes('note.html'))) return;

        if (url.pathname === window.location.pathname && url.search === window.location.search) {
            e.preventDefault();
            return; // same page
        }

        e.preventDefault();

        const wrapper = document.getElementById("wrapper");
        if (wrapper) wrapper.style.opacity = '0.5';

        try {
            const response = await fetch(url.href);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            document.title = doc.title;

            const newWrapper = doc.getElementById("wrapper");
            if (newWrapper && wrapper) {
                wrapper.innerHTML = newWrapper.innerHTML;
                wrapper.className = newWrapper.className;
            } else {
                window.location.href = url.href; return;
            }

            // Sync window location
            window.history.pushState({}, "", url.href);
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Re-run inline logic by finding inline scripts that ARE NOT background or sakura
            Array.from(doc.body.querySelectorAll("script:not([src])")).forEach(oldScript => {
                if (oldScript.innerHTML.includes('bg-video')) return;
                if (oldScript.innerHTML.includes('sakura-canvas')) return;

                let code = oldScript.innerHTML;
                // Patch DOMContentLoaded so it runs immediately
                code = code.replace(/document\.addEventListener\(['"\`]DOMContentLoaded['"\`]\s*,\s*(function|\(\)\s*=>)\s*\(?\)?\s*\{/g, '(function(){');
                code = code.replace(/\}\);\s*$/g, '})();');

                const newScript = document.createElement("script");
                newScript.textContent = code;
                document.body.appendChild(newScript);
                setTimeout(() => document.body.removeChild(newScript), 10);
            });

            if (wrapper) wrapper.style.opacity = '1';

        } catch (err) {
            console.error(err);
            window.location.href = url.href;
        }
    });

    window.addEventListener("popstate", () => {
        window.location.reload(); // simple fallback for back button
    });
})();
