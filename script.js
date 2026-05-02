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
  "Casa de máquinas",
];
const stages = [
  "Projeto inicial (orçamento)",
  "Projeto de paginação",
  "Projeto de dispositivos",
  "Projeto de laminação",
  "Pronto de implantação",
  "Projeto hidráulica",
  "Projeto elétrica",
];

const storageKey = "filaProjetosPiscinas";
const sessionStorageKey = "conceptPiscinasSession";
const config = window.APP_CONFIG || {};
const supabaseUrl = (config.supabaseUrl || "").replace(/\/$/, "");
const supabaseAnonKey = config.supabaseAnonKey || "";
const useRemoteDatabase = Boolean(supabaseUrl && supabaseAnonKey);

const requestForm = document.querySelector("#requestForm");
const sellerSelect = requestForm.elements.seller;
const equipmentOptions = document.querySelector("#equipmentOptions");
const teamList = document.querySelector("#teamList");
const queueList = document.querySelector("#queueList");
const projectDebug = document.querySelector("#projectDebug");
const timeline = document.querySelector("#timeline");
const template = document.querySelector("#projectTemplate");
const formFeedback = document.querySelector("#formFeedback");
const filters = document.querySelectorAll(".filter");
const filterButtons = document.querySelectorAll("[data-filter]");
const refreshProjects = document.querySelector("#refreshProjects");
const exportData = document.querySelector("#exportData");
const importData = document.querySelector("#importData");
const submitButton = requestForm.querySelector('button[type="submit"]');
const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const accessRequestForm = document.querySelector("#accessRequestForm");
const showRequestAccess = document.querySelector("#showRequestAccess");
const showLogin = document.querySelector("#showLogin");
const loginFeedback = document.querySelector("#loginFeedback");
const requestFeedback = document.querySelector("#requestFeedback");
const roleBadge = document.querySelector("#roleBadge");
const approvalList = document.querySelector("#approvalList");
const logoutButton = document.querySelector("#logoutButton");

let activeFilter = "all";
let isSubmittingRequest = false;
let isLoadingProjects = false;
let lastProjectLoadError = "";
let projects = [];
let currentSession = loadSession();
let currentUser = currentSession?.user || null;
let currentProfile = null;
let currentRole = "";

function updateProjectDebug(message = "") {
  if (!projectDebug) return;
  projectDebug.textContent = canUse("adm") ? message : "";
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionStorageKey));
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (session?.expires_in && !session.expires_at) {
    session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  }
  currentSession = session;
  currentUser = session?.user || null;
  if (session) {
    localStorage.setItem(sessionStorageKey, JSON.stringify(session));
  } else {
    localStorage.removeItem(sessionStorageKey);
  }
}

function authHeaders(extra = {}) {
  return {
    apikey: supabaseAnonKey,
    "Content-Type": "application/json",
    ...extra,
  };
}

function dataHeaders(extra = {}) {
  const token = currentSession?.access_token || supabaseAnonKey;
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
    ...extra,
  };
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || "Falha de autenticacao");
  return data;
}

async function refreshSessionIfNeeded(force = false) {
  if (!currentSession?.refresh_token) return;
  const now = Math.floor(Date.now() / 1000);
  const shouldRefresh = force || !currentSession.expires_at || currentSession.expires_at - now < 60;
  if (!shouldRefresh) return;

  const nextSession = await authRequest("token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({
      refresh_token: currentSession.refresh_token,
    }),
  });
  saveSession(nextSession);
}

async function supabaseRequest(path, options = {}) {
  await refreshSessionIfNeeded();

  let response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: dataHeaders(options.headers || {}),
  });

  if (response.status === 401 && currentSession?.refresh_token) {
    await refreshSessionIfNeeded(true);
    response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: dataHeaders(options.headers || {}),
    });
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Falha ao acessar banco online");
  }

  if (response.status === 204) return null;
  return response.json();
}

function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

function saveLocalProjects(nextProjects) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(nextProjects));
  } catch (error) {
    console.warn("Nao foi possivel salvar cache local dos projetos.", error);
  }
}

function clearLocalProjectCache() {
  try {
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn("Nao foi possivel limpar cache local dos projetos.", error);
  }
}

async function loadRemoteProjects() {
  const rows = await supabaseRequest("rpc/app_list_projects", {
    method: "POST",
    headers: { Prefer: "" },
    body: "{}",
  });
  if (!Array.isArray(rows)) {
    throw new Error("Resposta inesperada ao carregar projetos.");
  }
  return rows.map((row) => row.data);
}

