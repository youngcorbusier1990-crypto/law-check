/* ---------- 상태 ---------- */
let currentProject = null;   // {info, rules, checks}
const LS_KEY = "lawcheck_projects_v1";

/* 공용 유틸($, $$, fmt, esc, toast)은 uses.js에 정의됨 */
const SRC_LABEL={act:["법",  "act"],enf:["령","enf"],rule:["규칙","rule"],ord:["조례","ord"],other:["기타","other"]};

/* ---------- 탭 ---------- */
$$(".tab-btn").forEach(b=>b.onclick=()=>{
  $$(".tab-btn").forEach(x=>x.classList.remove("active"));
  $$(".panel").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  $("#tab-"+b.dataset.tab).classList.add("active");
  if(b.dataset.tab==="width" && currentProject) renderWidth(currentProject.info);
});

/* ---------- 입력 읽기 ---------- */
function readInput(){
  const uses=[$("#f_use").value,$("#f_use2").value,$("#f_use3").value].filter(Boolean);
  return {
    name:$("#f_name").value.trim()||"이름 없는 프로젝트",
    use:$("#f_use").value, useLabel:USE_LABEL[$("#f_use").value]||"미지정",
    uses,
    usesLabel: uses.map(u=>USE_LABEL[u]||u).join(" + ")||"미지정",
    work:(()=>{const a=$$(".f_work_cb").filter(c=>c.checked).map(c=>c.value);return a.length?a.join("+"):"new";})(),
    workLabel:(()=>{const L={new:"신축",ext:"증축",remo:"대수선",recon:"개축·재축"};const a=$$(".f_work_cb").filter(c=>c.checked).map(c=>L[c.value]);return a.length?a.join("+"):"신축";})(),
    works:$$(".f_work_cb").filter(c=>c.checked).map(c=>c.value),
    area:+$("#f_area").value||0,
    lot:+$("#f_lot").value||0,
    floors:+$("#f_floors").value||0,
    base:+$("#f_base").value||0,
    height:+$("#f_height").value||0,
    zones:$$(".f_zone_cb").filter(c=>c.checked).map(c=>c.value),
    zone:(()=>{const a=$$(".f_zone_cb").filter(c=>c.checked).map(c=>c.value);return a[0]||"";})(),
    zoneLabel:(()=>{const a=$$(".f_zone_cb").filter(c=>c.checked);return a.length?a.map(c=>c.parentElement.textContent.trim()).join(", "):"";})(),
    gov:$("#f_gov").value.trim(),
  };
}
function writeInput(d){
  $("#f_name").value=d.name==="이름 없는 프로젝트"?"":d.name;
  const uses=d.uses||(d.use?[d.use]:[]);
  $("#f_use").value=uses[0]||"";
  $("#f_use2").value=uses[1]||"";
  $("#f_use3").value=uses[2]||"";
  $("#use3wrap").style.display=uses[1]?"flex":"none";
  const works = d.works || (d.work?String(d.work).split("+"):["new"]);
  $$(".f_work_cb").forEach(c=>{ c.checked = works.includes(c.value); });
  $("#f_area").value=d.area||""; $("#f_lot").value=d.lot||"";
  $("#f_floors").value=d.floors||""; $("#f_base").value=d.base||"";
  $("#f_height").value=d.height||"";
  const zones = d.zones || (d.zone?[d.zone]:[]);
  $$(".f_zone_cb").forEach(c=>{ c.checked = zones.includes(c.value); });
  $("#f_gov").value=d.gov||"";
}

/* ---------- 판별 엔진 ---------- */
function analyze(){
  const d=readInput();
  if(!d.use){toast("주 용도를 선택하세요");return}
  if(d.area<=0&&d.floors<=0){toast("연면적 또는 층수를 입력하세요");return}

  const uses = d.uses.length?d.uses:[d.use];
  const map = new Map();
  for(const u of uses){
    // 세부유형(다가구·아파트 등)은 상위용도(단독·공동주택)로 정규화해 규칙 판정
    const pu = (typeof parentUse==='function') ? parentUse(u) : u;
    const du={...d, use:pu, subUse:u};
    for(const r of RULES){
      let ok=false; try{ok=r.cond(du)}catch(e){ok=false}
      if(!ok) continue;
      if(!map.has(r.art)){
        map.set(r.art, {...r, whyText:r.why?safeWhy(r.why,du):null, byUse:new Set([u])});
      } else { map.get(r.art).byUse.add(u); }
    }
  }
  const hits=[...map.values()].map(h=>{
    if(uses.length>1 && h.byUse.size<uses.length){
      h.byUseText=[...h.byUse].map(u=>USE_LABEL[u]||u).join("·");
    }
    return h;
  });

  currentProject={info:d, rules:hits, checks:currentProject?.checks||{}, savedAt:null};
  renderResult(d,hits);
  buildChecklist(hits);
  $("#resBadge").style.display="inline-block";
  $("#resBadge").textContent=hits.length;
  $$(".tab-btn").forEach(x=>x.classList.remove("active"));
  $$(".panel").forEach(x=>x.classList.remove("active"));
  document.querySelector('[data-tab="result"]').classList.add("active");
  $("#tab-result").classList.add("active");
  toast(`${uses.length>1?"복합용도 ":""}${hits.length}개 조항 판별 완료`);
}
function safeWhy(fn,d){try{return fn(d)}catch(e){return null}}

