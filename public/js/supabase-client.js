let supabase = null;
let cloudinaryConfig = null;

export async function getSupabase() {
    if (supabase) return supabase;

    try {
        // Fetch keys from serverless function
        const res = await fetch('/api/config');
        const config = await res.json();
        
        // Save Cloudinary Config for later use
        cloudinaryConfig = {
            cloudName: config.cloudinaryName,
            preset: config.cloudinaryPreset
        };
        
        // Initialize Supabase Client
        supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
        return supabase;
    } catch (error) {
        console.error("Failed to init App Config", error);
    }
}

// New helper to get Cloudinary keys
export function getCloudinaryConfig() {
    return cloudinaryConfig;
}