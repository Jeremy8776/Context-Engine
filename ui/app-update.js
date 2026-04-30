const AppUpdate = (() => {
  const POLL_MS = 30000;
  let currentVersion = null;
  let toastShown = false;

  async function check() {
    const data = await DS.getAppVersion();
    if (!data?.version) return;
    if (!currentVersion) {
      currentVersion = data.version;
      return;
    }
    if (data.version === currentVersion || toastShown) return;
    toastShown = true;
    Toast.action('Update available', 'Update', () => window.location.reload());
  }

  function init() {
    check();
    setInterval(check, POLL_MS);
  }

  return { init, check };
})();

document.addEventListener('DOMContentLoaded', AppUpdate.init);
