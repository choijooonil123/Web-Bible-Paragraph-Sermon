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
  if(!sel || !sel.rangeCount){ docEl.insertAdjacentHTML('beforeend', html); retur
