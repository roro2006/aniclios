// Note: This version is designed for Capacitor Native Apps
// It uses @capacitor/core and @capacitor-community/http to bypass CORS

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

// --- NATIVE SCRAPING LOGIC (Internalized from server.js) ---
const ALLANIME_BASE = 'allanime.day';
const ALLANIME_API = `https://api.${ALLANIME_BASE}`;
const ALLANIME_REFR = 'https://allmanga.to';
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';

const DECODE_MAP = {
    '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O', '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z',
    '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o', '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z',
    '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9',
    '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%'
};

function decodeProviderId(hex) {
    let result = '';
    for (let i = 0; i < hex.length; i += 2) {
        const h = hex.substring(i, i + 2);
        result += DECODE_MAP[h] || '';
    }
    return result.replace('/clock', '/clock.json');
}

// Wrapper for Native HTTP Calls
async function nativeGet(url, params = {}) {
    // If running in Capacitor, use the native plugin
    if (window.Capacitor && window.Capacitor.Plugins.CapacitorHttp) {
        const { CapacitorHttp } = window.Capacitor.Plugins;
        const options = {
            url,
            params,
            headers: { 'Referer': ALLANIME_REFR, 'User-Agent': AGENT }
        };
        const response = await CapacitorHttp.get(options);
        return response.data;
    } else {
        throw new Error("Native HTTP not available. Build as App first!");
    }
}

// --- APP LOGIC ---

async function searchAnime() {
    const query = searchInput.value.trim();
    if (!query) return;

    loadingDiv.style.display = 'block';
    resultsDiv.innerHTML = '';

    try {
        const search_gql = 'query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name thumbnail availableEpisodes __typename } }}';
        const data = await nativeGet(`${ALLANIME_API}/api`, {
            variables: JSON.stringify({
                search: { allowAdult: false, allowUnknown: false, query },
                limit: 40, page: 1, translationType: 'sub', countryOrigin: 'ALL'
            }),
            query: search_gql
        });
        
        const results = data.data.shows.edges;
        loadingDiv.style.display = 'none';
        
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
                <button class="watchlist-btn ${inWatchlist ? 'active' : ''}" data-id="${anime._id}" onclick="event.stopPropagation(); toggleWatchlist('${anime._id}', '${anime.name.replace(/'/g, "'")}', '${thumbnail}')">
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
    playerTitle.innerText = name;
    playerOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    episodesContainer.innerHTML = '<p class="loading">Loading episodes...</p>';
    
    try {
        const episodes_list_gql = 'query ($showId: String!) { show( _id: $showId ) { _id availableEpisodesDetail }}';
        const data = await nativeGet(`${ALLANIME_API}/api`, {
            variables: JSON.stringify({ showId: id }),
            query: episodes_list_gql
        });
        const episodes = data.data.show.availableEpisodesDetail.sub;
        
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
        const episode_embed_gql = 'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}';
        const gql_resp = await nativeGet(`${ALLANIME_API}/api`, {
            variables: JSON.stringify({ showId: currentAnimeId, translationType: 'sub', episodeString: ep }),
            query: episode_embed_gql
        });

        const sourceUrls = gql_resp.data.episode.sourceUrls;
        const allLinks = [];

        for (const source of sourceUrls) {
            if (!source.sourceUrl.startsWith('--')) continue;
            const provider_id = decodeProviderId(source.sourceUrl.substring(2));
            const resp = await nativeGet(`https://${ALLANIME_BASE}${provider_id}`);
            if (resp.links) {
                resp.links.forEach(l => {
                    allLinks.push({ quality: l.resolutionStr, url: l.link, isHLS: l.hls || l.link.includes('.m3u8') });
                });
            }
        }
        
        if (allLinks.length === 0) throw new Error("No links found");

        const bestLink = allLinks.find(l => l.quality === '1080p') || allLinks[0];
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
    } catch (err) {
        alert(`Failed to play: ${err.message}`);
    }
}

// (Remaining helper functions like saveToHistory, loadHistory, etc. stay the same...)
// (Add them back here or keep them in the file)

searchBtn.onclick = searchAnime;
searchInput.onkeypress = (e) => { if (e.key === 'Enter') searchAnime(); };
closePlayer.onclick = () => {
    playerOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
    videoPlayer.pause();
    if (hls) { hls.destroy(); hls = null; }
};

loadHistory();
loadWatchlist();
