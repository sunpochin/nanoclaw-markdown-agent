// [技術] 全域檔案鎖定 Map，鍵為檔案絕對路徑，值為該檔案的排隊 Promise
// [童趣] 城堡排隊登記簿：同一本書如果很多人要同時寫，大家要在隊伍裡乖乖排隊，前一個寫完蓋上章，下一個人才准提筆喔！
const fileLocks = new Map();

/**
 * [技術] 獲取指定檔案的寫入鎖
 * @param {string} filePath 檔案絕對路徑
 * @returns {Promise<Function>} 釋放鎖的 release 函數
 */
export async function acquireLock(filePath) {
  const previous = fileLocks.get(filePath) || Promise.resolve();
  
  let resolveLock;
  const next = new Promise(resolve => {
    resolveLock = resolve;
  });
  
  // 更新鎖定 Map，讓後面的請求排隊在我們這個 next 承諾後面
  fileLocks.set(filePath, next);
  
  // 等待前面的鎖釋放
  await previous;
  
  // 回傳釋放鎖的 callback
  return () => {
    if (fileLocks.get(filePath) === next) {
      fileLocks.delete(filePath);
    }
    resolveLock();
  };
}
