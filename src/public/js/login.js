import { jq, log } from './help.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());

    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: payload.username, password: payload.password })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Login failed');
      window.location.href = j.redirect || '/client';
    } catch (err) {
      alert(err.message);
    }
  });
});
