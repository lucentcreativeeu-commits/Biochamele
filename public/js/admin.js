import { getSupabase, getCloudinaryConfig } from './supabase-client.js';
import { esc, money, FALLBACK_IMG } from './ui.js';

const LOW_STOCK = 5; // keep in sync with admin_stats() in schema.sql
const MAX_IMAGES = 6;
const ORDER_STATUSES = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'];

let sb;
let uploadedImages = [];
let mainImageIndex = 0;
let cloudinaryReady = false;
let productsCache = [];
let ordersCache = [];
let categoriesCache = [];

const $ = (id) => document.getElementById(id);

// ---------- helpers ----------
function toast(msg, isError = false) {
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' toast-error' : '');
    t.textContent = (isError ? '⚠ ' : '') + msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
}

const fail = (label, error) => {
    console.error(label, error);
    toast(`${label}: ${error?.message || error}`, true);
};

// Algerian numbers: 0555 12 34 56 -> 213555123456
const waNumber = (phone) => {
    const d = String(phone || '').replace(/\D/g, '');
    return d.startsWith('0') ? '213' + d.slice(1) : d;
};

const slugify = (name) =>
    (name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product') + '-' + Date.now().toString(36);

// ---------- init / auth ----------
async function initAdmin() {
    sb = await getSupabase();
    if (!sb) { toast('Configuration error: check your environment variables', true); return; }

    const { data: { session } } = await sb.auth.getSession();
    if (session) await enterDashboard();
    else $('login-view').classList.remove('hidden');
}

async function enterDashboard() {
    const { data: isAdmin, error } = await sb.rpc('is_admin');
    if (error || !isAdmin) {
        await sb.auth.signOut();
        $('dashboard-view').classList.add('hidden');
        $('login-view').classList.remove('hidden');
        toast('This account does not have admin access', true);
        return;
    }
    $('login-view').classList.add('hidden');
    $('dashboard-view').classList.remove('hidden');
    initCloudinary();
    showSection('products');
}

$('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({
        email: $('email').value.trim(),
        password: $('password').value
    });
    if (error) return fail('Login failed', error);
    await enterDashboard();
});

$('logout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.reload();
});

window.showSection = (section) => {
    ['products', 'categories', 'orders'].forEach((id) => $(`section-${id}`).classList.add('hidden'));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === section));
    $(`section-${section}`).classList.remove('hidden');

    loadStats();
    if (section === 'products') loadProducts();
    if (section === 'categories') loadCategories();
    if (section === 'orders') loadOrders();
};

