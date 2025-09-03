// src/public/js/manager.js
document.addEventListener("DOMContentLoaded", () => {
  const q = (sel) => document.querySelector(sel);
  const qa = (sel) => Array.from(document.querySelectorAll(sel));

  // ==================== Refresh helpers ====================
  async function refreshTeam() {
    try {
      const res = await fetch("/manager/team");
      const j = await res.json();
      if (!res.ok || j.success === false) throw new Error(j.error || "Failed to load team");
      const tbody = q("#teamTable tbody");
      tbody.innerHTML = "";
      if (!j.team.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-muted">No team members yet.</td></tr>`;
        return;
      }
      j.team.forEach((m) => {
        tbody.insertAdjacentHTML(
          "beforeend",
          `<tr data-employee-id="${m.employee_id}" data-user-id="${m.user_id}">
            <td>${m.name}</td>
            <td>${m.position || "-"}</td>
            <td><span class="badge bg-info">${m.open_assigned}</span></td>
            <td>${m.online ? `<span class="badge bg-success">Online</span>` : `<span class="badge bg-secondary">Offline</span>`}</td>
            <td>
              <div class="dropdown">
                <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">Actions</button>
                <ul class="dropdown-menu">
                  <li><a class="dropdown-item act-edit" href="#">Edit Profile</a></li>
                  <li><a class="dropdown-item act-reset" href="#">Reset Password</a></li>
                </ul>
              </div>
            </td>
          </tr>`
        );
      });
      bindTeamActions();
    } catch (err) {
      console.error("refreshTeam:", err);
    }
  }

  async function refreshTickets() {
    try {
      const res = await fetch("/manager/tickets");
      const j = await res.json();
      if (!res.ok || j.success === false) throw new Error(j.error || "Failed to load tickets");
      const list = q("#ticketList");
      list.innerHTML = "";
      if (!j.tickets.length) {
        list.innerHTML = `<div class="list-group-item text-muted">No tickets found.</div>`;
        return;
      }
      j.tickets.forEach((t) => {
        list.insertAdjacentHTML(
          "beforeend",
          `<div class="list-group-item ticket-item"
                data-status="${t.status}"
                data-assignee="${t.assignee_label || ''}">
            <div class="d-flex justify-content-between">
              <strong>
                <a href="/manager/tickets/${t.id}" target="_blank" class="text-decoration-none">#${t.id} · ${t.subject || "Ticket"}</a>
              </strong>
              <span class="badge bg-secondary">${t.priority || "n/a"}</span>
            </div>
            <div class="small text-muted mb-2">
              Status: ${t.status || "n/a"} · Assignee: ${t.assignee_label || "Unassigned"}
            </div>            
          </div>`
        );
      });

      // Populate assignment selects with team
      const teamRes = await fetch("/manager/team");
      const teamData = await teamRes.json();
      if (teamData.success) {
        qa(".assign-select").forEach((sel) => {
          teamData.team.forEach((emp) => {
            sel.insertAdjacentHTML("beforeend", `<option value="${emp.employee_id}">${emp.name}</option>`);
          });
        });
      }

      bindAssignButtons();
      applyCurrentFilter();
    } catch (err) {
      console.error("refreshTickets:", err);
    }
  }

  // ==================== Ticket Filtering ====================
  let currentFilter = "actionable"; // default = open/in_progress OR unassigned

  function applyFilter(type) {
    currentFilter = type;
    qa("#ticketList .ticket-item").forEach((el) => {
      const status = (el.dataset.status || "").toLowerCase(); console.log(status)
      const assignee = (el.dataset.assignee || "").toLowerCase();
      let show = false;

      if (type === "actionable") {
        // open or in_progress, OR unassigned — but exclude closed/resolved
        show = ((status === "open" || status === "in_progress") ||
          (!assignee || assignee === "unassigned"))
          && status !== "closed" && status !== "resolved";
      } else if (type === "open") {
        show = (status === "open" || status === "in_progress");
      } else if (type === "unassigned") {
        show = (!assignee || assignee === "unassigned") &&
          status !== "closed" && status !== "resolved";
      } else if (type === "closed") {
        show = (status === "closed");
      } else if (type === "resolved") {
        show = (status === "resolved");
      }

      el.style.display = show ? "" : "none";
    });
  }

  function applyCurrentFilter() { applyFilter(currentFilter); }

  q("#filterOpen")?.addEventListener("click", () => {
    qa(".btn-group .btn").forEach((b) => b.classList.remove("active"));
    q("#filterOpen").classList.add("active");
    applyFilter("open");
  });
  q("#filterUnassigned")?.addEventListener("click", () => {
    qa(".btn-group .btn").forEach((b) => b.classList.remove("active"));
    q("#filterUnassigned").classList.add("active");
    applyFilter("unassigned");
  });
  q("#filterClosed")?.addEventListener("click", () => {
    qa(".btn-group .btn").forEach((b) => b.classList.remove("active"));
    q("#filterClosed").classList.add("active");
    applyFilter("closed");
  });

  // ==================== Ticket Assignment ====================
  function bindAssignButtons() {
    qa(".do-assign").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (btn.closest(".assign-wrap")?.classList.contains("d-none")) return; // hidden for closed
        const ticketId = btn.dataset.ticketId;
        const sel = btn.parentElement.querySelector(".assign-select");
        const empId = sel?.value;
        if (!empId) return alert("Select an employee");
        try {
          const res = await fetch("/manager/assign-ticket", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticketId, employeeId: empId }),
          });
          const j = await res.json();
          if (!res.ok || j.success === false) throw new Error(j.error || "Assignment failed");
          alert("Assigned successfully");
          refreshTickets();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  // ==================== Team Actions ====================
  function bindTeamActions() {
    qa(".act-edit").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const tr = btn.closest("tr");
        if (!tr) return;
        q("#pf_employee_id").value = tr.dataset.employeeId;
        q("#pf_first_name").value = "";
        q("#pf_last_name").value = "";
        q("#pf_position").value = tr.querySelector("td:nth-child(2)")?.textContent.trim() || "";
        new bootstrap.Modal(q("#editEmployeeModal")).show();
      });
    });

    qa(".act-reset").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const tr = btn.closest("tr");
        if (!tr) return;
        q("#rp_employee_id").value = tr.dataset.employeeId;
        q("#rp_new_password").value = "";
        new bootstrap.Modal(q("#resetPwModal")).show();
      });
    });
  }

  // ==================== Forms ====================
  q("#profileForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      const res = await fetch("/manager/update-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await res.json();
      if (!res.ok || j.success === false) throw new Error(j.error || "Update failed");
      bootstrap.Modal.getInstance(q("#editEmployeeModal"))?.hide();
      alert("Employee updated");
      refreshTeam();
    } catch (err) {
      alert(err.message);
    }
  });

  q("#resetPwForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      const res = await fetch("/manager/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await res.json();
      if (!res.ok || j.success === false) throw new Error(j.error || "Reset failed");
      bootstrap.Modal.getInstance(q("#resetPwModal"))?.hide();
      alert("Password reset successfully");
    } catch (err) {
      alert(err.message);
    }
  });

  q("#filterActionable")?.addEventListener("click", () => {
    qa(".btn-group .btn").forEach((b) => b.classList.remove("active"));
    q("#filterActionable").classList.add("active");
    applyFilter("actionable");
  });

  // ==================== Initial ====================
  refreshTeam();
  refreshTickets();
});
