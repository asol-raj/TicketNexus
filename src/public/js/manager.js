async function getJSON(url) {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(j.error || "Request failed");
  return j;
}
async function putJSON(url, data) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(data),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(j.error || "Request failed");
  return j;
}

// Tickets: assign/unassigned filter + assign handler
function bindTicketsPanel() {
  const list = document.getElementById("ticketList");
  const filterAll = document.getElementById("filterAll");
  const filterUnassigned = document.getElementById("filterUnassigned");
  if (!list) return;

  list.addEventListener("click", async (e) => {
    const btn = e.target.closest(".do-assign");
    if (!btn) return;
    const id = btn.dataset.ticketId;
    const sel = btn.parentElement.querySelector(".assign-select");
    const employee_id = sel && sel.value;
    if (!employee_id) return alert("Select an employee first");
    try {
      await putJSON(`/manager/tickets/${id}/assign`, { employee_id });
      const prev = btn.textContent;
      btn.textContent = "Assigned ✓";
      setTimeout(() => (btn.textContent = prev), 1200);
      refreshTeamTable(); // counts update
    } catch (err) {
      alert(err.message || "Failed to assign");
    }
  });

  const renderTickets = (tickets) => {
    list.innerHTML = "";
    if (!tickets || !tickets.length) {
      list.innerHTML = `<div class="list-group-item text-muted">No tickets found.</div>`;
      return;
    }
    for (const t of tickets) {
      const item = document.createElement("div");
      item.className = "list-group-item";
      item.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <strong>#${t.id} · ${t.subject || "Ticket"}</strong>
          <span class="badge bg-secondary text-uppercase">${t.priority || "n/a"}</span>
        </div>
        <div class="small text-muted mb-2">
          Status: ${t.status || "n/a"} · Assignee: ${t.assignee_label || "Unassigned"}
        </div>
        <div class="d-flex gap-2">
          <select class="form-select form-select-sm assign-select" data-ticket-id="${t.id}">
            <option value="">Assign to…</option>
          </select>
          <button class="btn btn-sm btn-primary do-assign" data-ticket-id="${t.id}">Assign</button>
        </div>
      `;
      list.appendChild(item);
    }
    // Fill selects with team members
    const selects = list.querySelectorAll(".assign-select");
    const teamOptions = window.__teamSelect || [];
    selects.forEach(sel => {
      for (const emp of teamOptions) {
        const opt = document.createElement("option");
        opt.value = emp.employee_id;
        opt.textContent = emp.label;
        sel.appendChild(opt);
      }
    });
  };

  async function refreshTickets(filter = "all") {
    try {
      const data = await getJSON("/manager/data/tickets");
      let arr = data.tickets || [];
      if (filter === "unassigned") arr = arr.filter(t => !t.assigned_to);
      renderTickets(arr);
    } catch {
      // silent
    }
  }

  filterAll?.addEventListener("click", () => refreshTickets("all"));
  filterUnassigned?.addEventListener("click", () => refreshTickets("unassigned"));

  // initial load
  refreshTickets("all");

  // periodic refresh
  setInterval(() => refreshTickets(), 60000);
}

// Team table: edit + reset password + refresh counts
function bindTeamTable() {
  const table = document.getElementById("teamTable");
  const pf = document.getElementById("profileForm");
  const pfMsg = document.getElementById("profileMsg");
  const rp = document.getElementById("resetPwForm");
  const rpMsg = document.getElementById("resetMsg");
  const pfBody = document.getElementById("pf_body");
  const pfHint = document.getElementById("pf_hint");

  if (!table) return;

  table.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".act-edit");
    const resetBtn = e.target.closest(".act-reset");
    const row = e.target.closest("tr");
    if (!row) return;

    const employee_id = row.dataset.employeeId;
    if (editBtn) {
      // prefill profile form
      pfBody.style.opacity = "1";
      pfBody.style.pointerEvents = "auto";
      pfHint.textContent = "";
      document.getElementById("pf_employee_id").value = employee_id;
      document.getElementById("pf_first_name").value = row.querySelector("td:nth-child(1)")?.textContent.split(" ")[0] || "";
      document.getElementById("pf_last_name").value = ""; // left blank; manager can fill
      document.getElementById("pf_position").value = row.querySelector("td:nth-child(2)")?.textContent.trim() || "";
      // date_of_joining is not visible in table; leave as-is
    }
    if (resetBtn) {
      document.getElementById("rp_employee_id").value = employee_id;
      rpMsg.textContent = "";
    }
  });

  pf?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("pf_employee_id").value;
    if (!id) { pfMsg.textContent = "Pick a team member first."; return; }
    const fd = new FormData(pf);
    const employee_id = fd.get("employee_id");
    const payload = Object.fromEntries(fd.entries());
    try {
      const out = await putJSON(`/manager/employees/${employee_id}/profile`, payload);
      pfMsg.textContent = "Profile saved.";
      refreshTeamTable();
      setTimeout(() => (pfMsg.textContent = ""), 1500);
    } catch (err) {
      pfMsg.textContent = err.message || "Failed to save";
    }
  });

  rp?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(rp);
    const employee_id = fd.get("employee_id");
    const new_password = fd.get("new_password");
    if (!new_password) {
      rpMsg.textContent = "Enter a new password.";
      return;
    }
    try {
      const out = await putJSON(`/manager/employees/${employee_id}/reset-password`, { new_password });
      rpMsg.textContent = "Password reset.";
      rp.reset();
      setTimeout(() => (rpMsg.textContent = ""), 1500);
    } catch (err) {
      rpMsg.textContent = err.message || "Failed to reset";
    }
  });
}

async function refreshTeamTable() {
  try {
    const data = await getJSON("/manager/data/team");
    const tbody = document.querySelector("#teamTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    (data.team || []).forEach(m => {
      const tr = document.createElement("tr");
      tr.dataset.employeeId = m.employee_id;
      tr.dataset.userId = m.user_id;
      tr.innerHTML = `
        <td>${m.name}</td>
        <td>${m.position || "-"}</td>
        <td><span class="badge bg-info">${m.open_assigned}</span></td>
        <td>${m.online ? '<span class="badge bg-success">Online</span>' : '<span class="badge bg-secondary">Offline</span>'}</td>
        <td class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary act-edit" data-employee-id="${m.employee_id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger act-reset" data-employee-id="${m.employee_id}">Reset PW</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch {
    // ignore
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // stash teamSelect from SSR for ticket assignment dropdowns
  window.__teamSelect = window.__teamSelect || [];
  // If server embedded a global, you can hydrate it here; otherwise ticket panel will fetch options per render

  bindTicketsPanel();
  bindTeamTable();
  // live updates
  setInterval(refreshTeamTable, 30000);
});
