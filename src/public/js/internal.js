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

// presence (optional)
async function pingPresence() {
  try { await putJSON("/internal/presence/ping", {}); } catch {}
}

// KPIs
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

// Assign tickets (right)
function bindAssignHandlers() {
  const list = document.getElementById("ticketList");
  if (!list) return;
  list.addEventListener("click", async (e) => {
    const btn = e.target.closest(".do-assign");
    if (!btn) return;
    const ticketId = btn.dataset.ticketId;
    const sel = btn.parentElement.querySelector(".assign-select");
    const employee_id = sel && sel.value;
    if (!employee_id) return alert("Select an employee first");
    try {
      await putJSON(`/internal/tickets/${ticketId}/assign`, { employee_id });
      const prev = btn.textContent;
      btn.textContent = "Assigned ✓";
      setTimeout(() => { btn.textContent = prev; }, 1200);
      refreshSummary();
    } catch (err) {
      alert(err.message || "Failed to assign");
    }
  });
}

// Manager-aware employee create form
async function initManagerAwareEmployeeForm() {
  const select = document.getElementById("employeeManagerSelect");
  const createBtn = document.getElementById("createEmployeeBtn");
  const noMgr = document.getElementById("noManagerAlert");

  try {
    const data = await getJSON("/internal/data/managers");
    const managers = data.managers || [];

    if (managers.length === 0) {
      // block creation
      noMgr.style.display = "";
      select.style.display = "none";
      createBtn.disabled = true;
      return;
    }

    if (managers.length === 1) {
      // auto-assign server-side; hide select; allow submit
      noMgr.style.display = "none";
      select.style.display = "none";
      createBtn.disabled = false;
      // (optional) store single manager id in a data attribute if you want to send explicitly
    } else {
      // show select with options
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
    // if managers API fails, keep default (allow submit, server will enforce)
    console.warn("Failed to load managers:", e);
  }
}

// Create forms
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
        // re-evaluate managers after creating a manager
        if (formId === "createManagerForm") await initManagerAwareEmployeeForm();
      } catch (err) {
        if (msg) msg.textContent = err.message;
      }
    });
  };

  // manager create (unchanged)
  bind("createManagerForm", "managerMsg", "/internal/managers");

  // employee create — require manager selection if select is visible
  bind("createEmployeeForm", "employeeMsg", "/internal/employees", (payload) => {
    const sel = document.getElementById("employeeManagerSelect");
    if (sel && sel.style.display !== "none") {
      if (!payload.manager_id) return "Please select a manager.";
    }
    return null;
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  bindAssignHandlers();
  bindCreateForms();
  refreshSummary();
  pingPresence();

  await initManagerAwareEmployeeForm(); // set up employee form based on managers count

  setInterval(refreshSummary, 30000);
  setInterval(pingPresence, 120000);
});
