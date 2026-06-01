const tasksNode = document.querySelector("#tasks");
const statusNode = document.querySelector("#status");
const healthNode = document.querySelector("#health");
const form = document.querySelector("#task-form");
const titleInput = document.querySelector("#title");
const priorityInput = document.querySelector("#priority");

const priorityLabels = {
  low: "Niski",
  medium: "Sredni",
  high: "Wysoki"
};

function setStatus(message) {
  statusNode.textContent = message;
}

function renderTasks(tasks) {
  if (tasks.length === 0) {
    tasksNode.innerHTML = "";
    setStatus("Brak zadan.");
    return;
  }

  setStatus("");
  tasksNode.innerHTML = tasks.map((task) => {
    const priority = task.priority || "medium";
    return `
      <li class="task">
        <div>
          <p class="task-title">${escapeHtml(task.title)}</p>
          <div class="task-meta">ID: ${task.id}</div>
        </div>
        <span class="priority priority-${priority}">${priorityLabels[priority] || priority}</span>
      </li>
    `;
  }).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function request(path, options) {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

async function loadHealth() {
  try {
    const health = await request("/health");
    healthNode.textContent = `API ${health.status}, DB ${health.database}, v${health.version || "1.0.0"}`;
    healthNode.className = "health ok";
  } catch (error) {
    healthNode.textContent = "API niedostepne";
    healthNode.className = "health error";
  }
}

async function loadTasks() {
  setStatus("Ladowanie zadan...");
  try {
    const tasks = await request("/tasks");
    renderTasks(tasks);
  } catch (error) {
    tasksNode.innerHTML = "";
    setStatus("Nie udalo sie pobrac zadan.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) {
    return;
  }

  const button = form.querySelector("button");
  button.disabled = true;

  try {
    await request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, priority: priorityInput.value })
    });
    titleInput.value = "";
    priorityInput.value = "medium";
    await loadTasks();
  } catch (error) {
    setStatus("Nie udalo sie dodac zadania.");
  } finally {
    button.disabled = false;
  }
});

loadHealth();
loadTasks();
