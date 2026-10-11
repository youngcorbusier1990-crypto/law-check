#!/usr/bin/env node
/* ============================================================
   法規·CHECK 백엔드 서버
   - 국가법령정보 공동활용 OPEN API 프록시 (CORS 우회)
   - 정적 파일(앱) 서빙
   - 자치법규(조례) 목록·본문 조회
   의존성 없음: Node.js 내장 모듈만 사용 (v18+)
   ============================================================ */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

/* ── 설정 ── */
const PORT = process.env.PORT || 8080;
// 인증키(OC): 환경변수 또는 아래 값 직접 수정. 신청: https://open.law.go.kr → OPEN API 신청
const OC = process.env.LAW_OC || 'test';   // 'test'는 법제처 제공 샘플키(제한적)
const API_HOST = 'www.law.go.kr';
// 브이월드(V-World) 인증키: 대지정보(토지이용계획) 조회용. 신청: https://www.vworld.kr
const VWORLD_KEY = process.env.VWORLD_KEY || '';
const VWORLD_HOST = 'api.vworld.kr';

/* ── 지자체 코드 매핑 (시도) — API의 org 파라미터 ── */
const ORG_CODES = {
  '서울': '6110000', '서울특별시': '6110000',
  '부산': '6260000', '부산광역시': '6260000',
  '대구': '6270000', '대구광역시': '6270000',
  '인천': '6280000', '인천광역시': '6280000',
  '광주': '6290000', '광주광역시': '6290000',
  '대전': '6300000', '대전광역시': '6300000',
  '울산': '6310000', '울산광역시': '6310000',
  '세종': '5690000', '세종특별자치시': '5690000',
  '경기': '6410000', '경기도': '6410000',
  '강원': '6530000', '강원도': '6530000', '강원특별자치도': '6530000',
  '충북': '6430000', '충청북도': '6430000',
  '충남': '6440000', '충청남도': '6440000',
  '전북': '6540000', '전라북도': '6540000', '전북특별자치도': '6540000',
  '전남': '6460000', '전라남도': '6460000',
  '경북': '6470000', '경상북도': '6470000',
  '경남': '6480000', '경상남도': '6480000',
  '제주': '6500000', '제주특별자치도': '6500000',
};

/* 입력 문자열에서 시도 코드 추출 */
function resolveOrg(gov){
  if(!gov) return null;
  for(const key of Object.keys(ORG_CODES)){
    if(gov.indexOf(key)===0 || gov.indexOf(key)>=0) return ORG_CODES[key];
  }
  return null;
}

/* ── 법제처 API 호출 (봇 차단 우회 + 빈/HTML 응답 재시도) ──
   참고: korean-law-mcp 프로젝트가 밝혀낸 법제처 API 특성
   - Node 기본 User-Agent를 봇으로 차단 → 브라우저 UA 주입
   - Referer 헤더 없으면 "사용자 정보 검증 실패" → Referer 주입
   - 간헐적으로 200에 빈 본문/HTML 점검페이지 반환 → 재시도 */
const BROWSER_UA = process.env.LAW_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const LAW_REFERER = process.env.LAW_REFERER || 'https://www.law.go.kr/';

function callLawApi(apiPath, callback, _retry){
  const options = {
    hostname: API_HOST, port: 443, path: apiPath, method: 'GET',
    headers: {
      'User-Agent': BROWSER_UA,
      'Referer': LAW_REFERER,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9'
    }
  };
  const req = https.request(options, res => {
    let data = [];
    res.on('data', c => data.push(c));
    res.on('end', () => {
      const body = Buffer.concat(data).toString('utf8');
      // 빈 응답 또는 HTML 점검/안티봇 페이지 감지 → 최대 2회 재시도
      const looksEmpty = !body || body.trim().length === 0;
      const looksHtml = /^\s*<(?:!doctype|html)/i.test(body) || body.indexOf('사용자 정보 검증') >= 0;
      if((looksEmpty || looksHtml) && (_retry||0) < 2){
        const wait = 300 * ((_retry||0) + 1);
        setTimeout(() => callLawApi(apiPath, callback, (_retry||0)+1), wait);
        return;
      }
      callback(null, { status: res.statusCode, body, retried:(_retry||0) });
    });
  });
  req.on('error', e => {
    if((_retry||0) < 2){ setTimeout(()=>callLawApi(apiPath, callback, (_retry||0)+1), 300); return; }
    callback(e);
  });
  req.setTimeout(15000, () => { req.destroy(); if((_retry||0)<2){callLawApi(apiPath,callback,(_retry||0)+1);} else {callback(new Error('API timeout'));} });
  req.end();
}

