import { getSupabase } from './supabase-client.js';
import { esc, productCard } from './ui.js';

async function loadShop() {
    const sb = await getSupabase();
    const urlParams = new URLSearchParams(window.location.search);
    const selectedCat = urlParams.get('category');

    // 1. Filters
    const { data: categories } = await sb.from('categories').select('*');
    const filterList = document.getElementById('filter-list');
    filterList.innerHTML = `<a href="/shop" class="chip ${selectedCat ? '' : 'active'}">All</a>` +
        (categories || []).map(cat =>
            `<a href="/shop?category=${cat.id}" class="chip ${selectedCat == cat.id ? 'active' : ''}">${esc(cat.name)}</a>`
        ).join('');

    // 2. Fetch with sorting
    async function fetchProducts(sortType) {
        let query = sb.from('products').select('*').eq('active', true).gt('stock', 0);

        if (selectedCat) query = query.eq('category_id', selectedCat);

        if (sortType === 'high-low') query = query.order('price', { ascending: false });
        else if (sortType === 'low-high') query = query.order('price', { ascending: true });
        else query = query.order('created_at', { ascending: false });

        const { data: products } = await query;
        renderProducts(products);
    }

    function renderProducts(products) {
        const grid = document.getElementById('product-grid');
        if (!products || products.length === 0) {
            grid.innerHTML = '<p class="empty">No products found.</p>';
            return;
        }
        grid.innerHTML = products.map(productCard).join('');
    }

    fetchProducts('newest');

    document.getElementById('sort-select').addEventListener('change', (e) => {
        fetchProducts(e.target.value);
    });
}

loadShop();
