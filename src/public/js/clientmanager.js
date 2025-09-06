async function getJSON(url) { const r = await fetch(url, { headers: { "Accept": "application/json" } }); const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.error || "Request failed"); return j; }
async function postJSON(url, data) { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(data) }); const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.error || "Request failed"); return j; }
async function postForm(url, form) { const fd = new FormData(form); const r = await fetch(url, { method: "POST", body: fd }); const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.error || "Request failed"); return j; }

// tickets
function renderTicketsTable(tickets) {
  const tb = document.querySelector("#ticketsTable tbody"); if (!tb) return;
  tb.innerHTML = "";
  if (!tickets.length) { tb.innerHTML = `<tr><td colspan="7" class="text-muted">No tickets yet.</td></tr>`; return; }
  for (const t of tickets) { console.log(t)
    const tr = document.createElement("tr"); tr.style.cursor = "pointer";
    tr.addEventListener("click", () => window.open(`/client-manager/tickets/${t.id}`, "_blank"));
    tr.innerHTML = `
      <td>${t.id}</td>
      <td>${t.subject || "-"}</td>
      <td class="text-uppercase small">
        <span class="badge ${t.priority === "urgent"
        ? "bg-danger"
        : t.priority === "high"
          ? "bg-warning text-dark"
          : t.priority === "low"
            ? "bg-secondary"
            : "bg-info text-dark"
      } text-uppercase">${t.priority || "-"}</span>
      </td>
      <td>${t.raised_by}</td>
      <td>${t.assignee_label || "Unassigned"}</td>
      <td>${t.created_at ? new Date(t.created_at).toLocaleString() : "-"}</td>
      <td>${t.due_at ? new Date(t.due_at).toLocaleString() : "-"}</td>
      <td class="text-capitalize">
        <span class="badge ${t.status === "open"
        ? "bg-primary"
        : t.status === "in_progress"
          ? "bg-warning text-dark"
          : t.status === "resolved"
            ? "bg-success"
            : "bg-secondary"
      } text-capitalize">${t.status || "-"}</span>
      </td>`;
    tb.appendChild(tr);
  }
}
function renderRecentList(tks) {
  const list = document.getElementById("recentList"); if (!list) return;
  list.innerHTML = ""; if (!tks.length) { list.innerHTML = `<div class="list-group-item text-muted">No tickets.</div>`; return; }
  for (const t of tks.slice(0, 12)) {
    const div = document.createElement("div");
    div.className = "list-group-item"; div.style.cursor = "pointer";
    div.addEventListener("click", () => window.open(`/client-manager/tickets/${t.id}`, "_blank"));
    div.innerHTML = `
      <div class="d-flex justify-content-between">
        <strong>#${t.id} · ${t.subject || "Ticket"}</strong>
        <span class="badge bg-secondary text-uppercase">${t.priority || "n/a"}</span>
      </div>
      <div class="small text-muted">${t.status || "n/a"} · ${t.assignee_label || "Unassigned"}</div>`;
    list.appendChild(div);
  }
}

async function refreshTickets(filter = "open") {
  try {
    const d = await getJSON("/client-manager/data/tickets");
    let rows = d.tickets || [];    
    if (filter === "open") rows = rows.filter(x => (x.status === "open" || x.status === "in_progress"));
    if (filter === "in_progress") rows = rows.filter(x => x.status === "in_progress");
    if (filter === "archived") rows = rows.filter(x => x.status === "archived");
    if (filter === "resolved") rows = rows.filter(x => x.status === "resolved");
    if (filter === "closed") rows = rows.filter(x => x.status === "closed");
    renderTicketsTable(rows); 
    renderRecentList(d.tickets || []);
  } catch { }
}

function bindFilters() {
  document.getElementById("fltAll")?.addEventListener("click", () => refreshTickets("all"));
  document.getElementById("fltOpen")?.addEventListener("click", () => refreshTickets("open"));
  document.getElementById("fltInProg")?.addEventListener("click", () => refreshTickets("in_progress"));
  document.getElementById("fltResolved")?.addEventListener("click", () => refreshTickets("resolved"));
  document.getElementById("fltArchived")?.addEventListener("click", () => refreshTickets("archived"));
  document.getElementById("fltClosed")?.addEventListener("click", () => refreshTickets("closed"));
}

