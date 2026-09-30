import { getSupabase, getCloudinaryConfig } from './supabase-client.js';

let sb;
let uploadedImages = []; 
let mainImageIndex = 0; 

async function initAdmin() {
    try {
        // 1. Initialize Supabase
        sb = await getSupabase();
        
        if (!sb) {
            console.error('Failed to initialize Supabase');
            alert('Configuration error. Please check your environment variables.');
            return;
        }

        // 2. Check Auth
        const { data: { session } } = await sb.auth.getSession();
        
        if (session) {
            showDashboard();
            // 3. Initialize Cloudinary ONLY after config is loaded
            initCloudinary();
        } else {
            document.getElementById('login-view').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Init error:', error);
        alert('Failed to initialize admin panel: ' + error.message);
    }
}

function initCloudinary() {
    const config = getCloudinaryConfig();
    
    if (!config || !config.cloudName || !config.preset) {
        console.error("Cloudinary config missing. Check Vercel Env Vars.");
        alert('Cloudinary not configured. Please set CLOUDINARY_CLOUD_NAME and CLOUDINARY_PRESET in Vercel environment variables.');
        return;
    }

    console.log('Initializing Cloudinary with:', config.cloudName);

    try {
        const myWidget = cloudinary.createUploadWidget({
            cloudName: config.cloudName, 
            uploadPreset: config.preset,
            sources: ['local', 'url', 'camera'],
            multiple: true,
            maxFiles: 6,
            clientAllowedFormats: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
            maxImageFileSize: 5000000, // 5MB
            folder: 'ecommerce-products'
        }, (error, result) => { 
            if (error) {
                console.error('Cloudinary error:', error);
                alert('Upload error: ' + error.message);
                return;
            }
            
            if (result && result.event === "success") { 
                console.log('Upload successful:', result.info.secure_url);
                addImageToState(result.info.secure_url);
            }
        });

        document.getElementById("upload_widget").addEventListener("click", (e) => {
            e.preventDefault();
            myWidget.open();
        }, false);
        
        console.log('Cloudinary widget initialized successfully');
    } catch (error) {
        console.error('Failed to create Cloudinary widget:', error);
        alert('Failed to initialize image uploader: ' + error.message);
    }
}

function addImageToState(url) {
    if (uploadedImages.length >= 6) {
        alert('Maximum 6 images allowed');
        return;
    }
    uploadedImages.push(url);
    renderImages();
}

function renderImages() {
    const container = document.getElementById('uploaded-images-container');
    if (!container) return;
    
    container.innerHTML = uploadedImages.map((url, idx) => `
        <div class="img-thumb ${idx === mainImageIndex ? 'selected' : ''}" onclick="setMainImage(${idx})">
            <img src="${url}" alt="">
            <span onclick="removeImage(${idx}, event)">X</span>
        </div>
    `).join('');
}

window.setMainImage = (idx) => {
    mainImageIndex = idx;
    renderImages();
};

window.removeImage = (idx, e) => {
    e.stopPropagation();
    uploadedImages.splice(idx, 1);
    if(mainImageIndex >= uploadedImages.length) mainImageIndex = 0;
    renderImages();
};

// --- AUTH & DASHBOARD LOGIC ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const { error } = await sb.auth.signInWithPassword({ 
            email: document.getElementById('email').value, 
            password: document.getElementById('password').value 
        });
        if (error) {
            console.error('Login error:', error);
            alert('Login failed: ' + error.message);
        } else {
            showDashboard();
            initCloudinary(); // Initialize Cloudinary after login
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.reload();
});

function showDashboard() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    showSection('products');
}

window.showSection = (section) => {
    ['products', 'categories', 'orders'].forEach(id => {
        const el = document.getElementById(`section-${id}`);
        if (el) el.classList.add('hidden');
    });
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === section));
    const target = document.getElementById(`section-${section}`);
    if (target) target.classList.remove('hidden');
    
    if (section === 'products') loadProducts();
    if (section === 'categories') loadCategories();
    if (section === 'orders') loadOrders();
};

