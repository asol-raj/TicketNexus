// src/public/js/internal.js

// --- Utility fetch wrappers ---
async function getJSON(url) {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
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

// --- Presence ---
async function pingPresence() {
  try { await putJSON("/internal/presence/ping", {}); } catch {}
}

// --- Summary refresh ---
async function refreshSummary() {
  try {
    const s = await getJSON("/internal/data/summary");
    const byId = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    byId("kpiOpenTickets", s.open_tickets);
    byId("kpiTotalEmployees", s.total_employees);
    byId("kpiOnline", s.online_employees);
    byId("kpiOffline", s.offline_employees);
    if (s.sla) {
      byId("slaLow", s.sla.low);
      byId("slaMedium", s.sla.medium);
      byId("slaHigh", s.sla.high);
      byId("slaUrgent", s.sla.urgent);
    }
  } catch {}
}

// --- Ticket rendering ---
function renderTickets(tickets, label) {
  const list = document.getElementById("ticketList");
  const filterLabel = document.getElementById("ticketFilterLabel");
  list.innerHTML = "";
  filterLabel.textContent = label || "Tickets";

  if (!tickets || !tickets.length) {
    list.innerHTML = `<div class="list-group-item text-muted">No tickets found.</div>`;
    return;
  }

  tickets.forEach(t => {
    const badgeClass =
      t.priority === "urgent" ? "bg-danger" :
      t.priority === "high"   ? "bg-warning" :
      t.priority === "medium" ? "bg-info" :
      t.priority === "low"    ? "bg-success" :
                                "bg-secondary";

    list.innerHTML += `
      <div class="list-group-item">
        <div class="d-flex justify-content-between">
          <strong>
            <a class="text-decoration-none" href="/internal/tickets/${t.id}" target="_blank">#${t.id}</a>
            · ${t.subject || "Ticket"}
          </strong>
          <span class="badge ${badgeClass} text-uppercase">${t.priority || "n/a"}</span>
        </div>
        <div class="small text-muted mb-2">
          Status: ${t.status || "n/a"} · Assignee: ${t.assignee_label || "Unassigned"}
        </div>
      </div>`;
  });
}

// --- Ticket filters ---
function bindKpiFilters() {
  document.querySelectorAll(".kpi-card.clickable[data-filter]").forEach(card => {
    card.addEventListener("click", async () => {
      const status = card.dataset.filter;
      try {
        const j = await getJSON(`/internal/data/tickets?status=${status}`);
        renderTickets(j.tickets, `${status.charAt(0).toUpperCase() + status.slice(1)} Tickets`);
      } catch (err) {
        alert(err.message || "Failed to load tickets");
      }
    });
  });
}

// --- Employee directory ---
function bindEmployeeDirectory() {
  const modal = document.getElementById("employeeListModal");
  if (!modal) return;

  modal.addEventListener("show.bs.modal", async () => {
    try {
      const j = await getJSON("/internal/data/employees");
      const tbody = modal.querySelector("#employeeTable tbody");
      tbody.innerHTML = "";
      (j.employees || []).forEach(emp => {
        tbody.innerHTML += `
          <tr>
            <td>${emp.first_name || ""} ${emp.last_name || ""}</td>
            <td>${emp.email || ""}</td>
            <td>${emp.role}</td>
            <td>${emp.position || "-"}</td>
            <td>${emp.manager_label || "-"}</td>
            <td><button class="btn btn-sm btn-outline-primary edit-employee" data-id="${emp.employee_id}">Edit</button></td>
          </tr>`;
      });
    } catch (e) {
      console.warn("Failed to load employees:", e);
    }
  });

  // handle edit button clicks
  modal.addEventListener("click", async (e) => {
    const btn = e.target.closest(".edit-employee");
    if (!btn) return;
    const id = btn.dataset.id;
    try {
      const j = await getJSON(`/internal/data/employees/${id}`);
      const emp = j.employee;

      document.getElementById("empId").value = emp.employee_id;
      document.getElementById("empFirstName").value = emp.first_name || "";
      document.getElementById("empLastName").value = emp.last_name || "";
      document.getElementById("empEmail").value = emp.email || "";
      document.getElementById("empPosition").value = emp.position || "";

      // load managers into select
      const mgrData = await getJSON("/internal/data/managers");
      const mgrSelect = document.getElementById("empManager");
      mgrSelect.innerHTML = `<option value="">(No manager)</option>`;
      (mgrData.managers || []).forEach(m => {
        mgrSelect.innerHTML += `<option value="${m.manager_employee_id}" ${m.manager_employee_id === emp.manager_id ? "selected" : ""}>${m.label}</option>`;
      });

      const editModal = new bootstrap.Modal(document.getElementById("editEmployeeModal"));
      editModal.show();
    } catch (err) {
      alert(err.message || "Failed to load employee");
    }
  });
}

// --- Save employee updates ---
function bindEmployeeEditForm() {
  const form = document.getElementById("editEmployeeForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await putJSON(`/internal/employees/${payload.id}`, payload);
      alert("Employee updated successfully");
      bootstrap.Modal.getInstance(document.getElementById("editEmployeeModal"))?.hide();
    } catch (err) {
      alert(err.message || "Update failed");
    }
  });
}

