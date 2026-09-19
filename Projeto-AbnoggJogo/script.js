(function(){
  "use strict";

  // ---------- Setup ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const TS = 40; 
  const GRAVITY = 1700;
  const JUMP_V = 620;
  const MOVESPEED = 260;
  const PROJ_SPEED = 700;
  const NORMAL_W = 34, NORMAL_H = 64;
  const CROUCH_H = 32;
  const ENEMY_W = 40, ENEMY_H = 32;
  const ENEMY_DETECT_RANGE = 120;

  function resizeCanvas(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

 
  document.addEventListener("wheel", (e)=>{
    if(e.ctrlKey) e.preventDefault();
  }, {passive:false});
  document.addEventListener("keydown", (e)=>{
    if((e.ctrlKey || e.metaKey) && ["=","+","-","0"].includes(e.key)) e.preventDefault();
  });
  document.addEventListener("gesturestart", (e)=> e.preventDefault());
  document.addEventListener("gesturechange", (e)=> e.preventDefault());
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e)=>{
    const now = Date.now();
    if(now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, {passive:false});
  document.addEventListener("touchmove", (e)=>{
    if(e.touches.length > 1) e.preventDefault();
  }, {passive:false});

  const chip = document.getElementById("chip");
  const counter = document.getElementById("counter");
  const bubble = document.getElementById("bubble");
  const bubbleText = document.getElementById("bubbleText");
  const bubbleHint = document.getElementById("bubbleHint");
  const bubbleNext = document.getElementById("bubbleNext");
  const keystrip = document.getElementById("keystrip");
  const hintBubble = document.getElementById("hintBubble");
  const hintText = document.getElementById("hintText");
  const startOverlay = document.getElementById("startOverlay");
  const startBtn = document.getElementById("startBtn");
  const phaseCompleteOverlay = document.getElementById("phaseCompleteOverlay");
  const phaseCompleteTitle = document.getElementById("phaseCompleteTitle");
  const phaseCompleteText = document.getElementById("phaseCompleteText");
  const phaseCompleteBtn = document.getElementById("phaseCompleteBtn");
  const gameCompleteOverlay = document.getElementById("gameCompleteOverlay");
  const restartBtn = document.getElementById("restartBtn");

  // ---------- Level builder ----------
  function buildLevel(opts){
    const rows = opts.rows || 14;
    const cols = opts.cols;
    const groundRows = opts.groundRows || [12,13];
    const grid = [];
    for(let r=0;r<rows;r++){ grid.push(new Array(cols).fill(".")); }

    function inPit(c){
      return (opts.pits||[]).some(p => c>=p.start && c<p.start+p.width);
    }
    for(const r of groundRows){
      for(let c=0;c<cols;c++){
        if(!inPit(c)) grid[r][c] = "#";
      }
    }
    for(const p of (opts.platforms||[])){
      for(let c=p.col;c<p.col+p.length;c++){ grid[p.row][c] = "#"; }
    }
    for(const lc of (opts.lowCeilings||[])){
      for(let c=lc.colStart;c<=lc.colEnd;c++){ grid[lc.row][c] = "L"; }
    }
    const breakables = [];
    for(const b of (opts.breakWalls||[])){
      for(let c=b.col;c<b.col+b.width;c++){
        for(let r=b.topRow;r<b.topRow+b.height;r++){
          grid[r][c] = "B";
          breakables.push({col:c,row:r});
        }
      }
    }
    const targets = (opts.targets||[]).map(t => ({col:t.col,row:t.row,alive:true}));
    for(const t of targets){ grid[t.row][t.col] = "T"; }

    return {
      grid, rows, cols,
      flagCol: opts.flagCol, flagRow: opts.flagRow,
      startCol: opts.startCol, startRow: opts.startRow || (groundRows[0]-2),
      trees: opts.trees || [],
      breakables, targets,
      enemiesDef: opts.enemies || [],
      widthPx: cols*TS, heightPx: rows*TS
    };
  }

  const LEVELS = {
    move: buildLevel({
      cols:26, flagCol:24, flagRow:11, startCol:1,
      trees:[6,13,19]
    }),
    jump: buildLevel({
      cols:32, flagCol:30, flagRow:11, startCol:1,
      pits:[{start:8,width:2},{start:16,width:3},{start:24,width:2}],
      trees:[4,12,20,27]
    }),
    hide: buildLevel({
      cols:28, flagCol:26, flagRow:11, startCol:1,
      lowCeilings:[{colStart:12,colEnd:18,row:11}],
      enemies:[{minCol:8,maxCol:20,row:11,speed:95}],
      trees:[5,22]
    }),
    shoot: buildLevel({
      cols:28, flagCol:26, flagRow:11, startCol:1,
      breakWalls:[{col:16,width:2,topRow:9,height:3}],
      targets:[{col:5,row:9},{col:7,row:9},{col:9,row:9}],
      trees:[21]
    })
  };

  // ---------- Dialogue content ----------
  const PHASES = [
    {
      key:"move", title:"Fase 1: Mover", levelName:"move",
      unlock:["move"],
      dialogue:[
        {text:"Bem-vindo(a)! Vamos aprender a se mover pelo cenário.", keys:[]},
        {text:"Use as <b>SETAS</b> ou as teclas <b>WASD</b> para se mover!", keys:["←","→","W","A","S","D"]},
        {text:"Pense assim: as setas significam a mesma coisa que as letras.", keys:[]},
        {text:"Use <b>◀ / A</b> para ir para a esquerda e <b>▶ / D</b> para ir para a direita.", keys:["A","◀","▶","D"]},
        {text:"Agora chegue até a bandeira para completar a fase!", keys:[]}
      ],
      complete:"Muito bem! Você aprendeu a se mover."
    },
    {
      key:"jump", title:"Fase 2: Pular", levelName:"jump",
      unlock:["jump"],
      dialogue:[
        {text:"Ótimo! Agora vamos aprender a pular.", keys:[]},
        {text:"Pressione <b>ESPAÇO</b> (ou W / ↑) para pular sobre os buracos!", keys:["SPACE"]},
        {text:"Cuidado! Se você cair no buraco, volta para o começo da fase.", keys:[]},
        {text:"Pule os obstáculos e chegue até a bandeira!", keys:["SPACE"]}
      ],
      complete:"Muito bem! Você aprendeu a pular."
    },
    {
      key:"hide", title:"Fase 3: Esconder", levelName:"hide",
      unlock:["crouch"],
      dialogue:[
        {text:"Muito bem! Agora vamos aprender a se esconder.", keys:[]},
        {text:"Existe uma fera patrulhando o caminho à frente. Se ela te ver de pé, você volta pro início.", keys:[]},
        {text:"Segure <b>CTRL</b> para se abaixar e se esconder dela!", keys:["CTRL"]},
        {text:"Fique abaixado perto da fera e ao passar pela passagem baixa até a bandeira.", keys:["CTRL"]}
      ],
      complete:"Muito bem! Você aprendeu a se esconder."
    },
    {
      key:"shoot", title:"Fase 4: Atirar", levelName:"shoot",
      unlock:["shoot"],
      dialogue:[
        {text:"Última habilidade: atirar.", keys:[]},
        {text:"Clique com o <b>BOTÃO ESQUERDO DO MOUSE</b> para atirar!", keys:["CLIQUE"]},
        {text:"Use os alvos para praticar sua mira.", keys:["CLIQUE"]},
        {text:"Alguns blocos bloqueiam o caminho, atire neles para destruí-los!", keys:["CLIQUE"]},
        {text:"Destrua o bloqueio e chegue até a bandeira para vencer o jogo!", keys:["CLIQUE"]}
      ],
      complete:"Parabéns! Você aprendeu todos os comandos."
    }
  ];

  // ---------- State ----------
  let phaseIndex = 0;
  let unlocked = new Set();
  let dialogueStep = 0;
  let mode = "start"; // start | dialogue | play | phaseComplete | gameComplete
  let level = null;
  let player, projectiles, camX;

  function loadPhase(idx){
    const phase = PHASES[idx];
    level = LEVELS[phase.levelName];
    // reset breakable/target state each time phase is (re)loaded
    level.breakables.forEach(b => { level.grid[b.row][b.col] = "B"; });
    level.targets.forEach(t => { t.alive = true; level.grid[t.row][t.col] = "T"; });
    // instantiate runtime enemies from the level definition
    level.enemies = level.enemiesDef.map(e => ({
      x: e.minCol*TS, minX: e.minCol*TS, maxX: e.maxCol*TS - ENEMY_W,
      y: e.row*TS + TS - ENEMY_H, w: ENEMY_W, h: ENEMY_H,
      speed: e.speed, dir: 1
    }));
    resetPlayerToStart();
    projectiles = [];
    dialogueStep = 0;
    mode = "dialogue";
    chip.textContent = phase.title;
    showDialogueStep();
  }

  function resetPlayerToStart(){
    player = {
      x: level.startCol*TS, y: level.startRow*TS,
      w: NORMAL_W, h: NORMAL_H,
      vx:0, vy:0, onGround:false, crouching:false, facing:1,
      checkpointX: level.startCol*TS, checkpointY: level.startRow*TS
    };
    camX = 0;
  }

  // ---------- Recovery hint (camera zooms on the player + encouraging tip) ----------
  const FALL_MESSAGES = [
    "Quase lá! Calcule o momento certo de pular.",
    "Você consegue! Tenta pular um pouco antes do buraco.",
    "Foi por pouco, vamos tentar de novo!"
  ];
  const CAUGHT_MESSAGES = [
    "Ela te viu! Abaixe-se (Ctrl) antes de chegar perto.",
    "Quase! Segure Ctrl mais cedo da próxima vez.",
    "Você consegue se esconder, tenta de novo!"
  ];
  const hint = { active:false, timer:0, duration:1.3 };

  function recoverAtCheckpoint(messages){
    player.x = player.checkpointX;
    player.y = player.checkpointY;
    player.vx = 0; player.vy = 0;
    hint.active = true;
    hint.timer = hint.duration;
    hintText.textContent = messages[Math.floor(Math.random()*messages.length)];
    hintBubble.classList.add("show");
  }

  function hintZoom(){
    const t = hint.duration - hint.timer;
    const inT = 0.25, outT = 0.3;
    const holdT = hint.duration - inT - outT;
    if(t < inT) return 1 + 0.7*(t/inT);
    if(t < inT+holdT) return 1.7;
    return 1.7 - 0.7*Math.min(1, (t-inT-holdT)/outT);
  }

  function showDialogueStep(){
    const phase = PHASES[phaseIndex];
    const step = phase.dialogue[dialogueStep];
    bubbleText.innerHTML = step.text;
    bubbleHint.textContent = dialogueStep < phase.dialogue.length-1
      ? "Clique em Continuar ou pressione Enter"
      : "Clique para começar a jogar";
    bubbleNext.textContent = dialogueStep < phase.dialogue.length-1 ? "Continuar ▸" : "Jogar ▸";
    bubble.classList.add("show");
    counter.textContent = (dialogueStep+1) + "/" + phase.dialogue.length;
    renderKeystrip(step.keys);
  }

  function advanceDialogue(){
    const phase = PHASES[phaseIndex];
    if(dialogueStep < phase.dialogue.length-1){
      dialogueStep++;
      showDialogueStep();
    } else {
      bubble.classList.remove("show");
      phase.unlock.forEach(u => unlocked.add(u));
      updateTouchButtons();
      mode = "play";
      counter.textContent = "vá até a bandeira";
      renderKeystrip([]);
    }
  }

  function renderKeystrip(activeList){
    const allKeys = [
      {id:"A",label:"A"},{id:"W",label:"W"},{id:"S",label:"S"},{id:"D",label:"D"},
      {id:"←",label:"←"},{id:"↑",label:"↑"},{id:"→",label:"→"},
      {id:"SPACE",label:"ESPAÇO"},{id:"CTRL",label:"CTRL"},{id:"CLIQUE",label:"CLIQUE"}
    ];
    keystrip.innerHTML = "";
    const relevant = mode==="dialogue" ? (activeList && activeList.length ? activeList : null) : null;
    const toShow = relevant || (function(){
      const s = [];
      if(unlocked.has("move")) s.push("A","D","←","→");
      if(unlocked.has("jump")) s.push("SPACE");
      if(unlocked.has("crouch")) s.push("CTRL");
      if(unlocked.has("shoot")) s.push("CLIQUE");
      return s;
    })();
    const shown = new Set();
    for(const key of allKeys){
      if(!toShow.includes(key.id)) continue;
      if(shown.has(key.id)) continue;
      shown.add(key.id);
      const div = document.createElement("div");
      div.className = "keycap" + (relevant && relevant.includes(key.id) ? " active" : "");
      div.textContent = key.label;
      div.dataset.key = key.id;
      keystrip.appendChild(div);
    }
  }

  function completePhase(){
    mode = "phaseComplete";
    const phase = PHASES[phaseIndex];
    phaseCompleteTitle.textContent = "Fase concluída!";
    phaseCompleteText.textContent = phase.complete;
    phaseCompleteBtn.textContent = (phaseIndex < PHASES.length-1) ? "Próxima fase ▸" : "Finalizar ▸";
    phaseCompleteOverlay.classList.add("show");
  }

  // ---------- Input ----------
  const keys = new Set();
  window.addEventListener("keydown", (e)=>{
    const k = e.key;
    if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," ","Control"].includes(k)) e.preventDefault();
    keys.add(normalizeKey(k));
    if(k === "Enter"){
      if(mode==="dialogue") advanceDialogue();
      else if(mode==="start") startGame();
      else if(mode==="phaseComplete") nextFromPhaseComplete();
      else if(mode==="gameComplete") restartGame();
    }
  }, {passive:false});
  window.addEventListener("keyup", (e)=>{
    keys.delete(normalizeKey(e.key));
  });
  function normalizeKey(k){
    if(k==="ArrowLeft") return "LEFT";
    if(k==="ArrowRight") return "RIGHT";
    if(k==="ArrowUp") return "UP";
    if(k==="ArrowDown") return "DOWN";
    if(k===" ") return "SPACE";
    if(k==="Control") return "CTRL";
    return k.toUpperCase();
  }

  canvas.addEventListener("mousedown", (e)=>{
    if(mode==="dialogue"){ advanceDialogue(); return; }
    if(mode==="play" && unlocked.has("shoot")){
      spawnProjectile();
    }
  });

  bubbleNext.addEventListener("click", advanceDialogue);
  startBtn.addEventListener("click", startGame);
  phaseCompleteBtn.addEventListener("click", nextFromPhaseComplete);
  restartBtn.addEventListener("click", restartGame);

  // ---------- Touch HUD (mobile controls) ----------
  const btnLeft = document.getElementById("btnLeft");
  const btnRight = document.getElementById("btnRight");
  const btnJump = document.getElementById("btnJump");
  const btnCrouch = document.getElementById("btnCrouch");
  const btnShoot = document.getElementById("btnShoot");

  function bindHold(el, keyName){
    const press = (e)=>{ e.preventDefault(); keys.add(keyName); el.classList.add("pressed"); };
    const release = (e)=>{ if(e) e.preventDefault(); keys.delete(keyName); el.classList.remove("pressed"); };
    el.addEventListener("touchstart", press, {passive:false});
    el.addEventListener("touchend", release, {passive:false});
    el.addEventListener("touchcancel", release, {passive:false});
    el.addEventListener("mousedown", press);
    el.addEventListener("mouseup", release);
    el.addEventListener("mouseleave", release);
  }
  bindHold(btnLeft, "LEFT");
  bindHold(btnRight, "RIGHT");
  bindHold(btnJump, "SPACE");
  bindHold(btnCrouch, "CTRL");

  function fireShoot(e){
    e.preventDefault();
    if(mode==="play" && unlocked.has("shoot")) spawnProjectile();
    btnShoot.classList.add("pressed");
  }
  btnShoot.addEventListener("touchstart", fireShoot, {passive:false});
  btnShoot.addEventListener("touchend", (e)=>{ e.preventDefault(); btnShoot.classList.remove("pressed"); }, {passive:false});
  btnShoot.addEventListener("mousedown", fireShoot);
  btnShoot.addEventListener("mouseup", ()=> btnShoot.classList.remove("pressed"));

  function updateTouchButtons(){
    btnLeft.style.display = unlocked.has("move") ? "flex" : "none";
    btnRight.style.display = unlocked.has("move") ? "flex" : "none";
    btnJump.style.display = unlocked.has("jump") ? "flex" : "none";
    btnCrouch.style.display = unlocked.has("crouch") ? "flex" : "none";
    btnShoot.style.display = unlocked.has("shoot") ? "flex" : "none";
  }

  function startGame(){
    startOverlay.classList.remove("show");
    phaseIndex = 0;
    unlocked = new Set();
    updateTouchButtons();
    loadPhase(0);
  }
  function nextFromPhaseComplete(){
    phaseCompleteOverlay.classList.remove("show");
    if(phaseIndex < PHASES.length-1){
      phaseIndex++;
      loadPhase(phaseIndex);
    } else {
      mode = "gameComplete";
      gameCompleteOverlay.classList.add("show");
    }
  }
  function restartGame(){
    gameCompleteOverlay.classList.remove("show");
    startOverlay.classList.add("show");
    mode = "start";
  }

  function spawnProjectile(){
    projectiles.push({
      x: player.x + (player.facing>0 ? player.w : 0),
      y: player.y + player.h*0.35,
      vx: PROJ_SPEED*player.facing,
      alive:true
    });
  }

  // ---------- Collision helpers ----------
  function tileAt(col,row){
    if(row<0 || row>=level.rows) return ".";
    if(col<0 || col>=level.cols) return "#"; // treat out-of-bounds sides as solid walls
    return level.grid[row][col];
  }
  function isSolid(ch){ return ch==="#" || ch==="L" || ch==="B"; }

  function collideX(p){
    const dir = Math.sign(p.vx);
    if(dir===0) return;
    const nextX = p.x + p.vx*dt;
    const col = dir>0 ? Math.floor((nextX+p.w)/TS) : Math.floor(nextX/TS);
    const rowTop = Math.floor(p.y/TS);
    const rowBot = Math.floor((p.y+p.h-1)/TS);
    for(let r=rowTop;r<=rowBot;r++){
      if(isSolid(tileAt(col,r))){
        p.x = dir>0 ? col*TS - p.w : (col+1)*TS;
        p.vx = 0;
        return;
      }
    }
    p.x = nextX;
  }
  function collideY(p){
    const nextY = p.y + p.vy*dt;
    const dir = Math.sign(p.vy);
    p.onGround = false;
    if(dir!==0){
      const row = dir>0 ? Math.floor((nextY+p.h)/TS) : Math.floor(nextY/TS);
      const colL = Math.floor(p.x/TS);
      const colR = Math.floor((p.x+p.w-1)/TS);
      for(let c=colL;c<=colR;c++){
        if(isSolid(tileAt(c,row))){
          if(dir>0){ p.y = row*TS - p.h; p.onGround = true; }
          else { p.y = (row+1)*TS; }
          p.vy = 0;
          return;
        }
      }
    }
    p.y = nextY;
  }

  // ---------- Update ----------
  let dt = 1/60, lastTime = performance.now();

  function update(){
    if(mode!=="play"){ return; }

    if(hint.active){
      hint.timer -= dt;
      if(hint.timer <= 0){
        hint.active = false;
        hintBubble.classList.remove("show");
      }
      return;
    }

    // crouch
    const wantCrouch = unlocked.has("crouch") && keys.has("CTRL");
    const bottom = player.y + player.h;
    const newH = wantCrouch ? CROUCH_H : NORMAL_H;
    if(newH !== player.h){
      player.h = newH;
      player.y = bottom - player.h;
    }
    player.crouching = wantCrouch;

    // horizontal input
    let vx = 0;
    if(unlocked.has("move")){
      if(keys.has("LEFT")||keys.has("A")){ vx = -MOVESPEED; player.facing = -1; }
      else if(keys.has("RIGHT")||keys.has("D")){ vx = MOVESPEED; player.facing = 1; }
    }
    player.vx = vx;

    // jump
    if(unlocked.has("jump") && player.onGround &&
       (keys.has("SPACE")||keys.has("UP")||keys.has("W"))){
      player.vy = -JUMP_V;
      player.onGround = false;
    }

    // gravity
    player.vy += GRAVITY*dt;
    if(player.vy > 1400) player.vy = 1400;

    collideX(player);
    collideY(player);

    if(player.onGround){
      player.checkpointX = player.x;
      player.checkpointY = player.y;
    }

    // fell into a pit — go back to the last safe spot instead of the start
    if(player.y > level.heightPx + 80){
      recoverAtCheckpoint(FALL_MESSAGES);
      return;
    }

    // camera
    const half = canvas.width/2;
    camX = Math.max(0, Math.min(player.x - half, level.widthPx - canvas.width));

    // enemies (the "bicho" you must hide from with Ctrl)
    for(const en of (level.enemies||[])){
      en.x += en.dir*en.speed*dt;
      if(en.x <= en.minX){ en.x = en.minX; en.dir = 1; }
      if(en.x >= en.maxX){ en.x = en.maxX; en.dir = -1; }

      const playerCenterX = player.x + player.w/2;
      const enemyCenterX = en.x + en.w/2;
      const closeEnough = Math.abs(playerCenterX - enemyCenterX) < ENEMY_DETECT_RANGE;
      const sameGround = (player.y + player.h) > en.y - 10;
      if(closeEnough && sameGround && !player.crouching){
        recoverAtCheckpoint(CAUGHT_MESSAGES);
        return;
      }
    }

    // projectiles
    for(const pr of projectiles){
      if(!pr.alive) continue;
      pr.x += pr.vx*dt;
      const col = Math.floor(pr.x/TS);
      const row = Math.floor(pr.y/TS);
      const ch = tileAt(col,row);
      if(ch==="B"){
        level.grid[row][col] = ".";
        pr.alive = false;
      } else if(ch==="T"){
        const t = level.targets.find(t=>t.col===col && t.row===row && t.alive);
        if(t){ t.alive = false; level.grid[row][col] = "."; }
        pr.alive = false;
      } else if(ch==="#" || ch==="L"){
        pr.alive = false;
      }
      if(pr.x<0 || pr.x>level.widthPx) pr.alive = false;
    }
    projectiles = projectiles.filter(p=>p.alive);

    // win check
    const flagRect = {x: level.flagCol*TS, y: level.flagRow*TS - TS, w: TS, h: TS*2};
    if(rectsOverlap(player, flagRect)){
      completePhase();
    }
  }
  function rectsOverlap(a,b){
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  // ---------- Draw ----------
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // sky
    const grad = ctx.createLinearGradient(0,0,0,canvas.height);
    grad.addColorStop(0,"#8fd8f5");
    grad.addColorStop(1,"#bdeaff");
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    if(!level){ return; }

    ctx.save();
    if(hint.active){
      const zoom = hintZoom();
      const cx = player.x + player.w/2, cy = player.y + player.h/2;
      ctx.translate(canvas.width/2, canvas.height/2);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    } else {
      const camY = level.heightPx - canvas.height;
      ctx.translate(-camX, -camY);
    }

    // decorative trees
    for(const tc of level.trees){
      drawTree(tc*TS+TS/2, 12*TS);
    }

    // tiles
    const colStart = Math.max(0, Math.floor(camX/TS)-1);
    const colEnd = Math.min(level.cols, Math.ceil((camX+canvas.width)/TS)+1);
    for(let c=colStart;c<colEnd;c++){
      for(let r=0;r<level.rows;r++){
        const ch = level.grid[r][c];
        if(ch===".") continue;
        drawTile(ch, c*TS, r*TS, r, level.grid);
      }
    }

    // flag
    drawFlag(level.flagCol*TS, level.flagRow*TS);

    // enemies
    for(const en of (level.enemies||[])){
      drawEnemy(en);
    }

    // projectiles
    ctx.fillStyle = "#ff5a3d";
    for(const pr of projectiles){
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 5, 0, Math.PI*2);
      ctx.fill();
    }

    // player
    drawPlayer();

    ctx.restore();
  }

  function drawTile(ch,x,y,row,grid){
    if(ch==="#"){
      const isTop = grid[row-1] ? grid[row-1][x/TS]==="." || grid[row-1][x/TS]===undefined : true;
      ctx.fillStyle = "#8b5a2b";
      ctx.fillRect(x,y,TS,TS);
      if(isTop){
        ctx.fillStyle = "#4caf50";
        ctx.fillRect(x,y,TS,10);
      }
      ctx.strokeStyle = "rgba(0,0,0,.12)";
      ctx.strokeRect(x+0.5,y+0.5,TS-1,TS-1);
    } else if(ch==="L"){
      ctx.fillStyle = "#6b4a2f";
      ctx.fillRect(x,y,TS,TS);
      ctx.strokeStyle = "rgba(0,0,0,.25)";
      for(let i=0;i<2;i++){
        ctx.strokeRect(x+2, y+2+i*18, TS-4, 14);
      }
    } else if(ch==="B"){
      ctx.fillStyle = "#c9a227";
      ctx.fillRect(x+2,y+2,TS-4,TS-4);
      ctx.strokeStyle = "#8a6d1a";
      ctx.lineWidth = 2;
      ctx.strokeRect(x+2,y+2,TS-4,TS-4);
      ctx.beginPath();
      ctx.moveTo(x+2,y+2); ctx.lineTo(x+TS-2,y+TS-2);
      ctx.moveTo(x+TS-2,y+2); ctx.lineTo(x+2,y+TS-2);
      ctx.stroke();
    } else if(ch==="T"){
      ctx.fillStyle = "#ffe89a";
      ctx.fillRect(x+6,y+6,TS-12,TS-12);
      ctx.fillStyle = "#e63946";
      ctx.beginPath();
      ctx.arc(x+TS/2,y+TS/2,6,0,Math.PI*2);
      ctx.fill();
    }
  }

  function drawTree(cx, groundY){
    ctx.fillStyle = "#6b4423";
    ctx.fillRect(cx-4, groundY-38, 8, 38);
    ctx.fillStyle = "#3f9142";
    ctx.beginPath();
    ctx.arc(cx, groundY-48, 22, 0, Math.PI*2);
    ctx.fill();
  }

  function drawFlag(px,py){
    ctx.fillStyle = "#6b4423";
    ctx.fillRect(px+16, py-40, 4, 80);
    ctx.fillStyle = "#e83fae";
    ctx.beginPath();
    ctx.moveTo(px+20, py-40);
    ctx.lineTo(px+50, py-30);
    ctx.lineTo(px+20, py-20);
    ctx.closePath();
    ctx.fill();
  }

  // the "bicho" (creature) that patrols in phase 3 — hide from it with Ctrl
  function drawEnemy(en){
    const bob = Math.sin(performance.now()/180 + en.x*0.05) * 3;
    ctx.save();
    ctx.translate(en.x, en.y + bob);
    // body
    ctx.fillStyle = "#8a3f2b";
    ctx.beginPath();
    ctx.ellipse(en.w/2, en.h/2, en.w/2, en.h/2, 0, 0, Math.PI*2);
    ctx.fill();
    // belly
    ctx.fillStyle = "#c97a4a";
    ctx.beginPath();
    ctx.ellipse(en.w/2, en.h*0.62, en.w*0.32, en.h*0.28, 0, 0, Math.PI*2);
    ctx.fill();
    // eyes (facing patrol direction)
    const eyeOffset = en.dir>0 ? 6 : -6;
    ctx.fillStyle = "#1b1e24";
    ctx.beginPath();
    ctx.arc(en.w/2+eyeOffset, en.h*0.35, 3.2, 0, Math.PI*2);
    ctx.fill();
    // little ears
    ctx.fillStyle = "#6b2f1e";
    ctx.beginPath();
    ctx.moveTo(en.w*0.2, en.h*0.12); ctx.lineTo(en.w*0.32, -4); ctx.lineTo(en.w*0.42, en.h*0.12);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(en.w*0.58, en.h*0.12); ctx.lineTo(en.w*0.68, -4); ctx.lineTo(en.w*0.8, en.h*0.12);
    ctx.fill();
    ctx.restore();
  }

  // player is drawn as a plain square
  function drawPlayer(){
    const p = player;
    ctx.fillStyle = "#2f6fed";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = "#173a8a";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x+1, p.y+1, p.w-2, p.h-2);
  }

  // ---------- Loop ----------
  function loop(now){
    dt = Math.min(0.032, (now-lastTime)/1000);
    lastTime = now;
    update();
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

})();