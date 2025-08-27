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

function fillClientSelect(selectEl, clients) {
    selectEl.innerHTML = '<option value="">Select a client...</option>';
    for (const c of clients) {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = `${c.name} (#${c.id})`;
        selectEl.appendChild(opt);
    }
}

async function loadClientsIntoSelects() {
    const list = await getJSON("/admin/clients");
    const selects = [
        document.getElementById("clientSelectForInternal"),
        document.getElementById("clientSelectForClientAdmin"),
    ].filter(Boolean);
    selects.forEach(sel => fillClientSelect(sel, list.clients || []));
}

function bindForm(formId, msgId, makeUrl, picker = (fd) => Object.fromEntries(fd.entries())) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const payload = picker(fd);
        const msg = document.getElementById(msgId);
        msg.textContent = "Saving...";
        try {
            const out = await postJSON(makeUrl(payload), payload);
            msg.textContent = "Success: " + JSON.stringify(out);
            form.reset();
            // If a new client was created, refresh selects
            if (formId === "createClientForm") {
                await loadClientsIntoSelects();
            }
        } catch (err) {
            msg.textContent = err.message;
        }
    });
}

async function loadAdminsTables() {
    try {
        const data = await getJSON("/admin/admins");

        const renderTable = (tbodyId, arr) => {
            const tbody = document.querySelector(`#${tbodyId} tbody`);
            if (!tbody) return;
            tbody.innerHTML = "";
            arr.forEach((a, i) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${a.client_name}</td>
          <td>${a.username || "-"}</td>
          <td>${a.email}</td>
        `;
                tbody.appendChild(tr);
            });
        };

        renderTable("internalAdminsTable", data.internal || []);
        renderTable("clientAdminsTable", data.clientAdmins || []);
    } catch (err) {
        console.error("Failed to load admins:", err);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadClientsIntoSelects();
        await loadAdminsTables();
    } catch (e) {
        console.error(e);
    }

    // Rebind forms (already there) ...
    bindForm("createClientForm", "clientMsg", () => "/admin/clients");
    bindForm("createInternalAdminForm", "internalAdminMsg", () => "/admin/internal-admins");
    bindForm("createClientAdminForm", "clientAdminMsg", () => "/admin/client-admins");

    // Refresh admin lists after adding new admins
    ["createInternalAdminForm", "createClientAdminForm"].forEach(id => {
        const form = document.getElementById(id);
        if (form) {
            form.addEventListener("submit", async () => {
                setTimeout(loadAdminsTables, 1000);
            });
        }
    });
});
