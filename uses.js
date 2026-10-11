/* ============================================================
   공용 유틸리티 — 가장 먼저 로드되어 모든 파일에서 사용
   (var 선언으로 로드 순서·재선언 문제 원천 차단)
   ============================================================ */
var $   = window.$   || function(s){ return document.querySelector(s); };
var $$  = window.$$  || function(s){ return [...document.querySelectorAll(s)]; };
var fmt = window.fmt || function(n){ return Number(n||0).toLocaleString("ko-KR"); };
var esc = window.esc || function(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); };
function toast(msg){ var t=document.getElementById("toast"); if(!t)return; t.textContent=msg; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(function(){t.classList.remove("show");},2200); }

/* ============================================================
   USES — 건축법 시행령 별표1 [시행 2026.7.28] 용도별 건축물 종류
   전체 29개 용도군. 일부는 법규 판별에 필요한 세부용도 포함.
   value는 로직 키, label은 표시명.
   ============================================================ */
const USE_GROUPS = [
  { g:"단독주택", items:[
    {v:"danilo",      l:"단독주택", d:"1호 가목. 단독주택 형태(가정어린이집·공동생활가정·지역아동센터·작은도서관·노인복지시설 포함)"},
    {v:"dajung",      l:"다중주택", d:"1호 나목. 여러 사람 장기거주·독립주거 아님(취사시설 없음)·바닥면적 660㎡ 이하·3개층 이하"},
    {v:"dagagu",      l:"다가구주택", d:"1호 다목. 3개층 이하·바닥면적 660㎡ 이하·19세대 이하 (공동주택 아닌 것)"},
    {v:"gonggwan",    l:"공관", d:"1호 라목. 공관(公館)"},
  ]},
  { g:"공동주택", items:[
    {v:"apt",         l:"아파트", d:"2호 가목. 주택으로 쓰는 층수 5개층 이상"},
    {v:"yeonlip",     l:"연립주택", d:"2호 나목. 1개동 바닥면적 660㎡ 초과·4개층 이하"},
    {v:"dasedae",     l:"다세대주택", d:"2호 다목. 1개동 바닥면적 660㎡ 이하·4개층 이하"},
    {v:"gisuksa",     l:"기숙사", d:"2호 라목. 일반기숙사·임대형기숙사(공동취사 50%↑). 구분소유 개별실 제외"},
  ]},
  { g:"근린생활", items:[
    {v:"geun1",       l:"제1종 근린생활시설", d:"3호. 소매점(1천㎡ 미만)·휴게음식점(300㎡ 미만)·의원·이미용·탁구장(500㎡ 미만)·공공업무(1천㎡ 미만) 등"},
    {v:"geun2",       l:"제2종 근린생활시설", d:"4호. 공연장(500㎡ 미만)·종교집회장(500㎡ 미만)·일반음식점·학원(500㎡ 미만)·다중생활시설(고시원, 500㎡ 미만) 등"},
  ]},
  { g:"문화·집회", items:[
    {v:"munhwa_gongyeon", l:"문화및집회 — 공연장", d:"5호 가목. 공연장으로서 2종근생 아닌 것(500㎡ 이상)"},
    {v:"munhwa_jiphoe",   l:"문화및집회 — 집회장", d:"5호 나목. 예식장·공회당·회의장·마권장외발매소 등(2종근생 아닌 것)"},
    {v:"munhwa_gwanram",  l:"문화및집회 — 관람장", d:"5호 다목. 경마·경륜·경정·자동차경기장, 관람석 1천㎡ 이상 체육관·운동장"},
    {v:"munhwa_jeonsi",   l:"문화및집회 — 전시장·동식물원", d:"5호 라·마목. 박물관·미술관·과학관·전시장 / 동물원·식물원·수족관"},
  ]},
  { g:"종교·판매·운수", items:[
    {v:"jonggyo",     l:"종교시설", d:"6호. 종교집회장(2종근생 아닌 것)·봉안당"},
    {v:"pangmae",     l:"판매시설", d:"7호. 도매시장·소매시장(대규모점포)·상점"},
    {v:"unsu",        l:"운수시설", d:"8호. 여객터미널·철도·공항·항만·버티포트"},
  ]},
  { g:"의료·교육·복지", items:[
    {v:"uiryo",       l:"의료시설", d:"9호. 병원(종합·치과·한방·정신·요양)·격리병원"},
    {v:"gyoyuk",      l:"교육연구시설", d:"10호. 학교·교육원·직업훈련소·학원·연구소·도서관(2종근생 아닌 것)"},
    {v:"noyuja",      l:"노유자시설", d:"11호. 아동시설(어린이집 등)·노인복지시설·사회복지시설"},
    {v:"suryeon",     l:"수련시설", d:"12호. 생활권·자연권 수련시설·유스호스텔·야영장(29호 아닌 것)"},
  ]},
  { g:"운동·업무·숙박", items:[
    {v:"undong",      l:"운동시설", d:"13호. 탁구·체육도장·볼링장 등(근생 아닌 것)·관람석 1천㎡ 미만 체육관·운동장"},
    {v:"eopmu",       l:"업무시설", d:"14호. 공공업무시설(청사·외국공관)·일반업무시설(사무소·오피스텔)"},
    {v:"sukbak",      l:"숙박시설", d:"15호. 일반·생활숙박시설·관광숙박시설·다중생활시설(2종근생 아닌 것)"},
    {v:"wirak",       l:"위락시설", d:"16호. 단란주점(2종근생 아닌 것)·유흥주점·무도장·카지노·테마파크"},
  ]},
  { g:"산업·저장", items:[
    {v:"gongjang",    l:"공장", d:"17호. 물품 제조·가공·수리 건축물(근생·위험물·자동차·자원순환 등으로 분류 안 된 것)"},
    {v:"changgo",     l:"창고시설", d:"18호. 창고(일반·냉장냉동)·하역장·물류터미널·집배송시설(2종근생·위험물 제외)"},
    {v:"wiheom",      l:"위험물 저장 및 처리 시설", d:"19호. 주유소·LPG충전소·위험물제조소·고압가스·화약류저장소 등(자가용 제외)"},
    {v:"jadongcha",   l:"자동차 관련 시설", d:"20호. 주차장·세차장·폐차장·검사장·매매장·정비공장·운전학원·차고"},
  ]},
  { g:"기타 시설", items:[
    {v:"dongsingmul", l:"동물 및 식물 관련 시설", d:"21호. 축사·가축시설·도축장·작물재배사·온실 등(동식물원 제외)"},
    {v:"jawon",       l:"자원순환 관련 시설", d:"22호. 하수처리·고물상·폐기물재활용·처분·감량화시설"},
    {v:"gyojeong",    l:"교정시설", d:"23호. 교정시설(구치소·교도소)·갱생보호시설·소년원(1종근생 제외)"},
    {v:"gukbang",     l:"국방·군사시설", d:"23의2호. 국방·군사시설(1종근생 제외)"},
    {v:"bangsong",    l:"방송통신시설", d:"24호. 방송국·전신전화국·촬영소·통신용시설·데이터센터(1종근생 제외)"},
    {v:"baljeon",     l:"발전시설", d:"25호. 발전소(집단에너지 공급시설 포함, 1종근생 아닌 것)"},
    {v:"myoji",       l:"묘지 관련 시설", d:"26호. 화장시설·봉안당(종교시설 제외)·묘지부수건축물·동물화장시설"},
    {v:"gwangwang",   l:"관광 휴게시설", d:"27호. 야외음악당·야외극장·어린이회관·관망탑·휴게소·공원부수시설"},
    {v:"jangrye",     l:"장례시설", d:"28호. 장례식장(의료시설 부수 제외)·동물전용 장례식장"},
    {v:"yayeong",     l:"야영장 시설", d:"29호. 관광진흥법 야영장(관리동·화장실 등 300㎡ 미만)"},
  ]},
];
const USE_LABEL = {};
const USE_DESC = {};
USE_GROUPS.forEach(g=>g.items.forEach(i=>{USE_LABEL[i.v]=i.l; USE_DESC[i.v]=i.d||"";}));

