(function () {
  const original = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const response = await original(...args);
    if (response.status === 401) window.location.assign('/login');
    return response;
  };
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;background:white;border:1px solid #ddd;border-radius:8px;padding:6px;font:12px system-ui';
  const link = document.createElement('button');
  link.textContent = 'Sign out';
  link.onclick = async function () {
    link.disabled = true;
    try {
      const response = await original('/api/auth/logout', {method:'POST'});
      if (!response.ok) throw new Error();
      window.location.assign('/login');
    } catch (_) { link.disabled = false; link.textContent = 'Sign out failed — retry'; }
  };
  bar.appendChild(link); document.body.appendChild(bar);
})();