// ---------- dashboard stats ----------
async function loadStats() {
    const { data, error } = await sb.rpc('admin_stats');
    if (error || !data) return;
    const items = [
        ['New orders', data.orders_new],
        ['Delivered revenue (30 days)', money(data.revenue_30d)],
        ['Low stock', data.low_stock],
        ['Out of stock', data.out_of_stock]
    ];
    $('stats').innerHTML = items.map(([label, value]) =>
        `<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
}

// ---------- images (Cloudinary) ----------
function initCloudinary() {
    if (cloudinaryReady) return;
    const config = getCloudinaryConfig();
    if (!config?.cloudName || !config?.preset) {
        toast('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_PRESET)', true);
        return;
    }
    const widget = cloudinary.createUploadWidget({
        cloudName: config.cloudName,
        uploadPreset: config.preset,
        sources: ['local', 'url', 'camera'],
        multiple: true,
        maxFiles: MAX_IMAGES,
        clientAllowedFormats: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
        maxImageFileSize: 5000000,
        folder: 'ecommerce-products'
    }, (error, result) => {
        if (error) return fail('Upload error', error);
        if (result?.event === 'success') addImageToState(result.info.secure_url);
    });

    $('upload_widget').addEventListener('click', (e) => { e.preventDefault(); widget.open(); });
    cloudinaryReady = true;
}

function addImageToState(url) {
    if (uploadedImages.length >= MAX_IMAGES) return toast(`Maximum ${MAX_IMAGES} images`, true);
    uploadedImages.push(url);
    renderImages();
}

function renderImages() {
    $('uploaded-images-container').innerHTML = uploadedImages.map((url, idx) => `
        <div class="img-thumb ${idx === mainImageIndex ? 'selected' : ''}" onclick="setMainImage(${idx})">
            <img src="${esc(url)}" alt="">
            <span onclick="removeImage(${idx}, event)">X</span>
        </div>`).join('');
}

window.setMainImage = (idx) => { mainImageIndex = idx; renderImages(); };

window.removeImage = (idx, e) => {
    e.stopPropagation();
    uploadedImages.splice(idx, 1);
    if (idx < mainImageIndex) mainImageIndex--;
    else if (idx === mainImageIndex) mainImageIndex = 0;
    renderImages();
};

// ---------- products ----------
async function loadProducts() {
    const [{ data: products, error }, { data: cats }] = await Promise.all([
        sb.from('products').select('*, categories(name)').order('created_at', { ascending: false }),
        sb.from('categories').select('*').order('name')
    ]);
    if (error) return fail('Failed to load products', error);

    productsCache = products || [];
    const sel = $('p-category');
    const current = sel.value;
    sel.innerHTML = '<option value="">No category</option>' +
        (cats || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value = current;

    renderProducts();
}

function renderProducts() {
    const q = $('product-search').value.trim().toLowerCase();
    const f = $('product-filter').value;

    const list = productsCache.filter((p) => {
        if (q && !p.name.toLowerCase().includes(q)) return false;
        if (f === 'active') return p.active;
        if (f === 'inactive') return !p.active;
        if (f === 'low') return p.stock > 0 && p.stock <= LOW_STOCK;
        if (f === 'out') return p.stock === 0;
        return true;
    });

    $('admin-products-list').innerHTML = list.length ? list.map((p) => `
        <div class="admin-row">
            <div class="lead">
                <img src="${esc(p.image_url || FALLBACK_IMG)}" alt="">
                <div>
                    <strong>${esc(p.name)}</strong> (${money(p.price)})<br>
                    <small>${esc(p.categories?.name || 'No category')} |
                    <span class="${p.active ? 'on' : 'off'}">${p.active ? 'Active' : 'Hidden'}</span>
                    ${p.stock === 0 ? ' | <b>Out of stock</b>' : p.stock <= LOW_STOCK ? ' | <b>Low stock</b>' : ''}</small>
                </div>
            </div>
            <div class="row-actions">
                <input type="number" min="0" class="stock-input" value="${p.stock}" title="Stock"
                       onchange="updateStock(${p.id}, this.value)">
                <button class="btn btn-outline btn-sm" onclick="toggleActive(${p.id})">${p.active ? 'Hide' : 'Show'}</button>
                <button class="btn btn-outline btn-sm" onclick="editProduct(${p.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Delete</button>
            </div>
        </div>`).join('') : '<p class="empty">No products match.</p>';
}

$('product-search').addEventListener('input', renderProducts);
$('product-filter').addEventListener('change', renderProducts);

window.updateStock = async (id, value) => {
    const stock = Math.max(0, parseInt(value, 10) || 0);
    const { error } = await sb.from('products').update({ stock }).eq('id', id);
    if (error) return fail('Failed to update stock', error);
    toast('Stock updated');
    loadProducts();
    loadStats();
};

window.toggleActive = async (id) => {
    const p = productsCache.find((x) => x.id === id);
    if (!p) return;
    const { error } = await sb.from('products').update({ active: !p.active }).eq('id', id);
    if (error) return fail('Failed to update product', error);
    loadProducts();
    loadStats();
};

window.resetProductForm = () => {
    $('product-form').reset();
    $('p-id').value = '';
    $('form-title').textContent = 'Add product';
    uploadedImages = [];
    mainImageIndex = 0;
    renderImages();
};

window.editProduct = (id) => {
    const p = productsCache.find((x) => x.id === id);
    if (!p) return;

    $('p-id').value = p.id;
    $('p-name').value = p.name;
    $('p-price').value = p.price;
    $('p-desc').value = p.description || '';
    $('p-stock').value = p.stock;
    $('p-category').value = p.category_id || '';
    $('p-sizes').value = (p.sizes || []).join(',');
    $('p-colors').value = (p.colors || []).join(',');
    $('p-active').checked = p.active;
    $('form-title').textContent = `Editing: ${p.name}`;

    uploadedImages = [...(p.gallery || [])];
    if (p.image_url && !uploadedImages.includes(p.image_url)) uploadedImages.unshift(p.image_url);
    mainImageIndex = Math.max(0, uploadedImages.indexOf(p.image_url));
    renderImages();
    $('product-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

$('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!uploadedImages.length) return toast('Please upload at least one image', true);

    const id = $('p-id').value;
    const name = $('p-name').value.trim();
    const price = parseFloat($('p-price').value);
    const stock = parseInt($('p-stock').value, 10);
    if (!name || !(price >= 0) || !(stock >= 0)) return toast('Check name, price and stock', true);

    const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
    const sizes = list($('p-sizes').value);
    const colors = list($('p-colors').value);

    const payload = {
        name,
        price,
        stock,
        description: $('p-desc').value.trim(),
        category_id: $('p-category').value || null,
        image_url: uploadedImages[mainImageIndex],
        gallery: uploadedImages,
        sizes: sizes.length ? sizes : null,
        colors: colors.length ? colors : null,
        active: $('p-active').checked
    };
    if (!id) payload.slug = slugify(name);

    const { error } = id
        ? await sb.from('products').update(payload).eq('id', id)
        : await sb.from('products').insert([payload]);
    if (error) return fail('Failed to save product', error);

    toast('Product saved');
    resetProductForm();
    loadProducts();
    loadStats();
});

window.deleteProduct = async (id) => {
    if (!confirm('Delete this product? Past orders are kept. (Use "Hide" if you only want it off the shop.)')) return;
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) return fail('Failed to delete', error);
    toast('Product deleted');
    loadProducts();
    loadStats();
};

// ---------- categories ----------
async function loadCategories() {
    const { data, error } = await sb.from('categories').select('*, products(count)').order('name');
    if (error) return fail('Failed to load categories', error);

    categoriesCache = data || [];
    $('admin-cat-list').innerHTML = categoriesCache.map((c) => {
        const count = c.products?.[0]?.count ?? 0;
        return `<li><span>${esc(c.name)} <small>(${count} products)</small></span>
            <span>
                <button class="btn btn-outline btn-sm" onclick="renameCat(${c.id})">Rename</button>
                <button class="btn btn-danger btn-sm" onclick="deleteCat(${c.id}, ${count})">Delete</button>
            </span></li>`;
    }).join('') || '<li>No categories yet.</li>';
}

$('cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('cat-name').value.trim();
    if (!name) return;
    const { error } = await sb.from('categories').insert([{ name }]);
    if (error) return fail('Failed to add category', error);
    $('cat-name').value = '';
    loadCategories();
});

window.renameCat = async (id) => {
    const current = categoriesCache.find((c) => c.id === id)?.name || '';
    const name = prompt('New category name', current)?.trim();
    if (!name || name === current) return;
    const { error } = await sb.from('categories').update({ name }).eq('id', id);
    if (error) return fail('Failed to rename', error);
    loadCategories();
};

window.deleteCat = async (id, count) => {
    const msg = count
        ? `This category has ${count} product(s). They will stay but have no category. Delete it?`
        : 'Delete this category?';
    if (!confirm(msg)) return;
    const { error } = await sb.from('categories').delete().eq('id', id);
    if (error) return fail('Failed to delete', error);
    loadCategories();
};

// ---------- orders ----------
async function loadOrders() {
    const { data, error } = await sb.from('orders').select('*')
        .order('created_at', { ascending: false }).limit(500);
    if (error) return fail('Failed to load orders', error);
    ordersCache = data || [];
    renderOrders();
}

function filteredOrders() {
    const q = $('order-search').value.trim().toLowerCase();
    const f = $('order-filter').value;
    return ordersCache.filter((o) =>
        (!f || o.status === f) &&
        (!q || [o.customer_name, o.phone, o.wilaya, o.product_name].some((v) => String(v || '').toLowerCase().includes(q))));
}

function renderOrders() {
    const rows = filteredOrders();
    $('orders-table-body').innerHTML = rows.length ? rows.map((o) => `
        <tr>
            <td>${new Date(o.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td>
                <strong>${esc(o.customer_name)}</strong><br>
                <span class="phone-links">${esc(o.phone)}
                    <a href="tel:${esc(o.phone)}">Call</a>
                    <a href="https://wa.me/${waNumber(o.phone)}" target="_blank" rel="noopener">WhatsApp</a></span><br>
                ${esc(o.wilaya)}${o.baladia ? ', ' + esc(o.baladia) : ''}${o.address ? '<br>' + esc(o.address) : ''}
                ${o.delivery_type ? `<br><small>${esc(o.delivery_type)}</small>` : ''}
                ${o.notes ? `<br><small class="order-note">Note: ${esc(o.notes)}</small>` : ''}
            </td>
            <td>${esc(o.product_name || 'Deleted product')} × ${o.quantity}
                ${o.size || o.color ? `<br><small>${esc([o.size, o.color].filter(Boolean).join(' / '))}</small>` : ''}</td>
            <td>${money(o.total_price)}</td>
            <td>
                <select class="status-${esc(o.status)}" onchange="setOrderStatus(${o.id}, this.value)">
                    ${ORDER_STATUSES.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </td>
            <td><button class="btn btn-outline btn-sm" onclick="editNote(${o.id})">Note</button></td>
        </tr>`).join('') : '<tr><td colspan="6">No orders match.</td></tr>';
}

$('order-search').addEventListener('input', renderOrders);
$('order-filter').addEventListener('change', renderOrders);

// Stock is adjusted by a database trigger when an order enters/leaves "delivered".
window.setOrderStatus = async (id, status) => {
    const { error } = await sb.from('orders').update({ status }).eq('id', id);
    if (error) fail('Failed to update order', error);
    else toast(status === 'delivered' ? 'Delivered — stock updated' : 'Order updated');
    loadOrders();
    loadStats();
};

window.editNote = async (id) => {
    const o = ordersCache.find((x) => x.id === id);
    const notes = prompt('Internal note', o?.notes || '');
    if (notes === null) return;
    const { error } = await sb.from('orders').update({ notes: notes.trim() || null }).eq('id', id);
    if (error) return fail('Failed to save note', error);
    loadOrders();
};

$('export-orders').addEventListener('click', () => {
    const cell = (v) => {
        let s = String(v ?? '');
        if (/^[=+\-@]/.test(s)) s = "'" + s; // avoid spreadsheet formula injection
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['Date', 'Customer', 'Phone', 'Wilaya', 'Baladia', 'Address', 'Product', 'Qty', 'Size', 'Color', 'Total', 'Status', 'Note'];
    const lines = filteredOrders().map((o) => [
        new Date(o.created_at).toISOString(), o.customer_name, o.phone, o.wilaya, o.baladia, o.address,
        o.product_name, o.quantity, o.size, o.color, o.total_price, o.status, o.notes
    ].map(cell).join(','));

    const blob = new Blob(['\uFEFF' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
});

initAdmin();