async function saveProject(project) {
  if (!useRemoteDatabase) {
    saveLocalProjects(projects);
    return;
  }

  await supabaseRequest("rpc/app_save_project", {
    method: "POST",
    body: JSON.stringify({
      project_id: project.id,
      project_data: project,
    }),
  });
}

async function deleteProject(id) {
  if (!useRemoteDatabase) {
    saveLocalProjects(projects);
    return;
  }

  await supabaseRequest("rpc/app_delete_project", {
    method: "POST",
    body: JSON.stringify({
      project_id: id,
    }),
  });
}

async function loadCurrentProfile() {
  if (!currentUser) return null;
  const rows = await supabaseRequest(
    `profiles?select=id,name,email,role,status&id=eq.${encodeURIComponent(currentUser.id)}`,
    { headers: { Prefer: "" } },
  );
  return rows[0] || null;
}

async function loadPendingProfiles() {
  if (!canUse("adm")) return [];
  return supabaseRequest("profiles?select=id,name,email,role,status,created_at&status=eq.pending&order=created_at.asc", {
    headers: { Prefer: "" },
  });
}

async function loadApprovedProfiles() {
  if (!canUse("adm")) return [];
  return supabaseRequest("profiles?select=id,name,email,role,status,created_at,approved_at&status=eq.approved&order=approved_at.desc", {
    headers: { Prefer: "" },
  });
}

async function updateProfileStatus(id, status) {
  await supabaseRequest("rpc/admin_set_profile_status", {
    method: "POST",
    body: JSON.stringify({
      target_id: id,
      next_status: status,
    }),
  });
}

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

function showApp() {
  loginScreen.classList.add("is-hidden");
  document.body.classList.add("has-access");
  applyRoleView();
}

function showLoginScreen() {
  loginScreen.classList.remove("is-hidden");
  loginForm.classList.remove("is-hidden");
  accessRequestForm.classList.add("is-hidden");
  document.body.classList.remove("has-access");
}

function applyRoleView() {
  roleBadge.textContent = getRoleLabel(currentRole);
  document.querySelectorAll("[data-role-view]").forEach((element) => {
    const allowedRoles = element.dataset.roleView.split(" ");
    element.hidden = !allowedRoles.includes(currentRole);
  });
}

function getStatus(project) {
  if (project.completedAt) return "done";
  if (project.architect) return "working";
  return "waiting";
}

function getStatusLabel(status) {
  return {
    waiting: "Na fila",
    working: "Em produção",
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

function setActiveFilter(filter) {
  activeFilter = filter;
  filterButtons.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.filter === filter);
  });
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
    return `<span class="readonly-note">Acompanhamento liberado. Alterações são da arquitetura ou ADM.</span>`;
  }

  if (status === "done") {
    return canUse("arquiteto", "adm")
      ? `<button class="ghost-button" type="button" data-reopen="${project.id}">Reabrir</button>`
      : "";
  }

  const architectSelect = `
    <select data-architect="${project.id}" aria-label="Arquiteto responsável">
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
      ${project.architect ? "Atualizar responsável" : "Pegar projeto"}
    </button>
    <button class="secondary-button" type="button" data-prev="${project.id}">Voltar etapa</button>
    <button class="primary-button" type="button" data-next="${project.id}">Avançar etapa</button>
    ${currentRole === "adm" ? `<button class="danger-button" type="button" data-delete="${project.id}">Excluir</button>` : ""}
  `;
}

