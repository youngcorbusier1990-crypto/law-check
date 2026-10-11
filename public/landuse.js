/* ============================================================
   landuse.js — 용도지역별 건폐율·용적률 법정 상한
   근거: 국토의 계획 및 이용에 관한 법률 제77·78조,
         시행령 제84·85조 [시행 2026 기준]
   ※ 법정 상한(최대치)이며, 실제 적용치는 지자체 조례로 더 낮을 수 있음.
      → 토지이용계획 API 원본값과 함께 표시.
   ============================================================ */

/* 용도지역: [표시명, 건폐율상한(%), 용적률상한(%), 분류] */
const LANDUSE_ZONES = {
  // ── 주거지역 ──
  "제1종전용주거지역": { bcr:50,  farMax:100,  cat:"주거", far:"50~100" },
  "제2종전용주거지역": { bcr:50,  farMax:150,  cat:"주거", far:"100~150" },
  "제1종일반주거지역": { bcr:60,  farMax:200,  cat:"주거", far:"100~200" },
  "제2종일반주거지역": { bcr:60,  farMax:250,  cat:"주거", far:"150~250" },
  "제3종일반주거지역": { bcr:50,  farMax:300,  cat:"주거", far:"200~300" },
  "준주거지역":       { bcr:70,  farMax:500,  cat:"주거", far:"200~500" },
  // ── 상업지역 ──
  "중심상업지역":     { bcr:90,  farMax:1500, cat:"상업", far:"400~1500" },
  "일반상업지역":     { bcr:80,  farMax:1300, cat:"상업", far:"300~1300" },
  "근린상업지역":     { bcr:70,  farMax:900,  cat:"상업", far:"200~900" },
  "유통상업지역":     { bcr:80,  farMax:1100, cat:"상업", far:"200~1100" },
  // ── 공업지역 ──
  "전용공업지역":     { bcr:70,  farMax:300,  cat:"공업", far:"150~300" },
  "일반공업지역":     { bcr:70,  farMax:350,  cat:"공업", far:"200~350" },
  "준공업지역":       { bcr:70,  farMax:400,  cat:"공업", far:"200~400" },
  // ── 녹지지역 ──
  "보전녹지지역":     { bcr:20,  farMax:80,   cat:"녹지", far:"50~80" },
  "생산녹지지역":     { bcr:20,  farMax:100,  cat:"녹지", far:"50~100" },
  "자연녹지지역":     { bcr:20,  farMax:100,  cat:"녹지", far:"50~100" },
  // ── 관리지역 ──
  "보전관리지역":     { bcr:20,  farMax:80,   cat:"관리", far:"50~80" },
  "생산관리지역":     { bcr:20,  farMax:80,   cat:"관리", far:"50~80" },
  "계획관리지역":     { bcr:40,  farMax:100,  cat:"관리", far:"50~100" },
  // ── 농림·자연환경보전 ──
  "농림지역":         { bcr:20,  farMax:80,   cat:"농림", far:"50~80" },
  "자연환경보전지역": { bcr:20,  farMax:80,   cat:"보전", far:"50~80" },
};

/* 브이월드/토지이음이 반환하는 다양한 용도지역 표기 → 표준 키 매핑 */
function normalizeZoneName(raw){
  if(!raw) return null;
  const s = String(raw).replace(/\s/g,'');
  // 정확 일치 우선
  for(const key of Object.keys(LANDUSE_ZONES)){
    if(s.indexOf(key)>=0) return key;
  }
  // 약식 표기 보정
  const alias = [
    [/1종전용주거|일종전용/, "제1종전용주거지역"],
    [/2종전용주거|이종전용/, "제2종전용주거지역"],
    [/1종일반주거|일종일반/, "제1종일반주거지역"],
    [/2종일반주거|이종일반/, "제2종일반주거지역"],
    [/3종일반주거|삼종일반/, "제3종일반주거지역"],
    [/준주거/, "준주거지역"],
    [/중심상업/, "중심상업지역"],
    [/일반상업/, "일반상업지역"],
    [/근린상업/, "근린상업지역"],
    [/유통상업/, "유통상업지역"],
    [/전용공업/, "전용공업지역"],
    [/일반공업/, "일반공업지역"],
    [/준공업/, "준공업지역"],
    [/보전녹지/, "보전녹지지역"],
    [/생산녹지/, "생산녹지지역"],
    [/자연녹지/, "자연녹지지역"],
    [/보전관리/, "보전관리지역"],
    [/생산관리/, "생산관리지역"],
    [/계획관리/, "계획관리지역"],
    [/농림/, "농림지역"],
    [/자연환경보전/, "자연환경보전지역"],
  ];
  for(const [re,key] of alias){ if(re.test(s)) return key; }
  return null;
}

