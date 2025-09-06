// src/public/js/ticket-manager.js
document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("ticketPage");
  if (!root) return;

  const TICKET_ID = root.dataset.ticketId;
  const USER_ID   = root.dataset.userId;

  const q = (s) => document.querySelector(s);
  const esc = (s) => String(s)
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">", "&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#39;");

  // ===== Status update =====
  q("#applyStatus")?.addEventListener("click", async () => {
    const val = q("#statusSelect").value;
    const res = await fetch(`/client-manager/tickets/${TICKET_ID}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ status: val })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.success === false) return alert(j.error || "Failed to update status");
    q("#statusBadge").textContent = j.status;
  });

  // ===== Create new comment (server-identical markup) =====
  q("#commentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const list = q("#commentList");
    const contentEl = q("#commentContent");
    const content = contentEl.value;

    const res = await fetch(`/client-manager/tickets/${TICKET_ID}/comments`, {
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
        list.innerHTML = "";
      }
      list.prepend(wrap);
    }
    e.target.reset();
  });

  // ===== Edit comment (author-only) =====
  let editingCommentId = null;

  q("#commentList")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".edit-comment");
    if (!btn) return;
    const wrap = btn.closest("[data-comment-id]");
    if (!wrap) return;
    editingCommentId = Number(wrap.dataset.commentId);
    const text = wrap.querySelector(".comment-content")?.textContent || "";
    q("#editCommentTextarea").value = text;
    new bootstrap.Modal(document.getElementById("editCommentModal")).show();
  });

  q("#editCommentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = q("#editCommentMsg");
    msg.textContent = "Saving...";
    try {
      const content = q("#editCommentTextarea").value;
      const res = await fetch(`/client-manager/tickets/${TICKET_ID}/comments/${editingCommentId}`, {
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

  // ===== Add attachments =====
  const form = document.getElementById("addAttachmentsForm");
  const msg  = document.getElementById("addAttMsg");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (msg) msg.textContent = "Uploading...";
    const fd = new FormData(form);
    try {
      const res = await fetch(`/client-manager/tickets/${TICKET_ID}/attachments`, { method: "POST", body: fd });
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
        // remove "No attachments" placeholder if present
        if (!grid) return;
        const placeholder = grid.previousElementSibling;
        if (placeholder && placeholder.classList?.contains("text-muted")) placeholder.remove();
        grid.prepend(col);
      });

      if (msg) msg.textContent = "Uploaded.";
      const modal = bootstrap.Modal.getInstance(document.getElementById("addAttachmentsModal"));
      setTimeout(() => { modal?.hide(); if (msg) msg.textContent = ""; }, 600);
      form.reset();
    } catch (err) {
      if (msg) msg.textContent = err.message || "Upload failed";
    }
  });

  // ===== Delete attachment =====
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

      const item = btn.closest(".attachment-item");
      const grid = document.getElementById("attachmentGrid");
      item?.remove();

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

   // Handle edit form submit
  document.getElementById("editTicketForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target); //console.log(formData);

    const ticketId = formData.get("ticket_id"); //console.log(ticketId); return;

    const payload = {
      subject: formData.get("subject"),
      description: formData.get("description"),
      due_option: formData.get("due_option"),
      due_at: formData.get("due_at"),
      assigned_to: formData.get("assigned_to"),
      priority: formData.get("priority"),
    }; //console.log(payload); return;

    const res = await fetch(`/client-manager/tickets/${ticketId}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      document.getElementById("editTicketMsg").innerText = "Ticket updated successfully!";
      setTimeout(() => location.reload(), 1000);
    } else {
      document.getElementById("editTicketMsg").innerText = "Error: " + data.message;
    }
  });

});
