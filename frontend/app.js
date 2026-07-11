(() => {
  "use strict";

  const VERSION = "1.1.3a-r1-pwa-responsiva";
  const app = document.getElementById("app");
  const keys = {
    apiUrl: "fab-control-api-url",
    token: "fab-control-session-token",
    draft: "fab-control-action-draft"
  };

  const state = {
    apiUrl: localStorage.getItem(keys.apiUrl) || "",
    token: sessionStorage.getItem(keys.token) || "",
    online: navigator.onLine,
    loading: false,
    screen: "setup",
    action: null,
    items: [],
    currentIndex: 0,
    draft: loadJson(keys.draft, {}),
    syncState: "idle",
    message: ""
  };

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("online", () => setConnectivity(true));
  window.addEventListener("offline", () => setConnectivity(false));

  function init() {
    registerServiceWorker();
    if (state.apiUrl && state.token) state.screen = "home";
    render();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  function setConnectivity(value) {
    state.online = value;
    render();
  }

  function loadJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function persistDraft() {
    localStorage.setItem(keys.draft, JSON.stringify(state.draft));
  }

  async function api(action, payload = {}) {
    if (!state.apiUrl) throw new Error("URL da API não configurada.");
    if (!state.online) throw new Error("Sem conexão com a rede.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(state.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, payload: { ...payload, token: state.token } }),
        signal: controller.signal,
        redirect: "follow"
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data?.error?.message || "Falha na operação.");
      return data.data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("A API demorou além do limite de segurança.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function shell(content) {
    const netClass = state.online ? "online" : "offline";
    return `
      <header class="topbar ${netClass}">
        <div class="topbar-row">
          <div><div class="brand">FAB Control</div><div class="version">${VERSION}</div></div>
          <div class="network-status"><span class="status-dot"></span>${state.online ? "Online" : "Offline"}</div>
        </div>
      </header>
      ${content}
    `;
  }

  function render() {
    if (state.screen === "setup") return renderSetup();
    if (state.screen === "home") return renderHome();
    if (state.screen === "action") return renderAction();
    renderSetup();
  }

  function renderSetup() {
    app.innerHTML = shell(`
      <main class="screen setup-screen">
        <section class="hero">
          <h1>Configuração de homologação</h1>
          <p class="muted">A URL e o token ficam somente neste dispositivo. Nenhuma credencial é gravada no repositório.</p>
        </section>
        <form id="setup-form" class="card config-grid">
          <label class="field">URL do Web App Apps Script
            <input name="apiUrl" type="url" required value="${escapeAttr(state.apiUrl)}" placeholder="https://script.google.com/macros/s/.../exec">
          </label>
          <label class="field">Token de OPERADOR
            <input name="token" type="password" required autocomplete="off" value="${escapeAttr(state.token)}">
          </label>
          <button class="primary" type="submit">Entrar no modo operador</button>
        </form>
      </main>
    `);
    document.getElementById("setup-form").addEventListener("submit", onSetup);
  }

  function onSetup(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.apiUrl = String(form.get("apiUrl") || "").trim();
    state.token = String(form.get("token") || "").trim();
    localStorage.setItem(keys.apiUrl, state.apiUrl);
    sessionStorage.setItem(keys.token, state.token);
    state.screen = "home";
    render();
  }

  function renderHome() {
    app.innerHTML = shell(`
      <main class="screen home-screen">
        <section class="hero">
          <h1>Execução direta</h1>
          <p class="muted">Carregue a fila real do operador. A prioridade mais alta será exibida primeiro.</p>
        </section>
        <section class="metrics" aria-label="Resumo operacional">
          <div class="metric"><strong>${state.action ? 1 : 0}</strong><span class="muted">Em foco</span></div>
          <div class="metric"><strong>${Object.keys(state.draft).length}</strong><span class="muted">Rascunhos</span></div>
          <div class="metric"><strong>${state.online ? "OK" : "—"}</strong><span class="muted">Rede</span></div>
        </section>
        <section class="card action-card">
          <div>
            <h2>Próxima ação</h2>
            <p class="muted">Um toque carrega a atividade de maior prioridade.</p>
          </div>
          ${state.message ? `<div class="inline-message"><strong>${escapeHtml(state.message)}</strong></div>` : ""}
          <div class="action-buttons">
            <button id="load-actions" class="primary" ${state.loading ? "disabled" : ""}>${state.loading ? "Carregando..." : "Carregar minhas ações"}</button>
            <button id="open-setup" class="secondary">Configuração</button>
          </div>
        </section>
      </main>
    `);
    document.getElementById("load-actions").addEventListener("click", loadActions);
    document.getElementById("open-setup").addEventListener("click", () => { state.screen = "setup"; render(); });
  }

  async function loadActions() {
    state.loading = true;
    state.message = "";
    render();
    try {
      const data = await api("operador.minhas_acoes", {});
      const cards = data.cards || data.acoes || [];
      if (!cards.length) {
        state.message = data?.ui_collection?.empty_message || "Nenhuma ação pendente.";
        return;
      }
      state.action = cards[0];
      await openAction(state.action.acao_id || state.action.id);
    } catch (error) {
      state.message = error.message;
    } finally {
      state.loading = false;
      render();
    }
  }

  async function openAction(acaoId) {
    const data = await api("operador.tela_acao", { acao_id: acaoId });
    state.action = data;
    state.items = extractItems(data);
    state.currentIndex = firstPendingIndex(state.items);
    state.screen = "action";
  }

  function extractItems(data) {
    return data?.operator_screen?.items || data?.checklist?.itens || data?.itens || [];
  }

  function firstPendingIndex(items) {
    const index = items.findIndex((item) => !(state.draft[itemKey(item)] ?? currentValue(item)));
    return index < 0 ? 0 : index;
  }

  function itemKey(item) {
    return String(item.ui_key || item.checklist_execucao_id || item.id || item.ordem);
  }

  function currentValue(item) {
    return item.resposta ?? item.valor_numero ?? "";
  }

  function renderAction() {
    const raw = state.action || {};
    const action = raw.acao || raw;
    const item = state.items[state.currentIndex];
    const total = state.items.length;
    const responded = state.items.filter((entry) => hasValue(state.draft[itemKey(entry)] ?? currentValue(entry))).length;
    const percent = total ? Math.round((responded / total) * 100) : 0;

    if (!item) {
      app.innerHTML = shell(`<main class="screen"><section class="empty"><h2>Checklist indisponível</h2><button id="back" class="secondary">Voltar</button></section></main>`);
      document.getElementById("back").addEventListener("click", goHome);
      return;
    }

    app.innerHTML = shell(`
      <main class="screen action-screen">
        <section class="hero action-summary">
          <div class="action-meta"><span class="badge danger">${escapeHtml(labelPriority(action.prioridade || raw.priority?.label))}</span><span class="badge">${escapeHtml(action.status || raw.status?.label || "EM EXECUÇÃO")}</span></div>
          <h1>${escapeHtml(action.titulo || action.title || "Checklist operacional")}</h1>
          <p class="muted">${escapeHtml(assetLabel(raw))}</p>
          <div class="progress" aria-label="${percent}% concluído"><span style="width:${percent}%"></span></div>
          <p class="muted progress-label">${responded}/${total} registrados</p>
        </section>
        ${renderItem(item)}
        <section class="card sync ${state.syncState}">${syncLabel()}</section>
        <footer class="footer-actions">
          <div class="footer-actions-inner">
            <button id="previous" class="secondary" ${state.currentIndex === 0 ? "disabled" : ""}>Anterior</button>
            <button id="next" class="primary">${state.currentIndex === total - 1 ? "Revisar" : "Próximo"}</button>
          </div>
        </footer>
      </main>
    `);

    bindItem(item);
    document.getElementById("previous").addEventListener("click", () => move(-1));
    document.getElementById("next").addEventListener("click", () => move(1));
  }

  function renderItem(item) {
    const type = String(item.tipo_resposta || item.input?.type || "TEXTO").toUpperCase();
    const value = state.draft[itemKey(item)] ?? currentValue(item);
    const title = item.titulo || item.title || `Item ${item.ordem || ""}`;
    const instruction = item.instrucao || item.instruction || "";
    let input = "";

    if (["OK_NOK", "CONFIRMACAO"].includes(type)) {
      input = `<div class="choice-grid">${["OK", "NOK", "NA"].map((option) => choice(option, value)).join("")}</div>`;
    } else if (type === "SELECAO") {
      const options = item.options || item.opcoes || parseOptions(item.opcoes_json);
      input = `<div class="choice-grid">${options.map((option) => choice(option, value)).join("")}</div>`;
    } else if (["NUMERO", "PARAMETRO", "LEITURA_OPERACIONAL"].includes(type)) {
      const min = item.limite_min ?? item.limits?.min ?? "";
      const max = item.limite_max ?? item.limits?.max ?? "";
      const unit = item.unidade || item.unit || "";
      input = `<label class="field">Valor medido<input id="item-value" type="number" inputmode="decimal" step="any" value="${escapeAttr(value)}" ${min !== "" ? `min="${min}"` : ""} ${max !== "" ? `max="${max}"` : ""}></label><div class="range"><span>Faixa: ${escapeHtml(String(min || "—"))} a ${escapeHtml(String(max || "—"))}</span><strong>${escapeHtml(unit)}</strong></div>`;
    } else if (type === "EVIDENCIA") {
      input = `<label class="field file-field">Foto obrigatória<input id="item-file" type="file" accept="image/*" capture="environment"></label><p class="muted">A captura fica local neste protótipo. O envio real entra na integração 1.1.3c.</p>`;
    } else {
      input = `<label class="field">Registro<textarea id="item-value" rows="4">${escapeHtml(String(value || ""))}</textarea></label>`;
    }

    return `<section class="item-card"><p class="item-counter">Item ${state.currentIndex + 1} de ${state.items.length}</p><h2>${escapeHtml(title)}</h2><p class="instruction">${escapeHtml(instruction)}</p>${input}</section>`;
  }

  function choice(option, value) {
    const selected = String(option) === String(value);
    return `<button type="button" class="choice ${selected ? "selected" : ""}" data-value="${escapeAttr(option)}">${escapeHtml(option)}</button>`;
  }

  function bindItem(item) {
    document.querySelectorAll("[data-value]").forEach((button) => {
      button.addEventListener("click", () => saveLocal(item, button.dataset.value));
    });
    const input = document.getElementById("item-value");
    if (input) input.addEventListener("input", () => saveLocal(item, input.value));
    const file = document.getElementById("item-file");
    if (file) file.addEventListener("change", () => saveLocal(item, file.files?.[0]?.name || ""));
  }

  function saveLocal(item, value) {
    state.draft[itemKey(item)] = value;
    state.syncState = "ok";
    persistDraft();
    render();
  }

  function move(direction) {
    const next = Math.max(0, Math.min(state.items.length - 1, state.currentIndex + direction));
    state.currentIndex = next;
    render();
  }

  function goHome() {
    state.screen = "home";
    render();
  }

  function syncLabel() {
    if (!state.online) return "↻ Rascunho salvo neste dispositivo. Aguardando conexão.";
    if (state.syncState === "ok") return "✓ Rascunho salvo localmente.";
    if (state.syncState === "error") return "! Falha de sincronização.";
    return "Pronto para registrar.";
  }

  function parseOptions(value) {
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function assetLabel(raw) {
    const asset = raw.ativo || raw.asset || {};
    const component = raw.componente || raw.component || {};
    return [asset.tag, asset.nome || asset.name, component.tag, component.nome || component.name].filter(Boolean).join(" — ");
  }

  function labelPriority(value) {
    const normalized = String(value || "Normal").toUpperCase();
    return normalized === "CRITICA" ? "Crítica" : normalized;
  }

  function hasValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== "";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();