const sellers = ["Barbara", "Anderson", "Ingrind", "Debora", "Vanessa", "Felipe"];
const manager = "Luana";
const architects = ["Gustavo", "Kalebe", "Nara"];
const equipment = [
  "Filtro",
  "Bomba",
  "Dispositivos",
  "Iluminacao",
  "Hidromassagem",
  "Aquecimento",
  "Cascata",
  "Borda atremica",
  "Casa de maquinas",
];
const stages = [
  "Projeto inicial (orcamento)",
  "Projeto de paginacao",
  "Projeto de dispositivos",
  "Projeto de laminacao",
  "Pronto de implantacao",
  "Projeto hidraulica",
  "Projeto eletrica",
];

const storageKey = "filaProjetosPiscinas";
const accessStorageKey = "conceptPiscinasAccess";
const config = window.APP_CONFIG || {};
const accessPasswords = config.accessPasswords || {
  adm: config.accessPassword || "",
};
const supabaseUrl = (config.supabaseUrl || "").replace(/\/$/, "");
const supabaseAnonKey = config.supabaseAnonKey || "";
const useRemoteDatabase = Boolean(supabaseUrl && supabaseAnonKey);
const requestForm = document.querySelector("#requestForm");
const sellerSelect = requestForm.elements.seller;
const equipmentOptions = document.querySelector("#equipmentOptions");
const teamList = document.querySelector("#teamList");
const queueList = document.querySelector("#queueList");
const timeline = document.querySelector("#timeline");
const template = document.querySelector("#projectTemplate");
const formFeedback = document.querySelector("#formFeedback");
const filters = document.querySelectorAll(".filter");
const exportData = document.querySelector("#exportData");
const importData = document.querySelector("#importData");
const syncStatus = document.querySelector("#syncStatus");
const submitButton = requestForm.querySelector('button[type="submit"]');
const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const loginFeedback = document.querySelector("#loginFeedback");
const roleBadge = document.querySelector("#roleBadge");
let activeFilter = "all";
let isSubmittingRequest = false;
let currentRole = "";

function hasAccess() {
  currentRole = sessionStorage.getItem(accessStorageKey) || "";
  return !Object.values(accessPasswords).filter(Boolean).length || Boolean(currentRole);
}

function showApp() {
  loginScreen.classList.add("is-hidden");
  document.body.classList.add("has-access");
  applyRoleView();
}

function showLogin() {
  loginScreen.classList.remove("is-hidden");
  document.body.classList.remove("has-access");
}

function getRoleLabel(role) {
  return {
    comercial: "Comercial",
    arquiteto: "Arquitetura",
    adm: "ADM",
  }[role] || "Acesso";
}

function canUse(...roles) {
  return roles.includes(currentRole);
}

function applyRoleView() {
  roleBadge.textContent = getRoleLabel(currentRole);
  document.querySelectorAll("[data-role-view]").forEach((element) => {
    const allowedRoles = element.dataset.roleView.split(" ");
    element.hidden = !allowedRoles.includes(currentRole);
  });
}

function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