/* 지역지구명에서 우리 앱의 zone 코드(방화지구·경관지구 등) 추출 */
function detectZoneCode(jibunList){
  const txt = (jibunList||[]).join(' ');
  if(/방화지구/.test(txt)) return 'fire';
  if(/경관지구/.test(txt)) return 'scenic';
  if(/고도지구/.test(txt)) return 'height';
  if(/방재지구/.test(txt)) return 'disaster';
  if(/보호지구|보존지구/.test(txt)) return 'protect';
  if(/취락지구/.test(txt)) return 'village';
  if(/개발진흥지구/.test(txt)) return 'develop';
  if(/특정용도제한지구/.test(txt)) return 'usereject';
  if(/복합용도지구/.test(txt)) return 'mixed';
  if(/개발제한구역/.test(txt)) return 'greenbelt';
  if(/도시자연공원구역/.test(txt)) return 'parkzone';
  if(/시가화조정구역/.test(txt)) return 'urbanadj';
  if(/수산자원보호구역/.test(txt)) return 'fishery';
  if(/입지규제최소구역/.test(txt)) return 'minregul';
  if(/지구단위계획/.test(txt)) return 'district';
  if(/재개발|재건축|정비구역/.test(txt)) return 'rebuild';
  return '';
}

/* ============================================================
   주차대수 산정 — 주차장법 시행령 별표1 (부설주차장 설치기준)
   원단위: 시설면적 N㎡당 1대. 단독주택·공동주택은 별도 공식.
   ※ 지자체 조례로 강화 가능(예: 세대당 1대 등). 법정 최소 기준.
   ============================================================ */
const PARKING_UNIT = {
  // 위락 100㎡/대
  wirak:        { div:100, label:"위락시설", note:"100㎡당 1대" },
  // 150㎡/대 그룹 (관람장·오피스텔·정신병원 등 일부 제외)
  munhwa_gongyeon:{ div:150, label:"공연장", note:"150㎡당 1대" },
  munhwa_jiphoe: { div:150, label:"집회장", note:"150㎡당 1대" },
  munhwa_jeonsi: { div:150, label:"전시장·동식물원", note:"150㎡당 1대" },
  munhwa_gwanram:{ div:null, label:"관람장", note:"관람장은 별표1 산정대상 제외(개별 검토)" },
  jonggyo:      { div:150, label:"종교시설", note:"150㎡당 1대" },
  pangmae:      { div:150, label:"판매시설", note:"150㎡당 1대" },
  unsu:         { div:150, label:"운수시설", note:"150㎡당 1대" },
  uiryo:        { div:150, label:"의료시설", note:"150㎡당 1대(정신·요양·격리병원 제외)" },
  undong:       { div:150, label:"운동시설", note:"150㎡당 1대(골프장·골프연습장·옥외수영장 제외)" },
  eopmu:        { div:150, label:"업무시설", note:"150㎡당 1대(외국공관·오피스텔 제외)" },
  jangrye:      { div:150, label:"장례시설", note:"150㎡당 1대" },
  bangsong:     { div:150, label:"방송통신(방송국)", note:"150㎡당 1대" },
  // 200㎡/대 그룹
  geun1:        { div:200, label:"제1종근린생활", note:"200㎡당 1대(일부 제외)" },
  geun2:        { div:200, label:"제2종근린생활", note:"200㎡당 1대" },
  sukbak:       { div:200, label:"숙박시설", note:"200㎡당 1대" },
  // 주택: 별도 공식
  danilo:       { div:"house", label:"단독주택", note:"50㎡초과150㎡이하 1대 + 초과 100㎡당 1대" },
  gongdong:     { div:"apt", label:"공동주택", note:"주택건설기준(세대 전용면적별) 적용 — 조례 확인" },
  // 그 밖(창고·공장 등): 대개 400㎡/대 또는 개별
  changgo:      { div:400, label:"창고시설", note:"400㎡당 1대(그 밖의 시설)" },
  gongjang:     { div:400, label:"공장", note:"400㎡당 1대(그 밖의 시설)" },
  gyoyuk:       { div:400, label:"교육연구시설", note:"400㎡당 1대(그 밖의 시설)" },
  noyuja:       { div:400, label:"노유자시설", note:"400㎡당 1대(그 밖의 시설)" },
  suryeon:      { div:400, label:"수련시설", note:"400㎡당 1대(그 밖의 시설)" },
};

