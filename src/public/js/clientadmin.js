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

function bindForm(formId, msgId, url) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const msg = document.getElementById(msgId);
    msg.textContent = "Saving...";
    try {
      const out = await postJSON(url, payload);
      msg.textContent = "Success: " + JSON.stringify(out);
      form.reset();
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      msg.textContent = err.message;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindForm("createManagerForm", "managerMsg", "/client-admin/managers");
  bindForm("createEmployeeForm", "employeeMsg", "/client-admin/employees");
});