function renderQueue() {
  if (isLoadingProjects) {
    queueList.innerHTML = `<p class="empty-state">Carregando projetos...</p>`;
    return;
  }

  if (lastProjectLoadError) {
    queueList.innerHTML = `<p class="empty-state">${escapeHtml(lastProjectLoadError)}</p>`;
    return;
  }

  const visible = projects
    .filter((project) => activeFilter === "all" || getStatus(project) === activeFilter)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (!visible.length) {
    queueList.innerHTML = projects.length
      ? `<p class="empty-state">Há projetos cadastrados, mas nenhum neste filtro. Clique em “Todos” para ver a lista completa.</p>`
      : `<p class="empty-state">Nenhuma solicitação cadastrada ainda.</p>`;
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
      <div><dt>3D</dt><dd>${project.needs3d ? "Solicitado" : "Não solicitado"}</dd></div>
    `;
    node.querySelector(".stage-track").innerHTML = renderStageTrack(project);
    node.querySelector(".project-notes").innerHTML = `
      <strong>Equipamentos</strong>
      <p>${project.equipment.length ? project.equipment.map(escapeHtml).join(", ") : "Não informado"}</p>
      ${project.notes ? `<strong>Observações</strong><p>${escapeHtml(project.notes)}</p>` : ""}
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
  if (isLoadingProjects) {
    timeline.innerHTML = `<p class="empty-state">Carregando histórico...</p>`;
    return;
  }

  if (lastProjectLoadError) {
    timeline.innerHTML = `<p class="empty-state">O histórico será exibido assim que a fila carregar.</p>`;
    return;
  }

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
    : `<p class="empty-state">O histórico aparece assim que houver solicitações.</p>`;
}

async function renderApprovals() {
  if (!canUse("adm")) return;
  const pending = await loadPendingProfiles().catch(() => []);
  const approved = await loadApprovedProfiles().catch(() => []);
  const pendingHtml = pending.length
    ? pending
        .map(
          (profile) => `
            <article class="approval-card">
              <div>
                <strong>${escapeHtml(profile.name)}</strong>
                <span>${escapeHtml(profile.email)} - ${getRoleLabel(profile.role)}</span>
              </div>
              <div>
                <button class="primary-button" type="button" data-approve-user="${profile.id}">Liberar</button>
                <button class="danger-button" type="button" data-reject-user="${profile.id}">Rejeitar</button>
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="empty-state">Nenhuma solicitação pendente.</p>`;

  const approvedHtml = approved.length
    ? approved
        .map(
          (profile) => `
            <article class="approval-card approval-card--approved">
              <div>
                <strong>${escapeHtml(profile.name)}</strong>
                <span>${escapeHtml(profile.email)} - ${getRoleLabel(profile.role)}</span>
              </div>
              <span class="status-pill" data-status="done">Liberado</span>
            </article>
          `,
        )
        .join("")
    : `<p class="empty-state">Nenhum usuário liberado ainda.</p>`;

  approvalList.innerHTML = `
    <div class="approval-group">
      <h3>Pendentes</h3>
      ${pendingHtml}
    </div>
    <div class="approval-group">
      <h3>Liberados</h3>
      ${approvedHtml}
    </div>
  `;
}

function renderAll() {
  updateMetrics();
  renderQueue();
  renderTimeline();
  renderApprovals();
}

async function refreshRemoteProjects() {
  if (!useRemoteDatabase || !currentSession || !currentProfile) return;

  isLoadingProjects = true;
  lastProjectLoadError = "";
  updateProjectDebug("Carregando projetos do Supabase...");
  renderQueue();
  renderTimeline();

  try {
    projects = await loadRemoteProjects();
    clearLocalProjectCache();
    lastProjectLoadError = "";
    updateProjectDebug(`Projetos carregados do Supabase: ${projects.length}.`);
  } catch (error) {
    console.error(error);
    lastProjectLoadError = `Não foi possível carregar os projetos agora. Erro: ${error.message}`;
    updateProjectDebug(lastProjectLoadError);
  } finally {
    isLoadingProjects = false;
    renderAll();
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

async function enterApplication() {
  try {
    currentProfile = await loadCurrentProfile();
  } catch (error) {
    console.error(error);
    loginFeedback.textContent = `Erro ao carregar perfil: ${error.message}`;
    saveSession(null);
    showLoginScreen();
    return;
  }

  if (!currentProfile) {
    loginFeedback.textContent = "Perfil não encontrado. Solicite acesso novamente.";
    saveSession(null);
    showLoginScreen();
    return;
  }

  if (currentProfile.status === "pending") {
    loginFeedback.textContent = "Seu acesso ainda está aguardando liberação do ADM.";
    saveSession(null);
    showLoginScreen();
    return;
  }

  if (currentProfile.status === "rejected") {
    loginFeedback.textContent = "Seu acesso não foi liberado. Fale com o ADM.";
    saveSession(null);
    showLoginScreen();
    return;
  }

  currentRole = currentProfile.role;
  showApp();
  await loadInitialData();
}

async function loadInitialData() {
  if (useRemoteDatabase) {
    isLoadingProjects = true;
    lastProjectLoadError = "";
    updateProjectDebug("Carregando projetos do Supabase...");
    renderQueue();
    renderTimeline();

    try {
      projects = await loadRemoteProjects();
      clearLocalProjectCache();
      setActiveFilter("all");
      lastProjectLoadError = "";
      updateProjectDebug(`Projetos carregados do Supabase: ${projects.length}.`);
    } catch (error) {
      console.error(error);
      lastProjectLoadError = `Não foi possível carregar os projetos agora. Erro: ${error.message}`;
      updateProjectDebug(lastProjectLoadError);
    } finally {
      isLoadingProjects = false;
    }
  } else {
    projects = loadProjects();
    updateProjectDebug("Banco online desativado. Usando somente dados deste navegador.");
  }

  renderAll();
}

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canUse("comercial", "adm")) return;
  if (isSubmittingRequest) return;

  isSubmittingRequest = true;
  submitButton.disabled = true;
  submitButton.textContent = "Salvando...";
  formFeedback.textContent = "Salvando solicitação...";

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
    history: [createHistory("Solicitação inicial criada", data.get("seller"))],
    ...fileInfo,
  };

  projects.push(project);

  try {
    await saveProject(project);
    requestForm.reset();
    sellerSelect.value = sellers[0];
    formFeedback.textContent = `Solicitação de ${project.client} adicionada na fila.`;
    renderAll();
  } catch (error) {
    console.error(error);
    projects = projects.filter((item) => item.id !== project.id);
    formFeedback.textContent =
      "Não foi possível salvar. Confira a conexão e tente novamente.";
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
      project.history.push(createHistory(`Avançou para ${stages[project.stageIndex]}`, person));
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
    const canDelete = confirm(`Excluir a solicitação de ${project.client}?`);
    if (!canDelete) return;
    projects = projects.filter((item) => item.id !== id);
    await deleteProject(id);
    renderAll();
    return;
  }

  await saveProject(project);
  renderAll();
});

