import { getSupabase } from './supabase-client.js';
import { esc, productCard } from './ui.js';

async function loadHome() {
    const sb = await getSupabase();

    // 1. Search
    const handleSearch = async () => {
        const query = document.getElementById('search-input').value.trim();
        if (!query) return;

        const { data } = await sb.from('products')
            .select('slug')
            .ilike('name', `%${query}%`)
            .limit(1);

        if (data && data.length > 0) {
            window.location.href = `/product?slug=${data[0].slug}`;
        } else {
            alert('Product not found. Try looking in the shop.');
            window.location.href = `/shop`;
        }
    };
    document.getElementById('search-btn').addEventListener('click', handleSearch);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // 2. Categories (random 4)
    const { data: categories } = await sb.from('categories').select('*');
    const catContainer = document.getElementById('category-list');
    if (categories && categories.length) {
        const shuffled = categories.sort(() => 0.5 - Math.random()).slice(0, 4);
        catContainer.innerHTML = shuffled.map(cat =>
            `<a class="chip" href="/shop?category=${cat.id}">${esc(cat.name)}</a>`).join('');
    } else {
        catContainer.remove();
    }

    // 3. Products: active + in stock, newest first
    const { data: products } = await sb.from('products')
        .select('*')
        .eq('active', true)
        .gt('stock', 0)
        .order('created_at', { ascending: false })
        .limit(12);

    const list = products || [];
    const rail = document.getElementById('featured-products');
    rail.innerHTML = list.length ? list.map(productCard).join('') : '<p class="empty">No products yet.</p>';

    // Trending: 4 random from the same pool
    const trending = [...list].sort(() => 0.5 - Math.random()).slice(0, 4);
    document.getElementById('trending-products').innerHTML =
        trending.length ? trending.map(productCard).join('') : '<p class="empty">No products yet.</p>';

    // Carousel arrows
    const step = () => rail.clientWidth * 0.8;
    document.getElementById('rail-prev').addEventListener('click', () => rail.scrollBy({ left: -step(), behavior: 'smooth' }));
    document.getElementById('rail-next').addEventListener('click', () => rail.scrollBy({ left: step(), behavior: 'smooth' }));
}

loadHome();
