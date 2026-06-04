'use strict';
// 포트폴리오용 상품 3건 fetch — 코존(파워에너지바) + 드하영(루미노엣지·이브덴 1건)
// 부모 폴더 lib/naver_stores.js 활용. detailContent + images 추출 → JSON 저장.

const path = require('path');
const fs = require('fs');

const PARENT = 'C:/Users/MYCOM/Documents/조현준편집파일 329부터/클로드코드';
const { apiPost, apiGet, STORES } = require(path.join(PARENT, 'lib', 'naver_stores.js'));

const OUT_DIR = path.join(__dirname, '..', '..', 'output', 'portfolio_source');
fs.mkdirSync(OUT_DIR, { recursive: true });

// 키워드별 매칭 우선 (사장님이 명시한 정확한 이름)
const TARGETS = [
  { store: 'kojon',    keyword: '파워에너지바', label: 'powerenergybar' },
  { store: 'dhayoung', keyword: '루미노엣지',  label: 'luminoedge' },
  { store: 'dhayoung', keyword: '이브덴',      label: 'evdenmemory' }, // 이브덴메모리 한 건 — 첫 매칭
];

async function searchProduct(storeKey, keyword) {
  // 검색 — searchKeyword 자체 전달
  const body = { searchKeywordType: 'ALL', searchKeyword: keyword, page: 1, size: 50 };
  const res = await apiPost(storeKey, '/v1/products/search', body);
  return res.contents || [];
}

async function getDetail(storeKey, originProductNo) {
  return apiGet(storeKey, `/v2/products/origin-products/${originProductNo}`);
}

function pickBestMatch(items, keyword) {
  // 정확 매칭 우선, 그 다음 부분 매칭, 그 다음 첫 결과
  if (!items.length) return null;
  const exact = items.find((it) => {
    const cp = (it.channelProducts && it.channelProducts[0]) || {};
    return (cp.name || '').replace(/\s+/g, '').includes(keyword.replace(/\s+/g, ''));
  });
  return exact || items[0];
}

function summarize(detail) {
  const op = detail.originProduct || {};
  const cp = (detail.channelProducts && detail.channelProducts[0]) || {};
  const opt = op.detailAttribute?.optionInfo || {};
  return {
    originProductNo: op.originProductNo,
    name: cp.name || op.name,
    salePrice: op.salePrice,
    stockQuantity: op.stockQuantity,
    statusType: cp.statusType,
    representativeImage: op.images?.representativeImage?.url || null,
    optionalImages: (op.images?.optionalImages || []).map((x) => x.url).filter(Boolean),
    detailContent: op.detailContent || '',
    detailContentLength: (op.detailContent || '').length,
    optionSimple: (opt.optionSimple || []).map((o) => ({ name: o.groupName, values: (o.optionValues || []).map((v) => v.code || v.value) })),
    optionCustom: (opt.optionCustom || []).map((o) => ({ name: o.groupName, values: (o.optionValues || []).map((v) => v.code || v.value) })),
    keywords: op.sellerTags?.map((t) => t.text) || [],
  };
}

(async () => {
  const summary = { generatedAt: new Date().toISOString(), products: [] };
  for (const t of TARGETS) {
    process.stdout.write(`\n[${t.store}] ${t.keyword} 검색 중... `);
    try {
      const items = await searchProduct(t.store, t.keyword);
      console.log(`${items.length}건 발견`);
      const chosen = pickBestMatch(items, t.keyword);
      if (!chosen) { console.log('  ✗ 매칭 없음'); summary.products.push({ ...t, error: '검색 결과 없음' }); continue; }
      const cp = (chosen.channelProducts && chosen.channelProducts[0]) || {};
      const opNo = chosen.originProductNo;
      console.log(`  ✓ 선정: opNo=${opNo} name="${cp.name}"`);
      const detail = await getDetail(t.store, opNo);
      const summ = summarize(detail);
      // 원본 detail 전체 + 요약 두 형태로 저장
      const fnRaw = path.join(OUT_DIR, `${t.label}_${opNo}_raw.json`);
      const fnSum = path.join(OUT_DIR, `${t.label}_${opNo}_summary.json`);
      fs.writeFileSync(fnRaw, JSON.stringify(detail, null, 2), 'utf-8');
      fs.writeFileSync(fnSum, JSON.stringify(summ, null, 2), 'utf-8');
      console.log(`  ✓ 저장: ${path.basename(fnRaw)} (${(JSON.stringify(detail).length / 1024).toFixed(1)}KB)`);
      console.log(`         ${path.basename(fnSum)} (detailContent ${summ.detailContentLength}자, 이미지 ${1 + summ.optionalImages.length}장)`);
      summary.products.push({ ...t, originProductNo: opNo, name: summ.name, salePrice: summ.salePrice, files: { raw: fnRaw, summary: fnSum } });
    } catch (err) {
      console.log(`  ✗ 실패: ${err.message.slice(0, 200)}`);
      summary.products.push({ ...t, error: err.message });
    }
  }
  const summaryPath = path.join(OUT_DIR, '_index.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`\n━━━ 완료 ━━━\n  인덱스: ${summaryPath}`);
})();
