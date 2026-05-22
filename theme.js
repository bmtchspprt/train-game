(function() {
  const DARK = {
    '--bg': '#0a0a0f', '--surface': '#12121a', '--surface2': '#1a1a26', '--surface3': '#20202e',
    '--text': '#f0f0f8', '--muted': '#8888aa', '--border': 'rgba(255,255,255,0.08)',
    '--maroon': '#8B1A1A', '--maroon-light': '#c0392b', '--maroon-glow': 'rgba(139,26,26,0.18)',
  };
  const LIGHT = {
    '--bg': '#f4f2ef', '--surface': '#ffffff', '--surface2': '#f0ede8', '--surface3': '#e8e4de',
    '--text': '#1a1410', '--muted': '#8a7a6a', '--border': 'rgba(0,0,0,0.1)',
    '--maroon': '#8B1A1A', '--maroon-light': '#c0392b', '--maroon-glow': 'rgba(139,26,26,0.12)',
  };

  function applyTheme(theme) {
    const vars = theme === 'light' ? LIGHT : DARK;
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
    if (theme === 'light') { document.body.classList.add('theme-light'); document.body.classList.remove('theme-dark'); }
    else { document.body.classList.add('theme-dark'); document.body.classList.remove('theme-light'); }
  }

  window.TechTheme = {
    init: function() { applyTheme(localStorage.getItem('tt_theme') || 'dark'); },
    toggle: function() {
      const next = (localStorage.getItem('tt_theme') || 'dark') === 'dark' ? 'light' : 'dark';
      localStorage.setItem('tt_theme', next);
      applyTheme(next);
    }
  };
  window.TechTheme.init();
})();
