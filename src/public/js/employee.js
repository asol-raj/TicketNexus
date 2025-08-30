// src/public/js/employee.js
document.addEventListener("DOMContentLoaded", () => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  // ===================== Dashboard: Pie Chart =====================
  const chartData = q("#chartData");
  if (chartData) {
    const open = Number(chartData.dataset.open || 0);
    const inProgress = Number(chartData.dataset.inprogress || 0);
    const resolved = Number(chartData.dataset.resolved || 0);
    const closed = Number(chartData.dataset.closed || 0);

    const ctx = q("#myTicketsChart");
    if (ctx) {
      new Chart(ctx, {
        type: "pie",
        data: {
          labels: ["Open", "In Progress", "Resolved", "Closed"],
          datasets: [
            {
              data: [open, inProgress, resolved, closed],
              backgroundColor: [
                "#0dcaf0", // info
                "#ffc107", // warning
                "#198754", // success
                "#6c757d", // secondary
              ],
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: ${ctx.parsed}`,
              },
            },
          },
        },
      });
    }
  }

  // ===================== Dashboard: Self-assign buttons =====================
  qa(".self-assign").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.ticketId;
      if (!confirm("Do you want to take this ticket?")) return;
      try {
        const res = await fetch(`/employee/tickets/${id}/self-assign`, { method: "POST" });
        const j = await res.json();
        if (j.success) {
          alert("Ticket assigned to you.");
          location.reload();
        } else {
          alert(j.error || "Failed");
        }
      } catch (err) {
        alert(err.message);
      }
    });
  });

  // ===================== Ticket Page =====================
  const root = q("#ticketPage");
  if (root) {
    const TICKET_ID = root.dataset.ticketId;
    const USER_ID = root.dataset.userId;

    // ----- Post new comment -----
    q("#commentForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const contentEl = q("#commentContent");
      const content = contentEl.value.trim();
      if (!content) return;
      try {
        const res = await fetch(`/employee/tickets/${TICKET_ID}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ content }),
        });
        const j = await res.json();
        if (!res.ok || j.success === false) throw new Error(j.error || "Failed");
        const c = j.comment;
        const isMine = Number(c.user_id) === Number(USER_ID);

        const wrap = document.createElement("div");
        wrap.className = "mb-3 border-bottom pb-2";
        wrap.dataset.commentId = c.id;
        wrap.dataset.authorId = c.user_id;
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
        const list = q("#commentList");
        if (list) {
          if (list.children.length === 1 && list.firstElementChild.classList.contains("text-muted")) {
            list.innerHTML = "";
          }
          list.prepend(wrap);
        }
        e.target.reset();
      } catch (err) {
        alert(err.message);
      }
    });

    // ----- Edit comment -----
    let editingCommentId = null;
    q("#commentList")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".edit-comment");
      if (!btn) return;
      const wrap = btn.closest("[data-comment-id]");
      editingCommentId = Number(wrap.dataset.commentId);
      q("#editCommentTextarea").value = wrap.querySelector(".comment-content")?.textContent || "";
      new bootstrap.Modal(q("#editCommentModal")).show();
    });

    q("#editCommentForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = q("#editCommentMsg");
      msg.textContent = "Saving...";
      try {
        const content = q("#editCommentTextarea").value;
        const res = await fetch(`/employee/tickets/${TICKET_ID}/comments/${editingCommentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ content }),
        });
        const j = await res.json();
        if (!res.ok || j.success === false) throw new Error(j.error || "Update failed");

        const node = document.querySelector(`[data-comment-id="${editingCommentId}"] .comment-content`);
        if (node) node.textContent = j.comment.content || content;

        bootstrap.Modal.getInstance(q("#editCommentModal"))?.hide();
        msg.textContent = "";
        editingCommentId = null;
      } catch (err) {
        msg.textContent = err.message;
      }
    });

    // ----- Upload attachments -----
    q("#addAttachmentsForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = q("#addAttMsg");
      msg.textContent = "Uploading...";
      const fd = new FormData(e.target);
      try {
        const res = await fetch(`/employee/tickets/${TICKET_ID}/attachments`, { method: "POST", body: fd });
        const j = await res.json();
        if (!res.ok || j.success === false) throw new Error(j.error || "Upload failed");

        const grid = q("#attachmentGrid");
        j.attachments.forEach((a) => {
          const fileName = (a.file_path || "").split("/").slice(-1)[0] || "file";
          const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName);
          const col = document.createElement("div");
          col.className = `col-12 ${isImg ? "col-sm-6" : ""} attachment-item`;
          col.dataset.attachId = a.id;
          col.innerHTML = `
            <div class="border rounded p-2 h-100">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="small text-muted">Uploaded just now</div>
                <button class="btn btn-sm btn-outline-danger delete-attachment" data-id="${a.id}">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
              ${
                isImg
                  ? `<a href="/attachments/${a.id}" target="_blank"><img src="/attachments/${a.id}" class="img-fluid rounded"></a>`
                  : `<a href="/attachments/${a.id}" target="_blank">${fileName}</a>`
              }
            </div>`;
          grid.prepend(col);
        });
        msg.textContent = "Uploaded.";
        bootstrap.Modal.getInstance(q("#addAttachmentsModal"))?.hide();
        e.target.reset();
      } catch (err) {
        msg.textContent = err.message;
      }
    });

    // ----- Delete attachment -----
    q("#attachmentGrid")?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".delete-attachment");
      if (!btn) return;
      if (!confirm("Delete this attachment?")) return;
      try {
        const res = await fetch(`/attachments/${btn.dataset.id}`, { method: "DELETE" });
        const j = await res.json();
        if (!res.ok || j.success === false) throw new Error(j.error || "Delete failed");
        btn.closest(".attachment-item")?.remove();
      } catch (err) {
        alert(err.message);
      }
    });
  }
});
