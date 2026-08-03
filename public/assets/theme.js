(function () {
    const storageKey = '360sprng-theme';
    const html = document.documentElement;
    const stored = localStorage.getItem(storageKey);
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const defaultTheme = stored || (prefersLight ? 'light' : 'dark');

    function applyTheme(theme) {
        if (theme === 'light') {
            html.classList.add('theme-light');
        } else {
            html.classList.remove('theme-light');
        }
        localStorage.setItem(storageKey, theme);
    }

    function createToggle() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-toggle';
        btn.setAttribute('aria-label', 'Toggle light and dark theme');
        btn.addEventListener('click', () => {
            const nextTheme = html.classList.contains('theme-light') ? 'dark' : 'light';
            applyTheme(nextTheme);
        });
        return btn;
    }

    function insertToggle(button) {
        const nav = document.querySelector('nav');
        if (!nav) {
            document.body.prepend(button);
            return;
        }

        const menuBtn = nav.querySelector('.menu-btn');
        if (menuBtn) {
            nav.insertBefore(button, menuBtn);
            return;
        }

        nav.appendChild(button);
    }

    applyTheme(defaultTheme);
    const toggle = createToggle();
    insertToggle(toggle);
})();
