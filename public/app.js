const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
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

let currentAnimeId = '';
let currentAnimeName = '';
let currentThumbnail = '';
let hls = null;

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
            <span>Last Watched: Ep ${item.lastEp}</span>
        `;
        card.onclick = () => showPlayer(item.id, item.name, item.lastEp);
        historyList.appendChild(card);
    });
}

function saveToHistory(id, name, thumbnail, lastEp) {
    let history = JSON.parse(localStorage.getItem('anicli-history') || '[]');
    // Remove existing entry
    history = history.filter(item => item.id !== id);
    // Add to front
    history.unshift({ id, name, thumbnail, lastEp });
    // Keep last 10
    history = history.slice(0, 10);
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
            <span>Added to Watchlist</span>
            <button class="watchlist-btn active" onclick="event.stopPropagation(); toggleWatchlist('${item.id}', '${item.name}', '${item.thumbnail}')">Remove</button>
        `;
        card.onclick = () => showPlayer(item.id, item.name, null, item.thumbnail);
        watchlistList.appendChild(card);
    });
}

function toggleWatchlist(id, name, thumbnail) {
    let watchlist = JSON.parse(localStorage.getItem('anicli-watchlist') || '[]');
    const exists = watchlist.some(item => item.id === id);
    
    if (exists) {
        watchlist = watchlist.filter(item => item.id !== id);
    } else {
        watchlist.unshift({ id, name, thumbnail });
    }
    
    localStorage.setItem('anicli-watchlist', JSON.stringify(watchlist));
    loadWatchlist();
    // Update button in search if visible
    const searchBtn = document.querySelector(`.watchlist-btn[data-id="${id}"]`);
    if (searchBtn) {
        searchBtn.innerText = exists ? 'Add to Watchlist' : 'In Watchlist';
        searchBtn.classList.toggle('active', !exists);
    }
}

async function searchAnime() {
    const query = searchInput.value.trim();
    if (!query) return;

    loadingDiv.style.display = 'block';
    resultsDiv.innerHTML = '';

    try {
        const resp = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
        const results = await resp.json();
        
        loadingDiv.style.display = 'none';
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<p>No results found.</p>';
            return;
        }

        const watchlist = JSON.parse(localStorage.getItem('anicli-watchlist') || '[]');
        results.forEach(anime => {
            const card = document.createElement('div');
            card.className = 'anime-card';
            const thumbnail = anime.thumbnail || 'https://via.placeholder.com/200x250?text=No+Cover';
            const inWatchlist = watchlist.some(item => item.id === anime._id);
            card.innerHTML = `
                <img src="${thumbnail}" alt="${anime.name}" onerror="this.src='https://via.placeholder.com/200x250?text=No+Cover'">
                <h3>${anime.name}</h3>
                <span>Episodes: ${anime.availableEpisodes.sub || 0}</span>
                <button class="watchlist-btn ${inWatchlist ? 'active' : ''}" data-id="${anime._id}" onclick="event.stopPropagation(); toggleWatchlist('${anime._id}', '${anime.name.replace(/'/g, "\\'")}', '${thumbnail}')">
                    ${inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                </button>
            `;
            card.onclick = () => showPlayer(anime._id, anime.name, null, thumbnail);
            resultsDiv.appendChild(card);
        });
    } catch (err) {
        loadingDiv.innerText = `Error: ${err.message}`;
    }
}

async function showPlayer(id, name, lastEp = null, thumbnail = null) {
    currentAnimeId = id;
    currentAnimeName = name;
    if (thumbnail) currentThumbnail = thumbnail;
    else {
        const history = JSON.parse(localStorage.getItem('anicli-history') || '[]');
        const histItem = history.find(item => item.id === id);
        if (histItem) currentThumbnail = histItem.thumbnail;
    }
    
    playerTitle.innerText = name;
    playerOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    episodesContainer.innerHTML = '<p class="loading">Loading episodes...</p>';
    
    try {
        const resp = await fetch(`/api/episodes?id=${id}`);
        const episodes = await resp.json();
        
        episodesContainer.innerHTML = '';
        episodes.sort((a,b) => parseFloat(a) - parseFloat(b)).forEach(ep => {
            const btn = document.createElement('button');
            btn.className = 'ep-btn';
            btn.innerText = `Ep ${ep}`;
            btn.onclick = () => playEpisode(ep, btn);
            episodesContainer.appendChild(btn);
        });

        if (episodes.length > 0) {
            const targetEp = lastEp || episodes[0];
            const targetBtn = Array.from(episodesContainer.children).find(b => b.innerText === `Ep ${targetEp}`) || episodesContainer.firstChild;
            playEpisode(targetEp, targetBtn);
        }
    } catch (err) {
        episodesContainer.innerText = `Error: ${err.message}`;
    }
}

async function playEpisode(ep, btn) {
    document.querySelectorAll('.ep-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    saveToHistory(currentAnimeId, currentAnimeName, currentThumbnail, ep);
    
    try {
        const resp = await fetch(`/api/links?id=${currentAnimeId}&ep=${ep}`);
        const links = await resp.json();
        
        if (links.length === 0) {
            alert('No links found for this episode.');
            return;
        }

        const bestLink = links.find(l => l.quality === '1080p') || links[0];
        const streamUrl = bestLink.url;

        if (hls) {
            hls.destroy();
            hls = null;
        }

        if (bestLink.isHLS && Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(streamUrl);
            hls.attachMedia(videoPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoPlayer.play();
            });
        } else {
            videoPlayer.src = streamUrl;
            videoPlayer.play();
        }
    } catch (err) {
        alert(`Failed to play episode: ${err.message}`);
    }
}

searchBtn.onclick = searchAnime;
searchInput.onkeypress = (e) => { if (e.key === 'Enter') searchAnime(); };

closePlayer.onclick = () => {
    playerOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
    videoPlayer.pause();
    if (hls) {
        hls.destroy();
        hls = null;
    }
};

loadHistory();
loadWatchlist();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js');
  });
}
