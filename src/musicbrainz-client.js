/**
 * =====================================================================
 * 🎼 MusicBrainz API 核心探索客戶端 (MusicBrainz Metadata Client)
 * =====================================================================
 * [技術] 串接 MusicBrainz JSON Web Service 進行藝人 MBID 查詢與分頁
 *        Release-Groups 專輯檢索。內建 1000ms 嚴格限流防禦與標準 User-Agent 識別。
 * [童趣] 音樂藏寶圖偵探：在無邊無際的音樂海洋裡，幫我們撈起最新最亮的小音符，
 *        給智慧小精靈提供滿滿的童話故事靈感！
 * =====================================================================
 */
import { fetch } from 'undici';

// [技術] 輔助延遲函式，MusicBrainz 嚴格限制 1秒最多1次請求 (1 req/s)
// [童趣] 小精靈休息時間：MusicBrainz 很容易累，每次跟它說完話要乖乖等 1000 毫秒（1 秒），它才不會生氣關門喔
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// [技術] 官方規範之身分識別 User-Agent，附帶聯絡電子郵件，防範連線阻斷
const USER_AGENT = 'NanoClawMusicAgent/1.0.0 ( sunpochin@gmail.com )';

/**
 * [技術] 核心 MusicBrainz API 請求包裝器，自動處理 headers、格式化與限流緩衝
 * [童趣] 穿上禮貌小外衣：戴上乖乖牌的 User-Agent 識別帽，這樣音樂城堡的門衛就不會把我們當成壞人擋在外面啦
 * @param {string} endpoint - API 子端點 (如 'release-group')
 * @param {object|null} params - 查詢參數物件
 * @returns {Promise<any>} API 解析 JSON 結果
 */
async function musicbrainzRequest(endpoint, params = null) {
  let url = `https://musicbrainz.org/ws/2/${endpoint}`;
  
  const queryParams = new URLSearchParams();
  queryParams.append('fmt', 'json'); // 確保請求 JSON 格式
  
  if (params) {
    Object.entries(params).forEach(([key, val]) => {
      if (val !== null && val !== undefined) {
        queryParams.append(key, val);
      }
    });
  }
  url += `?${queryParams.toString()}`;

  const options = {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    }
  };

  const response = await fetch(url, options);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`MusicBrainz 伺服器拒絕 (HTTP ${response.status}): ${errText}`);
  }

  // 遵守 1 req/s 限流要求，每次請求完成後，強制休眠 1000ms 進行冷卻
  await sleep(1000);

  return await response.json();
}

/**
 * [技術] 利用藝人名稱搜尋對齊獲取 MusicBrainz MBID
 * [童趣] 歌手名冊大點名：輸入歌手的名字，在音樂王國的魔法書裡，精準找出專屬於他的亮晶晶身分證字號
 * @param {string} artistName - 藝人中文或英文名稱
 * @returns {Promise<string|null>} 藝人 MBID，若無匹配則返回 null
 */
export async function getMusicBrainzArtistMBID(artistName) {
  console.log(`[MusicBrainz/Client] 🔍 正在搜尋藝人 MBID：「${artistName}」...`);
  try {
    const data = await musicbrainzRequest('artist', {
      query: `artist:"${artistName}"`,
      limit: 5
    });

    const artists = data.artists || [];
    if (artists.length === 0) {
      console.warn(`[MusicBrainz/Client] ⚠️ 找不到藝人 「${artistName}」 的 MBID。`);
      return null;
    }

    // 優先選取名稱完全一致或搜尋相關度最高的藝人
    const bestMatch = artists.find(a => a.name.toLowerCase() === artistName.toLowerCase()) || artists[0];
    console.log(`[MusicBrainz/Client] ✅ 成功對齊藝人 ${artistName} => MBID: ${bestMatch.id} (${bestMatch.name})`);
    return bestMatch.id;
  } catch (err) {
    console.error(`[MusicBrainz/Client] ❌ 搜尋藝人 MBID 出錯:`, err.message || err);
    return null;
  }
}

/**
 * [技術] 分頁獲取單個藝人的發行 Release-Groups 清單，並進行近 30 天新發行篩選
 * [童趣] 採摘新鮮小蘋果：悄悄走進歌手的新歌花園，把過去 30 天長出來的新鮮新專輯通通摘進小籃子裡
 * @param {string} mbid - 藝人 MusicBrainz ID (MBID)
 * @param {number} days - 往前追溯的天數，預設 30 天
 * @returns {Promise<Array<object>>} 正規化後的新發行專輯清單
 */
export async function getMusicBrainzArtistAlbums(mbid, days = 30) {
  let releaseGroups = [];
  let limit = 100;
  let offset = 0;
  let hasMore = true;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  console.log(`[MusicBrainz/Client] 📂 正在獲取藝人 [${mbid}] 的 Release-Groups 列表...`);

  while (hasMore) {
    try {
      const data = await musicbrainzRequest('release-group', {
        artist: mbid,
        limit: limit,
        offset: offset,
        type: 'album|single' // 只獲取專輯與單曲，排除合輯或其它
      });

      const items = data['release-groups'] || [];
      if (items.length === 0) {
        break;
      }

      releaseGroups = releaseGroups.concat(items);

      // 檢查這一頁最舊的發行日期是否還在 30 天內，若是則繼續抓下一頁
      const oldestItem = items[items.length - 1];
      const oldestDateStr = oldestItem['first-release-date'];
      let oldestDate;

      if (oldestDateStr) {
        // MusicBrainz 的日期可能是 YYYY-MM-DD, YYYY-MM 或 YYYY
        if (oldestDateStr.length === 10) {
          oldestDate = new Date(oldestDateStr);
        } else if (oldestDateStr.length === 7) {
          oldestDate = new Date(`${oldestDateStr}-01`);
        } else {
          oldestDate = new Date(`${oldestDateStr}-01-01`);
        }
      } else {
        oldestDate = new Date(0); // 日期未知則設為極早
      }

      const totalCount = data['release-group-count'] || releaseGroups.length;
      if (oldestDate >= cutoffDate && releaseGroups.length < totalCount && items.length === limit) {
        offset += limit;
      } else {
        hasMore = false;
      }
    } catch (err) {
      console.error(`[MusicBrainz/Client] ❌ 獲取 Release-Groups 出錯:`, err.message || err);
      hasMore = false;
    }
  }

  // 篩選與正規化為 Candidate Schema 格式，完美相容 Spotify 屬性
  const newReleases = [];
  for (const group of releaseGroups) {
    const dateStr = group['first-release-date'];
    if (!dateStr) continue;

    let releaseDate;
    let precision = 'day';
    
    if (dateStr.length === 10) {
      releaseDate = new Date(dateStr);
    } else if (dateStr.length === 7) {
      releaseDate = new Date(`${dateStr}-01`);
      precision = 'month';
    } else {
      releaseDate = new Date(`${dateStr}-01-01`);
      precision = 'year';
    }

    if (releaseDate >= cutoffDate) {
      newReleases.push({
        id: group.id,
        name: group.title,
        release_date: dateStr,
        release_date_precision: precision,
        total_tracks: 1, // MusicBrainz release-group 沒有直接提供曲目數，預設 1 首 (不影響樂評分析)
        type: (group['primary-type'] || 'album').toLowerCase(),
        uri: `musicbrainz:release-group:${group.id}`,
        url: `https://musicbrainz.org/release-group/${group.id}`,
        image: '' // 沒有圖片網址
      });
    }
  }

  return newReleases;
}
