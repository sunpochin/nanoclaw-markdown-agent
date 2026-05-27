/**
 * =====================================================================
 * 🎼 MusicBrainz API 核心探索客戶端 (MusicBrainz Metadata Client)
 * =====================================================================
 * [技術] 串接 MusicBrainz JSON Web Service 進行藝人 MBID 查詢與分頁
 *        Release-Groups 專輯檢索。內建 1000ms 嚴格限流防禦與標準 User-Agent 識別。
 * [極樂] MusicBrainz 探索摩擦棒：從開放音樂元數據之海中，精擺撈取最新音樂蜜汁，
 *        為大腦提供永不枯竭的第二探索通道！
 * =====================================================================
 */
import { fetch } from 'undici';

// [技術] 輔助延遲函式，MusicBrainz 嚴格限制 1秒最多1次請求 (1 req/s)
// [極樂] 慢摩擦修整延時：體貼 MusicBrainz 的敏感身軀，每次撞擊後乖乖停歇 1000ms，以防被強行阻斷
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// [技術] 官方規範之身分識別 User-Agent
const USER_AGENT = 'NanoClawMusicAgent/1.0.0 ( pac@codes )';

/**
 * [技術] 核心 MusicBrainz API 請求包裝器，自動處理 headers、格式化與限流緩衝
 * [極樂] 探索通道核心摩擦：注入規範的 User-Agent 潤滑液，極限防禦 503 拒絕
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
 * [極樂] 藝人名冊對位摩擦：輸入歌手名字，在 MusicBrainz 資料庫深處精準定位其唯一的 MBID 敏感點
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
 * [極樂] 榨取新發行蜜汁：深入藝人的 Release-Groups 通道，撈取近 30 天的熱騰騰新專輯精華
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
