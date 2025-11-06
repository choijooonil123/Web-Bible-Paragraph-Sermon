/* --------- Utils --------- */
const el = (id) => document.getElementById(id);
const docEl = el('doc');
const statusEl = el('status');           // 없어도 OK (status()에서 가드)
const treeEl = el('tree');               // 없어도 OK (buildTree()에서 가드)
const VER_KEY = 'wbp.ver';
const LS_KEY = 'wbp.v3.doc';

function status(msg){ if(statusEl) statusEl.textContent = msg; }
function escapeHtml(s){ return (s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function debounce(fn, ms=400){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); } }

/* --------- Global State --------- */
let BIBLE = null;
let CURRENT = { tracing:false, tts:false };

/* --------- Init --------- */
window.addEventListener('DOMContentLoaded', async () => {
  try{
    BIBLE = await fetchJson('bible-mini.json');
  }catch(e){
    console.error(e);
    status('본문 로드 실패: ' + e.message);
  }

  // 좌측 패널이 없는 레이아웃: 트리 생성은 존재할 때만
  if (treeEl && BIBLE) buildTree();

  // 에디터 로드 & 자동저장
  const saved = localStorage.getItem(LS_KEY);
  docEl.innerHTML = saved || `<p>여기에 본문을 삽입하세요.</p>`;
  docEl.addEventListener('input', debounce(()=>localStorage.setItem(LS_KEY, docEl.innerHTML), 500));

  // 버튼 바인딩
  bind('#btnInsert', onInsertClick);
  bind('#btnClear',  onClear);
  bind('#btnExport', onExport);
  bind('#btnImport', onImport);
  bind('#btnTTS',    toggleTTS);
  bind('#btnTrace',  toggleTrace);
});

function bind(sel, fn){
  const b = document.querySelector(sel);
  if (b) b.addEventListener('click', fn);
}

async function fetchJson(path){ const r = await fetch(path); return await r.json(); }

/* --------- (옵션) 트리: 요소 있을 때만 동작 --------- */
function buildTree(){
  if (!treeEl || !BIBLE) return;   // 🔒 가드
  const frag = document.createDocumentFragment();
  const books = Object.keys(BIBLE.books);
  books.forEach(book=>{
    const wrap = document.createElement('details');
    wrap.className = 'para';
    const sm = document.createElement('summary');
    sm.innerHTML = `<span class="ptitle" data-book="${book}">${book}</span>`;
    wrap.appendChild(sm);

    const chs = BIBLE.books[book];
    chs.forEach(chObj=>{
      const d = document.createElement('div');
      d.style.padding = '4px 0 8px 8px';
      const links = chObj.verses.map((v,i)=> i>0 ? `<a class="v" href="#${book}.${chObj.chapter}.${i}">${i}</a>` : '').join('');
      d.innerHTML = `<div><strong>${book} ${chObj.chapter}장</strong> ${links}</div>`;
      wrap.appendChild(d);
    });

    frag.appendChild(wrap);
  });
  treeEl.innerHTML = '';
  treeEl.appendChild(frag);
}