/* ── 브이월드 API 호출 (범용) ── */
function callVworld(apiPath, callback){
  const options = {
    hostname: VWORLD_HOST, port: 443, path: apiPath, method: 'GET',
    headers: {
      'User-Agent': BROWSER_UA,
      'Referer': 'https://www.vworld.kr/',
      'Accept': 'application/json, text/plain, */*'
    }
  };
  const req = https.request(options, res => {
    let data = [];
    res.on('data', c => data.push(c));
    res.on('end', () => callback(null, { status: res.statusCode, body: Buffer.concat(data).toString('utf8') }));
  });
  req.on('error', e => callback(e));
  req.setTimeout(15000, () => { req.destroy(); callback(new Error('V-World timeout')); });
  req.end();
}

/* 조문번호 변환: "제46조" ↔ "004600", "제46조의2" ↔ "004602"
   참고: korean-law-mcp의 조문번호 변환 규칙 (앞 4자리 조, 뒤 2자리 가지) */
function joToCode(jo){
  // "46" 또는 "46의2" → "004600"/"004602"
  const m = String(jo).replace(/제|조/g,'').match(/^(\d+)(?:의(\d+))?$/);
  if(!m) return null;
  const main = String(m[1]).padStart(4,'0');
  const sub = String(m[2]||0).padStart(2,'0');
  return main + sub;
}
function codeToJo(code){
  const s = String(code).padStart(6,'0');
  const main = parseInt(s.slice(0,4),10);
  const sub = parseInt(s.slice(4,6),10);
  return sub>0 ? `제${main}조의${sub}` : `제${main}조`;
}

/* 주소 → 좌표+PNU (지오코더) */
function geocode(address, type, cb){
  // type: 'road'(도로명) 또는 'parcel'(지번)
  const p = `/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326`
    + `&type=${type||'parcel'}&address=${encodeURIComponent(address)}&format=json&key=${encodeURIComponent(VWORLD_KEY)}`;
  callVworld(p, cb);
}

/* PNU → 토지이용계획(용도지역·지역지구) */
function getLandUse(pnu, cb){
  // 토지이용계획속성 레이어: LT_C_LANDINFOBASEMAP 는 지적, 토지이용계획은 데이터API GetFeature 사용
  const p = `/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${encodeURIComponent(VWORLD_KEY)}`
    + `&attrFilter=pnu:=:${encodeURIComponent(pnu)}&format=json&size=10&page=1&geometry=false`;
  callVworld(p, cb);
}

/* 좌표 → 토지이용계획 규제 (토지이용계획 WFS) */
function getLandUsePlan(pnu, cb){
  const p = `/ned/data/getLandUseAttr?key=${encodeURIComponent(VWORLD_KEY)}&pnu=${encodeURIComponent(pnu)}&format=json&numOfRows=100&pageNo=1`;
  callVworld(p, cb);
}

/* 좌표(point) → 토지이용계획 속성 (WFS GetFeature, 용도지역·지역지구) */
function getLandUsePlan_byPoint(point, address, cb){
  // 토지이용계획도 레이어(LT_C_UQ111 등)에서 좌표가 포함된 피처 조회
  const buf = 0.00005; // 약 5m 버퍼
  const x = parseFloat(point.x), y = parseFloat(point.y);
  const bbox = `${x-buf},${y-buf},${x+buf},${y+buf}`;
  const p = `/req/data?service=data&request=GetFeature&data=LT_C_UQ111&key=${encodeURIComponent(VWORLD_KEY)}`
    + `&geomFilter=BOX(${bbox})&format=json&size=100&page=1&crs=EPSG:4326`;
  callVworld(p, (err, r) => {
    if(err){ cb(err, null); return; }
    let j;
    try { j = JSON.parse(r.body); } catch(e){ cb(null, null); return; }
    const features = j?.response?.result?.featureCollection?.features || [];
    // 용도지역·지역지구 속성 추출
    const zones = [];
    features.forEach(f => {
      const pr = f.properties || {};
      // 브이월드 토지이용 레이어 속성명은 데이터셋마다 다름 → 후보 키에서 추출
      const name = pr.dgm_nm || pr.prpos_area_dstrc_nm || pr.uname || pr.LADUSE_NM || pr.name || '';
      if(name) zones.push(name);
    });
    cb(null, { zones: [...new Set(zones)], rawCount: features.length });
  });
}