/* 주차대수 산정: 용도·시설면적 → 대수 */
function calcParking(use, area){
  const u = PARKING_UNIT[use];
  if(!u) return { count:null, note:"해당 용도 원단위 미등록 — 조례·별표1 직접 확인" };
  if(u.div === "house"){
    // 단독주택: 50㎡ 초과 150㎡ 이하 1대 / 150㎡ 초과 시 1 + (면적-150)/100
    if(area <= 50) return { count:0, note:u.note+" (50㎡ 이하 산정 없음)" };
    if(area <= 150) return { count:1, note:u.note };
    const cnt = 1 + Math.ceil((area - 150) / 100);
    return { count:cnt, note:u.note };
  }
  if(u.div === "apt"){
    return { count:null, note:u.note };
  }
  if(u.div === null){
    return { count:null, note:u.note };
  }
  const raw = area / u.div;
  // 소수점 0.5 이상 올림(별표1 비고), 단 총계 1 미만은 0
  const cnt = raw < 1 ? (raw >= 0.5 ? 1 : 0) : Math.round(raw);
  return { count:cnt, raw:raw, div:u.div, note:u.note };
}

/* ============================================================
   지역·지구·구역 전체 목록 (국토계획법 제37·38·39·40조 등)
   용도지구 9종 + 용도구역 + 지구단위·정비구역
   각 항목: [코드, 표시명, 근거, 설명]
   ============================================================ */
const DISTRICT_LIST = [
  // ── 용도지구 (국토계획법 제37조) ──
  { code:'scenic',   label:'경관지구',        law:'국토계획법 제37조', desc:'경관 보전·관리·형성 (자연·시가지·특화경관지구로 세분)' },
  { code:'height',   label:'고도지구',        law:'국토계획법 제37조', desc:'건축물 높이 최고한도 규제' },
  { code:'fire',     label:'방화지구',        law:'국토계획법 제37조', desc:'화재 위험 예방 — 주요구조부·외벽 내화구조' },
  { code:'disaster', label:'방재지구',        law:'국토계획법 제37조', desc:'풍수해·산사태·재해 예방 (시가지·자연방재지구)' },
  { code:'protect',  label:'보호지구',        law:'국토계획법 제37조', desc:'문화재·중요시설물·생태보존 (역사문화환경·중요시설물·생태계보호지구)' },
  { code:'village',  label:'취락지구',        law:'국토계획법 제37조', desc:'녹지·관리·농림·자연환경보전지역 등 취락 정비 (자연·집단취락지구)' },
  { code:'develop',  label:'개발진흥지구',    law:'국토계획법 제37조', desc:'주거·산업·유통·관광휴양·복합·특정개발진흥지구' },
  { code:'usereject',label:'특정용도제한지구',law:'국토계획법 제37조', desc:'주거·교육환경 보호 위해 특정시설(숙박·위락 등) 제한' },
  { code:'mixed',    label:'복합용도지구',    law:'국토계획법 제37조', desc:'용도지역 제한 완화해 다른 용도 허용' },
  // ── 용도구역 ──
  { code:'greenbelt',label:'개발제한구역',    law:'개발제한구역법', desc:'시가지 무질서 확산 방지 (그린벨트) — 원칙적 건축 제한' },
  { code:'parkzone', label:'도시자연공원구역',law:'도시공원법', desc:'도시 자연환경·경관 보호 — 건축 엄격 제한' },
  { code:'urbanadj', label:'시가화조정구역',  law:'국토계획법 제39조', desc:'무질서한 시가화 방지·단계적 개발 유도' },
  { code:'fishery',  label:'수산자원보호구역',law:'수산자원관리법', desc:'수산자원 보호·육성' },
  { code:'minregul', label:'입지규제최소구역',law:'국토계획법 제40조의2', desc:'도시 정비·거점 육성 위한 규제 완화 구역' },
  // ── 계획·정비 구역 ──
  { code:'district', label:'지구단위계획구역',law:'국토계획법 제51조', desc:'용도·높이·건폐율·용적률·건축선 개별 지침 우선' },
  { code:'rebuild',  label:'재개발·재건축 정비구역', law:'도시정비법', desc:'정비계획·사업시행계획 절차 병행' },
];
