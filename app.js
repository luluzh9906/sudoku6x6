// 6x6 Sudoku - app.js (revised & audited)
// Board model: linear array length 36, row-major order
const SIZE = 6;
const BOX_W = 3; // box width
const BOX_H = 2; // box height
let solution = new Array(SIZE*SIZE).fill(0);
let puzzle = new Array(SIZE*SIZE).fill(0);
let fixed = new Array(SIZE*SIZE).fill(false);
let notes = Array.from({length: SIZE*SIZE}, ()=> new Set());
let selectedIdx = null;
let timerInterval = null;
let seconds = 0;
let mistakes = 0;
const maxMistakes = 3;

document.addEventListener('DOMContentLoaded', ()=>{
  buildBoard();
  bindControls();
  newGame('medium');
});

// builds DOM board
function buildBoard(){
  const board = document.getElementById('board');
  board.innerHTML = '';
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const idx = r*SIZE + c;
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.idx = idx;
      // add thicker borders for box separation (inline style to be robust)
      if(c % BOX_W === BOX_W-1 && c !== SIZE-1) cell.style.borderRightWidth='2px';
      if(r % BOX_H === BOX_H-1 && r !== SIZE-1) cell.style.borderBottomWidth='2px';
      cell.addEventListener('click', ()=>selectCell(idx));
      board.appendChild(cell);
    }
  }
  // Make board focusable for keyboard navigation
  board.tabIndex = 0;
}

// update UI
function render(){
  const board = document.getElementById('board');
  for(const cell of board.children){
    const idx = Number(cell.dataset.idx);
    cell.classList.remove('prefilled','selected','conflict');
    // clear children
    while(cell.firstChild) cell.removeChild(cell.firstChild);
    const val = puzzle[idx];
    if(val){
      const span = document.createElement('div');
      span.textContent = val;
      cell.appendChild(span);
    } else if(notes[idx].size){
      const noteBox = document.createElement('div');
      noteBox.className = 'notes';
      for(let n=1;n<=6;n++){
        const s = document.createElement('div');
        s.textContent = notes[idx].has(n)?n:'';
        noteBox.appendChild(s);
      }
      cell.appendChild(noteBox);
    }
    if(fixed[idx]) cell.classList.add('prefilled');
    if(selectedIdx === idx) cell.classList.add('selected');
  }
  // highlight conflicts visually
  const conflicts = findConflicts();
  for(const i of conflicts){
    const el = document.querySelector(`.cell[data-idx="${i}"]`);
    if(el) el.classList.add('conflict');
  }

  document.getElementById('timer').textContent = formatTime(seconds);
  document.getElementById('mistakes').textContent = mistakes;
}