/* ── 자치법규 목록 조회 ── */
function searchOrdinances(gov, query, cb){
  const org = resolveOrg(gov);
  let p = `/DRF/lawSearch.do?OC=${encodeURIComponent(OC)}&target=ordin&type=JSON&display=20`;
  if(org) p += `&org=${org}`;
  if(query) p += `&query=${encodeURIComponent(query)}`;
  callLawApi(p, cb);
}

/* ── 자치법규 본문 조회 (ID로) ── */
function getOrdinance(id, cb){
  const p = `/DRF/lawService.do?OC=${encodeURIComponent(OC)}&target=ordin&type=JSON&ID=${encodeURIComponent(id)}`;
  callLawApi(p, cb);
}

/* ── 자치법규 본문 조회 (MST 일련번호로) ── */
function getOrdinanceByMst(mst, cb){
  const p = `/DRF/lawService.do?OC=${encodeURIComponent(OC)}&target=ordin&type=JSON&MST=${encodeURIComponent(mst)}`;
  callLawApi(p, cb);
}

/* 조례 본문 JSON에서 조문 배열 정규화 (다양한 응답 구조 대응) */
function parseOrdinanceArticles(body){
  let j; try{ j = JSON.parse(body); }catch(e){ return null; }
  // 루트 후보를 재귀적으로 탐색해 '조문' 배열을 찾음
  function findJomun(obj, depth){
    if(!obj || typeof obj !== 'object' || depth > 5) return null;
    // 직접 조문 키
    for(const key of ['조문','조문단위','articles','JoList']){
      if(obj[key]){
        let v = obj[key];
        if(v.조문단위) v = v.조문단위;
        if(Array.isArray(v)) return v;
        if(typeof v === 'object') return [v];
      }
    }
    // 자식 탐색
    for(const k in obj){
      if(typeof obj[k] === 'object'){
        const found = findJomun(obj[k], depth+1);
        if(found) return found;
      }
    }
    return null;
  }
  let jomun = findJomun(j, 0) || [];
  if(!Array.isArray(jomun)) jomun = jomun ? [jomun] : [];
  return jomun.map(a => ({
    no: a.조문번호 || a['조문번호'] || a.조번호 || '',
    isJo: (a.조문여부 || a['조문여부'] || 'Y'),
    title: a.조문제목 || a.조제목 || a['조제목'] || a['조문제목'] || '',
    content: a.조문내용 || a.조내용 || a['조내용'] || a['조문내용'] || '',
  })).filter(a => a.content && String(a.content).trim().length > 0);
}

/* 조문에서 핵심 키워드가 포함된 것만 추출 */
function pickRelevantArticles(articles, keywords){
  if(!articles) return [];
  const hit = [];
  for(const a of articles){
    const text = (a.title||'') + ' ' + (a.content||'');
    if(keywords.some(k => text.indexOf(k) >= 0)){
      // 조문내용이 너무 길면 앞부분만
      const content = a.content.length > 600 ? a.content.slice(0,600)+'…' : a.content;
      hit.push({ no:a.no, title:a.title, content });
    }
  }
  return hit.slice(0, 8);
}

/* 조례 1종: 검색→첫 결과 본문→핵심 조문 추출 */
function fetchOrdinanceArticles(gov, ordinName, keywords, cb){
  searchOrdinances(gov, ordinName, (err, r) => {
    if(err){ cb(err, null); return; }
    let list; try{ list = JSON.parse(r.body); }catch(e){ cb(null, {error:'parse'}); return; }
    const search = list.OrdinSearch || list.ordinSearch || {};
    let items = search.law || search.ordin || [];
    if(!Array.isArray(items)) items = items ? [items] : [];
    if(items.length === 0){ cb(null, { name:ordinName, found:false }); return; }
    // 이름이 가장 근접한 항목 선택(정확히 'OO 건축 조례')
    const best = items.find(it => (it.자치법규명||'').replace(/\s/g,'').indexOf(ordinName.replace(/\s/g,''))>=0) || items[0];
    const mst = best.자치법규일련번호 || best['자치법규일련번호'] || best.MST;
    const id = best.자치법규ID || best['자치법규ID'] || best.ID;
    const finish = (body) => {
      const articles = parseOrdinanceArticles(body);
      const relevant = pickRelevantArticles(articles, keywords);
      cb(null, {
        name: best.자치법규명 || ordinName,
        org: best.지자체기관명 || '',
        date: best.시행일자 || '',
        found: true,
        articles: relevant,
        totalArticles: articles ? articles.length : 0,
        link: best.자치법규상세링크 || ''
      });
    };
    if(mst){ getOrdinanceByMst(mst, (e2,r2)=> finish(r2?r2.body:'')); }
    else if(id){ getOrdinance(id, (e2,r2)=> finish(r2?r2.body:'')); }
    else { cb(null, { name:ordinName, found:true, articles:[], note:'ID/MST 없음' }); }
  });
}

