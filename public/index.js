const STORAGE_KEY = 'clipiq_google_sync';
let clips = [];
let activeTab = 'all';
let searchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
    const saveBtn = document.getElementById('saveBtn');
    const clipInput = document.getElementById('clipInput');
    const searchInput = document.getElementById('searchInput');
    const clearListBtn = document.getElementById('clearListBtn');
    const tabs = document.querySelectorAll('.tab');

    // 1. Fetch cloud data linked to active Google account login
    try {
        const data = await chrome.storage.sync.get(STORAGE_KEY);
        clips = data[STORAGE_KEY] || [];
        renderClips();
    } catch (err) {
        console.error("Cloud storage sync failed:", err);
    }

    // 2. Add New Clipboard Block
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const text = clipInput.value.trim();
            if (text) {
                const newClip = {
                    id: Date.now(),
                    text: text,
                    category: detectCategory(text)
                };
                clips.unshift(newClip);
                await chrome.storage.sync.set({ [STORAGE_KEY]: clips });
                clipInput.value = '';
                renderClips();
            }
        });
    }

    // 3. Category Filter Tabs
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.category;
            renderClips();
        });
    });

    // 4. Filter Items by Search Input
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            renderClips();
        });
    }

    // 5. Hard Reset Wipe Button
    if (clearListBtn) {
        clearListBtn.addEventListener('click', async () => {
            if (confirm("Are you sure you want to delete all stored clips across your cloud sync?")) {
                clips = [];
                await chrome.storage.sync.set({ [STORAGE_KEY]: clips });
                renderClips();
            }
        });
    }
});

function detectCategory(text) {
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) return 'emails';
    if (/[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/.test(text)) return 'phones';
    return 'text';
}

function renderClips() {
    const container = document.getElementById('clipsContainer');
    if (!container) return;
    container.innerHTML = '';

    const filtered = clips.filter(clip => {
        const matchesTab = activeTab === 'all' || clip.category === activeTab;
        const matchesSearch = clip.text.toLowerCase().includes(searchQuery);
        return matchesTab && matchesSearch;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div style="color:#475569; text-align:center; margin-top:30px; font-size:13px;">Empty list</div>';
        return;
    }

    filtered.forEach(clip => {
        const div = document.createElement('div');
        div.className = 'clip-item';
        div.innerHTML = `
            <div class="clip-text" title="${clip.text}">${clip.text}</div>
            <button class="copy-btn" data-text="${clip.text}">Copy</button>
        `;
        container.appendChild(div);
    });
}

// Global UI Copy actions
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('copy-btn')) {
        navigator.clipboard.writeText(e.target.dataset.text);
        
        const toast = document.getElementById('toast');
        if (toast) {
            toast.style.display = 'block';
            e.target.textContent = 'Copied!';
            setTimeout(() => { 
                toast.style.display = 'none'; 
                e.target.textContent = 'Copy';
            }, 1200);
        }
    }
});
