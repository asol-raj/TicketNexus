// src/public/js/internal-ticket.js

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("ticketPage");
  if (!root) return;

  const TICKET_ID = root.dataset.ticketId; // from <div id="ticketPage" data-ticket-id="..." data-user-id="...">
  const USER_ID   = root.dataset.userId;

  const q  = (s) => document.querySelector(s);

  // Simple HTML escape (defensive)
  const esc = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  // ===== Status update =====
  q("#applyStatus")?.addEventListener("click", async () => {
    const val = q("#statusSelect").value;
    const res = await fetch(`/internal/tickets/${TICKET_ID}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ status: val })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.success === false) return alert(j.error || "Failed to update status");
    q("#statusBadge").textContent = j.status;
  });

  // ===== Create new comment (render EXACT template) =====
  q("#commentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const list = q("#commentList");
    const contentEl = q("#commentContent");
    const content = contentEl.value;

    const res = await fetch(`/internal/tickets/${TICKET_ID}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ content })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.success === false) return alert(j.error || "Failed");

    const c = j.comment;
    const isMine = Number(c.author_id) === Number(USER_ID);

    const wrap = document.createElement("div");
    wrap.className = "mb-3 border-bottom pb-2";
    wrap.dataset.commentId = c.id;
    wrap.dataset.authorId  = c.author_id;
    wrap.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <strong>${esc(c.author_label || "User")}</strong>
          <span class="small text-muted">· ${new Date(c.created_at).toLocaleString()}</span>
        </div>
        ${isMine ? `<button class="btn edit-comment"><i class="bi bi-pencil-square"></i></button>` : ""}
      </div>
      <div class="mt-1 comment-content" style="white-space:pre-wrap;">${esc(c.content)}</div>
    `;

    if (list) {
      if (list.children.length === 1 && list.firstElementChild.classList.contains("text-muted")) {
        list.innerHTML = ""; // remove "No updates yet."
      }
      list.prepend(wrap);
    }
    e.target.reset();
  });

  // ===== Edit comment (author-only; server enforces) =====
  let editingCommentId = null;

  q("#commentList")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".edit-comment");
    if (!btn) return;
    const wrap = btn.closest("[data-comment-id]");
    if (!wrap) return;
    editingCommentId = Number(wrap.dataset.commentId);
    const text = wrap.querySelector(".comment-content")?.textContent || "";
    q("#editCommentTextarea").value = text;
    const modal = new bootstrap.Modal(document.getElementById("editCommentModal"));
    modal.show();
  });

  q("#editCommentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = q("#editCommentMsg");
    msg.textContent = "Saving...";
    try {
      const content = q("#editCommentTextarea").value;
      const res = await fetch(`/internal/tickets/${TICKET_ID}/comments/${editingCommentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ content })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) throw new Error(j.error || "Update failed");

      const node = document.querySelector(`[data-comment-id="${editingCommentId}"] .comment-content`);
      if (node) node.textContent = j.comment.content || content;

      const modal = bootstrap.Modal.getInstance(document.getElementById("editCommentModal"));
      modal?.hide();
      msg.textContent = "";
      editingCommentId = null;
    } catch (err) {
      msg.textContent = err.message || "Update failed";
    }
  });

  // ===== Add attachments (modal form) =====
  const form = document.getElementById("addAttachmentsForm");
  const msg  = document.getElementById("addAttMsg");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (msg) msg.textContent = "Uploading...";
    const fd = new FormData(form);
    try {
      const res = await fetch(`/internal/tickets/${TICKET_ID}/attachments`, {
        method: "POST",
        body: fd
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) throw new Error(j.error || "Upload failed");

      const grid = document.getElementById("attachmentGrid");
      (j.attachments || []).forEach((a) => {
        const fileName = (a.file_path || "").split("/").slice(-1)[0] || "file";
        const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName);
        const col = document.createElement("div");
        col.className = `col-12 ${isImg ? "col-sm-6" : ""} attachment-item`;
        col.dataset.attachId = a.id;
        col.innerHTML = `
          <div class="border rounded p-2 h-100">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="small text-muted">Uploaded just now</div>
            </div>
            ${
              isImg
                ? `<a href="/attachments/${a.id}" target="_blank" class="d-block"><img src="/attachments/${a.id}" class="img-fluid rounded" alt=""></a>`
                : `<a href="/attachments/${a.id}" target="_blank">${fileName}</a>`
            }
          </div>`;
        // remove "No attachments" placeholder
        if (grid && grid.previousElementSibling?.classList.contains("text-muted")) {
          grid.previousElementSibling.remove();
        }
        grid?.prepend(col);
      });

      if (msg) msg.textContent = "Uploaded.";
      const modal = bootstrap.Modal.getInstance(document.getElementById("addAttachmentsModal"));
      setTimeout(() => { modal?.hide(); if (msg) msg.textContent = ""; }, 600);
      form.reset();
    } catch (err) {
      if (msg) msg.textContent = err.message || "Upload failed";
    }
  });

  // ===== Delete attachment (author-only; server enforces as well) =====
document.getElementById("attachmentGrid")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".delete-attachment");
  if (!btn) return;
  const id = btn.dataset.id;
  if (!id) return;
  if (!confirm("Delete this attachment?")) return;

  try {
    const res = await fetch(`/attachments/${id}`, { method: "DELETE", headers: { "Accept": "application/json" } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.success === false) throw new Error(j.error || "Delete failed");

    // Remove from DOM
    const item = btn.closest(".attachment-item");
    const grid = document.getElementById("attachmentGrid");
    item?.remove();

    // If none left, show placeholder
    if (grid && !grid.querySelector(".attachment-item")) {
      const empty = document.createElement("div");
      empty.className = "text-muted";
      empty.textContent = "No attachments.";
      grid.parentElement?.appendChild(empty);
    }
  } catch (err) {
    alert(err.message || "Delete failed");
  }
});

});
