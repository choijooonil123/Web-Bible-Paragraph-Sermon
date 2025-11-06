const el = (id) => document.getElementById(id);
const treeEl = el('tree'), statusEl = el('status'), docEl = el('doc');
const VER_KEY = 'wbp.ver';
const LS_KEY = 'wbp.v3.doc';

function status(msg){ if(statusEl) statusEl.textContent = msg; }
function escapeHtml(s){ return (s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function debounce(fn, ms=400){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); } }

let BIBLE = null;
let CURRENT = { tracing:false, tts:false };

window.addEventListener('DOMContentLoaded', async() => {
  const verSel = el('verTabs');
  const savedVer = localStorage.getItem(VER_KEY) || 'krv';
  verSel.value = savedVer;
  verSel.addEventListener('change', ()=>localStorage.setItem(VER_KEY, verSel.value));

  BIBLE = await fetchJson('bible-mini.json');
  buildTree();

  const saved = localStorage.getItem(LS_KEY);
  docEl.innerHTML = saved || `<p>여기에 본문을 삽입하세요.</p>`;
  docEl.addEventListener('input', debounce(()=>localStorage.setItem(LS_KEY, docEl.innerHTML), 500));

  el('btnInsert').addEventListener('click', onInsertClick);
  el('btnClear').addEventListener('click', ()=>{ localStorage.removeItem(LS_KEY); docEl.innerHTML=''; status('로컬 저장소를 비웠습니다.');});
  el('btnExport').addEventListener('click', onExport);
  el('btnImport').addEventListener('click', onImport);
  el('btnTTS').addEventListener('click', toggleTTS);
  el('btnTrace').addEventListener('click', toggleTrace);
});

async function fetchJson(path){ const r = await fetch(path); return await r.json(); }

function buildTree(){
  if(!BIBLE){ status('본문 로드 실패'); return; }
  const frag = document.createDocumentFragment();
  const books = Object.keys(BIBLE.books);
  books.forEach(book=>{
    const bookWrap = document.createElement('details');
    bookWrap.className = 'para';
    const sm = document.createElement('summary');
    sm.innerHTML = `<span class="ptitle" data-book="${book}">${book}</span>`;
    bookWrap.appendChild(sm);
    const chs = BIBLE.books[book];
    chs.forEach(chObj=>{
      const d = document.createElement('div');
      d.style.padding = '4px 0 8px 8px';
      const links = chObj.verses.map((v,i)=> i>0 ? `<a class="v" href="#${book}.${chObj.chapter}.${i}">${i}</a>` : '').join('');
      d.innerHTML = `<div><strong>${book} ${chObj.chapter}장</strong> ${links}</div>`;
      bookWrap.appendChild(d);
    });
    frag.appendChild(bookWrap);
  });
  treeEl.innerHTML = '';
  treeEl.appendChild(frag);
}

function parseRef(input){
  const s = String(input||'').replace(/\\s+/g,' ').trim();
  if(!s) return [];
  const tokens=[]; const re=/([가-힣A-Za-z0-9]+)\\s+([^;]+(?:;[^가-힣A-Za-z0-9][^;]+)*)/g;
  let m; re.lastIndex=0;
  while((m=re.exec(s))){ tokens.push({book:m[1], rest:m[2].trim()}); }
  const result=[];
  tokens.forEach(({book,rest})=>{
    rest.split(';').map(x=>x.trim()).filter(Boolean).forEach(part=>{
      const [chStr, versesStr] = part.split(':').map(x=>x.trim());
      const ch = parseInt(chStr,10);
      if(!Number.isFinite(ch)) return;
      (versesStr||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(seg=>{
        if(seg.includes('-')){ const [a,b]=seg.split('-').map(n=>parseInt(n,10)); for(let v=a; v<=b; v++) result.push({book, ch, v}); }
        else { const v=parseInt(seg,10); if(Number.isFinite(v)) result.push({book, ch, v}); }
      });
    });
  });
  return result;
}

function getVerseText(book, ch, v, ver){
  const bookArr = BIBLE?.parallel?.[ver]?.[book];
  if(!bookArr) return null;
  const chObj = bookArr.find(x=>x.chapter===ch);
  const verse = chObj?.verses?.[v];
  return verse || null;
}

function onInsertClick(){
  const ref = el('refInput').value;
  const list = parseRef(ref);
  const ver = el('verTabs').value;
  const showNum = el('chkShowNum').checked;
  if(!list.length){ status('참조 구문을 인식하지 못했습니다.'); return; }

  const blocks = [];
  let lastKey='';
  list.forEach(({book,ch,v})=>{
    const t = getVerseText(book, ch, v, ver);
    if(!t) return;
    const key = `${book} ${ch}`;
    if(key !== lastKey){ blocks.push(`<p class="verse"><strong>${book} ${ch}장</strong></p>`); lastKey = key; }
    const num = showNum ? `<sup>[${v}]</sup> ` : '';
    const id = `${book}.${ch}.${v}`;
    blocks.push(`<p id="${id}" class="verse"><a href="#${id}">#</a> ${num}${escapeHtml(t)}</p>`);
  });
  insertHtmlAtCursor(blocks.join('\\n'));
  localStorage.setItem(LS_KEY, docEl.innerHTML);
  status('본문을 삽입했습니다.');
}

function insertHtmlAtCursor(html){
  docEl.focus();
  const sel = window.getSelection();
  if(!sel || !sel.rangeCount){ docEl.insertAdjacentHTML('beforeend', html); return; }
  const range = sel.getRangeAt(0);
  const frag = range.createContextualFragment(html);
  range.deleteContents(); range.insertNode(frag);
  sel.collapseToEnd();
}

function onExport(){
  const data = { html: docEl.innerHTML, ts: Date.now(), ver: el('verTabs').value };
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
      if(data?.ver){ el('verTabs').value = data.ver; localStorage.setItem(VER_KEY, data.ver); }
      status('불러오기를 완료했습니다.');
    }catch(e){ status('JSON 파싱 오류: '+e.message); }
  };
  inp.click();
}

let currentSpeakNode = null;
function toggleTTS(){
  if(CURRENT.tts){ window.speechSynthesis.cancel(); CURRENT.tts = false; el('btnTTS').textContent = '낭독';
    if(currentSpeakNode) currentSpeakNode.classList.remove('current'); return; }
  const sel = window.getSelection();
  let node = sel?.anchorNode?.parentElement;
  if(!node || !docEl.contains(node)) node = docEl.firstElementChild;
  speakFrom(node);
}

function speakFrom(startEl){
  CURRENT.tts = true; el('btnTTS').textContent = '정지';
  const walk = document.createTreeWalker(docEl, NodeFilter.SHOW_ELEMENT, {
    acceptNode(n){ return (n.tagName==='P' || n.tagName==='DIV') && n.textContent.trim()? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }
  });
  walk.currentNode = startEl || docEl.firstElementChild;
  const queue=[]; let n = walk.currentNode; while(n){ queue.push(n); n = walk.nextNode(); }
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

function toggleTrace(){
  CURRENT.tracing = !CURRENT.tracing;
  el('btnTrace').textContent = CURRENT.tracing? '설교추적중지' : '설교추적시작';
  if(CURRENT.tracing) demoTrace();
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
