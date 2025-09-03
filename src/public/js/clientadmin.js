async function getJSON(url) {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(j.error || "Request failed");
  return j;
}
async function postForm(url, formEl) {
  const fd = new FormData(formEl);
  const res = await fetch(url, { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(j.error || "Request failed");
  return j;
}
async function postJSON(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(data),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(j.error || "Request failed");
  return j;
}

// Create Manager (modal)
function bindCreateManager() {
  const form = document.getElementById("createManagerForm");
  const msg = document.getElementById("managerMsg");
  const modalEl = document.getElementById("createManagerModal");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Saving...";
    try {
      const out = await postJSON("/client-admin/managers", Object.fromEntries(new FormData(form).entries()));
      msg.textContent = "Manager created (user_id: " + out.user_id + ")";
      form.reset();
      setTimeout(() => {
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal?.hide();
        msg.textContent = "";
      }, 700);
    } catch (err) {
      msg.textContent = err.message;
    }
  });
}

// Tickets (table + recent)
function renderTicketsTable(tickets) {
  const tb = document.querySelector("#ticketsTable tbody");
  if (!tb) return;
  tb.innerHTML = "";

  if (!tickets.length) {
    tb.innerHTML = `<tr><td colspan="7" class="text-muted">No tickets yet.</td></tr>`;
    return;
  }

  for (const t of tickets) {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => window.open(`/client-admin/tickets/${t.id}`, "_blank"));

    tr.innerHTML = `
      <td>#${t.id}</td>
      <td>${t.subject || "-"}</td>
      <td>
        <span class="badge ${t.priority === "urgent"
        ? "bg-danger"
        : t.priority === "high"
          ? "bg-warning text-dark"
          : t.priority === "low"
            ? "bg-secondary"
            : "bg-info text-dark"
      } text-uppercase">${t.priority || "-"}</span>
      </td>
      <td>
        <span class="badge ${t.status === "open"
        ? "bg-primary"
        : t.status === "in_progress"
          ? "bg-warning text-dark"
          : t.status === "closed"
            ? "bg-success"
            : "bg-secondary"
      } text-uppercase">${t.status || "-"}</span>
      </td>
      <td>${t.assignee_label || "Unassigned"}</td>
      <td>${t.created_at ? new Date(t.created_at).toLocaleString() : "-"}</td>
      <td>${t.due_label || (t.due_at ? new Date(t.due_at).toLocaleString() : "-")}</td>
    `;
    tb.appendChild(tr);
  }
}


function renderRecentList(tickets) {
  const list = document.getElementById("recentList");
  if (!list) return;
  list.innerHTML = "";
  if (!tickets.length) {
    list.innerHTML = `<div class="list-group-item text-muted">No tickets.</div>`;
    return;
  }
  for (const t of tickets.slice(0, 12)) {
    const div = document.createElement("div");
    div.className = "list-group-item";
    div.style.cursor = "pointer";
    div.addEventListener("click", () => window.open(`/client-admin/tickets/${t.id}`, "_blank"));
    div.innerHTML = `
      <div class="d-flex justify-content-between">
        <strong>#${t.id} · ${t.subject || "Ticket"}</strong>
        <span class="badge ${t.priority === "urgent"
        ? "bg-danger"
        : t.priority === "high"
          ? "bg-warning text-dark"
          : t.priority === "low"
            ? "bg-secondary"
            : "bg-info text-dark"
      } text-uppercase">${t.priority || "-"}</span>
      </div>
      <div class="small text-muted">
        ${t.status || "n/a"} · ${t.assignee_label || "Unassigned"}
      </div>
    `;
    list.appendChild(div);
  }
}

async function refreshTickets(filter = "open") {
  try {
    const data = await getJSON("/client-admin/data/tickets");
    let rows = data.tickets || [];
    if (filter === "open") rows = rows.filter(x => (x.status === "open" || x.status === "in_progress"));
    if (filter === "in_progress") rows = rows.filter(x => x.status === "in_progress");
    if (filter === "archived") rows = rows.filter(x => x.status === "archived");
    if (filter === "resolved") rows = rows.filter(x => x.status === "resolved");
    if (filter === "closed") rows = rows.filter(x => x.status === "closed");
    renderTicketsTable(rows);
    renderRecentList(data.tickets || []);

  } catch { }
}

