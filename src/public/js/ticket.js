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

function renderComments(list) {
  const root = document.getElementById("commentList");
  if (!root) return;
  root.innerHTML = "";
  if (!list || !list.length) {
    root.innerHTML = `<div class="text-muted">No updates yet.</div>`;
    return;
  }
  for (const p of list) {
    const div = document.createElement("div");
    div.className = "border rounded p-3";
    div.innerHTML = `
      <div class="small text-muted mb-1">
        <strong>${p.author_label || "User"}</strong> · ${new Date(p.created_at).toLocaleString()}
      </div>
      <div style="white-space:pre-wrap;">${p.content}</div>
    `;
    root.appendChild(div);
  }
}

async function refreshComments() {
  const id = window.__TICKET_ID__;
  if (!id) return;
  try {
    const data = await getJSON(`/client-admin/tickets/${id}/comments`);
    renderComments(data.comments || []);
  } catch { /* silent */ }
}

async function del(url) {
  const res = await fetch(url, { method: "DELETE", headers: { "Accept": "application/json" } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(j.error || "Request failed");
  return j;
}

function bindAttachmentDeletes() {
  const grid = document.getElementById("attachmentGrid");
  if (!grid) return;

  grid.addEventListener("click", async (e) => {
    const btn = e.target.closest(".att-delete");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;

    if (!confirm("Delete this attachment?")) return;

    btn.disabled = true;
    try {
      await del(`/attachments/${id}`);
      // remove the card
      const wrap = btn.closest(".attachment-item");
      if (wrap) wrap.remove();
    } catch (err) {
      alert(err.message || "Failed to delete");
      btn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("commentForm");
  const msg = document.getElementById("commentMsg");
  const txt = document.getElementById("commentContent");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = (txt?.value || "").trim();
    if (!content) { if (msg) msg.textContent = "Write something first."; return; }
    if (msg) msg.textContent = "Posting...";
    try {
      const id = window.__TICKET_ID__;
      await postJSON(`/client-admin/tickets/${id}/comments`, { content });
      txt.value = "";
      if (msg) msg.textContent = "Posted.";
      setTimeout(() => { if (msg) msg.textContent = ""; }, 1000);
      refreshComments();
    } catch (err) {
      if (msg) msg.textContent = err.message || "Failed to post";
    }
  });

  async function postForm(url, formEl) {
  const fd = new FormData(formEl);
  const res = await fetch(url, { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(j.error || "Upload failed");
  return j;
}

// Rebuild just the single attachment card node (for images/non-images)
function buildAttachmentItem(a) {
  const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.file_path || "");
  const fileName = (a.file_path || "").split("/").slice(-1)[0] || "file";
  const wrap = document.createElement("div");
  wrap.className = `col-12 ${isImg ? "col-sm-6" : ""} attachment-item`;
  wrap.dataset.attachId = a.id;
  wrap.innerHTML = `
    <div class="border rounded p-2 h-100">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="small text-muted">
          Uploaded just now
        </div>
        ${a.can_delete ? `<button class="btn btn-sm btn-outline-danger att-delete" data-id="${a.id}" title="Delete attachment">🗑</button>` : ""}
      </div>
      ${isImg
        ? `<a href="/attachments/${a.id}" target="_blank" class="d-block">
             <img src="/attachments/${a.id}" alt="attachment" class="img-fluid rounded">
           </a>`
        : `<a class="d-block" href="/attachments/${a.id}" target="_blank">${fileName}</a>`
      }
    </div>`;
  return wrap;
}

// After upload, either re-fetch attachments or append the returned ones
async function refreshAttachmentsSoft(added = []) {
  const grid = document.getElementById("attachmentGrid");
  if (!grid) return;
  if (added.length) {
    for (const a of added) {
      // mark delete eligibility for the current user
      a.can_delete = true; // the uploader is current user
      grid.prepend(buildAttachmentItem(a));
    }
    bindAttachmentDeletes(); // rebind for new buttons
    return;
  }
  // Fallback to hard refresh (call a small endpoint if you add one later)
}

function bindAddAttachments() {
  const form = document.getElementById("addAttachmentsForm");
  const msg = document.getElementById("addAttMsg");
  const modalEl = document.getElementById("addAttachmentsModal");
  const ticketId = window.__TICKET_ID__;

  if (!form) return;

  // Clear input every time modal opens
  modalEl?.addEventListener("show.bs.modal", () => {
    form.reset();
    if (msg) msg.textContent = "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (msg) msg.textContent = "Uploading...";
    try {
      const out = await postForm(`/client-admin/tickets/${ticketId}/attachments`, form);
      if (msg) msg.textContent = "Uploaded.";
      // close modal, update grid
      setTimeout(() => {
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal?.hide();
        if (msg) msg.textContent = "";
        refreshAttachmentsSoft(out.attachments || []);
      }, 600);
    } catch (err) {
      if (msg) msg.textContent = err.message || "Upload failed";
    }
  });
}

  // initial + periodic refresh
  refreshComments();
  bindAttachmentDeletes();
  bindAddAttachments(); // NEW
  setInterval(refreshComments, 30000);
});
