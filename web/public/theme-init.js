(function () {
  try {
    var saved = localStorage.getItem('lsm-theme');
    var dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) {
      document.documentElement.classList.add('dark');
      document.querySelector('meta[name=theme-color]').setAttribute('content', '#0b0e13');
    }
  } catch (e) {
    // Storage can be unavailable in private browsing; the light default stays.
  }
})();