/* ---------- 결과 렌더 ---------- */
function renderResult(d,hits){
  const scaleLabel=classifyScale(d);
  const groups={};
  hits.forEach(h=>{(groups[h.cat]=groups[h.cat]||[]).push(h)});
  const order=["기본·공통","용도 판정","공사종류","허가·심의","감리","대지·조경","피난·방화","피난·동선","구조·설비","에너지·환경","편의·안전","교통·주차","지역·지구","용도별 특례","용도 심화","자치조례"];

  let html=`<div class="result-head">
    <div><div class="h-name">${esc(d.name)}</div>
    <div class="h-meta">${esc(d.usesLabel||d.useLabel)} · ${esc(d.workLabel)} · 연면적 ${fmt(d.area)}㎡ · 지상 ${d.floors}층/지하 ${d.base}층 · 높이 ${fmt(d.height)}m</div></div>
    <div class="scale-chip">${scaleLabel}</div>
  </div>
  <div class="export-bar">
    <button class="btn sm" onclick="exportReport()">◈ 법규 검토서 내보내기 (HTML)</button>
    <button class="btn ghost sm" onclick="exportLinks()">◎ 원문 링크 목록 (텍스트)</button>
    <button class="btn ghost sm" onclick="openAllLaws()">↗ 원문 일괄 열기</button>
  </div>`;

  order.filter(c=>groups[c]).forEach(cat=>{
    const items=groups[cat];
    html+=`<div class="law-group"><div class="lg-head"><span class="cat">${esc(cat)}</span><span class="cnt">${items.length}개 조항</span></div>`;
    items.forEach(h=>{
      const[lbl,cls]=SRC_LABEL[h.src]||["기타","other"];
      html+=`<div class="law-item">
        <div class="li-top"><span class="li-art">${esc(h.art)}</span><span class="li-src ${cls}">${lbl}</span></div>
        ${h.byUseText?`<div class="li-byuse">◑ ${esc(h.byUseText)} 용도에서 적용</div>`:""}
        ${h.whyText?`<div class="li-why">▲ ${esc(h.whyText)}</div>`:""}
        <div class="li-desc">${esc(h.desc)}</div>
        ${h.check?`<div class="li-check">✓ 검토: ${esc(h.check)}</div>`:""}
        <a class="li-link" href="${h.src==='ord'?buildOrdinanceLink((d.gov||'').trim(), lawNameOf(h.art)):buildLawLink(h.art)}" target="_blank" rel="noopener">📖 ${h.src==='ord'?`${(d.gov||'').trim()?esc((d.gov||'').trim())+' ':''}자치법규`:'국가법령정보센터'}에서 「${esc(lawNameOf(h.art))}」 ${h.src==='ord'?'조례':'원문'} 보기 ↗</a>
      </div>`;
    });
    html+=`</div>`;
  });

  // 관련 법령 원문 모음 (정식 명칭 기준 고유 법령)
  const lawSet=new Map();
  hits.forEach(h=>{const n=lawNameOf(h.art); if(!lawSet.has(n)) lawSet.set(n,buildLawLink(h.art));});
  let lawsHtml=`<div class="laws-src"><div class="ls-head">📚 이 검토에 적용된 법령 원문 (${lawSet.size}개)</div><div class="ls-grid">`;
  [...lawSet.entries()].forEach(([name,url])=>{
    lawsHtml+=`<a class="ls-item" href="${url}" target="_blank" rel="noopener">「${esc(name)}」 ↗</a>`;
  });
  lawsHtml+=`</div><button class="btn ghost sm" id="btnOpenAll" style="margin-top:10px">관련 법령 전체 새 탭으로 열기</button></div>`;
  html+=lawsHtml;

  // 지역 맞춤 자치법규(조례) 확인 섹션
  const gov=(d.gov||"").trim();
  const ordinList=[
    ["건축 조례","건폐율·용적률 완화, 대지 안의 공지, 조경면적률, 건축위원회 심의 대상, 가로구역 높이"],
    ["주차장 설치 및 관리 조례","용도별 부설주차장 설치기준(원단위)·완화·현금납부"],
    ["도시계획 조례","용도지역별 건폐율·용적률·용도제한 세부기준"],
    ["경관 조례","경관지구·경관계획 심의 대상 및 형태·색채 기준"],
    ["도시·군계획시설 조례","기반시설·공공시설 부담 기준"],
  ];
  let ordHtml=`<div class="ordin-src"><div class="ls-head">🏛️ 지역 맞춤 조례 확인 ${gov?`— <b>${esc(gov)}</b>`:`<span style="font-weight:400;color:var(--seal)">(지자체를 입력하면 해당 지역 조례로 바로 연결됩니다)</span>`}</div>
    <div class="ordin-desc">건축법·시행령은 전국 공통이지만, 아래 항목은 <b>지자체 조례로 지역마다 다르게</b> 정해집니다. 반드시 해당 지역 조례 원문에서 수치를 확인하세요.</div>
    <div id="liveOrdinBox" class="live-ordin"></div>
    <div class="ls-grid">`;
  ordinList.forEach(([name,note])=>{
    ordHtml+=`<a class="ordin-item" href="${buildOrdinanceLink(gov,name)}" target="_blank" rel="noopener" title="${esc(note)}">${gov?esc(gov)+" ":""}${esc(name)} ↗</a>`;
  });
  ordHtml+=`</div>`;
  if(!gov) ordHtml+=`<div class="ordin-warn">⚠ 지자체 미입력: 위 링크는 전국 조례 검색으로 연결됩니다. ① 규모 입력의 <b>지자체</b> 칸에 "서울특별시 강남구" 처럼 입력하면 해당 지역 조례로 정확히 연결됩니다.</div>`;
  ordHtml+=`</div>`;
  html+=ordHtml;

  html+=`<div class="note-box"><b>▲ 표시 조항</b>은 입력한 규모(연면적·층수·높이·용도)가 임계값을 넘어 <b>추가로 적용된</b> 조항입니다. 규모를 바꾸면 결과가 달라집니다. 자치조례·지구단위계획은 반드시 관할 지자체에서 별도 확인하세요.</div>`;

  // 유효너비 계산기 (문화·집회시설 등에서 노출)
  html+=widthCalcHTML(d);

  $("#resultBody").innerHTML=html;
  bindWidthCalc();
  const oa=$("#btnOpenAll"); if(oa) oa.onclick=openAllLaws;
  // 조례 실시간 조회 (서버 연동 시)
  if(typeof enhanceOrdinanceSection==='function'){
    enhanceOrdinanceSection((d.gov||'').trim());
  }
}

