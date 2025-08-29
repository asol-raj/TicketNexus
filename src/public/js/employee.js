function updateElapsed() {
  const el = document.querySelector(".text-info");
  if (!el) return;
  const txt = el.textContent;
  const m = txt.match(/Elapsed:\s+(\d+)/i);
  if (!m) return;
  let minutes = parseInt(m[1], 10);
  minutes = isNaN(minutes) ? 0 : minutes + 1;
  el.textContent = `Elapsed: ${minutes} minutes`;
}

function renderPie() {
  const holder = document.getElementById("chartData");
  const canvas = document.getElementById("myTicketsChart");
  if (!holder || !canvas || !window.Chart) return;

  const open = Number(holder.dataset.open || 0);
  const inprogress = Number(holder.dataset.inprogress || 0);
  const resolved = Number(holder.dataset.resolved || 0);
  const closed = Number(holder.dataset.closed || 0);

  const total = open + inprogress + resolved + closed;
  if (total === 0) {
    // nothing to chart; leave canvas blank
    return;
  }

  // Chart.js pie
  new Chart(canvas.getContext("2d"), {
    type: "pie",
    data: {
      labels: ["Open", "In Progress", "Resolved", "Closed"],
      datasets: [{
        data: [open, inprogress, resolved, closed],
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        title: { display: false }
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Update elapsed minutes every minute
  setInterval(updateElapsed, 60000);
  // Draw chart once
  renderPie();
});