function bindFilters() {
  document.getElementById("fltAll")?.addEventListener("click", () => refreshTickets("all"));
  document.getElementById("fltOpen")?.addEventListener("click", () => refreshTickets("open"));
  document.getElementById("fltInProg")?.addEventListener("click", () => refreshTickets("in_progress"));
  document.getElementById("fltArchived")?.addEventListener("click", () => refreshTickets("archived"));
  document.getElementById("fltResolved")?.addEventListener("click", () => refreshTickets("resolved"));
  document.getElementById("fltClosed")?.addEventListener("click", () => refreshTickets("closed"));
}

// New Ticket (modal)
async function populateAssignees() {
  const sel = document.getElementById("assigneeSelect");
  if (!sel) return;
  try {
    const data = await getJSON("/client-admin/data/assignees");
    sel.innerHTML = `<option value="">Unassigned</option>`;
    for (const a of data.assignees || []) {
      const opt = document.createElement("option");
      opt.value = a.employee_id;
      opt.textContent = `${a.label} — ${a.role}${a.admin_type ? " (" + a.admin_type + ")" : ""}`;
      sel.appendChild(opt);
    }
  } catch { }
}
function bindNewTicketForm() {
  const form = document.getElementById("newTicketForm");
  const msg = document.getElementById("ticketMsg");
  const modalEl = document.getElementById("newTicketModal");
  if (!form) return;

  modalEl?.addEventListener("show.bs.modal", populateAssignees);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Creating...";
    try {
      const out = await postForm("/client-admin/tickets", form);
      msg.textContent = "Created ticket #" + out.ticket_id;
      form.reset();
      setTimeout(() => {
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal?.hide();
        msg.textContent = "";
        refreshTickets();
      }, 700);
    } catch (err) {
      msg.textContent = err.message;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const sel = document.getElementById("dueOptionSelect");
  const custom = document.getElementById("customDueWrapper");
  sel?.addEventListener("change", () => {
    if (sel.value === "custom") {
      custom.classList.remove("d-none");
    } else {
      custom.classList.add("d-none");
    }
  });
});

function bindCreateEmployee() {
  const form = document.getElementById("createEmployeeForm");
  const msg = document.getElementById("empMsg");
  const modalEl = document.getElementById("createEmployeeModal");
  if (!form) return;
  modalEl?.addEventListener("show.bs.modal", () => { form.reset(); if (msg) msg.textContent = ""; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); if (msg) msg.textContent = "Saving...";
    try {
      const out = await postJSON("/client-admin/employees", Object.fromEntries(new FormData(form).entries()));
      if (msg) msg.textContent = "Employee created (user_id: " + out.user_id + ")";
      setTimeout(() => { const m = bootstrap.Modal.getInstance(modalEl); m?.hide(); if (msg) msg.textContent = ""; refreshTeam(); }, 700);
    } catch (err) { if (msg) msg.textContent = err.message; }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".edit-employee-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("editEmpId").value = btn.dataset.id;
      document.getElementById("editFirstName").value = btn.dataset.firstname || "";
      document.getElementById("editLastName").value = btn.dataset.lastname || "";
      document.getElementById("editPosition").value = btn.dataset.position || "";
      document.getElementById("editDOJ").value = btn.dataset.doj || "";

      // Manager dropdown logic
      const managerWrapper = document.getElementById("managerWrapper");
      const role = btn.dataset.role;

      if (role === "manager") {
        managerWrapper.style.display = "none";
      } else {
        managerWrapper.style.display = "block";
        const managerSelect = document.getElementById("editManager");
        if (btn.dataset.manager) {
          managerSelect.value = btn.dataset.manager;
        } else {
          managerSelect.value = "";
        }
      }
    });
  });
});


// boot
document.addEventListener("DOMContentLoaded", () => {
  bindCreateManager();
  bindNewTicketForm();
  bindCreateEmployee();
  bindFilters();
  refreshTickets();
  setInterval(refreshTickets, 30000);
});
