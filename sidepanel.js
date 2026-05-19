const STORAGE_KEY = 'clipiq_data';
let clips = [];
let activeTab = 'all';
let searchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
    const saveBtn = document.getElementById('saveBtn');
    const clipInput = document.getElementById('clipInput');
    const searchInput = document.getElementById('searchInput');
    const tabs = document.querySelectorAll('.tab');

    // 1. Load data from Chrome memory
    const data = await chrome.storage.local.get(STORAGE_KEY);
    clips = data[STORAGE_KEY] || [];
    renderClips();

    // 2. Save Button Logic
    saveBtn.addEventListener('click', async () => {
        const text = clipInput.value.trim();
        if (text) {
            const newClip = {
                id: Date.now(),
                text: text,
                category: detectCategory(text)
            };
            clips.unshift(newClip); // Add to top of list
            await chrome.storage.local.set({ [STORAGE_KEY]: clips });
            clipInput.value = '';
            renderClips();
        }
    });

    // 3. Tab Clicking Logic
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.category;
            renderClips();
        });
    });

    // 4. Search Bar Logic
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderClips();
    });
});

// Detects if the text is an email, phone number, or normal text
function detectCategory(text) {
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) return 'emails';
    if (/[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/.test(text)) return 'phones';
    return 'text';
}

// Draws the clips onto the screen
function renderClips() {
    const container = document.getElementById('clipsContainer');
    container.innerHTML = '';

    const filtered = clips.filter(clip => {
        const matchesTab = activeTab === 'all' || clip.category === activeTab;
        const matchesSearch = clip.text.toLowerCase().includes(searchQuery);
        return matchesTab && matchesSearch;
    });

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

// Copy to clipboard functionality
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('copy-btn')) {
        navigator.clipboard.writeText(e.target.dataset.text);
        
        // Show success popup
        const toast = document.getElementById('toast');
        toast.style.display = 'block';
        e.target.textContent = 'Copied!';
        
        setTimeout(() => { 
            toast.style.display = 'none'; 
            e.target.textContent = 'Copy';
        }, 1500);
    }
});