approvalList.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || !canUse("adm")) return;
  const id = button.dataset.approveUser || button.dataset.rejectUser;
  if (!id) return;
  await updateProfileStatus(id, button.dataset.approveUser ? "approved" : "rejected");
  await renderApprovals();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveFilter(button.dataset.filter);
    renderQueue();
  });
});

refreshProjects.addEventListener("click", async () => {
  refreshProjects.disabled = true;
  refreshProjects.textContent = "Atualizando...";
  await refreshRemoteProjects();
  refreshProjects.disabled = false;
  refreshProjects.textContent = "Atualizar fila";
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
      if (useRemoteDatabase) {
        Promise.all(projects.map(saveProject)).catch(console.error);
      } else {
        saveLocalProjects(projects);
      }
      renderAll();
    } catch {
      alert("Não foi possível importar esse arquivo.");
    }
  };
  reader.readAsText(file);
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginFeedback.textContent = "Entrando...";
  const data = new FormData(loginForm);

  try {
    const session = await authRequest("token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({
        email: data.get("email"),
        password: data.get("password"),
      }),
    });
    saveSession(session);
    loginForm.reset();
    loginFeedback.textContent = "";
    await enterApplication();
  } catch (error) {
    console.error(error);
    saveSession(null);
    loginFeedback.textContent = `Não foi possível entrar: ${error.message}`;
  }
});

accessRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  requestFeedback.textContent = "Enviando solicitação...";
  const data = new FormData(accessRequestForm);

  try {
    await authRequest("signup", {
      method: "POST",
      body: JSON.stringify({
        email: data.get("email"),
        password: data.get("password"),
        data: {
          name: data.get("name"),
          role: data.get("role"),
        },
      }),
    });
    accessRequestForm.reset();
    requestFeedback.textContent =
      "Solicitação enviada. Aguarde o ADM liberar seu acesso.";
  } catch (error) {
    console.error(error);
    requestFeedback.textContent = "Não foi possível solicitar acesso. Verifique os dados.";
  }
});

showRequestAccess.addEventListener("click", () => {
  loginForm.classList.add("is-hidden");
  accessRequestForm.classList.remove("is-hidden");
});

showLogin.addEventListener("click", () => {
  accessRequestForm.classList.add("is-hidden");
  loginForm.classList.remove("is-hidden");
});

logoutButton.addEventListener("click", async () => {
  if (currentSession?.access_token) {
    authRequest("logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${currentSession.access_token}` },
    }).catch(console.error);
  }
  saveSession(null);
  currentProfile = null;
  currentRole = "";
  showLoginScreen();
});

async function init() {
  buildTeam();

  if (currentSession?.access_token && currentUser) {
    try {
      await enterApplication();
    } catch (error) {
      console.error(error);
      saveSession(null);
      showLoginScreen();
    }
  } else {
    showLoginScreen();
  }

  if (useRemoteDatabase) {
    setInterval(refreshRemoteProjects, 30000);
  }
}

init();