// assignees for ticket modal
async function populateAssignees() {
  const sel = document.getElementById("assigneeSelect"); if (!sel) return;
  try {
    const d = await getJSON("/client-manager/data/assignees");
    sel.innerHTML = `<option value="">Unassigned</option>`;
    for (const a of (d.assignees || [])) {
      const o = document.createElement("option");
      o.value = a.employee_id; o.textContent = `${a.label} — ${a.role}${a.admin_type ? ` (${a.admin_type})` : ""}`;
      sel.appendChild(o);
    }
  } catch { }
}

// create client employee (modal)
function bindCreateEmployee() {
  const form = document.getElementById("createEmployeeForm");
  const msg = document.getElementById("empMsg");
  const modalEl = document.getElementById("createEmployeeModal");
  if (!form) return;
  modalEl?.addEventListener("show.bs.modal", () => { form.reset(); if (msg) msg.textContent = ""; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); if (msg) msg.textContent = "Saving...";
    try {
      const out = await postJSON("/client-manager/employees", Object.fromEntries(new FormData(form).entries()));
      if (msg) msg.textContent = "Employee created (user_id: " + out.user_id + ")";
      setTimeout(() => { const m = bootstrap.Modal.getInstance(modalEl); m?.hide(); if (msg) msg.textContent = ""; refreshTeam(); }, 700);
    } catch (err) { if (msg) msg.textContent = err.message; }
  });
}

// team panel (cards)
function employeeCard(e) {
  const name = [e.first_name || "", e.last_name || ""].join(" ").trim() || (e.username || e.email);
  const doj = e.date_of_joining ? new Date(e.date_of_joining).toLocaleDateString() : "—";
  const wrap = document.createElement("div");
  wrap.className = "border rounded p-3";
  wrap.innerHTML = `
    <div class="d-flex justify-content-between align-items-start">
      <div>
        <div class="fw-bold">${name}</div>
        <div class="small text-muted">${e.position || "Client Employee"} · DOJ: ${doj}</div>
        <div class="small">${e.email || ""}</div>
      </div>
      <button class="btn btn-sm btn-outline-danger reset-pw" data-user="${e.user_id}">Reset PW</button>
    </div>`;
  return wrap;
}
async function refreshTeam() {
  try {
    const d = await getJSON("/client-manager/data/team");
    const root = document.getElementById("teamList"); if (!root) return;
    root.innerHTML = "";
    const arr = d.employees || [];
    if (!arr.length) { root.innerHTML = `<div class="text-muted">No client employees yet.</div>`; return; }
    for (const e of arr) { root.appendChild(employeeCard(e)); }
  } catch { }
}
function bindTeamActions() {
  const root = document.getElementById("teamList"); if (!root) return;
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest(".reset-pw"); if (!btn) return;
    const userId = btn.dataset.user; if (!userId) return;
    const np = prompt("Enter new password:");
    if (!np) return;
    btn.disabled = true;
    try {
      await postJSON(`/client-manager/employees/${userId}/reset-password`, { new_password: np });
      btn.textContent = "Reset ✓"; setTimeout(() => btn.textContent = "Reset PW", 1200);
    } catch (err) { alert(err.message || "Failed"); } finally { btn.disabled = false; }
  });
}

// new ticket modal
function bindNewTicketForm() {
  const form = document.getElementById("newTicketForm");
  const msg = document.getElementById("ticketMsg");
  const modalEl = document.getElementById("newTicketModal");
  if (!form) return;
  modalEl?.addEventListener("show.bs.modal", populateAssignees);
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); if (msg) msg.textContent = "Creating...";
    try {
      const out = await postForm("/client-manager/tickets", form);
      if (msg) msg.textContent = "Created ticket #" + out.ticket_id;
      form.reset();
      setTimeout(() => { const m = bootstrap.Modal.getInstance(modalEl); m?.hide(); if (msg) msg.textContent = ""; refreshTickets(); }, 700);
    } catch (err) { if (msg) msg.textContent = err.message; }
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

document.addEventListener("DOMContentLoaded", () => {
  bindFilters();
  bindCreateEmployee();
  bindTeamActions();
  bindNewTicketForm();
  refreshTickets();
  refreshTeam();
  setInterval(refreshTickets, 30000);
});