/* --------- 다중 범위 파서 --------- */
// 예: "창 1:1-3,6-8; 2:1"  /  "시 23:1-2"
function parseRef(input){
  const s = String(input||'').replace(/\s+/g,' ').trim();
  if(!s) return [];
  const tokens=[]; const re=/([가-힣A-Za-z0-9]+)\s+([^;]+(?:;[^가-힣A-Za-z0-9][^;]+)*)/g;
  let m; re.lastIndex=0;
  while((m=re.exec(s))){ tokens.push({book:m[1], rest:m[2].trim()}); }
  const result=[];
  tokens.forEach(({book,rest})=>{
    rest.split(';').map(x=>x.trim()).filter(Boolean).forEach(part=>{
      const [chStr, versesStr] = part.split(':').map(x=>x.trim());
      const ch = parseInt(chStr,10);
      if(!Number.isFinite(ch)) return;
      (versesStr||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(seg=>{
        if(seg.includes('-')){
          const [a,b]=seg.split('-').map(n=>parseInt(n,10));
          for(let v=a; v<=b; v++) result.push({book, ch, v});
        } else {
          const v=parseInt(seg,10); if(Number.isFinite(v)) result.push({book, ch, v});
        }
      });
    });
  });
  return result;
}

/* --------- 본문 조회 (기본: 개역개정) --------- */
function getVerseText(book, ch, v, ver){
  const version = ver || localStorage.getItem(VER_KEY) || 'krv';
  const bookArr = BIBLE?.parallel?.[version]?.[book];
  if(!bookArr) return null;
  const chObj = bookArr.find(x=>x.chapter===ch);
  return chObj?.verses?.[v] || null;
}

/* --------- 본문 삽입 (툴바 버튼 → prompt로 입력) --------- */
function onInsertClick(){
  const ref = window.prompt('삽입할 성구를 입력하세요 (예: 창 1:1-3,6-8; 2:1)');
  if(!ref) return;

  const list = parseRef(ref);
  if(!list.length){ status('참조 구문을 인식하지 못했습니다. 예: 창 1:1-3,6-8; 2:1'); return; }

  const blocks = [];
  let lastKey='';
  list.forEach(({book,ch,v})=>{
    const t = getVerseText(book, ch, v);
    if(!t) return;
    const key = `${book} ${ch}`;
    if(key !== lastKey){
      blocks.push(`<p class="verse"><strong>${book} ${ch}장</strong></p>`);
      lastKey = key;
    }
    const id = `${book}.${ch}.${v}`;
    blocks.push(`<p id="${id}" class="verse"><a href="#${id}">#</a> <sup>[${v}]</sup> ${escapeHtml(t)}</p>`);
  });

  insertHtmlAtCursor(blocks.join('\n'));
  localStorage.setItem(LS_KEY, docEl.innerHTML);
  status('본문을 삽입했습니다.');
}

function insertHtmlAtCursor(html){
  docEl.focus();
  const sel = window.getSelection();
  if(!sel || !sel.rangeCount){
    docEl.insertAdjacentHTML('beforeend', html);
    return;
  }
  const range = sel.getRangeAt(0);
  const frag = range.createContextualFragment(html);
  range.deleteContents();
  range.insertNode(frag);
  sel.collapseToEnd();
}

/* --------- 내보내기/불러오기 --------- */
function onExport(){
  const data = { html: docEl.innerHTML, ts: Date.now(), ver: localStorage.getItem(VER_KEY) || 'krv' };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sermon-data.json';
  a.click();
}

async function onImport(){
  const inp = document.createElement('input');
  inp.type='file'; inp.accept='.json,application/json';
  inp.onchange = async () => {
    const file = inp.files?.[0]; if(!file) return;
    const text = await file.text();
    try{
      const data = JSON.parse(text);
      if(data?.html){ docEl.innerHTML = data.html; localStorage.setItem(LS_KEY, data.html); }
      if(data?.ver){ localStorage.setItem(VER_KEY, data.ver); }
      status('불러오기를 완료했습니다.');
    }catch(e){ status('JSON 파싱 오류: '+e.message); }
  };
  inp.click();
}

/* --------- TTS --------- */
let currentSpeakNode = null;

function toggleTTS(){
  const btn = el('btnTTS');
  if(!btn) return;

  if(CURRENT.tts){
    window.speechSynthesis.cancel();
    CURRENT.tts = false;
    btn.textContent = '낭독';
    if(currentSpeakNode) currentSpeakNode.classList.remove('current');
    return;
  }
  const sel = window.getSelection();
  let node = sel?.anchorNode?.parentElement;
  if(!node || !docEl.contains(node)) node = docEl.firstElementChild;
  speakFrom(node);
}

function speakFrom(startEl){
  CURRENT.tts = true;
  const btn = el('btnTTS'); if(btn) btn.textContent = '정지';
  const walk = document.createTreeWalker(docEl, NodeFilter.SHOW_ELEMENT, {
    acceptNode(n){ return (n.tagName==='P' || n.tagName==='DIV') && n.textContent.trim()? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }
  });
  walk.currentNode = startEl || docEl.firstElementChild;

  const queue=[]; let n = walk.currentNode;
  while(n){ queue.push(n); n = walk.nextNode(); }

  let idx=0;
  const speakNext = ()=>{
    if(!CURRENT.tts || idx>=queue.length){ toggleTTS(); return; }
    const node = queue[idx++]; const text = node.textContent.trim();
    if(!text){ speakNext(); return; }

    if(currentSpeakNode) currentSpeakNode.classList.remove('current');
    currentSpeakNode = node; node.classList.add('current','center-scroll');
    node.scrollIntoView({block:'center', behavior:'smooth'});

    const u = new SpeechSynthesisUtterance(text);
    u.lang='ko-KR';
    u.onend = ()=>{ if(CURRENT.tts) speakNext(); };
    u.onerror = ()=>{ if(CURRENT.tts) speakNext(); };
    window.speechSynthesis.speak(u);
  };
  speakNext();
}

/* --------- 설교추적 데모 --------- */
function toggleTrace(){
  const btn = el('btnTrace');
  CURRENT.tracing = !CURRENT.tracing;
  if(btn) btn.textContent = CURRENT.tracing? '설교추적중지' : '설교추적시작';
  if(CURRENT.tracing){ demoTrace(); }
}
function demoTrace(){
  if(!CURRENT.tracing) return;
  const nodes = [...docEl.querySelectorAll('p,div')].filter(n=>n.textContent.trim());
  if(!nodes.length) return;
  let i = nodes.findIndex(n=>n.classList.contains('current')); if(i<0) i=0; else i=(i+1)%nodes.length;
  if(currentSpeakNode) currentSpeakNode.classList.remove('current');
  const node = nodes[i]; node.classList.add('current','center-scroll');
  node.scrollIntoView({block:'center', behavior:'smooth'});
  setTimeout(()=>{ if(CURRENT.tracing) demoTrace(); }, 2000);
}
