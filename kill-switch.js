// ══════════════════════════════════════════════════════════════════════════
// KILL SWITCH — one line controls the entire site
//
// SITE OFFLINE (coming soon mode):  const SITE_LIVE = false;
// SITE ONLINE  (normal mode):       const SITE_LIVE = true;
// ══════════════════════════════════════════════════════════════════════════

const SITE_LIVE = false;

(function() {
  if (!SITE_LIVE) {
    // Allow coming-soon.html to load normally
    if (window.location.pathname.includes('coming-soon')) return;
    window.location.replace('./coming-soon.html');
  }
})();
