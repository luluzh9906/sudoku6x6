/* Lulu Sudoku - script.js
   中文 9x9 数独（经核查修正版）
   主要修正：
   - DIFFS 新增 mul（难度乘数）
   - computeScore 使用 base * mul 计算
   - 确认所有 id/class 与 index.html 一致
*/

const SIZE = 9;
const BOX = 3;
let solution = new Array(SIZE * SIZE).fill(0);
let puzzle = new Array(SIZE * SIZE).fill(0);
let fixed = new Array(SIZE * SIZE).fill(false);
let selected = null;
let seconds = 0;
let timer = null;
let mistakes = 0;
const MAX_MISTAKES = 3;
const LB_KEY = 'luluSudokuLeaderboard'; // localStorage 键

// Difficulty params: removals count, base score, multiplier, label
const DIFFS = {
  easy:   { remove: 36, base: 1000, mul: 1.0, label: '简单' },
  medium: { remove: 46, base: 1500, mul: 1.5, label: '中等' },
  hard:   { remove: 52, base: 2000, mul: 2.0, label: '困难' }
};

document.addEventListener('DOMContentLoaded', ()=>{
  buildBoard();
  bind();
  newGame('medium');
});

function buildBoard(){
  const board = document.getElementById('board');
  board.innerHTML = '';
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const idx = r*SIZE + c;
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.idx = idx;
      cell.addEventListener('click', ()=>selectCell(idx));
      // add thick visual separators for 3x3
      if((c+1) % BOX === 0 && c !== SIZE-1) cell.classList.add('col-border-right');
      if((r+1) % BOX === 0 && r !== SIZE-1) cell.classList.add('row-border-bottom');
      board.appendChild(cell);
    }
  }
}

function render(){
  const board = document.getElementById('board');
  for(const el of board.children){
    const idx = Number(el.dataset.idx);
    el.classList.remove('prefilled','selected','conflict','empty');
    el.textContent = '';
    const v = puzzle[idx];
    if(v){
      el.textContent = v;
      if(fixed[idx]) el.classList.add('prefilled');
      else el.classList.add('empty');
    }
    if(selected === idx) el.classList.add('selected');
  }
  // show conflicts
  const conflicts = findConflicts();
  for(const i of conflicts){
    const el = document.querySelector(`.cell[data-idx="${i}"]`);
    if(el) el.classList.add('conflict');
  }
  const timerEl = document.getElementById('timer');
  if(timerEl) timerEl.textContent = formatTime(seconds);
  const mistakesEl = document.getElementById('mistakes');
  if(mistakesEl) mistakesEl.textContent = mistakes;
}

function bind(){
  const newBtn = document.getElementById('newBtn');
  if(newBtn) newBtn.addEventListener('click', ()=>{
    const d = document.getElementById('difficulty').value;
    newGame(d);
  });

  document.querySelectorAll('.key.num').forEach(b=>{
    b.addEventListener('click', ()=>handleNumber(Number(b.dataset.num)));
  });

  const eraseBtn = document.getElementById('erase');
  if(eraseBtn) eraseBtn.addEventListener('click', ()=>{ eraseCell(); });

  const restartBtn = document.getElementById('restart');
  if(restartBtn) restartBtn.addEventListener('click', ()=>{ restart(); });

  // modal controls
  const closeModalBtn = document.getElementById('closeModal');
  if(closeModalBtn) closeModalBtn.addEventListener('click', ()=>closeModal());
  const viewBoardBtn = document.getElementById('viewBoard');
  if(viewBoardBtn) viewBoardBtn.addEventListener('click', ()=>renderLeaderboard());
  const clearBoardBtn = document.getElementById('clearBoard');
  if(clearBoardBtn) clearBoardBtn.addEventListener('click', ()=>{
    localStorage.removeItem(LB_KEY);
    renderLeaderboard();
  });

  // keyboard support
  window.addEventListener('keydown', (e)=>{
    if(e.key >= '1' && e.key <= '9'){ handleNumber(Number(e.key)); e.preventDefault(); return; }
    if(e.key === 'Backspace' || e.key === 'Delete'){ eraseCell(); e.preventDefault(); return; }
    if(e.key === 'ArrowRight'){ moveSelected(0,1); e.preventDefault(); return; }
    if(e.key === 'ArrowLeft'){ moveSelected(0,-1); e.preventDefault(); return; }
    if(e.key === 'ArrowDown'){ moveSelected(1,0); e.preventDefault(); return; }
    if(e.key === 'ArrowUp'){ moveSelected(-1,0); e.preventDefault(); return; }
  });
}

