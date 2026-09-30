// Shared render helpers (no backend logic)
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => `${Number(n || 0).toLocaleString('en-US')} DZD`;
export const FALLBACK_IMG = '/img/product.jpg';
export const productCard = (p) => `
  <a class="pcard" href="/product?slug=${encodeURIComponent(p.slug)}">
    <div class="pcard-img"><img src="${esc(p.image_url || FALLBACK_IMG)}" alt="${esc(p.name)}" loading="lazy"></div>
    <h3>${esc(p.name)}</h3>
    <div class="price">${money(p.price)}</div>
  </a>`;
