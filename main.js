// Supabase Configuration
// IMPORTANT: Replace these with your actual Supabase project credentials
const SUPABASE_URL = 'https://akfddcmtpunucxsdcgpm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZWOZhvbL3KYAtk8b8NiHPw_ah50vtnF';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Current user state
let currentUser = null;

// Helper to check auth state on page load
async function initAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;
    
    // Update navigation based on auth state
    updateNavigation();
    
    return user;
}

// Update navigation links based on login status
function updateNavigation() {
    const nav = document.querySelector('nav');
    if (!nav) return;
    
    if (currentUser) {
        nav.innerHTML = `
            <a href="homepage.html">Home</a>
            <a href="upload.html">Upload</a>
            <a href="dashboard.html">Dashboard</a>
            <a href="#" id="logout-btn">Sign Out</a>
            <a href="about.html">About</a>
        `;
        
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await supabase.auth.signOut();
                window.location.href = 'homepage.html';
            });
        }
    } else {
        nav.innerHTML = `
            <a href="homepage.html">Home</a>
            <a href="signup.html">Sign Up</a>
            <a href="signin.html">Sign In</a>
            <a href="about.html">About</a>
        `;
    }
}

// Track file view
async function trackView(fileId) {
    if (!currentUser) return;
    
    // Check if already viewed today to avoid duplicate counting
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
        .from('views')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('file_id', fileId)
        .gte('created_at', today)
        .limit(1);
    
    if (!existing || existing.length === 0) {
        await supabase.from('views').insert({
            user_id: currentUser.id,
            file_id: fileId
        });
        
        // Increment file view count
        await supabase.rpc('increment_file_views', { file_id: fileId });
    }
}

// Track download
async function trackDownload(fileId) {
    if (!currentUser) {
        alert('Please sign in to download files');
        return false;
    }
    
    const { error } = await supabase.from('downloads').insert({
        user_id: currentUser.id,
        file_id: fileId
    });
    
    if (!error) {
        await supabase.rpc('increment_file_downloads', { file_id: fileId });
        return true;
    }
    return false;
}

// Get file URL from storage
async function getFileUrl(filePath) {
    const { data } = supabase.storage.from('uploads').getPublicUrl(filePath);
    return data.publicUrl;
}

// Load content into horizontal scroll sections
async function loadHorizontalContent(containerId, query, titleKey = 'title') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const { data: files, error } = await supabase
        .from('files')
        .select(`
            *,
            profiles:user_id (username)
        `)
        .eq(...query)
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (error || !files || files.length === 0) {
        container.innerHTML = '<p style="color: #aaa;">No content available</p>';
        return;
    }
    
    container.innerHTML = files.map(file => `
        <article class="card" data-file-id="${file.id}">
            <img src="${file.thumbnail_url || 'https://placehold.co/560x320/2b2b2b/ffffff?text=' + encodeURIComponent(file.file_name)}" 
                 alt="${file.file_name}">
            <div class="card-body">
                <h3 class="card-title">${file.file_name}</h3>
                <div class="card-meta">
                    <p><strong>Uploaded by:</strong> ${file.profiles?.username || 'Unknown'}</p>
                    <p><strong>Date:</strong> ${new Date(file.created_at).toLocaleDateString()}</p>
                </div>
                <div class="card-tags">
                    <span class="rating">⭐ ${file.avg_rating || 'New'}</span>
                    <span class="tag-btn">${file.tag || 'General'}</span>
                </div>
                <button class="download-btn" data-file-id="${file.id}" data-file-name="${file.file_name}">Download</button>
            </div>
        </article>
    `).join('');
    
    // Attach download handlers
    container.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const fileId = btn.dataset.fileId;
            const fileName = btn.dataset.fileName;
            
            const { data: file } = await supabase
                .from('files')
                .select('storage_path')
                .eq('id', fileId)
                .single();
            
            if (file && await trackDownload(fileId)) {
                const url = await getFileUrl(file.storage_path);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                link.click();
            } else {
                alert('Download failed. Please try again.');
            }
        });
    });
    
    // Add click to card to go to playpage for video/ebook
    container.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('download-btn')) {
                const fileId = card.dataset.fileId;
                window.location.href = `playpage.html?id=${fileId}`;
            }
        });
    });
}

// Run on page load
document.addEventListener('DOMContentLoaded', async () => {
    await initAuth();
});