/* ── 복도·계단·출구 유효너비 계산기 ── */
function widthCalcHTML(d){
  const mun = isMunhwa(d.use);
  const show = mun || d.area>=200 || ["gongdong","gyoyuk","uiryo"].includes(d.use);
  if(!show) return "";
  const multi = (d.uses&&d.uses.length>1);
  const showRoom = isGongyeon(d.use)||d.use==="munhwa_gwanram"||d.use==="munhwa_jiphoe";
  return `<div class="calc-wrap">
    <div class="calc-head">◨ 유효너비 자동 산정 <span>피난방화규칙 제15·15조의2 기준</span></div>
    <div class="calc-body">
      ${multi?`<div class="calc-note">복합용도입니다. 계산기는 <b>주 용도(${esc(USE_LABEL[d.use]||d.use)})</b> 기준입니다. 다른 용도 부분은 해당 용도를 주 용도로 바꿔 재계산하세요.</div>`:``}
      <div class="calc-row">
        <label>해당 층 거실/해당용도 바닥면적</label>
        <div class="unit-row"><input type="number" id="cAreaFloor" min="0" placeholder="예: 850"><span class="u">㎡</span></div>
      </div>
      ${showRoom?`<div class="calc-row">
        <label>개별 관람실 바닥면적 <span class="hint">(공연장·관람장 등, 없으면 0)</span></label>
        <div class="unit-row"><input type="number" id="cRoom" min="0" placeholder="예: 400"><span class="u">㎡</span></div>
      </div>`:``}
      ${(d.floors>=6&&d.area>=2000)?`<div class="calc-row">
        <label>6층 이상 거실 바닥면적 합계 <span class="hint">(승강기 대수 산정용)</span></label>
        <div class="unit-row"><input type="number" id="cElev" min="0" placeholder="예: 7000"><span class="u">㎡</span></div>
      </div>`:``}
      <div class="calc-row">
        <label>복도 형식</label>
        <select id="cCorr">
          <option value="both">양옆에 거실이 있는 복도</option>
          <option value="one">편복도 (기타)</option>
        </select>
      </div>
      <button class="btn sm" id="cRun" style="margin-top:4px">유효너비 계산</button>
      <div id="cOut" class="calc-out"></div>
    </div>
  </div>`;
}
function bindWidthCalc(){
  const btn=document.getElementById("cRun"); if(!btn) return;
  btn.onclick=()=>{
    const d=currentProject.info;
    const A=+(document.getElementById("cAreaFloor")?.value||0);
    const room=+(document.getElementById("cRoom")?.value||0);
    const corr=document.getElementById("cCorr")?.value||"both";
    const out=[];
    const mun=isMunhwa(d.use);

    // 복도 유효너비
    if(mun && A>0){
      // 제15조의2 제2항 (관람·집회 접한 복도)
      let corrW, basis;
      if(A<500){corrW=1.5;basis="해당층 해당용도 500㎡ 미만";}
      else if(A<1000){corrW=1.8;basis="500㎡ 이상 1천㎡ 미만";}
      else {corrW=2.4;basis="1천㎡ 이상";}
      out.push(`<div class="co-item"><b>복도 유효너비 ${corrW.toFixed(1)}m 이상</b><span>문화·집회시설 관람·집회실 접한 복도 · ${basis} (제15조의2제2항)</span></div>`);
    } else {
      // 제15조의2 제1항 (일반)
      let corrW=null, basis="";
      if(d.use==="gyoyuk"){corrW=corr==="both"?2.4:1.8;basis="유치원·학교";}
      else if(d.use==="gongdong"){corrW=corr==="both"?1.8:1.2;basis="공동주택·오피스텔";}
      else if(A>=200){corrW=corr==="both"?(d.use==="uiryo"?1.8:1.5):1.2;basis=`거실 200㎡ 이상${d.use==="uiryo"?" · 의료시설":""}`;}
      if(corrW) out.push(`<div class="co-item"><b>복도 유효너비 ${corrW.toFixed(1)}m 이상</b><span>${basis} · ${corr==="both"?"양옆 거실":"편복도"} (제15조의2제1항)</span></div>`);
      else out.push(`<div class="co-item muted"><b>일반 복도 기준</b><span>거실 200㎡ 미만은 별도 최소 규정 없음 — 피난·소방 기준 별도 검토</span></div>`);
    }

    // 계단 유효너비
    let stairW=0.6, sB="기타";
    if(d.use==="gyoyuk"){stairW=1.5;sB="학교(초·중·고)";}
    else if((mun&&!isJeonsi(d.use))||d.use==="pangmae"){stairW=1.2;sB="문화집회(공연장·집회장·관람장)·판매";}
    else if(A>=200){stairW=1.2;sB="위층 거실합계 200㎡ 이상";}
    out.push(`<div class="co-item"><b>계단 유효너비 ${stairW.toFixed(1)}m 이상</b><span>${sB} (제15조제2항) · 높이 3m 넘으면 3m 이내마다 유효너비 1.2m 계단참 · 유효높이 2.1m</span></div>`);

    // 관람석 출구 (공연장·관람장·집회장)
    const hasRoom=isGongyeon(d.use)||d.use==="munhwa_gwanram"||d.use==="munhwa_jiphoe";
    if(hasRoom && room>=300){
      const w=(room/100*0.6);
      out.push(`<div class="co-item"><b>관람석 출구 유효너비 합계 ${w.toFixed(2)}m 이상</b><span>개별 관람실 ${fmt(room)}㎡ × (0.6m/100㎡) · 관람실별 2개소↑·각 1.5m↑ · 안여닫이 금지 (제10조)</span></div>`);
    } else if(hasRoom && room>0 && room<300){
      out.push(`<div class="co-item muted"><b>관람석 출구</b><span>개별 관람실 300㎡ 미만 — 출구 너비 합계 규정 미적용(안여닫이 금지 등 일반기준 적용)</span></div>`);
    }

    // 승용승강기 대수 (그룹별)
    const elev=+(document.getElementById("cElev")?.value||0);
    if(d.floors>=6 && d.area>=2000 && elev>0){
      let base,step,grp;
      // 그룹1: 공연장·집회장·관람장·판매·의료 (2대 기준, 2천㎡마다)
      // 그룹2: 전시장·동식물원·업무·숙박·위락 (1대 기준, 2천㎡마다)
      // 그룹3: 그 외 (1대 기준, 3천㎡마다)
      const g1 = (mun && !isJeonsi(d.use)) || ["pangmae","uiryo"].includes(d.use);
      const g2 = isJeonsi(d.use) || ["eopmu","sukbak"].includes(d.use);
      if(g1){base=2;step=2000;grp="그룹1(공연·집회·관람·판매·의료)";}
      else if(g2){base=1;step=2000;grp=isJeonsi(d.use)?"그룹2(전시장·동식물원)":"그룹2(업무·숙박)";}
      else {base=1;step=3000;grp="그룹3(그 외)";}
      let cnt=base;
      if(elev>3000) cnt=base+Math.ceil((elev-3000)/step);
      out.push(`<div class="co-item"><b>승용승강기 ${cnt}대 이상</b><span>6층↑ 거실 ${fmt(elev)}㎡ · ${grp} · 8·16인승은 2·1대로 가감 산정 가능 (설비규칙 별표1의2)</span></div>`);
    }

    document.getElementById("cOut").innerHTML=out.join("");
  };
}

