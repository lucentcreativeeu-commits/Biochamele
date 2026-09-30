import { getSupabase } from './supabase-client.js';
import { esc, productCard, money, FALLBACK_IMG } from './ui.js';

let currentProduct = null;
const wilayas = [
    "01 - Adrar", "02 - Chlef", "03 - Laghouat", "04 - Oum El Bouaghi", "05 - Batna", "06 - Béjaïa", "07 - Biskra", "08 - Béchar", "09 - Blida", "10 - Bouira",
    "11 - Tamanrasset", "12 - Tébessa", "13 - Tlemcen", "14 - Tiaret", "15 - Tizi Ouzou", "16 - Alger", "17 - Djelfa", "18 - Jijel", "19 - Sétif", "20 - Saïda",
    "21 - Skikda", "22 - Sidi Bel Abbès", "23 - Annaba", "24 - Guelma", "25 - Constantine", "26 - Médéa", "27 - Mostaganem", "28 - M'Sila", "29 - Mascara", "30 - Ouargla",
    "31 - Oran", "32 - El Bayadh", "33 - Illizi", "34 - Bordj Bou Arreridj", "35 - Boumerdès", "36 - El Tarf", "37 - Tindouf", "38 - Tissemsilt", "39 - El Oued", "40 - Khenchela",
    "41 - Souk Ahras", "42 - Tipaza", "43 - Mila", "44 - Aïn Defla", "45 - Naâma", "46 - Aïn Témouchent", "47 - Ghardaïa", "48 - Relizane",
    "49 - Timimoun", "50 - Bordj Badji Mokhtar", "51 - Ouled Djellal", "52 - Béni Abbès", "53 - In Salah", "54 - In Guezzam", "55 - Touggourt", "56 - Djanet", "57 - El M'Ghair", "58 - El Meniaa",
    "59 - Aflou", "60 - Barika", "61 - El-Qantara", "62 - Bir El Ater", "63 - El Aricha", "64 - Ksar Chelala", "65 - Aïn Oussera", "66 - M'saâd", "67 - Ksar El Boukhari", "68 - Boussaâda", "69 - El Abiodh Sidi Cheikh"
];

async function loadProduct() {
    const sb = await getSupabase();
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');

    if (!slug) { window.location.href = '/shop'; return; }

    const { data, error } = await sb.from('products').select('*, categories(name)').eq('slug', slug).single();

    if (error || !data) {
        document.querySelector('main').innerHTML = "<div class='page-head'><h1 class='page-title'>Product not found</h1><p><a href='/shop'>Back to the collection</a></p></div>";
        return;
    }

    currentProduct = data;
    document.title = `${data.name} — Biochamelle`;

    // 1. Populate UI
    document.getElementById('p-name').innerText = data.name;
    document.getElementById('p-cat-name').innerText = data.categories?.name || 'General';
    document.getElementById('p-price').innerText = money(data.price);
    document.getElementById('p-desc').innerText = data.description;
    
    // Images
    const mainImg = document.getElementById('main-image');
    mainImg.src = data.image_url || FALLBACK_IMG;
    mainImg.alt = data.name;
    
    // Gallery
    if(data.gallery && data.gallery.length > 0) {
        const galContainer = document.getElementById('gallery-container');
        // Add main image to gallery too
        const allImages = [...new Set([data.image_url, ...data.gallery].filter(Boolean))];
        galContainer.innerHTML = allImages.map(img =>
            `<img src="${esc(img)}" alt="" onclick="document.getElementById('main-image').src='${esc(img)}'">`
        ).join('');
    }

    // Variants (Sizes/Colors)
    const varSection = document.getElementById('variants-section');
    if (data.sizes && data.sizes.length) {
        varSection.innerHTML += `<div><label>Size</label><select name="size">${data.sizes.map(s => `<option>${esc(s)}</option>`).join('')}</select></div>`;
    }
    if (data.colors && data.colors.length) {
        varSection.innerHTML += `<div><label>Color</label><select name="color">${data.colors.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>`;
    }

    // 2. Populate Wilayas
    const wSelect = document.getElementById('wilaya-select');
    wilayas.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w;
        opt.innerText = w;
        wSelect.appendChild(opt);
    });

    // 3. Initial Calc
    window.calculateTotal = () => {
        const delSelect = document.getElementById('delivery-select');
        const deliveryPrice = parseInt(delSelect.options[delSelect.selectedIndex].getAttribute('data-price')) || 0;
        const total = currentProduct.price + deliveryPrice;

        document.getElementById('summary-prod-price').innerText = currentProduct.price + ' DZD';
        document.getElementById('summary-shipping').innerText = deliveryPrice + ' DZD';
        document.getElementById('summary-total').innerText = total + ' DZD';
    };
    window.calculateTotal();

    // 4. Handle Order
    document.getElementById('order-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Stock Check Logic
        if (currentProduct.stock <= 0) {
            alert('Sorry, this product is currently out of stock.');
            return;
        }

        const formData = new FormData(e.target);
        
        // Gather Variant Selection
        const size = document.querySelector('[name="size"]')?.value || null;
        const color = document.querySelector('[name="color"]')?.value || null;
        
        const delSelect = document.getElementById('delivery-select');
        const deliveryPrice = parseInt(delSelect.options[delSelect.selectedIndex].getAttribute('data-price')) || 0;
        const total = currentProduct.price + deliveryPrice;

        const orderData = {
            customer_name: formData.get('customer_name'),
            phone: formData.get('phone'),
            wilaya: formData.get('wilaya'),
            baladia: formData.get('baladia'),
            address: formData.get('address'),
            delivery_type: formData.get('delivery_type'),
            total_price: total,
            quantity: 1, // Simple 1 qty for now as per form request
            product_id: currentProduct.id,
            status: 'new'
        };

        // Insert Order
        const { error: orderError } = await sb.from('orders').insert([orderData]);

        if (orderError) {
            alert('Error: ' + orderError.message);
        } else {
            // OPTIONAL: Reduce stock immediately? 
            // The prompt says "delivered orders reducing from stock". 
            // We will stick to the prompt's request to do it in Admin upon delivery.
            
            // WhatsApp
            const msg = `New Order!%0AProduct: ${currentProduct.name}%0APrice: ${total} DZD%0AName: ${orderData.customer_name}%0APhone: ${orderData.phone}%0AAddress: ${orderData.wilaya}, ${orderData.baladia}`;
            window.location.href = `https://wa.me/?text=${msg}`;
        }
    });

    // 5. Load Related Products ("You might also like")
    const { data: related } = await sb.from('products')
        .select('*')
        .eq('category_id', currentProduct.category_id)
        .neq('id', currentProduct.id) // Exclude current
        .limit(4);
    
    if (related && related.length > 0) {
        document.getElementById('related-products').innerHTML = related.map(productCard).join('');
    } else {
        document.querySelector('.related').remove();
    }
}

loadProduct();