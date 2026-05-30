"use strict";

(function initSettingsTabMobile(root) {
  let runtime = null;
  let helpers = null;

  function t(key) {
    return helpers.t(key);
  }

  function escapeHtml(str) {
    return helpers.escapeHtml(str);
  }

  function fetchMobileInfo() {
    if (!window.settingsAPI || typeof window.settingsAPI.getMobileConnectionInfo !== "function") {
      return Promise.resolve(null);
    }
    return window.settingsAPI.getMobileConnectionInfo().catch(() => null);
  }

  function renderMobileTab(container, core) {
    runtime = core.runtime;
    helpers = core.helpers;

    const section = document.createElement("div");
    section.className = "settings-tab-section";
    section.innerHTML =
      `<h3>${escapeHtml(t("mobileTitle") || "Mobile / PWA")}</h3>` +
      `<p class="settings-tab-desc">${escapeHtml(t("mobileDesc") || "Connect your phone to monitor sessions and approve permissions remotely.")}</p>` +
      `<div id="mobile-connection-info" class="mobile-info-loading">${escapeHtml(t("mobileLoading") || "Loading...")}</div>`;

    container.appendChild(section);

    fetchMobileInfo().then((info) => {
      const el = document.getElementById("mobile-connection-info");
      if (!el) return;
      if (!info || info.status !== "ok") {
        el.innerHTML = `<p class="mobile-info-error">${escapeHtml(t("mobileError") || "Unable to load connection info.")}</p>`;
        return;
      }

      let html = '';

      // QR Code
      if (info.qrDataUrl) {
        html += '<div class="mobile-qr-wrap">';
        html += `<img class="mobile-qr-img" src="${info.qrDataUrl}" alt="QR Code" width="200" height="200">`;
        html += '</div>';
      }

      // Connection details
      html += '<div class="mobile-conn-details">';
      html += `<div class="mobile-conn-row"><span class="mobile-conn-label">LAN IP</span><span class="mobile-conn-value">${escapeHtml(info.lanIp)}</span>`;
      html += `<button class="mobile-copy-btn" data-copy="${escapeHtml(info.lanIp)}">Copy</button></div>`;
      html += `<div class="mobile-conn-row"><span class="mobile-conn-label">Port</span><span class="mobile-conn-value">${info.port}</span>`;
      html += `<button class="mobile-copy-btn" data-copy="${String(info.port)}">Copy</button></div>`;
      html += `<div class="mobile-conn-row"><span class="mobile-conn-label">Token</span><span class="mobile-conn-value mobile-token">${escapeHtml(info.token)}</span>`;
      html += `<button class="mobile-copy-btn" data-copy="${escapeHtml(info.token)}">Copy</button></div>`;

      // Pair URL
      if (info.pairUrl) {
        html += `<div class="mobile-conn-row"><span class="mobile-conn-label">URL</span><span class="mobile-conn-value mobile-pair-url">${escapeHtml(info.pairUrl)}</span>`;
        html += `<button class="mobile-copy-btn" data-copy="${escapeHtml(info.pairUrl)}">Copy</button></div>`;
      }

      // Open PWA link
      html += `<div class="mobile-conn-actions">`;
      html += `<a class="mobile-open-link" href="http://${escapeHtml(info.lanIp)}:${info.port}/mobile/" target="_blank">Open PWA</a>`;
      html += '</div>';

      html += '</div>';

      el.innerHTML = html;

      // Copy button handlers
      el.querySelectorAll(".mobile-copy-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const text = btn.getAttribute("data-copy");
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
              btn.textContent = "Copied!";
              setTimeout(() => { btn.textContent = "Copy"; }, 1500);
            });
          }
        });
      });
    });
  }

  function init(core) {
    runtime = core.runtime;
    helpers = core.helpers;
    core.tabs["mobile"] = { render: renderMobileTab };
  }

  root.ClawdSettingsTabMobile = { init };
})(globalThis);