/* ── 법령 본문 조회 ── */
function getLaw(query, cb){
  const p = `/DRF/lawService.do?OC=${encodeURIComponent(OC)}&target=law&type=JSON&LM=${encodeURIComponent(query)}`;
  callLawApi(p, cb);
}

/* ── 정적 파일 MIME ── */
const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

function serveStatic(req, res){
  let pathname = url.parse(req.url).pathname;
  if(pathname === '/') pathname = '/index.html';
  const filePath = path.join(__dirname, 'public', path.normalize(pathname).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(filePath, (err, content) => {
    if(err){ res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end('404 Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(content);
  });
}

function sendJson(res, status, obj){
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type'
  });
  res.end(JSON.stringify(obj));
}

/* ── 라우팅 ── */
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const p = parsed.pathname;

  if(req.method === 'OPTIONS'){ sendJson(res, 204, {}); return; }

  // 헬스체크 (클라우드 배포용)
  if(p === '/health'){
    res.writeHead(200, {'Content-Type':'text/plain'});
    res.end('ok');
    return;
  }

  // API 상태
  if(p === '/api/status'){
    sendJson(res, 200, { ok:true, ocConfigured: OC!=='test', oc: OC==='test'?'샘플키(test)':'설정됨', vworldConfigured: !!VWORLD_KEY });
    return;
  }

  // 대지정보 통합 조회: /api/land?address=서울...&type=parcel
  if(p === '/api/land'){
    const address = parsed.query.address || '';
    const type = parsed.query.type || 'parcel';
    if(!address){ sendJson(res, 400, { error:'address 필요' }); return; }
    if(!VWORLD_KEY){ sendJson(res, 200, { ok:false, reason:'no_key', note:'브이월드 인증키(VWORLD_KEY)가 설정되지 않았습니다.' }); return; }

    geocode(address, type, (err, r) => {
      if(err){ sendJson(res, 502, { error: err.message }); return; }
      let geo;
      try { geo = JSON.parse(r.body); } catch(e){ sendJson(res, 200, { ok:false, reason:'geocode_parse', preview:r.body.slice(0,200) }); return; }
      const status = geo?.response?.status;
      if(status !== 'OK'){
        sendJson(res, 200, { ok:false, reason:'geocode_'+(status||'fail'), note:'주소를 찾지 못했습니다. 지번/도로명 여부를 바꿔보세요.' });
        return;
      }
      const point = geo.response.result.point; // {x:경도, y:위도}
      const refined = geo.response.refined?.text || address;
      // 토지이용계획 조회
      getLandUsePlan_byPoint(point, refined, (err2, landData) => {
        sendJson(res, 200, {
          ok: true,
          address: refined,
          point,
          land: landData || null,
          note: landData ? undefined : '좌표는 찾았으나 토지이용계획 조회에 제한이 있습니다. 인증키 권한을 확인하세요.'
        });
      });
    });
    return;
  }

  // 지자체 코드 확인
  if(p === '/api/org'){
    const gov = parsed.query.gov || '';
    sendJson(res, 200, { gov, org: resolveOrg(gov), supported: Object.keys(ORG_CODES) });
    return;
  }

  // 자치법규 검색: /api/ordin?gov=서울특별시&query=건축 조례
  if(p === '/api/ordin'){
    const gov = parsed.query.gov || '';
    const query = parsed.query.query || '건축 조례';
    searchOrdinances(gov, query, (err, r) => {
      if(err){ sendJson(res, 502, { error: err.message }); return; }
      try {
        const j = JSON.parse(r.body);
        sendJson(res, 200, { ok:true, gov, org:resolveOrg(gov), raw:j });
      } catch(e) {
        // JSON 파싱 실패 시 원문 일부 반환 (test 키 제한 등)
        sendJson(res, 200, { ok:false, gov, note:'응답을 JSON으로 파싱하지 못했습니다. 인증키(OC) 확인 필요.', preview: r.body.slice(0,300) });
      }
    });
    return;
  }

  // 지역 조례 조문 통합 조회: /api/ordin/articles?gov=서울특별시 강남구
  // 용도지역별 건폐율·용적률 조례 조회: /api/ordin/zone?gov=서울특별시&zone=계획관리지역
  if(p === '/api/ordin/zone'){
    const gov = parsed.query.gov || '';
    const zone = parsed.query.zone || '';
    if(!gov || !zone){ sendJson(res, 400, { error:'gov, zone 필요' }); return; }
    if(OC==='test'){ sendJson(res, 200, { ok:false, reason:'test_key', note:'샘플키로는 조문 조회 제한. 인증키 필요.' }); return; }

    // 용도지역명 + 건폐율/용적률 + 세분/층수 키워드로 도시계획 조례 조문 조회
    const zoneShort = zone.replace(/지역$/,'').replace(/^제/,'');
    const zoneNum = zoneShort.replace(/종.*/,'종');
    const kws = ['건폐율','용적률', zone, zoneShort, zoneNum, '층수', '높이'];
    fetchOrdinanceArticles(gov, '도시계획 조례', kws, (err, data) => {
      if(err){ sendJson(res, 502, { error: err.message }); return; }
      sendJson(res, 200, { ok:true, gov, zone, ordinance: data });
    });
    return;
  }

  if(p === '/api/ordin/articles'){
    const gov = parsed.query.gov || '';
    if(!gov){ sendJson(res, 400, { error:'gov 필요' }); return; }
    if(OC==='test'){ sendJson(res, 200, { ok:false, reason:'test_key', note:'샘플키(test)로는 조문 조회가 제한됩니다. 인증키(OC)를 설정하세요.' }); return; }

    // 세 조례를 병렬 조회
    const targets = [
      { name:'건축 조례', keywords:['조경','공개공지','대지 안의 공지','건축위원회','심의','높이','건폐율','용적률','가로구역'] },
      { name:'주차장 설치 및 관리 조례', keywords:['설치기준','부설주차','주차대수','완화','현금납부','기계식'] },
      { name:'도시계획 조례', keywords:['건폐율','용적률','용도지역','높이','층수'] },
    ];
    let done = 0; const results = [];
    targets.forEach((t, i) => {
      fetchOrdinanceArticles(gov, t.name, t.keywords, (err, data) => {
        results[i] = err ? { name:t.name, error:err.message } : data;
        if(++done === targets.length){
          sendJson(res, 200, { ok:true, gov, org:resolveOrg(gov), ordinances:results });
        }
      });
    });
    return;
  }

  // 자치법규 본문: /api/ordin/detail?id=...
  if(p === '/api/ordin/detail'){
    const id = parsed.query.id || '';
    if(!id){ sendJson(res, 400, { error:'id 필요' }); return; }
    getOrdinance(id, (err, r) => {
      if(err){ sendJson(res, 502, { error: err.message }); return; }
      try { sendJson(res, 200, { ok:true, raw: JSON.parse(r.body) }); }
      catch(e){ sendJson(res, 200, { ok:false, preview:r.body.slice(0,300) }); }
    });
    return;
  }

  // 법령 본문: /api/law?query=건축법
  if(p === '/api/law'){
    const query = parsed.query.query || '';
    if(!query){ sendJson(res, 400, { error:'query 필요' }); return; }
    getLaw(query, (err, r) => {
      if(err){ sendJson(res, 502, { error: err.message }); return; }
      try { sendJson(res, 200, { ok:true, raw: JSON.parse(r.body) }); }
      catch(e){ sendJson(res, 200, { ok:false, preview:r.body.slice(0,300) }); }
    });
    return;
  }

  // 정적 파일
  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │   法規·CHECK 서버 실행 중                      │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log(`  │   포트: ${PORT}                                    `);
  console.log(`  │   인증키(OC): ${OC==='test'?'샘플키 test (제한적)':'설정됨'}`);
  console.log('  └─────────────────────────────────────────────┘');
  console.log('  로컬 접속: http://localhost:'+PORT);
  console.log('');
  if(OC==='test'){
    console.log('  ⚠ 실제 조례 조회를 하려면 인증키(OC)가 필요합니다.');
    console.log('    로컬: my_oc.txt 파일에 인증키 저장');
    console.log('    클라우드: 환경변수 LAW_OC 에 인증키 설정');
    console.log('');
  }
});
