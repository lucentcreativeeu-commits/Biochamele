import { getSupabase } from './supabase-client.js';
import { esc, productCard } from './ui.js';

async function loadHome() {
    const sb = await getSupabase();

    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const handleSearch = async () => {
        if (!sb || !searchInput) return;
        const query = searchInput.value.trim();
        if (!query) return;

        const { data } = await sb.from('products')
            .select('slug')
            .ilike('name', `%${query}%`)
            .limit(1);

        if (data && data.length > 0) {
            window.location.href = `/product?slug=${data[0].slug}`;
        } else {
            alert('Produit introuvable. Essayez de parcourir la boutique.');
            window.location.href = `/shop`;
        }
    };
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', handleSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
    }

    const catContainer = document.getElementById('category-list');
    if (sb && catContainer) {
        const { data: categories } = await sb.from('categories').select('*');
        if (categories && categories.length) {
            const shuffled = [...categories].sort(() => 0.5 - Math.random()).slice(0, 4);
            catContainer.innerHTML = shuffled.map(cat =>
                `<a class="chip" href="/shop?category=${cat.id}">${esc(cat.name)}</a>`).join('');
        } else {
            catContainer.remove();
        }
    }

    const rail = document.getElementById('featured-products');
    if (sb && rail) {
        const { data: products } = await sb.from('products')
            .select('*')
            .eq('active', true)
            .gt('stock', 0)
            .order('created_at', { ascending: false })
            .limit(12);

        const list = products || [];
        rail.innerHTML = list.length ? list.map(productCard).join('') : '<p class="empty">Nos prochaines pépites arrivent très bientôt !</p>';

        const railPrev = document.getElementById('rail-prev');
        const railNext = document.getElementById('rail-next');
        const step = () => rail.clientWidth * 0.8;
        if (railPrev) railPrev.addEventListener('click', () => rail.scrollBy({ left: -step(), behavior: 'smooth' }));
        if (railNext) railNext.addEventListener('click', () => rail.scrollBy({ left: step(), behavior: 'smooth' }));

        const trending = document.getElementById('trending-products');
        if (trending) {
            const picks = [...list].sort(() => 0.5 - Math.random()).slice(0, 4);
            trending.innerHTML = picks.length ? picks.map(productCard).join('') : '<p class="empty">Nos prochaines pépites arrivent très bientôt !</p>';
        }
    }
}

loadHome();