// --- PRODUCT LOGIC ---
async function loadProducts() {
    try {
        const { data, error } = await sb.from('products').select('*').order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error loading products:', error);
            alert('Failed to load products: ' + error.message);
            return;
        }

        const list = document.getElementById('admin-products-list');
        if (!list) return;

        if (!data || data.length === 0) {
            list.innerHTML = '<p>No products yet. Create your first one above!</p>';
            return;
        }

        list.innerHTML = data.map(p => `
            <div class="admin-row">
                <div class="lead">
                    <img src="${p.image_url || '/img/product.jpg'}" alt="">
                    <div>
                        <strong>${p.name}</strong> (${p.price} DZD)<br>
                        <small>Stock: ${p.stock || 0} | <span class="${p.active ? 'on' : 'off'}">${p.active ? 'Active' : 'Inactive'}</span></small>
                    </div>
                </div>
                <div class="row-actions">
                    <button class="btn btn-outline btn-sm" onclick="editProduct(${p.id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Delete</button>
                </div>
            </div>
        `).join('');
        
        // Populate Categories
        const { data: cats } = await sb.from('categories').select('*');
        const sel = document.getElementById('p-category');
        if (sel && cats) {
            sel.innerHTML = '<option value="">Select Category</option>' + cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }
    } catch (error) {
        console.error('Error in loadProducts:', error);
        alert('Failed to load products: ' + error.message);
    }
}

window.resetProductForm = () => {
    const form = document.getElementById('product-form');
    if (form) form.reset();
    
    const idField = document.getElementById('p-id');
    if (idField) idField.value = '';
    
    uploadedImages = [];
    mainImageIndex = 0;
    renderImages();
};

window.editProduct = async (id) => {
    try {
        const { data, error } = await sb.from('products').select('*').eq('id', id).single();
        
        if (error || !data) {
            console.error('Error loading product:', error);
            alert('Failed to load product');
            return;
        }

        document.getElementById('p-id').value = data.id;
        document.getElementById('p-name').value = data.name;
        document.getElementById('p-price').value = data.price;
        document.getElementById('p-desc').value = data.description || '';
        document.getElementById('p-stock').value = data.stock || 0;
        document.getElementById('p-category').value = data.category_id || '';
        
        document.getElementById('p-sizes').value = data.sizes ? data.sizes.join(',') : '';
        document.getElementById('p-colors').value = data.colors ? data.colors.join(',') : '';

        uploadedImages = data.gallery || [];
        if(data.image_url && !uploadedImages.includes(data.image_url)) {
            uploadedImages.unshift(data.image_url);
        }
        mainImageIndex = uploadedImages.indexOf(data.image_url);
        if(mainImageIndex === -1) mainImageIndex = 0;
        renderImages();
    } catch (error) {
        console.error('Error in editProduct:', error);
        alert('Failed to edit product: ' + error.message);
    }
};

document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        if(uploadedImages.length === 0) { 
            alert('Please upload at least one image'); 
            return; 
        }

        const id = document.getElementById('p-id').value;
        const name = document.getElementById('p-name').value;
        const stock = parseInt(document.getElementById('p-stock').value) || 0;
        
        const sizes = document.getElementById('p-sizes').value.split(',').map(s=>s.trim()).filter(s=>s);
        const colors = document.getElementById('p-colors').value.split(',').map(s=>s.trim()).filter(s=>s);

        const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '') + '-' + Date.now();

        const payload = {
            name,
            price: parseFloat(document.getElementById('p-price').value),
            description: document.getElementById('p-desc').value,
            stock: stock,
            category_id: document.getElementById('p-category').value || null,
            image_url: uploadedImages[mainImageIndex],
            gallery: uploadedImages,
            sizes: sizes.length > 0 ? sizes : null,
            colors: colors.length > 0 ? colors : null,
            active: stock > 0
        };

        if (!id) payload.slug = slug;

        let result;
        if (id) {
            result = await sb.from('products').update(payload).eq('id', id);
        } else {
            result = await sb.from('products').insert([payload]);
        }

        if (result.error) {
            console.error('Save error:', result.error);
            alert('Failed to save product: ' + result.error.message);
            return;
        }

        alert('Product saved successfully!');
        resetProductForm();
        loadProducts();
    } catch (error) {
        console.error('Error saving product:', error);
        alert('Failed to save product: ' + error.message);
    }
});