function selectCell(idx){
  selected = idx;
  render();
}

function moveSelected(dr, dc){
  if(selected==null){ selected = 0; render(); return; }
  const r = Math.floor(selected / SIZE), c = selected % SIZE;
  let nr = r + dr, nc = c + dc;
  nr = Math.max(0, Math.min(SIZE-1, nr));
  nc = Math.max(0, Math.min(SIZE-1, nc));
  selected = nr * SIZE + nc;
  render();
}

function eraseCell(){
  if(selected == null) return;
  if(fixed[selected]) return;
  puzzle[selected] = 0;
  render();
}

function handleNumber(n){
  if(selected == null) return;
  if(fixed[selected]) return;
  puzzle[selected] = n;
  const conflicts = findConflicts();
  if(conflicts.has(selected) || puzzle[selected] !== solution[selected]){
    mistakes++;
    const el = document.querySelector(`.cell[data-idx="${selected}"]`);
    if(el){ el.classList.add('conflict'); setTimeout(()=>{ el.classList.remove('conflict'); render(); }, 600); }
    if(mistakes >= MAX_MISTAKES){
      stopTimer();
      setTimeout(()=>{ alert('错误次数过多，游戏结束。'); }, 50);
    }
  }
  if(isSolved()){
    stopTimer();
    const diff = document.getElementById('difficulty').value;
    const score = computeScore(diff, seconds, mistakes);
    saveResult({ date: new Date().toISOString(), difficulty: DIFFS[diff].label, time: formatTime(seconds), mistakes, score });
    showModal({ time: formatTime(seconds), mistakes, difficulty: DIFFS[diff].label, score });
  }
  render();
}

/* --- conflicts detection --- */
function findConflicts(){
  const conf = new Set();
  // rows
  for(let r=0;r<SIZE;r++){
    const seen = new Map();
    for(let c=0;c<SIZE;c++){
      const idx = r*SIZE + c, v = puzzle[idx];
      if(!v) continue;
      if(seen.has(v)){ conf.add(idx); conf.add(seen.get(v)); }
      else seen.set(v, idx);
    }
  }
  // cols
  for(let c=0;c<SIZE;c++){
    const seen = new Map();
    for(let r=0;r<SIZE;r++){
      const idx = r*SIZE + c, v = puzzle[idx];
      if(!v) continue;
      if(seen.has(v)){ conf.add(idx); conf.add(seen.get(v)); }
      else seen.set(v, idx);
    }
  }
  // boxes
  for(let br=0;br<SIZE;br+=BOX){
    for(let bc=0;bc<SIZE;bc+=BOX){
      const seen = new Map();
      for(let r=0;r<BOX;r++){
        for(let c=0;c<BOX;c++){
          const idx = (br + r)*SIZE + (bc + c), v = puzzle[idx];
          if(!v) continue;
          if(seen.has(v)){ conf.add(idx); conf.add(seen.get(v)); }
          else seen.set(v, idx);
        }
      }
    }
  }
  return conf;
}