function classifyScale(d){
  if(d.floors>=50||d.height>=200) return "초고층";
  if(d.floors>=30||d.height>=120) return "고층건축물";
  if(d.area>=5000||d.floors>=11) return "대규모";
  if(d.area>=1000) return "중규모";
  return "소규모";
}

/* ---------- 원본자료·검토서 내보내기 ---------- */
function lawLink(art){ return buildLawLink(art); }
function lawNameOf(art){
  for(const [kw,name] of LAW_NAME_MAP){ if(art.indexOf(kw)>=0) return name; }
  if(art.indexOf("건축법")===0) return "건축법";
  return art.split(" ")[0].replace(/\(.*$/,"").replace(/제\d+조.*$/,"")||art;
}

function exportReport(){
  if(!currentProject?.rules?.length){toast("먼저 법조항을 판별하세요");return}
  const d=currentProject.info, hits=currentProject.rules;
  const groups={}; hits.forEach(h=>{(groups[h.cat]=groups[h.cat]||[]).push(h)});
  const order=["기본·공통","용도 판정","공사종류","허가·심의","감리","대지·조경","피난·방화","구조·설비","에너지·환경","편의·안전","교통·주차","지역·지구","용도별 특례","용도 심화","자치조례"];
  const today=new Date().toLocaleDateString("ko-KR");
  let rows="";
  order.filter(c=>groups[c]).forEach(cat=>{
    rows+=`<tr class="cat"><td colspan="4">${esc(cat)}</td></tr>`;
    groups[cat].forEach(h=>{
      rows+=`<tr>
        <td class="art"><a href="${lawLink(h.art)}" target="_blank">${esc(h.art)}</a></td>
        <td>${esc(h.desc)}${h.whyText?`<div class="why">▲ ${esc(h.whyText)}</div>`:""}${h.byUseText?`<div class="byuse">◑ ${esc(h.byUseText)} 용도</div>`:""}</td>
        <td class="chk">${esc(h.check||"")}</td>
        <td class="lk"><a href="${lawLink(h.art)}" target="_blank">원문↗</a></td>
      </tr>`;
    });
  });
  const doc=`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>법규 검토서 · ${esc(d.name)}</title>
<style>
body{font-family:-apple-system,"Malgun Gothic",sans-serif;max-width:1000px;margin:0 auto;padding:32px 24px;color:#1a1c1a;line-height:1.6}
h1{font-family:Georgia,serif;font-size:24px;border-bottom:3px solid #1f3a5f;padding-bottom:10px}
.meta{background:#f4f2ec;border:1px solid #e0ddd2;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px}
.meta b{color:#1f3a5f}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
th{background:#1f3a5f;color:#fff;padding:9px 11px;text-align:left;font-size:12px}
td{border-bottom:1px solid #e0ddd2;padding:9px 11px;vertical-align:top}
tr.cat td{background:#eef2f7;font-weight:700;color:#1f3a5f;font-size:13px}
td.art{font-weight:600;white-space:nowrap;font-size:12.5px}
td.art a{color:#1f3a5f;text-decoration:none}
td.chk{color:#3d6b4a;font-size:12px}
td.lk a{color:#b5462e;text-decoration:none;white-space:nowrap}
.why{color:#a8781c;font-size:11.5px;margin-top:3px}
.byuse{color:#b5462e;font-size:11.5px;margin-top:2px}
.foot{margin-top:24px;padding-top:14px;border-top:1px solid #e0ddd2;font-size:11.5px;color:#8a8d82}
@media print{.no-print{display:none}body{padding:0}}
</style></head><body>
<h1>建築 法規 檢討書</h1>
<div class="meta">
<b>프로젝트</b> ${esc(d.name)}<br>
<b>용도</b> ${esc(d.usesLabel||d.useLabel)} &nbsp; <b>공사</b> ${esc(d.workLabel)}<br>
<b>규모</b> 연면적 ${fmt(d.area)}㎡ · 대지 ${fmt(d.lot)}㎡ · 지상 ${d.floors}층/지하 ${d.base}층 · 높이 ${fmt(d.height)}m · <b>${classifyScale(d)}</b><br>
${d.gov?`<b>지자체</b> ${esc(d.gov)}<br>`:""}
<b>작성일</b> ${today} &nbsp; <b>적용 조항</b> ${hits.length}건
</div>
<table><thead><tr><th>조항</th><th>내용 / 적용 사유</th><th>실무 검토포인트</th><th>원문</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="foot">본 검토서는 규모별 임계값에 따른 자동 판별 결과입니다. ▲는 규모로 인해 추가 적용된 조항, ◑는 특정 용도에서만 적용된 조항입니다. 자치조례·지구단위계획·허가권자 해석은 반드시 관할 지자체에서 별도 확인하시기 바랍니다. 원문은 국가법령정보센터(law.go.kr) 기준이며, 최신 개정 여부를 확인하세요. · 法規·CHECK 생성</div>
<`+`/body></html>`;
  const blob=new Blob([doc],{type:"text/html;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download=`법규검토서_${d.name.replace(/[^\wㄱ-힣]/g,"_")}_${new Date().toISOString().slice(0,10)}.html`;
  a.click(); toast("법규 검토서를 저장했습니다");
}

function exportLinks(){
  if(!currentProject?.rules?.length){toast("먼저 법조항을 판별하세요");return}
  const d=currentProject.info, hits=currentProject.rules;
  let txt=`■ 법규 원문 링크 목록\n프로젝트: ${d.name}\n용도: ${d.usesLabel||d.useLabel} / 규모: 연면적 ${fmt(d.area)}㎡ · ${d.floors}층 · ${fmt(d.height)}m\n작성일: ${new Date().toLocaleDateString("ko-KR")}\n적용 조항: ${hits.length}건\n${"─".repeat(40)}\n\n`;
  const groups={}; hits.forEach(h=>{(groups[h.cat]=groups[h.cat]||[]).push(h)});
  Object.keys(groups).forEach(cat=>{
    txt+=`【${cat}】\n`;
    groups[cat].forEach(h=>{
      txt+=`· ${h.art}\n  ${h.desc}\n`;
      if(h.check) txt+=`  검토: ${h.check}\n`;
      txt+=`  원문: ${lawLink(h.art)}\n\n`;
    });
  });
  txt+=`${"─".repeat(40)}\n※ 원문은 국가법령정보센터(law.go.kr) 기준. 최신 개정 확인 필요. 자치조례는 관할 지자체 확인.\n法規·CHECK 생성`;
  const blob=new Blob([txt],{type:"text/plain;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download=`법규원문링크_${d.name.replace(/[^\wㄱ-힣]/g,"_")}_${new Date().toISOString().slice(0,10)}.txt`;
  a.click(); toast("원문 링크 목록을 저장했습니다");
}

function openAllLaws(){
  if(!currentProject?.rules?.length){toast("먼저 법조항을 판별하세요");return}
  // 고유 법령명만 추출 (정식 명칭 기준 중복 제거)
  const seen=new Set(), laws=[];
  currentProject.rules.forEach(h=>{
    const name=lawNameOf(h.art);
    if(!seen.has(name)){seen.add(name);laws.push(name);}
  });
  if(laws.length>8){
    if(!confirm(`${laws.length}개 법령 원문을 각각 새 탭으로 엽니다. 계속할까요?`)) return;
  }
  laws.forEach((name,i)=>setTimeout(()=>window.open(LAW_URL+encodeURIComponent(name),"_blank"),i*300));
  toast(`${laws.length}개 법령 원문을 엽니다`);
}

/* ---------- 체크리스트 ---------- */
function buildChecklist(hits){
  if(!currentProject) return;
  const checks=currentProject.checks||{};
  // 규칙 기반 체크 항목 + 공정 순서 고정 항목
  const items=hits.map(h=>({
    id:h.art, title:h.art,
    note:h.check||h.desc,
    tag:h.cat,
    done: checks[h.art]||false
  }));
  currentProject.checkItems=items;
  renderChecklist();
}
function renderChecklist(){
  const box=$("#checkBody");
  if(!currentProject?.checkItems?.length){
    box.innerHTML=`<div class="empty"><div class="big">☑</div>법조항을 먼저 판별하면<br>체크리스트가 자동 생성됩니다.</div>`;return;
  }
  const items=currentProject.checkItems;
  const done=items.filter(i=>i.done).length;
  const pct=Math.round(done/items.length*100);
  let html=`<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
    <span style="font-size:13px;color:var(--ink-2)">진행률 <b>${done}/${items.length}</b></span>
    <span style="font-size:13px;font-weight:700;color:var(--ok)">${pct}%</span></div>
    <div class="ck-progress"><i style="width:${pct}%"></i></div>`;
  items.forEach((it,i)=>{
    html+=`<div class="ck-item ${it.done?'done':''}">
      <input type="checkbox" ${it.done?'checked':''} data-ci="${i}">
      <div class="ck-body"><div class="ck-title">${esc(it.title)}</div>
      <div class="ck-note">${esc(it.note)}</div>
      <span class="ck-tag">${esc(it.tag)}</span></div></div>`;
  });
  box.innerHTML=html;
  box.querySelectorAll("[data-ci]").forEach(cb=>cb.onchange=()=>{
    const i=+cb.dataset.ci; currentProject.checkItems[i].done=cb.checked;
    currentProject.checks[currentProject.checkItems[i].id]=cb.checked;
    renderChecklist();
  });
}

/* ---------- 유효폭 산정 ---------- */
let _audArea = 0;
function renderWidth(d){
  d = d || (currentProject?.info);
  const box=$("#widthBody");
  if(!d || (!d.use && !d.area)){box.innerHTML=`<div class="empty"><div class="big">↔</div>① 규모 입력에서 용도·연면적·층수를 넣으면<br>유효폭이 자동 산정됩니다.</div>`;return}

  const stair=calcStair(d.use,d.area,d.floors,d.base);
  const cor=calcCorridor(d.use,d.area);
  const isCulture=d.use==="munhwa";

  let html="";

  // 적용 안내
  html+=`<div class="w-cond" style="background:var(--hit);border:1px solid var(--line);border-radius:6px;padding:9px 12px;margin-bottom:14px;font-size:12px">
    <b>${esc(d.useLabel||"용도 미지정")}</b> · 연면적 ${fmt(d.area)}㎡ · 지상 ${d.floors}층/지하 ${d.base}층 기준 산정
    ${d.area<=200?' <span style="color:var(--warn)">— 연면적 200㎡ 이하는 계단·복도 유효너비 규정 대상 아님(참고용 표시)</span>':''}
  </div>`;

  // 계단
  html+=`<div class="w-card">
    <div class="w-head"><span class="wt">계단 유효너비</span><span class="wa">피난방화규칙 제15조</span></div>
    <div class="w-big">${stair.width}<span class="u">cm 이상</span></div>
    <div class="w-body">
      <div class="w-cond">${esc(stair.label)} — ${esc(stair.note)}</div>
      <div class="w-spec">
        <span>단높이 <b>${stair.riser}</b></span>
        <span>단너비 <b>${stair.tread}</b></span>
      </div>
      ${d.use==="gyoyuk"?'<div class="w-cond" style="margin-top:8px;color:var(--warn)">▲ 초등학교는 단높이 16cm 이하 기준(중·고는 18cm 이하). 학교급을 확인하세요.</div>':''}
      <ul class="w-common">${STAIR_COMMON.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
    </div>
  </div>`;

  // 복도
  html+=`<div class="w-card">
    <div class="w-head"><span class="wt">복도 유효너비</span><span class="wa">피난방화규칙 제15조의2</span></div>
    <div class="w-body" style="padding-top:14px">
      <div class="w-cond">${esc(cor.applied)} 기준 — ${esc(cor.note)}</div>
      <div class="w-spec" style="margin-top:10px">
        <span>양옆에 거실 <b>${(cor.both/100).toFixed(1)}m 이상</b></span>
        <span>기타 복도 <b>${(cor.other/100).toFixed(1)}m 이상</b></span>
      </div>
    </div>
  </div>`;

  // 문화·집회: 관람실 출구 + 접합복도 (면적 입력)
  if(isCulture){
    const a=_audArea||0;
    const exitW=a>=300?EXIT_RULE.calc(a):0;
    const corW=AUDIENCE_CORRIDOR.calc(a||500);
    html+=`<div class="w-card">
      <div class="w-head"><span class="wt">관람실 출구·접합복도</span><span class="wa">제10조·제15조의2②</span></div>
      <div class="w-body" style="padding-top:14px">
        <div class="w-input">
          <label>개별 관람실 바닥면적</label>
          <input id="audArea" type="number" min="0" value="${a||''}" placeholder="㎡"><span class="u" style="font-size:12px;color:var(--ink-3)">㎡</span>
          <button class="btn sm" id="btnAud" style="padding:6px 14px">계산</button>
        </div>
        ${a>0?`
          <div class="w-cond">개별 관람실 바닥면적 <b>${fmt(a)}㎡</b> 기준</div>
          <div class="w-spec" style="margin-top:8px">
            ${a>=300?`<span>출구 유효너비 합계 <b>${exitW.toFixed(1)}m 이상</b></span>`:`<span style="color:var(--ink-3)">300㎡ 미만 → 출구 유효너비 규정 대상 아님</span>`}
            <span>접합복도(양쪽 각각) <b>${corW.toFixed(1)}m 이상</b></span>
          </div>
          <ul class="w-common" style="margin-top:8px">
            <li>${esc(EXIT_RULE.note)}</li>
            <li>관람실 출구는 안여닫이 금지 · 300㎡ 이상은 출구 2개소 이상</li>
          </ul>
        `:`<div class="w-cond" style="color:var(--ink-3)">개별 관람실 면적을 입력하면 출구·접합복도 유효너비가 계산됩니다.</div>`}
      </div>
    </div>`;
  }

  html+=`<div class="note-box"><b>산정 안내.</b> 위 값은 법령상 <b>최소 기준</b>입니다. 실제 설계는 피난용량(재실인원)·소방 성능위주설계·장애인 편의기준(경사로)·지자체 조례로 더 넓게 요구될 수 있으니, 최댓값을 적용하세요. 연면적 200㎡ 초과 건축물의 계단·복도에 적용됩니다.</div>`;

  box.innerHTML=html;

  if(isCulture){
    const btn=$("#btnAud"), inp=$("#audArea");
    if(btn) btn.onclick=()=>{_audArea=+inp.value||0; renderWidth(d)};
    if(inp) inp.addEventListener("keydown",e=>{if(e.key==="Enter"){_audArea=+inp.value||0;renderWidth(d)}});
  }
}


function doSearch(){
  const q=$("#searchInput").value.trim();
  const box=$("#searchBody");
  if(!q){box.innerHTML="";return}
  const rx=new RegExp("("+q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","gi");
  const res=SEARCH_DB.filter(r=>(r.art+r.desc+r.cat).toLowerCase().includes(q.toLowerCase()));
  if(!res.length){box.innerHTML=`<div class="empty" style="padding:32px"><div class="big">∅</div>"${esc(q)}" 관련 조문을 내장 데이터에서 찾지 못했습니다.<br><span style="font-size:12px">API 연동 시 전체 원문 검색이 가능합니다.</span></div>`;return}
  box.innerHTML=res.map(r=>`<div class="sr-item">
    <div class="li-top"><span class="li-art">${r.art.replace(rx,'<span class="sr-hl">$1</span>')}</span>
    <span class="ck-tag">${esc(r.cat)}</span></div>
    <div class="li-desc" style="margin-top:5px">${r.desc.replace(rx,'<span class="sr-hl">$1</span>')}</div>
    <a class="li-link" href="${buildLawLink(r.art)}" target="_blank" rel="noopener">📖 「${esc(lawNameOf(r.art))}」 원문 보기 ↗</a>
    </div>`).join("");
}

/* ---------- 프로젝트 저장/불러오기 ---------- */
function loadProjects(){try{return JSON.parse(localStorage.getItem(LS_KEY)||"[]")}catch(e){return[]}}
function saveProjects(a){localStorage.setItem(LS_KEY,JSON.stringify(a))}
function saveCurrent(){
  if(!currentProject){toast("먼저 법조항을 판별하세요");return}
  const all=loadProjects();
  currentProject.info=readInput();
  currentProject.savedAt=new Date().toISOString();
  currentProject.id=currentProject.id||("p"+Date.now());
  const idx=all.findIndex(p=>p.id===currentProject.id);
  const snap=JSON.parse(JSON.stringify(currentProject));
  if(idx>=0) all[idx]=snap; else all.push(snap);
  saveProjects(all); renderSaved(); toast("저장되었습니다");
}
function renderSaved(){
  const all=loadProjects(); const box=$("#savedBody");
  if(!all.length){box.innerHTML=`<div class="empty"><div class="big">▤</div>저장된 프로젝트가 없습니다.</div>`;return}
  box.innerHTML=all.slice().reverse().map(p=>{
    const done=(p.checkItems||[]).filter(i=>i.done).length;
    const tot=(p.checkItems||[]).length;
    const dt=p.savedAt?new Date(p.savedAt).toLocaleDateString("ko-KR"):"";
    return `<div class="proj-card">
      <div style="min-width:0"><div class="p-name">${esc(p.info.name)}</div>
      <div class="p-meta">${esc(p.info.useLabel||"")} · 연면적 ${fmt(p.info.area)}㎡ · ${p.rules?.length||0}개 조항 · 체크 ${done}/${tot} · ${dt}</div></div>
      <div class="proj-actions">
        <button class="icon-btn" title="불러오기" data-load="${p.id}">↥</button>
        <button class="icon-btn del" title="삭제" data-del="${p.id}">✕</button>
      </div></div>`;
  }).join("");
  box.querySelectorAll("[data-load]").forEach(b=>b.onclick=()=>loadProject(b.dataset.load));
  box.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{
    saveProjects(loadProjects().filter(p=>p.id!==b.dataset.del));renderSaved();toast("삭제됨");
  });
}
function loadProject(id){
  const p=loadProjects().find(x=>x.id===id); if(!p)return;
  currentProject=JSON.parse(JSON.stringify(p));
  writeInput(p.info);
  renderResult(p.info,p.rules||[]);
  currentProject.checkItems=p.checkItems||[]; renderChecklist();
  renderWidth(p.info);
  $("#resBadge").style.display="inline-block"; $("#resBadge").textContent=p.rules?.length||0;
  $$(".tab-btn").forEach(x=>x.classList.remove("active"));
  $$(".panel").forEach(x=>x.classList.remove("active"));
  document.querySelector('[data-tab="result"]').classList.add("active");
  $("#tab-result").classList.add("active");
  toast("프로젝트를 불러왔습니다");
}
function exportAll(){
  const data=loadProjects();
  if(!data.length){toast("내보낼 프로젝트가 없습니다");return}
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="법규체크_프로젝트_"+new Date().toISOString().slice(0,10)+".json";a.click();
  toast("내보내기 완료");
}
function importFile(e){
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=()=>{try{
    const imported=JSON.parse(r.result);
    if(!Array.isArray(imported))throw 0;
    const all=loadProjects();
    const ids=new Set(all.map(p=>p.id));
    imported.forEach(p=>{if(!ids.has(p.id))all.push(p)});
    saveProjects(all);renderSaved();toast(`${imported.length}개 프로젝트 불러옴`);
  }catch(err){toast("파일 형식이 올바르지 않습니다")}};
  r.readAsText(f); e.target.value="";
}

/* ---------- 바인딩 ---------- */
$("#btnAnalyze").onclick=analyze;
$("#btnReset").onclick=()=>{writeInput({work:"new"});$$(".form-grid input,.form-grid select").forEach(el=>{if(el.tagName==="SELECT")el.selectedIndex=0;else if(el.type!=="checkbox")el.value=""});$$(".f_work_cb").forEach(c=>c.checked=(c.value==="new"));$$(".f_zone_cb").forEach(c=>c.checked=false);toast("초기화됨")};
$("#btnSearch").onclick=doSearch;
$("#searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")doSearch()});
$("#searchInput").addEventListener("input",()=>{if(!$("#searchInput").value.trim())$("#searchBody").innerHTML=""});
$("#btnSaveCur").onclick=saveCurrent;
$("#btnExport").onclick=exportAll;
$("#importFile").onchange=importFile;

/* 시계 */
function tick(){const n=new Date();$("#clock").textContent=n.toLocaleDateString("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit"})+" 기준"}
tick();setInterval(tick,60000);

/* 용도 드롭다운 채우기 */
function fillUseSelects(){
  const opts = USE_GROUPS.map(g=>{
    const inner=g.items.map(i=>`<option value="${i.v}"${i.d?` title="${esc(i.d)}"`:''}>${esc(i.l)}</option>`).join("");
    return `<optgroup label="${esc(g.g)}">${inner}</optgroup>`;
  }).join("");
  $("#f_use").innerHTML=`<option value="">— 선택 —</option>`+opts;
  $("#f_use2").innerHTML=`<option value="">— 없음 —</option>`+opts;
  $("#f_use3").innerHTML=`<option value="">— 없음 —</option>`+opts;
}
fillUseSelects();

// 용도지역 드롭다운 채우기 (landuse.js의 LANDUSE_ZONES)
function fillLandZoneSelect(){
  const sel = $("#f_landzone");
  if(!sel || typeof LANDUSE_ZONES==='undefined') return;
  // 분류별 그룹핑
  const groups = {};
  Object.keys(LANDUSE_ZONES).forEach(name=>{
    const cat = LANDUSE_ZONES[name].cat || '기타';
    (groups[cat]=groups[cat]||[]).push(name);
  });
  const catOrder = ['주거','상업','공업','녹지','관리','농림','보전'];
  let html = `<option value="">— 선택 —</option>`;
  catOrder.filter(c=>groups[c]).forEach(cat=>{
    html += `<optgroup label="${esc(cat)}지역">`;
    groups[cat].forEach(name=>{
      const d = LANDUSE_ZONES[name];
      html += `<option value="${esc(name)}">${esc(name)} (상한 건폐 ${d.bcr}%·용적 ${d.farMax}%)</option>`;
    });
    html += `</optgroup>`;
  });
  sel.innerHTML = html;
}
fillLandZoneSelect();

// 지역·지구 체크박스 채우기 (landuse.js의 DISTRICT_LIST)
function fillDistrictChecks(){
  const box = $("#f_zone_group");
  if(!box || typeof DISTRICT_LIST==='undefined') return;
  box.innerHTML = DISTRICT_LIST.map(d=>
    `<label class="dist-chk" title="${esc(d.desc)}"><input type="checkbox" class="f_zone_cb" value="${esc(d.code)}">${esc(d.label)}</label>`
  ).join("");
}
fillDistrictChecks();

// 용도지역 직접 선택 시 건폐율·용적률 전역 반영
$("#f_landzone").addEventListener("change", ()=>{
  const name = $("#f_landzone").value;
  if(name && typeof LANDUSE_ZONES!=='undefined' && LANDUSE_ZONES[name]){
    window.__landZone = name;
    window.__landZoneData = LANDUSE_ZONES[name];
    // 배지 갱신
    const badge = $("#zoneBadge");
    if(badge){
      const d = LANDUSE_ZONES[name];
      badge.style.display='inline-flex';
      badge.textContent = `용도지역: ${name} (법정 상한 건폐율 ${d.bcr}% · 용적률 ${d.farMax}%)`;
    }
    // 해당 지역 도시계획 조례에서 실제 적용치 조회
    if(typeof fetchZoneOrdinance==='function'){
      const gov = ($("#f_gov").value||'').trim();
      fetchZoneOrdinance(gov, name);
    }
  } else {
    window.__landZone = null;
    window.__landZoneData = null;
    const badge = $("#zoneBadge"); if(badge) badge.style.display='none';
    const zb = $("#zoneOrdinBox"); if(zb) zb.innerHTML='';
  }
});

// 지자체 입력이 바뀌면, 용도지역이 이미 선택돼 있을 때 조례 재조회
$("#f_gov").addEventListener("change", ()=>{
  const name = $("#f_landzone").value;
  if(name && typeof fetchZoneOrdinance==='function'){
    fetchZoneOrdinance(($("#f_gov").value||'').trim(), name);
  }
});

// 추가용도2 선택 시 용도3 노출
$("#f_use2").addEventListener("change",()=>{
  $("#use3wrap").style.display = $("#f_use2").value?"flex":"none";
  if(!$("#f_use2").value) $("#f_use3").value="";
});

// API 서버 연동 상태 확인
if(typeof checkApiStatus==='function'){
  checkApiStatus().then(st=>{
    const el=$("#apiStatus");
    if(st && API.available){
      el.classList.add("on");
      el.innerHTML=`<i></i>서버 연동됨 · 조례 실시간 조회${API.ocConfigured?'':' (샘플키)'}`;
    } else {
      el.innerHTML=`<i></i>단독 실행 · 조례는 링크로 확인`;
    }
  });
}

renderSaved();
