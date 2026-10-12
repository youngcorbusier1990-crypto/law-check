/* ============================================================
   api.js — 국가법령정보 자치법규 실시간 연동 모듈
   서버(server.js)가 있으면 조례를 실시간 조회, 없으면 링크 폴백.
   (esc·fmt 등 공용 유틸은 uses.js에 정의되어 먼저 로드됨)
   ============================================================ */

const API = {
  base: '',            // 같은 서버에서 서빙되므로 상대경로
  available: false,    // 서버 연동 가능 여부
  ocConfigured: false, // 실제 인증키 설정 여부
};

/* ============================================================
   외부 법규 검색 링크 생성 (조회 실패·미연동 시 폴백)
   - 법제처 국가법령정보센터: 법령·자치법규
   - 자치법규정보시스템(ELIS): 지자체 조례·규칙
   ============================================================ */
// 법제처 자치법규 검색 (지자체명+조례명)
function elawOrdinLink(gov, ordinName){
  const q = ((gov?gov+' ':'') + (ordinName||'')).trim();
  return 'https://www.law.go.kr/ordinSc.do?menuId=3&subMenuId=27&tabMenuId=139&query=' + encodeURIComponent(q);
}
// 법제처 법령 검색 (법령명)
function elawLawLink(name){
  return 'https://www.law.go.kr/lsSc.do?menuId=1&subMenu=1&query=' + encodeURIComponent(name||'');
}
// 자치법규정보시스템(ELIS) 검색
function elisLink(gov, ordinName){
  const q = ((gov?gov+' ':'') + (ordinName||'')).trim();
  return 'https://www.elis.go.kr/allalr/selectAllAlrList?searchAlrNm=' + encodeURIComponent(q);
}
// 토지이음 (용도지역·행위제한)
function eumLink(){ return 'https://www.eum.go.kr'; }

/* 지역 조례 3종에 대한 외부 링크 세트 HTML 생성 */
function externalOrdinLinksHtml(gov){
  const g = (gov||'').trim();
  const ordins = ['건축 조례','주차장 설치 및 관리 조례','도시계획 조례'];
  let rows = ordins.map(nm=>
    `<div class="ext-row"><span class="ext-nm">${esc(g?g+' ':'')}${esc(nm)}</span>
      <a href="${elawOrdinLink(g,nm)}" target="_blank" rel="noopener">법제처 ↗</a>
      <a href="${elisLink(g,nm)}" target="_blank" rel="noopener">자치법규정보 ↗</a></div>`
  ).join('');
  return `<div class="ext-links">
    <div class="ext-head">🔗 조례 원문 직접 확인 ${g?`— <b>${esc(g)}</b>`:'<span style="font-weight:400;color:var(--ink-3)">(지자체 입력 시 정확히 연결)</span>'}</div>
    ${rows}
    <div class="ext-foot">· <a href="${elisLink(g,'')}" target="_blank" rel="noopener">자치법규정보시스템(ELIS) 전체검색 ↗</a>
      &nbsp;·&nbsp; <a href="${eumLink()}" target="_blank" rel="noopener">토지이음(용도지역·행위제한) ↗</a></div>
  </div>`;
}

/* 서버 연동 가능 여부 확인 */
async function checkApiStatus(){
  try{
    const r = await fetch('/api/status', {signal: AbortSignal.timeout(3000)});
    if(!r.ok) throw 0;
    const j = await r.json();
    API.available = true;
    API.ocConfigured = !!j.ocConfigured;
    return j;
  }catch(e){
    API.available = false;
    return null;
  }
}

