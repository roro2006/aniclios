const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const typeSelect = document.getElementById('type-select');
const resultsDiv = document.getElementById('results');
const loadingDiv = document.getElementById('loading');
const playerOverlay = document.getElementById('player-overlay');
const closePlayer = document.getElementById('close-player');
const videoPlayer = document.getElementById('video-player');
const episodesContainer = document.getElementById('episodes-container');
const playerTitle = document.getElementById('player-title');
const historyContainer = document.getElementById('history-container');
const historyList = document.getElementById('history-list');
const watchlistContainer = document.getElementById('watchlist-container');
const watchlistList = document.getElementById('watchlist-list');
const animeView = document.getElementById('anime-view');
const mangaView = document.getElementById('manga-view');
const mangaPages = document.getElementById('manga-pages');

let currentId = '';
let currentName = '';
let currentThumbnail = '';
let currentType = 'anime';
let hls = null;

const MANGA_THUMB_BASE = 'https://allanime.day/';

// Load History
function loadHistory() {
    const history = JSON.parse(localStorage.getItem('anicli-history') || '[]');
    if (history.length === 0) {
        historyContainer.style.display = 'none';
        return;
    }
    historyContainer.style.display = 'block';
    historyList.innerHTML = '';
    history.forEach(item => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.innerHTML = `
            <img src="${item.thumbnail}" alt="${item.name}">
            <h3>${item.name}</h3>
            <span>Last ${item.type === 'manga' ? 'Read' : 'Watched'}: Ep ${item.lastEp}</span>
            <span style="font-size: 0.6rem; color: var(--primary); text-transform: uppercase;">${item.type}</span>
        `;
        card.onclick = () => showPlayer(item.id, item.name, item.type, item.lastEp, item.thumbnail);
        historyList.appendChild(card);
    });
}

function saveToHistory(id, name, type, thumbnail, lastEp) {
    let history = JSON.parse(localStorage.getItem('anicli-history') || '[]');
    history = history.filter(item => item.id !== id);
    history.unshift({ id, name, type, thumbnail, lastEp });
    history = history.slice(0, 15);
    localStorage.setItem('anicli-history', JSON.stringify(history));
    loadHistory();
}

// Watchlist Logic
function loadWatchlist() {
    const watchlist = JSON.parse(localStorage.getItem('anicli-watchlist') || '[]');
    if (watchlist.length === 0) {
        watchlistContainer.style.display = 'none';
        return;
    }
    watchlistContainer.style.display = 'block';
    watchlistList.innerHTML = '';
    watchlist.forEach(item => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.innerHTML = `
            <img src="${item.thumbnail}" alt="${item.name}">
            <h3>${item.name}</h3>
            <span style="font-size: 0.6rem; color: var(--primary); text-transform: uppercase;">${item.type}</span>
            <button class="watchlist-btn active" onclick="event.stopPropagation(); toggleWatchlist('${item.id}', '${item.name}', '${item.type}', '${item.thumbnail}')">Remove</button>
        `;
        card.onclick = () => showPlayer(item.id, item.name, item.type, null, item.thumbnail);
        watchlistList.appendChild(card);
    });
}

function toggleWatchlist(id, name, type, thumbnail) {
    let watchlist = JSON.parse(localStorage.getItem('anicli-watchlist') || '[]');
    const exists = watchlist.some(item => item.id === id);
    
    if (exists) {
        watchlist = watchlist.filter(item => item.id !== id);
    } else {
        watchlist.unshift({ id, name, type, thumbnail });
    }
    
    localStorage.setItem('anicli-watchlist', JSON.stringify(watchlist));
    loadWatchlist();
    const btn = document.querySelector(`.watchlist-btn[data-id="${id}"]`);
    if (btn) {
        btn.innerText = exists ? 'Add to List' : 'In List';
        btn.classList.toggle('active', !exists);
    }
}