window.deleteProduct = async (id) => {
    if(!confirm('Are you sure you want to delete this product?')) return;
    
    try {
        const { error } = await sb.from('products').delete().eq('id', id);
        
        if (error) {
            console.error('Delete error:', error);
            alert('Failed to delete: ' + error.message);
            return;
        }
        
        alert('Product deleted successfully');
        loadProducts();
    } catch (error) {
        console.error('Error deleting product:', error);
        alert('Failed to delete product: ' + error.message);
    }
};

// --- CATEGORIES & ORDERS LOGIC ---
async function loadCategories() {
    try {
        const { data, error } = await sb.from('categories').select('*');
        
        if (error) {
            console.error('Error loading categories:', error);
            return;
        }

        const list = document.getElementById('admin-cat-list');
        if (list) {
            list.innerHTML = data.map(c => `<li><span>${c.name}</span> <button class="btn btn-danger btn-sm" onclick="deleteCat(${c.id})">Delete</button></li>`).join('');
        }
    } catch (error) {
        console.error('Error in loadCategories:', error);
    }
}

document.getElementById('cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const name = document.getElementById('cat-name').value;
        const { error } = await sb.from('categories').insert([{ name }]);
        
        if (error) {
            console.error('Error adding category:', error);
            alert('Failed to add category: ' + error.message);
            return;
        }

        document.getElementById('cat-name').value = '';
        loadCategories();
    } catch (error) {
        console.error('Error in cat-form submit:', error);
        alert('Failed to add category: ' + error.message);
    }
});

window.deleteCat = async (id) => {
    if(!confirm('Delete this category?')) return;
    
    try {
        const { error } = await sb.from('categories').delete().eq('id', id);
        
        if (error) {
            console.error('Error deleting category:', error);
            alert('Failed to delete: ' + error.message);
            return;
        }
        
        loadCategories();
    } catch (error) {
        console.error('Error in deleteCat:', error);
        alert('Failed to delete category: ' + error.message);
    }
}

async function loadOrders() {
    try {
        const { data, error } = await sb.from('orders').select('*, products(name, stock)').order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error loading orders:', error);
            return;
        }

        const tbody = document.getElementById('orders-table-body');
        if (!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No orders yet</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(o => `
            <tr>
                <td>${new Date(o.created_at).toLocaleDateString()}</td>
                <td>${o.customer_name}<br>${o.wilaya}${o.baladia ? ', ' + o.baladia : ''}<br>${o.phone}</td>
                <td>${o.products?.name || 'N/A'}</td>
                <td>${o.total_price || 0} DZD</td>
                <td><span class="status-${o.status}">${o.status}</span></td>
                <td>
                    <button onclick="updateOrderStatus(${o.id}, 'delivered', ${o.product_id})" ${o.status === 'delivered' ? 'disabled' : ''} class="btn btn-sm">
                        Mark Delivered
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error in loadOrders:', error);
    }
}

window.updateOrderStatus = async (orderId, status, prodId) => {
    try {
        const { error: orderError } = await sb.from('orders').update({ status }).eq('id', orderId);
        
        if (orderError) {
            console.error('Error updating order:', orderError);
            alert('Failed to update order: ' + orderError.message);
            return;
        }

        if (status === 'delivered' && prodId) {
            const { data: prod } = await sb.from('products').select('stock').eq('id', prodId).single();
            if (prod) {
                const newStock = Math.max(0, (prod.stock || 0) - 1);
                await sb.from('products').update({ 
                    stock: newStock, 
                    active: newStock > 0 
                }).eq('id', prodId);
            }
        }
        
        loadOrders();
    } catch (error) {
        console.error('Error in updateOrderStatus:', error);
        alert('Failed to update order: ' + error.message);
    }
};

initAdmin();
