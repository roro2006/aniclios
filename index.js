const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

const ALLANIME_BASE = 'allanime.day';
const ALLANIME_API = `https://api.${ALLANIME_BASE}`;
const ALLANIME_REFR = 'https://allmanga.to';
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';

// Consumet API for reliable Manga support
const CONSUMET_URL = 'https://api.consumet.org/manga/mangadex';

// Hex-to-Char map for AllAnime Anime Decoding
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

// --- API ENDPOINTS ---

app.get('/api/search', async (req, res) => {
    const { query, type } = req.query;
    try {
        if (type === 'manga') {
            const response = await axios.get(`${CONSUMET_URL}/${encodeURIComponent(query)}`);
            // Format Consumet results to match our app structure
            const results = response.data.results.map(item => ({
                _id: item.id,
                name: item.title,
                thumbnail: item.image,
                availableChapters: { sub: '?' }, // Consumet details endpoint gives real count
                __typename: 'Manga'
            }));
            res.json(results);
        } else {
            const search_gql = 'query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name thumbnail availableEpisodes __typename } }}';
            const response = await axios.get(`${ALLANIME_API}/api`, {
                params: {
                    variables: JSON.stringify({
                        search: { allowAdult: false, allowUnknown: false, query },
                        limit: 40, page: 1, translationType: 'sub', countryOrigin: 'ALL'
                    }),
                    query: search_gql
                },
                headers: { 'Referer': ALLANIME_REFR, 'User-Agent': AGENT }
            });
            res.json(response.data.data.shows.edges);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/episodes', async (req, res) => {
    const { id, type } = req.query;
    try {
        if (type === 'manga') {
            const response = await axios.get(`${CONSUMET_URL}/info/${id}`);
            // Consumet returns chapters as an array of objects { id, title, chapterNumber }
            const chapters = response.data.chapters.map(c => c.chapterNumber || c.id);
            res.json(chapters);
        } else {
            const episodes_list_gql = 'query ($showId: String!) { show( _id: $showId ) { _id availableEpisodesDetail }}';
            const response = await axios.get(`${ALLANIME_API}/api`, {
                params: {
                    variables: JSON.stringify({ showId: id }),
                    query: episodes_list_gql
                },
                headers: { 'Referer': ALLANIME_REFR, 'User-Agent': AGENT }
            });
            res.json(response.data.data.show.availableEpisodesDetail.sub);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/links', async (req, res) => {
    const { id, ep } = req.query;
    const episode_embed_gql = 'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}';
    
    try {
        const gql_resp = await axios.get(`${ALLANIME_API}/api`, {
            params: {
                variables: JSON.stringify({ showId: id, translationType: 'sub', episodeString: ep }),
                query: episode_embed_gql
            },
            headers: { 'Referer': ALLANIME_REFR, 'User-Agent': AGENT }
        });

        const sourceUrls = gql_resp.data.data.episode.sourceUrls;
        const allLinks = [];

        for (const source of sourceUrls) {
            if (!source.sourceUrl.startsWith('--')) continue;
            const provider_id = decodeProviderId(source.sourceUrl.substring(2));
            try {
                const resp = await axios.get(`https://${ALLANIME_BASE}${provider_id}`, {
                    headers: { 'Referer': ALLANIME_REFR, 'User-Agent': AGENT }
                });
                if (resp.data.links) {
                    resp.data.links.forEach(l => {
                        allLinks.push({ quality: l.resolutionStr, url: l.link, isHLS: l.hls || l.link.includes('.m3u8') });
                    });
                }
            } catch (e) {}
        }
        res.json(allLinks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/manga-pages', async (req, res) => {
    const { id, chapterNumber } = req.query;
    try {
        // We need the internal chapter ID from the info endpoint first
        const info = await axios.get(`${CONSUMET_URL}/info/${id}`);
        const chapter = info.data.chapters.find(c => c.chapterNumber == chapterNumber || c.id == chapterNumber);
        
        if (!chapter) return res.status(404).json({ error: "Chapter not found" });
        
        const pagesResponse = await axios.get(`${CONSUMET_URL}/read/${chapter.id}`);
        // Consumet returns pages as [{ img: "url", page: 1 }, ...]
        const pages = pagesResponse.data.map(p => p.img);
        res.json(pages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Mirror running on port ${PORT}`));