/* 자치법규 실시간 검색 */
async function fetchOrdinances(gov, query){
  if(!API.available) return null;
  try{
    const u = `/api/ordin?gov=${encodeURIComponent(gov||'')}&query=${encodeURIComponent(query||'건축 조례')}`;
    const r = await fetch(u, {signal: AbortSignal.timeout(12000)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  }catch(e){
    return { error: e.message };
  }
}

/* 법제처 자치법규 목록 응답에서 항목 배열 정규화 */
function parseOrdinList(resp){
  // 응답 구조: { raw: { OrdinSearch: { law: [...] 또는 {...} } } }
  try{
    const root = resp.raw || resp;
    const search = root.OrdinSearch || root.ordinSearch || root.LawSearch || {};
    let items = search.law || search.ordin || search.Law || [];
    if(!Array.isArray(items)) items = items ? [items] : [];
    return items.map(it => ({
      name: it.자치법규명 || it['자치법규명'] || it.법령명 || '',
      id: it.자치법규ID || it['자치법규ID'] || it.ID || '',
      org: it.지자체기관명 || it['지자체기관명'] || '',
      date: it.시행일자 || it['시행일자'] || '',
      kind: it.자치법규종류 || it['자치법규종류'] || '',
      link: it.자치법규상세링크 || it['자치법규상세링크'] || '',
    })).filter(x=>x.name);
  }catch(e){ return []; }
}

/* 결과 화면의 조례 섹션을 실시간 데이터로 업그레이드 */
async function enhanceOrdinanceSection(gov){
  const box = document.getElementById('liveOrdinBox');
  if(!box) return;

  if(!API.available){
    box.innerHTML = `<div class="live-note">💡 지역 조례 조문 자동조회는 <b>서버 연동(배포된 버전)</b>에서 작동합니다. 지금은 아래에서 직접 확인하세요.</div>` + externalOrdinLinksHtml(gov);
    return;
  }
  if(!gov){
    box.innerHTML = `<div class="live-note">지자체를 입력하면 해당 지역의 건축·주차장·도시계획 조례 조문을 불러옵니다.</div>` + externalOrdinLinksHtml('');
    return;
  }

  box.innerHTML = `<div class="live-loading">⏳ ${esc(gov)}의 건축·주차장·도시계획 조례 조문을 불러오는 중… (수 초 소요)</div>`;

  // 통합 엔드포인트로 세 조례 조문 한 번에 조회
  let data;
  try{
    const r = await fetch(`/api/ordin/articles?gov=${encodeURIComponent(gov)}`, {signal:AbortSignal.timeout(30000)});
    data = await r.json();
  }catch(e){
    box.innerHTML = `<div class="live-item err"><b>조회 실패</b><span>${esc(e.message)} · 아래 링크로 직접 확인하세요</span></div>` + externalOrdinLinksHtml(gov);
    return;
  }

  if(data.reason === 'test_key' || data.ok === false){
    box.innerHTML = `<div class="live-note warn">⚠ ${esc(data.note||'인증키(OC)가 필요합니다')}<br>조문 자동조회는 서버에 <b>OPEN API 인증키</b> 설정 후 작동합니다. 그동안은 아래 링크로 확인하세요.</div>` + externalOrdinLinksHtml(gov);
    return;
  }

  const ords = data.ordinances || [];
  let html = '';
  ords.forEach(od => {
    if(od.error){
      html += `<div class="live-item err"><b>${esc(od.name)}</b><span>조회 실패: ${esc(od.error)}</span></div>`;
      return;
    }
    if(!od.found){
      html += `<div class="live-item"><b>${esc(od.name)}</b><span>${esc(gov)}에서 해당 조례를 찾지 못함</span></div>`;
      return;
    }
    html += `<div class="ord-block"><div class="ord-head">${esc(od.name)} <span>${od.org?esc(od.org):''}${od.date?' · 시행 '+esc(od.date):''} · 전체 ${od.totalArticles||0}개 조문</span></div>`;
    if(!od.articles || od.articles.length===0){
      html += `<div class="ord-empty">핵심 조문(조경·주차·건폐율 등)을 자동 추출하지 못했습니다. 원문 링크에서 확인하세요.</div>`;
    } else {
      od.articles.forEach(a => {
        html += `<div class="ord-art">
          <div class="ord-artno">제${esc(String(a.no).replace(/^0+/,''))}조${a.title?` (${esc(a.title)})`:''}</div>
          <div class="ord-artcontent">${esc(a.content).replace(/\n/g,'<br>')}</div>
        </div>`;
      });
    }
    if(od.link){
      const url = od.link.indexOf('http')===0?od.link:'https://www.law.go.kr'+od.link;
      html += `<a class="ord-link" href="${url}" target="_blank" rel="noopener">이 조례 전문 보기 ↗</a>`;
    }
    html += `</div>`;
  });

  box.innerHTML = (html || `<div class="live-note">조례 조문을 자동 추출하지 못했습니다. 아래 링크로 직접 확인하세요.</div>`) + externalOrdinLinksHtml(gov);
}

/* ============================================================
   대지 정보 조회 (브이월드 토지이용계획 연동)
   ============================================================ */
let lastLandInfo = null;

async function searchLand(){
  const address = document.getElementById('f_address').value.trim();
  const type = document.getElementById('f_addrtype').value;
  const box = document.getElementById('landResult');
  if(!address){ box.innerHTML = `<div class="land-err">주소를 입력하세요.</div>`; return; }

  if(!API.available){
    box.innerHTML = `<div class="land-nokey">💡 대지 자동 조회는 <b>인터넷 주소(배포된 버전)</b>로 접속했을 때 작동합니다. 지금은 파일을 직접 열어 조회 서버가 연결되지 않은 상태입니다.<br>
      · 배포된 주소(예: <b>○○○.onrender.com</b>)로 접속하면 이 검색이 바로 작동합니다.<br>
      · 그동안은 아래에서 <b>용도지역을 직접 선택</b>하시면 됩니다. <a href="https://www.eum.go.kr" target="_blank" rel="noopener" style="color:var(--blueprint)">토지이음에서 확인 ↗</a></div>`;
    return;
  }

  box.innerHTML = `<div class="land-loading">⏳ ${esc(address)} 의 토지이용계획을 조회하는 중…</div>`;

  try{
    const r = await fetch(`/api/land?address=${encodeURIComponent(address)}&type=${type}`, {signal:AbortSignal.timeout(15000)});
    const j = await r.json();

    if(j.reason === 'no_key'){
      box.innerHTML = `<div class="land-nokey">🔑 브이월드 인증키가 설정되지 않았습니다. 서버 관리자가 <b>VWORLD_KEY</b>를 설정하면 자동 조회가 켜집니다.<br>
        그동안은 <a href="https://www.eum.go.kr" target="_blank" rel="noopener" style="color:var(--blueprint)">토지이음 ↗</a>에서 확인 후 아래에 직접 입력하세요.</div>`;
      return;
    }
    if(!j.ok){
      box.innerHTML = `<div class="land-err">⚠ ${esc(j.note||'주소를 찾지 못했습니다.')} (지번↔도로명을 바꿔보세요)</div>`;
      return;
    }

    lastLandInfo = j;
    renderLandCard(j);
  }catch(e){
    box.innerHTML = `<div class="land-err">조회 실패: ${esc(e.message)}. 잠시 후 다시 시도하세요.</div>`;
  }
}

function renderLandCard(j){
  const box = document.getElementById('landResult');
  const zones = j.land?.zones || [];
  // 용도지역 파악
  let matchedZone = null;
  for(const z of zones){
    const norm = normalizeZoneName(z);
    if(norm){ matchedZone = norm; break; }
  }
  const zoneData = matchedZone ? LANDUSE_ZONES[matchedZone] : null;
  const zoneCode = detectZoneCode(zones);

  let html = `<div class="land-card">
    <div class="lc-head">📍 ${esc(j.address||'')}</div>
    <div class="lc-body">`;

  // 용도지역
  html += `<div class="lc-item hl"><div class="k">용도지역</div><div class="v">${matchedZone?esc(matchedZone):'<small>미확인 — 직접 선택 필요</small>'}</div></div>`;

  // 지역지구
  const otherZones = zones.filter(z=>!normalizeZoneName(z));
  html += `<div class="lc-item"><div class="k">지역·지구</div><div class="v">${otherZones.length?esc(otherZones.join(', ')):'<small>해당 없음/미확인</small>'}</div></div>`;

  // 건폐율
  if(zoneData){
    html += `<div class="lc-item"><div class="k">건폐율 (법정 상한)</div><div class="v">${zoneData.bcr}% <small>이하</small></div></div>`;
    html += `<div class="lc-item"><div class="k">용적률 (법정 상한)</div><div class="v">${zoneData.farMax}% <small>이하 · 범위 ${zoneData.far}%</small></div></div>`;
    // 최대 건축면적·연면적 (대지면적이 입력돼 있으면 즉시 계산)
    const lot = +(document.getElementById('f_lot')?.value||0);
    if(lot > 0){
      const maxBuild = Math.floor(lot * zoneData.bcr / 100);
      const maxFloor = Math.floor(lot * zoneData.farMax / 100);
      html += `<div class="lc-item hl"><div class="k">최대 건축면적 (대지 ${fmt(lot)}㎡ 기준)</div><div class="v">${fmt(maxBuild)}㎡ <small>= 대지 × 건폐율 ${zoneData.bcr}%</small></div></div>`;
      html += `<div class="lc-item hl"><div class="k">최대 연면적 (용적률 기준)</div><div class="v">${fmt(maxFloor)}㎡ <small>= 대지 × 용적률 ${zoneData.farMax}%</small></div></div>`;
    } else {
      html += `<div class="lc-item"><div class="k">최대 건축면적·연면적</div><div class="v"><small>대지면적 입력 시 자동 계산</small></div></div>`;
    }
  } else {
    html += `<div class="lc-item"><div class="k">건폐율·용적률</div><div class="v"><small>용도지역 확인 후 표시</small></div></div>`;
  }

  html += `</div>`; // lc-body

  // 자동 연결 안내 + 적용 버튼
  if(matchedZone || zoneCode){
    html += `<div class="lc-apply">✓ 이 정보를 규모 입력에 자동 반영했습니다`;
    if(zoneCode) html += ` (지역·지구: ${zoneCodeLabel(zoneCode)})`;
    html += `</div>`;
  }
  html += `</div>`; // land-card

  // 원본 데이터 표시(접기)
  html += `<details style="margin-top:8px"><summary style="font-size:11px;color:var(--ink-3);cursor:pointer">토지이용계획 원본 데이터 보기 (${(j.land?.rawCount||0)}건)</summary>
    <div style="font-size:11px;color:var(--ink-2);background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px;margin-top:5px">
    ${zones.length?zones.map(z=>esc(z)).join(' · '):'조회된 지역지구 속성 없음'}</div></details>`;

  box.innerHTML = html;

  // 폼에 자동 반영
  applyLandToForm(matchedZone, zoneData, zoneCode, j.address);
}

function zoneCodeLabel(code){
  if(typeof DISTRICT_LIST!=='undefined'){
    const d = DISTRICT_LIST.find(x=>x.code===code);
    if(d) return d.label;
  }
  return {fire:'방화지구', scenic:'경관지구', district:'지구단위계획구역', rebuild:'정비구역'}[code] || code;
}

/* 파악된 대지정보를 규모 입력 폼에 자동 채우기 */
function applyLandToForm(matchedZone, zoneData, zoneCode, address){
  // 지역·지구 자동 선택
  if(zoneCode){
    const cb = document.querySelector('.f_zone_cb[value="'+zoneCode+'"]');
    if(cb) cb.checked = true;
  }
  // 지자체 자동 추출 (주소 앞부분)
  if(address){
    const govSel = document.getElementById('f_gov');
    const m = address.match(/^(\S+(?:특별시|광역시|특별자치시|특별자치도|도))\s*(\S+(?:시|군|구))?/);
    if(govSel && m) govSel.value = (m[1]+(m[2]?' '+m[2]:'')).trim();
  }
  // 용도지역을 전역에 저장 (판별 시 건폐율·용적률 참조)
  window.__landZone = matchedZone || null;
  window.__landZoneData = zoneData || null;

  // 용도지역 드롭다운(숨김) 동기화 + 용도지역 체크박스 자동 체크
  const lzSel = document.getElementById('f_landzone');
  if(lzSel && matchedZone) lzSel.value = matchedZone;
  if(matchedZone){
    document.querySelectorAll('.zone-cb').forEach(c=>{ c.checked = (c.value === 'z:'+matchedZone); });
  }

  // 용도지역 배지를 규모입력 상단에 표시
  const badge = document.getElementById('zoneBadge');
  if(badge){
    if(matchedZone){
      badge.style.display='inline-flex';
      badge.textContent = `용도지역: ${matchedZone}${zoneData?` (건폐율 ${zoneData.bcr}% · 용적률 ${zoneData.farMax}%)`:''}`;
    } else {
      badge.style.display='none';
    }
  }
}

/* ============================================================
   용도지역별 건폐율·용적률 조례 실제치 조회
   ============================================================ */
async function fetchZoneOrdinance(gov, zone){
  const box = document.getElementById('zoneOrdinBox');
  if(!box) return;

  if(!API.available){
    box.innerHTML = `<div class="zone-note">💡 실제 적용 건폐율·용적률은 <b>배포된 버전(서버 연동)</b>에서 해당 지역 도시계획 조례로 확인됩니다. 지금 표시된 값은 <b>국토계획법 법정 상한</b>입니다.</div>`;
    return;
  }
  if(!gov){
    box.innerHTML = `<div class="zone-note">⚠ 표시된 건폐율·용적률은 <b>법정 상한(최대치)</b>입니다. <b>지자체를 입력</b>하면 해당 지역 도시계획 조례의 실제 적용치를 조회합니다.</div>`;
    return;
  }

  box.innerHTML = `<div class="zone-loading">⏳ ${esc(gov)} 도시계획 조례에서 ${esc(zone)} 건폐율·용적률 조문을 확인하는 중…</div>`;

  let data;
  try{
    const r = await fetch(`/api/ordin/zone?gov=${encodeURIComponent(gov)}&zone=${encodeURIComponent(zone)}`, {signal:AbortSignal.timeout(30000)});
    data = await r.json();
  }catch(e){
    box.innerHTML = `<div class="zone-note">조회 실패: ${esc(e.message)}. 표시된 값은 법정 상한입니다.</div>`;
    return;
  }

  if(data.reason === 'test_key' || data.ok === false){
    box.innerHTML = `<div class="zone-note warn">⚠ 표시값은 <b>법정 상한</b>입니다. 실제 적용치 자동조회는 <b>인증키(OC) 설정</b> 후 가능합니다.</div>`;
    return;
  }

  const od = data.ordinance;
  if(!od || !od.found || !od.articles || od.articles.length===0){
    box.innerHTML = `<div class="zone-note warn">⚠ 표시값은 <b>법정 상한</b>입니다. ${esc(gov)} 도시계획 조례에서 ${esc(zone)} 관련 조문을 자동 추출하지 못했습니다. 조례 원문에서 직접 확인하세요.${od&&od.link?` <a href="${od.link.indexOf('http')===0?od.link:'https://www.law.go.kr'+od.link}" target="_blank" rel="noopener">조례 보기 ↗</a>`:''}</div>`;
    return;
  }

  let html = `<div class="zone-ord"><div class="zone-ord-head">📋 ${esc(gov)} 도시계획 조례 — ${esc(zone)}의 실제 건폐율·용적률·세분</div>`;
  od.articles.forEach(a=>{
    html += `<div class="zone-ord-art">
      <div class="zone-ord-no">제${esc(String(a.no).replace(/^0+/,''))}조${a.title?` (${esc(a.title)})`:''}</div>
      <div class="zone-ord-content">${esc(a.content).replace(/\n/g,'<br>')}</div>
    </div>`;
  });
  html += `<div class="zone-note" style="margin-top:8px">위는 조례 원문입니다. 표에서 <b>${esc(zone)}</b>의 실제 수치를 확인하세요. 이 지자체가 <b>이 용도지역을 더 세분</b>(예: 제2종일반주거를 7층 이하 등)했다면 조문에 함께 나옵니다. (모두 법정 상한 이내)</div>`;
  if(od.link){
    const url = od.link.indexOf('http')===0?od.link:'https://www.law.go.kr'+od.link;
    html += `<a class="zone-ord-link" href="${url}" target="_blank" rel="noopener">도시계획 조례 전문 보기 ↗</a>`;
  }
  html += `</div>`;
  box.innerHTML = html;
}