/* --- solver / generator (backtracking) --- */
function canPlace(arr, idx, n){
  const r = Math.floor(idx / SIZE), c = idx % SIZE;
  for(let i=0;i<SIZE;i++){
    if(arr[r*SIZE + i] === n) return false;
    if(arr[i*SIZE + c] === n) return false;
  }
  const br = Math.floor(r/BOX)*BOX, bc = Math.floor(c/BOX)*BOX;
  for(let rr=0; rr<BOX; rr++) for(let cc=0; cc<BOX; cc++){
    if(arr[(br+rr)*SIZE + (bc+cc)] === n) return false;
  }
  return true;
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function solveGrid(arr){
  const idx = arr.findIndex(v=>v===0);
  if(idx === -1) return true;
  const nums = shuffle([1,2,3,4,5,6,7,8,9]);
  for(const n of nums){
    if(canPlace(arr, idx, n)){
      arr[idx] = n;
      if(solveGrid(arr)) return true;
      arr[idx] = 0;
    }
  }
  return false;
}

function generateSolution(){
  let arr = new Array(SIZE*SIZE).fill(0);
  // backtracking fill
  solveGrid(arr);
  return arr;
}

function carvePuzzle(full, difficulty){
  const arr = full.slice();
  const toRemove = DIFFS[difficulty].remove;
  const idxs = shuffle([...Array(SIZE*SIZE).keys()]);
  let removed = 0;
  for(const idx of idxs){
    const backup = arr[idx];
    arr[idx] = 0;
    // ensure still solvable (not necessarily unique)
    const copy = arr.slice();
    if(solveGrid(copy)){
      removed++;
      if(removed >= toRemove) break;
    } else {
      arr[idx] = backup;
    }
  }
  return arr;
}

/* --- game lifecycle --- */
function newGame(difficulty='medium'){
  stopTimer();
  seconds = 0; mistakes = 0; selected = null;
  solution = generateSolution();
  puzzle = carvePuzzle(solution, difficulty);
  for(let i=0;i<SIZE*SIZE;i++) fixed[i] = puzzle[i] !== 0;
  const mistakesEl = document.getElementById('mistakes');
  if(mistakesEl) mistakesEl.textContent = mistakes;
  startTimer();
  render();
}

function restart(){
  // 保持当前难度，重新生成一局
  const d = document.getElementById('difficulty').value;
  newGame(d);
}

/* timer */
function startTimer(){
  stopTimer();
  timer = setInterval(()=>{ seconds++; const t = document.getElementById('timer'); if(t) t.textContent = formatTime(seconds); }, 1000);
}
function stopTimer(){ if(timer){ clearInterval(timer); timer = null; } }
function formatTime(sec){
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  const s = (sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

function isSolved(){
  for(let i=0;i<SIZE*SIZE;i++){
    if(puzzle[i] !== solution[i]) return false;
  }
  return true;
}

/* --- scoring & leaderboard --- */
function computeScore(diffKey, timeInSeconds, mistakesCount){
  const cfg = DIFFS[diffKey];
  const base = cfg.base;
  const mul = cfg.mul;
  const timeFactor = 1 / (timeInSeconds/60 + 1); // in (0,1]
  const mistakeFactor = 1 / (mistakesCount + 1); // 1,1/2,...
  const raw = base * mul * timeFactor * mistakeFactor;
  return Math.max(10, Math.round(raw)); // 最少 10 分
}

function saveResult(record){
  const arr = JSON.parse(localStorage.getItem(LB_KEY) || '[]');
  arr.unshift(record); // 最新放前
  if(arr.length > 10) arr.length = 10;
  localStorage.setItem(LB_KEY, JSON.stringify(arr));
}

function renderLeaderboard(){
  const list = JSON.parse(localStorage.getItem(LB_KEY) || '[]');
  const ol = document.getElementById('leaderboard');
  if(!ol) return;
  ol.innerHTML = '';
  if(list.length === 0){
    const li = document.createElement('li'); li.textContent = '暂无记录';
    ol.appendChild(li); return;
  }
  for(const rec of list){
    const li = document.createElement('li');
    const d = new Date(rec.date);
    const ds = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    li.textContent = `${ds} — 难度:${rec.difficulty} — 用时:${rec.time} — 错误:${rec.mistakes} — 得分:${rec.score}`;
    ol.appendChild(li);
  }
}

/* modal */
function showModal({time, mistakes, difficulty, score}){
  const resTime = document.getElementById('res-time');
  if(resTime) resTime.textContent = time;
  const resMist = document.getElementById('res-mistakes');
  if(resMist) resMist.textContent = mistakes;
  const resDiff = document.getElementById('res-diff');
  if(resDiff) resDiff.textContent = difficulty;
  const resScore = document.getElementById('res-score');
  if(resScore) resScore.textContent = score;
  renderLeaderboard();
  const modal = document.getElementById('modal');
  if(modal) modal.classList.remove('hidden');
}

function closeModal(){
  const modal = document.getElementById('modal');
  if(modal) modal.classList.add('hidden');
}

/* end of script */