// --- Manager-aware employee form (unchanged from your old code) ---
async function initManagerAwareEmployeeForm() {
  const select = document.getElementById("employeeManagerSelect");
  const createBtn = document.getElementById("createEmployeeBtn");
  const noMgr = document.getElementById("noManagerAlert");

  try {
    const data = await getJSON("/internal/data/managers");
    const managers = data.managers || [];

    if (managers.length === 0) {
      noMgr.style.display = "";
      select.style.display = "none";
      createBtn.disabled = true;
      return;
    }

    if (managers.length === 1) {
      noMgr.style.display = "none";
      select.style.display = "none";
      createBtn.disabled = false;
    } else {
      noMgr.style.display = "none";
      select.style.display = "";
      select.innerHTML = '<option value="">Select manager…</option>';
      for (const m of managers) {
        const opt = document.createElement("option");
        opt.value = m.manager_employee_id;
        opt.textContent = m.label;
        select.appendChild(opt);
      }
      createBtn.disabled = false;
    }
  } catch (e) {
    console.warn("Failed to load managers:", e);
  }
}

// --- Create forms ---
function bindCreateForms() {
  const bind = (formId, msgId, url, beforeSend) => {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      if (beforeSend) {
        const err = beforeSend(payload);
        if (err) { const m = document.getElementById(msgId); if (m) m.textContent = err; return; }
      }
      const msg = document.getElementById(msgId);
      if (msg) msg.textContent = "Saving...";
      try {
        const out = await postJSON(url, payload);
        if (msg) msg.textContent = "Success: " + JSON.stringify(out);
        form.reset();
        refreshSummary();
        if (formId === "createManagerForm") await initManagerAwareEmployeeForm();
      } catch (err) {
        if (msg) msg.textContent = err.message;
      }
    });
  };

  bind("createManagerForm", "managerMsg", "/internal/managers");
  bind("createEmployeeForm", "employeeMsg", "/internal/employees", (payload) => {
    const sel = document.getElementById("employeeManagerSelect");
    if (sel && sel.style.display !== "none") {
      if (!payload.manager_id) return "Please select a manager.";
    }
    return null;
  });
}

// --- Init ---
document.addEventListener("DOMContentLoaded", async () => {
  bindKpiFilters();
  bindEmployeeDirectory();
  bindEmployeeEditForm();
  bindCreateForms();
  refreshSummary();
  pingPresence();
  await initManagerAwareEmployeeForm();

  setInterval(refreshSummary, 30000);
  setInterval(pingPresence, 120000);
});
