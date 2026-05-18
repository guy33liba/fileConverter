(function () {
  const storageKey = 'fileConverterBackgroundTheme';
  const themeLabels = {
    converter: 'Converter background',
    summarizer: 'Summarize PDF background'
  };

  function getDefaultTheme() {
    return document.body.dataset.defaultBackground || 'converter';
  }

  function getStoredTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (error) {
      // The current page can still switch if browser storage is unavailable.
    }
  }

  function applyTheme(theme) {
    const nextTheme = themeLabels[theme] ? theme : getDefaultTheme();
    document.body.dataset.backgroundTheme = nextTheme;

    document.querySelectorAll('[data-background-toggle]').forEach((button) => {
      const isSummarizer = nextTheme === 'summarizer';
      button.setAttribute('aria-pressed', String(isSummarizer));
      button.textContent = isSummarizer ? 'Converter BG' : 'PDF BG';
      button.title = isSummarizer ? 'Switch to converter background' : 'Switch to Summarize PDF background';
      button.setAttribute('aria-label', button.title);
    });
  }

  function setupToggle() {
    applyTheme(getStoredTheme() || getDefaultTheme());

    document.querySelectorAll('[data-background-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const currentTheme = document.body.dataset.backgroundTheme || getDefaultTheme();
        const nextTheme = currentTheme === 'summarizer' ? 'converter' : 'summarizer';
        applyTheme(nextTheme);
        storeTheme(nextTheme);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupToggle);
  } else {
    setupToggle();
  }
})();