function saveLocalProjects(projects) {
  localStorage.setItem(storageKey, JSON.stringify(projects));
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Falha ao acessar banco online");
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loadRemoteProjects() {
  const rows = await supabaseRequest("projects?select=id,data,created_at&order=created_at.asc", {
    headers: { Prefer: "" },
  });
  return rows.map((row) => row.data);
}

async function saveProject(project) {
  if (!useRemoteDatabase) {
    saveLocalProjects(projects);
    return;
  }

  await supabaseRequest("projects?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: project.id,
      data: project,
      created_at: project.createdAt,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function deleteProject(id) {
  if (!useRemoteDatabase) {
    saveLocalProjects(projects);
    return;
  }

  await supabaseRequest(`projects?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

let projects = [];

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatus(project) {
  if (project.completedAt) return "done";
  if (project.architect) return "working";
  return "waiting";
}

function getStatusLabel(status) {
  return {
    waiting: "Na fila",
    working: "Em producao",
    done: "Entregue",
  }[status];
}

function buildTeam() {
  sellerSelect.innerHTML = sellers
    .map((seller) => `<option value="${seller}">${seller}</option>`)
    .join("");

  teamList.innerHTML = `
    <article>
      <strong>Comercial</strong>
      <span>${sellers.join(", ")}</span>
    </article>
    <article>
      <strong>Gerente de loja</strong>
      <span>${manager}</span>
    </article>
    <article>
      <strong>Arquitetura</strong>
      <span>${architects.join(", ")}</span>
    </article>
  `;

  equipmentOptions.innerHTML = equipment
    .map(
      (item) => `
        <label>
          <input type="checkbox" name="equipment" value="${item}" />
          <span>${item}</span>
        </label>
      `,
    )
    .join("");
}

function createHistory(action, person = "Sistema") {
  return {
    action,
    person,
    date: new Date().toISOString(),
  };
}

function updateMetrics() {
  const totals = projects.reduce(
    (acc, project) => {
      acc[getStatus(project)] += 1;
      return acc;
    },
    { waiting: 0, working: 0, done: 0 },
  );

  document.querySelector("#metricWaiting").textContent = totals.waiting;
  document.querySelector("#metricWorking").textContent = totals.working;
  document.querySelector("#metricDone").textContent = totals.done;
}

function updateSyncStatus(isOnline) {
  syncStatus.innerHTML = isOnline
    ? `
        <strong>Online</strong>
        <p>Dados sincronizados no Supabase para computador e celular.</p>
      `
    : `
        <strong>Modo local</strong>
        <p>Configure o Supabase para sincronizar entre celular e computadores.</p>
      `;
  syncStatus.dataset.mode = isOnline ? "online" : "local";
}

function renderStageTrack(project) {
  return stages
    .map((stage, index) => {
      const isActive = index === project.stageIndex;
      const isDone = index < project.stageIndex || project.completedAt;
      return `<span class="${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}">${index + 1}</span>`;
    })
    .join("");
}

function renderActions(project) {
  const status = getStatus(project);

  if (currentRole === "comercial") {
    return `<span class="readonly-note">Acompanhamento liberado. Alteracoes sao da arquitetura ou ADM.</span>`;
  }

  if (status === "done") {
    return canUse("arquiteto", "adm")
      ? `<button class="ghost-button" type="button" data-reopen="${project.id}">Reabrir</button>`
      : "";
  }

  const architectSelect = `
    <select data-architect="${project.id}" aria-label="Arquiteto responsavel">
      <option value="">Arquiteto</option>
      ${architects
        .map(
          (architect) =>
            `<option value="${escapeHtml(architect)}" ${project.architect === architect ? "selected" : ""}>${escapeHtml(architect)}</option>`,
        )
        .join("")}
    </select>
  `;

  const estimateInput = `
    <input
      data-estimate="${project.id}"
      type="text"
      value="${escapeHtml(project.estimate)}"
      placeholder="Prazo ex.: 2h / hoje 17h"
      aria-label="Estimativa de tempo"
    />
  `;

  return `
    ${architectSelect}
    ${estimateInput}
    <button class="secondary-button" type="button" data-take="${project.id}">
      ${project.architect ? "Atualizar responsavel" : "Pegar projeto"}
    </button>
    <button class="secondary-button" type="button" data-prev="${project.id}">Voltar etapa</button>
    <button class="primary-button" type="button" data-next="${project.id}">Avancar etapa</button>
    ${currentRole === "adm" ? `<button class="danger-button" type="button" data-delete="${project.id}">Excluir</button>` : ""}
  `;
}

function renderQueue() {
  const visible = projects
    .filter((project) => activeFilter === "all" || getStatus(project) === activeFilter)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (!visible.length) {
    queueList.innerHTML = `<p class="empty-state">Nenhuma solicitacao neste filtro.</p>`;
    return;
  }

  queueList.innerHTML = "";

  visible.forEach((project, index) => {
    const status = getStatus(project);
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".project-card");
    card.dataset.status = status;
    node.querySelector(".queue-number").textContent = `#${index + 1} na fila`;
    node.querySelector("h3").textContent = project.client;
    node.querySelector(".project-card__head p").textContent =
      `${project.measures} - vendedor: ${project.seller}`;
    node.querySelector(".status-pill").textContent = getStatusLabel(status);
    node.querySelector(".status-pill").dataset.status = status;
    node.querySelector(".project-meta").innerHTML = `
      <div><dt>Solicitado</dt><dd>${formatDateTime(project.createdAt)}</dd></div>
      <div><dt>Arquiteto</dt><dd>${escapeHtml(project.architect || "Aguardando")}</dd></div>
      <div><dt>Assumido</dt><dd>${formatDateTime(project.takenAt)}</dd></div>
      <div><dt>Estimativa</dt><dd>${escapeHtml(project.estimate || "-")}</dd></div>
      <div><dt>Etapa atual</dt><dd>${escapeHtml(stages[project.stageIndex])}</dd></div>
      <div><dt>3D</dt><dd>${project.needs3d ? "Solicitado" : "Nao solicitado"}</dd></div>
    `;
    node.querySelector(".stage-track").innerHTML = renderStageTrack(project);
    node.querySelector(".project-notes").innerHTML = `
      <strong>Equipamentos</strong>
      <p>${project.equipment.length ? project.equipment.map(escapeHtml).join(", ") : "Nao informado"}</p>
      ${project.notes ? `<strong>Observacoes</strong><p>${escapeHtml(project.notes)}</p>` : ""}
      ${
        project.sketchName
          ? `<strong>Anexo</strong><p><a href="${project.sketchData}" download="${escapeHtml(project.sketchName)}">${escapeHtml(project.sketchName)}</a></p>`
          : ""
      }
    `;
    node.querySelector(".project-actions").innerHTML = renderActions(project);
    queueList.appendChild(node);
  });
}

function renderTimeline() {
  const items = projects
    .flatMap((project) =>
      project.history.map((item) => ({
        ...item,
        client: project.client,
      })),
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  timeline.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <article>
              <span>${formatDateTime(item.date)}</span>
              <strong>${escapeHtml(item.client)}</strong>
              <p>${escapeHtml(item.action)} - ${escapeHtml(item.person)}</p>
            </article>
          `,
        )
        .join("")
    : `<p class="empty-state">O historico aparece assim que houver solicitacoes.</p>`;
}

function renderAll() {
  updateMetrics();
  renderQueue();
  renderTimeline();
}

async function refreshRemoteProjects() {
  if (!useRemoteDatabase) return;

  try {
    projects = await loadRemoteProjects();
    saveLocalProjects(projects);
    updateSyncStatus(true);
    renderAll();
  } catch (error) {
    console.error(error);
    updateSyncStatus(false);
  }
}

async function fileToInfo(file) {
  if (!file) return { sketchName: "", sketchData: "" };

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        sketchName: file.name,
        sketchData: reader.result,
      });
    reader.readAsDataURL(file);
  });
}

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canUse("comercial", "adm")) return;
  if (isSubmittingRequest) return;

  isSubmittingRequest = true;
  submitButton.disabled = true;
  submitButton.textContent = "Salvando...";
  formFeedback.textContent = "Salvando solicitacao...";

  const data = new FormData(requestForm);
  const fileInfo = await fileToInfo(requestForm.elements.sketch.files[0]);
  const now = new Date().toISOString();
  const project = {
    id: createId(),
    seller: data.get("seller"),
    client: data.get("client").trim(),
    phone: data.get("phone").trim(),
    measures: data.get("measures").trim(),
    shape: data.get("shape").trim(),
    deadline: data.get("deadline"),
    equipment: data.getAll("equipment"),
    notes: data.get("notes").trim(),
    needs3d: data.get("needs3d") === "on",
    stageIndex: 0,
    architect: "",
    takenAt: "",
    estimate: "",
    completedAt: "",
    createdAt: now,
    history: [createHistory("Solicitacao inicial criada", data.get("seller"))],
    ...fileInfo,
  };

  projects.push(project);

  try {
    await saveProject(project);
    requestForm.reset();
    sellerSelect.value = sellers[0];
    formFeedback.textContent = `Solicitacao de ${project.client} adicionada na fila.`;
    renderAll();
  } catch (error) {
    console.error(error);
    projects = projects.filter((item) => item.id !== project.id);
    formFeedback.textContent =
      "Nao foi possivel salvar. Confira a conexao e tente novamente.";
  } finally {
    isSubmittingRequest = false;
    submitButton.disabled = false;
    submitButton.textContent = "Adicionar na fila";
  }
});

queueList.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("button");
  if (!actionButton) return;
  if (!canUse("arquiteto", "adm")) return;

  const id =
    actionButton.dataset.take ||
    actionButton.dataset.next ||
    actionButton.dataset.prev ||
    actionButton.dataset.delete ||
    actionButton.dataset.reopen;
  const project = projects.find((item) => item.id === id);
  if (!project) return;

  if (actionButton.dataset.take) {
    const architect = document.querySelector(`[data-architect="${id}"]`).value;
    const estimate = document.querySelector(`[data-estimate="${id}"]`).value.trim();
    if (!architect) return;
    project.architect = architect;
    project.estimate = estimate;
    project.takenAt = project.takenAt || new Date().toISOString();
    project.history.push(createHistory("Projeto assumido/atualizado", architect));
  }

  if (actionButton.dataset.next) {
    const person = project.architect || "Arquitetura";
    if (project.stageIndex < stages.length - 1) {
      project.stageIndex += 1;
      project.history.push(createHistory(`Avancou para ${stages[project.stageIndex]}`, person));
    } else {
      project.completedAt = new Date().toISOString();
      project.history.push(createHistory("Projeto entregue", person));
    }
  }

  if (actionButton.dataset.prev && project.stageIndex > 0) {
    project.stageIndex -= 1;
    project.completedAt = "";
    project.history.push(createHistory(`Voltou para ${stages[project.stageIndex]}`, project.architect || "Arquitetura"));
  }

  if (actionButton.dataset.reopen) {
    project.completedAt = "";
    project.history.push(createHistory("Projeto reaberto", project.architect || manager));
  }

  if (actionButton.dataset.delete) {
    if (!canUse("adm")) return;
    const canDelete = confirm(`Excluir a solicitacao de ${project.client}?`);
    if (!canDelete) return;
    projects = projects.filter((item) => item.id !== id);
    await deleteProject(id);
    renderAll();
    return;
  }

  await saveProject(project);
  renderAll();
});

filters.forEach((button) => {
  button.addEventListener("click", () => {
    filters.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    activeFilter = button.dataset.filter;
    renderQueue();
  });
});

exportData.addEventListener("click", () => {
  if (!canUse("adm")) return;
  const blob = new Blob([JSON.stringify(projects, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `fila-projetos-piscinas-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

importData.addEventListener("change", () => {
  if (!canUse("adm")) return;
  const file = importData.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("Arquivo invalido");
      projects = imported;
      saveLocalProjects(projects);
      if (useRemoteDatabase) {
        Promise.all(projects.map(saveProject)).catch(console.error);
      }
      renderAll();
    } catch {
      alert("Nao foi possivel importar esse arquivo.");
    }
  };
  reader.readAsText(file);
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const typedPassword = new FormData(loginForm).get("accessPassword");
  const matchedRole = Object.entries(accessPasswords).find(
    ([, password]) => password && password === typedPassword,
  )?.[0];

  if (matchedRole) {
    currentRole = matchedRole;
    sessionStorage.setItem(accessStorageKey, matchedRole);
    loginForm.reset();
    loginFeedback.textContent = "";
    showApp();
    return;
  }

  loginFeedback.textContent = "Senha incorreta.";
});

async function init() {
  if (hasAccess()) {
    showApp();
  } else {
    showLogin();
  }

  buildTeam();

  if (useRemoteDatabase) {
    try {
      projects = await loadRemoteProjects();
      saveLocalProjects(projects);
      updateSyncStatus(true);
    } catch (error) {
      console.error(error);
      projects = loadProjects();
      updateSyncStatus(false);
      formFeedback.textContent =
        "Nao foi possivel conectar ao banco online. Usando modo local neste navegador.";
    }
  } else {
    projects = loadProjects();
    updateSyncStatus(false);
  }

  renderAll();

  if (useRemoteDatabase) {
    setInterval(refreshRemoteProjects, 30000);
  }
}

init();