// helper
function formatTime(sec){
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  const s = (sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

// select
function selectCell(idx){
  // allow selecting prefilled to view but not edit
  selectedIdx = idx;
  document.getElementById('board').focus();
  render();
}

// controls binding
function bindControls(){
  document.getElementById('newBtn').addEventListener('click', ()=> {
    const d = document.getElementById('difficulty').value;
    newGame(d);
  });
  document.getElementById('solveBtn').addEventListener('click', ()=> {
    puzzle = solution.slice();
    stopTimer();
    render();
  });
  document.getElementById('hintBtn').addEventListener('click', hint);
  document.getElementById('noteMode').addEventListener('change', ()=>{/*visual only*/});
  document.querySelectorAll('.keypad .num').forEach(b=>{
    b.addEventListener('click', ()=>handleNumber(Number(b.textContent)));
  });
  document.getElementById('erase').addEventListener('click', eraseCell);
  document.getElementById('clearNotes').addEventListener('click', ()=> {
    if(selectedIdx!=null){ notes[selectedIdx].clear(); render(); }
  });

  // keyboard numbers and navigation
  window.addEventListener('keydown', (e)=>{
    if(document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    if(e.key >= '1' && e.key <= '6'){ handleNumber(Number(e.key)); e.preventDefault(); return; }
    if(e.key === 'Backspace' || e.key === 'Delete'){ eraseCell(); e.preventDefault(); return; }
    if(e.key === 'n' || e.key === 'N'){ document.getElementById('noteMode').checked = !document.getElementById('noteMode').checked; return; }
    if(e.key === 'ArrowRight'){ moveSelected(0,1); e.preventDefault(); return; }
    if(e.key === 'ArrowLeft'){ moveSelected(0,-1); e.preventDefault(); return; }
    if(e.key === 'ArrowDown'){ moveSelected(1,0); e.preventDefault(); return; }
    if(e.key === 'ArrowUp'){ moveSelected(-1,0); e.preventDefault(); return; }
  });
}

// movement helper
function moveSelected(dr, dc){
  if(selectedIdx==null) { selectedIdx = 0; render(); return; }
  const r = Math.floor(selectedIdx/SIZE), c = selectedIdx % SIZE;
  let nr = r+dr, nc = c+dc;
  if(nr < 0) nr = 0; if(nr > SIZE-1) nr = SIZE-1;
  if(nc < 0) nc = 0; if(nc > SIZE-1) nc = SIZE-1;
  selectedIdx = nr*SIZE + nc;
  render();
}

// erase
function eraseCell(){
  if(selectedIdx==null) return;
  if(fixed[selectedIdx]) {
    // cannot erase prefilled/hinted cell
    return;
  }
  puzzle[selectedIdx]=0;
  notes[selectedIdx].clear();
  render();
}

// handle number input
function handleNumber(n){
  if(selectedIdx==null) return;
  if(fixed[selectedIdx]) return;
  const noteMode = document.getElementById('noteMode').checked;
  if(noteMode){
    if(notes[selectedIdx].has(n)) notes[selectedIdx].delete(n);
    else notes[selectedIdx].add(n);
    render();
    return;
  }
  // place value
  puzzle[selectedIdx] = n;
  // check conflicts
  const conflicts = findConflicts();
  if(conflicts.has(selectedIdx)){
    mistakes++;
    flashCell(selectedIdx,'conflict');
    if(mistakes >= maxMistakes) {
      stopTimer();
      setTimeout(()=>alert('Game over. Too many mistakes.'), 50);
    }
  } else {
    // if placed correct?
    if(puzzle[selectedIdx] === solution[selectedIdx]){
      // clear notes in peers containing this number
      clearNotesRelated(selectedIdx, n);
    } else {
      // wrong but not producing immediate conflict (could be wrong relative to solution)
      mistakes++;
      flashCell(selectedIdx,'conflict');
      if(mistakes >= maxMistakes){
        stopTimer();
        setTimeout(()=>alert('Game over. Too many mistakes.'), 50);
      }
    }
  }
  // check win
  if(isSolved()){
    stopTimer();
    setTimeout(()=>alert(`Congratulations! Solved in ${formatTime(seconds)} with ${mistakes} mistakes.`),100);
  }
  render();
}

// remove notes containing placed number in peers
function clearNotesRelated(idx, num){
  const peers = getPeers(idx);
  peers.forEach(i => {
    if(notes[i].has(num)){ notes[i].delete(num); }
  });
}

// conflicts detection: returns Set of indexes in conflict
function findConflicts(){
  const conf = new Set();
  // rows
  for(let r=0;r<SIZE;r++){
    const seen = new Map();
    for(let c=0;c<SIZE;c++){
      const idx = r*SIZE + c; const v = puzzle[idx];
      if(!v) continue;
      if(seen.has(v)){ conf.add(idx); conf.add(seen.get(v)); }
      else seen.set(v, idx);
    }
  }
  // cols
  for(let c=0;c<SIZE;c++){
    const seen = new Map();
    for(let r=0;r<SIZE;r++){
      const idx = r*SIZE + c; const v = puzzle[idx];
      if(!v) continue;
      if(seen.has(v)){ conf.add(idx); conf.add(seen.get(v)); }
      else seen.set(v, idx);
    }
  }
  // boxes
  for(let br=0;br< SIZE; br += BOX_H){
    for(let bc=0; bc< SIZE; bc += BOX_W){
      const seen = new Map();
      for(let r=0;r<BOX_H;r++) for(let c=0;c<BOX_W;c++){
        const rr = br + r, cc = bc + c; const idx = rr*SIZE + cc; const v = puzzle[idx];
        if(!v) continue;
        if(seen.has(v)){ conf.add(idx); conf.add(seen.get(v)); }
        else seen.set(v, idx);
      }
    }
  }
  return conf;
}

// check solved
function isSolved(){
  for(let i=0;i<SIZE*SIZE;i++) if(puzzle[i] !== solution[i]) return false;
  return true;
}

// get peer indices (same row/col/box, excluding idx)
function getPeers(idx){
  const r = Math.floor(idx/SIZE), c = idx%SIZE;
  const peers = new Set();
  for(let cc=0;cc<SIZE;cc++) if(cc!==c) peers.add(r*SIZE+cc);
  for(let rr=0;rr<SIZE;rr++) if(rr!==r) peers.add(rr*SIZE+c);
  const boxR = Math.floor(r/BOX_H)*BOX_H, boxC = Math.floor(c/BOX_W)*BOX_W;
  for(let rr=0; rr<BOX_H; rr++){
    for(let cc=0; cc<BOX_W; cc++){
      const i = (boxR+rr)*SIZE + (boxC+cc);
      if(i !== idx) peers.add(i);
    }
  }
  return peers;
}

/* --- Generator / Solver (backtracking) --- */
// returns true if solved
function solveGrid(arr){
  const idx = arr.findIndex(v=>v===0);
  if(idx === -1) return true;
  const nums = shuffle([1,2,3,4,5,6]);
  for(const n of nums){
    if(canPlace(arr, idx, n)){
      arr[idx] = n;
      if(solveGrid(arr)) return true;
      arr[idx] = 0;
    }
  }
  return false;
}

function canPlace(arr, idx, n){
  const r = Math.floor(idx/SIZE), c = idx % SIZE;
  for(let cc=0;cc<SIZE;cc++){ if(arr[r*SIZE + cc] === n) return false; }
  for(let rr=0;rr<SIZE;rr++){ if(arr[rr*SIZE + c] === n) return false; }
  const boxR = Math.floor(r/BOX_H)*BOX_H, boxC = Math.floor(c/BOX_W)*BOX_W;
  for(let rr=0; rr<BOX_H; rr++) for(let cc=0; cc<BOX_W; cc++){
    if(arr[(boxR+rr)*SIZE + (boxC+cc)] === n) return false;
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

// generate full solution then remove cells according to difficulty
function generate(difficulty='medium'){
  let arr = new Array(SIZE*SIZE).fill(0);
  // fill full solution via backtracking (randomized)
  solveGrid(arr);
  return arr;
}

function carvePuzzle(full, difficulty='medium'){
  let arr = full.slice();
  let removals;
  if(difficulty==='easy') removals = 10;
  else if(difficulty==='medium') removals = 16;
  else removals = 20; // hard
  const indices = shuffle([...Array(SIZE*SIZE).keys()]);
  let removed = 0;
  for(const idx of indices){
    const backup = arr[idx];
    arr[idx] = 0;
    // ensure still solvable (not necessarily unique)
    const copy = arr.slice();
    if(solveGrid(copy)){
      removed++;
      if(removed >= removals) break;
    } else {
      arr[idx] = backup; // revert
    }
  }
  return arr;
}

/* new game driver */
function newGame(difficulty='medium'){
  stopTimer();
  seconds = 0;
  mistakes = 0;
  document.getElementById('mistakes').textContent = mistakes;
  // generate solution
  solution = generate(difficulty);
  // carve puzzle
  puzzle = carvePuzzle(solution, difficulty);
  // mark fixed
  for(let i=0;i<SIZE*SIZE;i++){
    fixed[i] = puzzle[i] !== 0;
    notes[i].clear();
  }
  selectedIdx = null;
  startTimer();
  render();
}

/* simple hint: fill one empty correct cell */
function hint(){
  if(!solution || !puzzle) return;
  let empties = [];
  for(let i=0;i< SIZE*SIZE;i++) if(puzzle[i] === 0) empties.push(i);
  if(empties.length === 0) return;
  const idx = empties[Math.floor(Math.random()*empties.length)];
  puzzle[idx] = solution[idx];
  // treat hint as prefilled so user can't erase it accidentally
  fixed[idx] = true;
  render();
}

// timer
function startTimer(){
  stopTimer();
  timerInterval = setInterval(()=>{ seconds++; render(); }, 1000);
}
function stopTimer(){ if(timerInterval){ clearInterval(timerInterval); timerInterval = null; } }

function flashCell(idx, cls){
  const el = document.querySelector(`.cell[data-idx="${idx}"]`);
  if(!el) return;
  el.classList.add(cls);
  setTimeout(()=>{ el.classList.remove(cls); render(); }, 600);
}