/* 세부유형 → 상위 카테고리 매핑 (기존 규칙 호환용)
   danilo 계열은 모두 단독주택으로, apt 계열은 공동주택으로 판정 */
const USE_PARENT = {
  danilo:"danilo", dajung:"danilo", dagagu:"danilo", gonggwan:"danilo",
  apt:"gongdong", yeonlip:"gongdong", dasedae:"gongdong", gisuksa:"gongdong",
};
function parentUse(u){ return USE_PARENT[u] || u; }

/* 용도 카테고리 헬퍼 (규칙에서 사용) */
const isMunhwa   = u => u==="munhwa" || (u&&u.indexOf("munhwa_")===0);
const isGongyeon = u => u==="munhwa_gongyeon";
const isJeonsi   = u => u==="munhwa_jeonsi";
// 다중이용 성격 용도 (공개공지·편의시설 등 다수 규정 대상)
const MULTIUSE = ["munhwa_gongyeon","munhwa_jiphoe","munhwa_gwanram","munhwa_jeonsi","jonggyo","pangmae","unsu","uiryo","gyoyuk","noyuja","undong","sukbak","wirak"];
const isMultiUse = u => MULTIUSE.includes(u);
// 관람석·집회실을 갖는 용도 (출구·복도 특례)
const hasAuditorium = u => isGongyeon(u)||u==="munhwa_gwanram"||u==="munhwa_jiphoe";