async function search() {
    const query = searchInput.value.trim();
    const type = typeSelect.value;
    if (!query) return;

    loadingDiv.style.display = 'block';
    resultsDiv.innerHTML = '';

    try {
        const resp = await fetch(`/api/search?query=${encodeURIComponent(query)}&type=${type}`);
        const results = await resp.json();
        
        loadingDiv.style.display = 'none';
        if (results.length === 0) {
            resultsDiv.innerHTML = '<p>No results found.</p>';
            return;
        }

        const watchlist = JSON.parse(localStorage.getItem('anicli-watchlist') || '[]');
        results.forEach(item => {
            const card = document.createElement('div');
            card.className = 'anime-card';
            let thumbnail = item.thumbnail;
            if (thumbnail && !thumbnail.startsWith('http')) {
                thumbnail = MANGA_THUMB_BASE + thumbnail;
            }
            if (!thumbnail) thumbnail = 'https://via.placeholder.com/200x250?text=No+Cover';
            
            const inList = watchlist.some(w => w.id === item._id);
            const count = type === 'manga' ? item.availableChapters.sub : item.availableEpisodes.sub;
            
            card.innerHTML = `
                <img src="${thumbnail}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/200x250?text=No+Cover'">
                <h3>${item.name}</h3>
                <span>${type === 'manga' ? 'Chapters' : 'Episodes'}: ${count || 0}</span>
                <button class="watchlist-btn ${inList ? 'active' : ''}" data-id="${item._id}" onclick="event.stopPropagation(); toggleWatchlist('${item._id}', '${item.name.replace(/'/g, "\\'")}', '${type}', '${thumbnail}')">
                    ${inList ? 'In List' : 'Add to List'}
                </button>
            `;
            card.onclick = () => showPlayer(item._id, item.name, type, null, thumbnail);
            resultsDiv.appendChild(card);
        });
    } catch (err) {
        loadingDiv.innerText = `Error: ${err.message}`;
    }
}

async function showPlayer(id, name, type, lastEp = null, thumbnail = null) {
    currentId = id;
    currentName = name;
    currentType = type;
    if (thumbnail) currentThumbnail = thumbnail;
    
    playerTitle.innerText = name;
    playerOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    if (type === 'manga') {
        animeView.style.display = 'none';
        mangaView.style.display = 'flex';
        videoPlayer.pause();
    } else {
        animeView.style.display = 'flex';
        mangaView.style.display = 'none';
    }
    
    episodesContainer.innerHTML = '<p class="loading">Loading...</p>';
    
    try {
        const resp = await fetch(`/api/episodes?id=${id}&type=${type}`);
        const episodes = await resp.json();
        
        episodesContainer.innerHTML = '';
        episodes.sort((a,b) => parseFloat(a) - parseFloat(b)).forEach(ep => {
            const btn = document.createElement('button');
            btn.className = 'ep-btn';
            btn.innerText = (type === 'manga' ? 'Ch ' : 'Ep ') + ep;
            btn.onclick = () => {
                if (type === 'manga') playChapter(ep, btn);
                else playEpisode(ep, btn);
            };
            episodesContainer.appendChild(btn);
        });

        if (episodes.length > 0) {
            const targetEp = lastEp || episodes[0];
            const targetBtn = Array.from(episodesContainer.children).find(b => b.innerText.includes(targetEp)) || episodesContainer.firstChild;
            if (type === 'manga') playChapter(targetEp, targetBtn);
            else playEpisode(targetEp, targetBtn);
        }
    } catch (err) {
        episodesContainer.innerText = `Error: ${err.message}`;
    }
}

async function playEpisode(ep, btn) {
    document.querySelectorAll('.ep-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    saveToHistory(currentId, currentName, 'anime', currentThumbnail, ep);
    
    try {
        const resp = await fetch(`/api/links?id=${currentId}&ep=${ep}`);
        const links = await resp.json();
        if (links.length === 0) return alert('No links found.');

        const bestLink = links.find(l => l.quality === '1080p') || links[0];
        const streamUrl = bestLink.url;

        if (hls) hls.destroy();
        if (bestLink.isHLS && Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(streamUrl);
            hls.attachMedia(videoPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, () => videoPlayer.play());
        } else {
            videoPlayer.src = streamUrl;
            videoPlayer.play();
        }
    } catch (err) { alert(`Error: ${err.message}`); }
}

async function playChapter(ch, btn) {
    document.querySelectorAll('.ep-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    saveToHistory(currentId, currentName, 'manga', currentThumbnail, ch);
    
    // Redirect to the new nice reader UI
    const url = `reader.html?id=${encodeURIComponent(currentId)}&ch=${encodeURIComponent(ch)}&title=${encodeURIComponent(currentName)}`;
    window.location.href = url;
}

searchBtn.onclick = search;
searchInput.onkeypress = (e) => { if (e.key === 'Enter') search(); };

closePlayer.onclick = () => {
    playerOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
    videoPlayer.pause();
    if (hls) { hls.destroy(); hls = null; }
};

loadHistory();
loadWatchlist();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js');
  });
}
