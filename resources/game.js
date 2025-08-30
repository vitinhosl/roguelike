// game.js — Mini Survivors (versão com WebRTC manual + menu Normal/Online + nick/labels)
(function(){
'use strict';

/* =========================================================================================
   MULTIPLAYER (manual WebRTC – usa o Net do net-manual.js)
   ========================================================================================= */
const MULTI_ENABLED = true;
(function () {
  const n = window.Net;
  if (n && typeof n.init === 'function') n.init();
})();


/* =========================================================================================
   REGISTROS (skins, classes, elementos)
   ========================================================================================= */
const SKINS = [
  {id:'classic', name:'Clássico', player:'#9afff0', proj:'#a9f7ff'},
  {id:'emerald', name:'Esmeralda', player:'#49d991', proj:'#b6f5d9'},
  {id:'ruby', name:'Rubi', player:'#ff6b81', proj:'#ffc2cb'},
  {id:'amethyst', name:'Ametista', player:'#b794f4', proj:'#e9d5ff'},
  {id:'amber', name:'Âmbar', player:'#fbbf24', proj:'#fde68a'},
  {id:'onyx', name:'Ônix', player:'#94a3b8', proj:'#cbd5e1'}
];

const CLASSES = [
  {id:'hunter', name:'Caçador', desc:'Equilibrado.', mods:function(p){}},
  {id:'mage',   name:'Mago', desc:'+Dano, -Vida.', mods:function(p){p.damage+=1; p.maxHp=Math.max(4,p.maxHp-2); p.hp=p.maxHp; p.projSpeed*=1.1;}},
  {id:'tank',   name:'Tanque', desc:'+Vida, -Velocidade.', mods:function(p){p.maxHp+=6; p.hp=p.maxHp; p.speed*=0.9;}},
  {id:'rogue',  name:'Ladino', desc:'+Velocidade e +Projéteis, -Dano.', mods:function(p){p.speed*=1.2; p.projCount=Math.min(4,p.projCount+1); p.damage=Math.max(1,p.damage-1);}},
  {id:'elementalist', name:'Elementalista', desc:'Magia recarrega +rápido.', mods:function(p){p.abilityCdMax=9;}}
];

const ELEMENTS = ['fire','ice','water','air'];
const ELEMENT_INFO = {
  fire:{name:'Fogo', color:'#ff7043'},
  ice:{name:'Gelo', color:'#93c5fd'},
  water:{name:'Água', color:'#22d3ee'},
  air:{name:'Ar', color:'#facc15'}
};

/* =========================================================================================
   SKILLS (adicione aqui novas magias)
   ========================================================================================= */
const SKILLS = {
  elemental_burst: {
    id:'elemental_burst',
    name:'Explosão Elemental',
    cooldown: 12,
    cast: function(player, enemies){
      const rad = 160; let affected = 0;
      for (let i=0;i<enemies.length;i++){
        const mob = enemies[i]; if(mob.dead) continue;
        const d2 = dist2(player, mob);
        if (d2 <= rad*rad){
          affected++;
          if (player.element==='fire'){ mob.hit(2); mob.burnT += 3; }
          else if (player.element==='ice'){ mob.hit(1); mob.slowT = Math.max(mob.slowT, 3); }
          else if (player.element==='water'){ mob.hit(1); const a=angleTo(player,mob); mob.x+=Math.cos(a)*50; mob.y+=Math.sin(a)*50; }
          else if (player.element==='air'){ const a2=angleTo(player,mob); mob.x+=Math.cos(a2)*120; mob.y+=Math.sin(a2)*120; }
        }
      }
      if (player.element==='air') player.buffSpeedT = 2.5;
      if (player.element==='water') player.heal(1);
      msgFlash(ELEMENT_INFO[player.element].name+"! ("+affected+")");
    }
  },
  frost_nova: {
    id:'frost_nova',
    name:'Nova de Gelo',
    cooldown: 10,
    cast: function(player, enemies){
      const rad = 200;
      for (let i=0;i<enemies.length;i++){
        const mob = enemies[i]; if(mob.dead) continue;
        if (dist2(player,mob) <= rad*rad){ mob.hit(1); mob.slowT = Math.max(mob.slowT, 4); }
      }
      msgFlash("Gelo profundo!");
    }
  },
  fire_bomb: {
    id:'fire_bomb',
    name:'Bomba Ígnea',
    cooldown: 9,
    cast: function(player, enemies){
      const near = enemies.filter(e=>!e.dead)
                          .sort((a,b)=>dist2(player,a)-dist2(player,b))
                          .slice(0,5);
      for (let i=0;i<near.length;i++){ const e=near[i]; e.hit(2); e.burnT += 5; }
      msgFlash("Queimando!");
    }
  },
  chain_lightning: {
    id:'chain_lightning',
    name:'Cadeia Relâmpago',
    cooldown: 11,
    cast: function(player, enemies){
      const pool = enemies.filter(e=>!e.dead)
                          .sort((a,b)=>dist2(player,a)-dist2(player,b))
                          .slice(0,1);
      let hops = 5, dmg = 4, last = pool[0];
      while(hops>0 && last){
        last.hit(dmg);
        addDamageText(last.x,last.y,dmg,false,'#fde047');
        const next = nearestEnemy(last, enemies, 180, e=>e!==last);
        last = next; dmg = Math.max(1, Math.floor(dmg*0.7)); hops--;
      }
      msgFlash("ZAP!");
    }
  }
};
const DEFAULT_SKILL_ID = 'elemental_burst';

/* =========================================================================================
   UTILS
   ========================================================================================= */
function clamp(v,min,max){ return v<min?min:(v>max?max:v); }
function rand(min,max){ return Math.random()*(max-min)+min; }
function rint(min,max){ return Math.floor(rand(min,max+1)); }
function dist2(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy; }
function angleTo(a,b){ return Math.atan2(b.y-a.y, b.x-a.x); }
function formatTime(sec){
  const m = (sec/60|0).toString().padStart(2,'0');
  const s = (sec%60|0).toString().padStart(2,'0');
  return m+':'+s;
}
function nearestEnemy(from, enemies, range, extraFilter){
  let best=null, bestD=Infinity, r2=(range||9e9)*(range||9e9);
  for (let i=0;i<enemies.length;i++){
    const e=enemies[i]; if(e.dead) continue;
    if (extraFilter && !extraFilter(e)) continue;
    const d2 = dist2(from,e);
    if (d2<bestD && d2<=r2){ bestD=d2; best=e; }
  }
  return best;
}

/* =========================================================================================
   ÁUDIO
   ========================================================================================= */
const audio = {
  muted:false, ctx:null,
  beep(freq=660,len=0.05,type='sine',vol=0.05){
    if(this.muted) return;
    try{
      if(!this.ctx) this.ctx=new (window.AudioContext||window.webkitAudioContext)();
      const o=this.ctx.createOscillator(), g=this.ctx.createGain();
      o.type=type; o.frequency.value=freq; g.gain.value=vol;
      o.connect(g); g.connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime+len);
    }catch(e){}
  }
};

/* =========================================================================================
   CANVAS E MUNDO
   ========================================================================================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W=0, H=0;
function resize(){ W=canvas.width=innerWidth; H=canvas.height=innerHeight; }
addEventListener('resize',resize); resize();

const world = { w:6000, h:6000 };
const camera = { x:0, y:0 };
function centerCamera(){ camera.x = player.x - W/2; camera.y = player.y - H/2; }

/* =========================================================================================
   ENTIDADES
   ========================================================================================= */
function Entity(x,y,r,color){ this.x=x; this.y=y; this.r=r; this.color=color; this.dead=false; }
Entity.prototype.draw = function(){
  ctx.fillStyle=this.color; ctx.beginPath(); ctx.arc(this.x-camera.x,this.y-camera.y,this.r,0,Math.PI*2); ctx.fill();
};

function Player(){
  Entity.call(this, world.w/2, world.h/2, 10, '#9afff0');
  this.speed=200; this.maxHp=6; this.hp=this.maxHp; this.damage=2;
  this.fireDelay=.35; this.fireTimer=0;
  this.projSpeed=500; this.projSize=5; this.projPierce=0; this.projCount=1; this.projSpread=.15;
  this.magnet=100; this.level=1; this.xp=0; this.xpTo=5; this.invuln=0;
  this.element='fire';
  this.abilityCd=0; this.abilityCdMax=12; this.buffSpeedT=0;
  // crítico
  this.critChance = 0.10;
  this.critMult   = 1.6;
  // lendárias (flags)
  this.lifeSteal = 0;
  this.reviveOnce = false;
  this.splitShots = false;
  this.arcChance  = 0;
  this.gemXpBoost = 0;
  // skill atual
  this.currentSkillId = DEFAULT_SKILL_ID;
}
Player.prototype = Object.create(Entity.prototype);
Player.prototype.constructor = Player;
Player.prototype.hurt = function(d){
  if(this.invuln>0) return;
  this.hp-=d; this.invuln=.6; audio.beep(200,.08,'square',.03);
  if(this.hp<=0){ gameOver(); }
};
Player.prototype.heal = function(v){
  this.hp=clamp(this.hp+v,0,this.maxHp); addDamageText(this.x,this.y, v, true, '#4ade80');
};
Player.prototype.addXp = function(v){
  this.xp+=v;
  while(this.xp>=this.xpTo){ this.xp-=this.xpTo; this.level++; this.xpTo=Math.floor(this.xpTo*1.4+3); levelUp(); }
  updateBars();
};
Player.prototype.update = function(dt,input){
  const s=(this.speed*(this.buffSpeedT>0?1.35:1))*dt;
  let vx=(input.right?1:0)-(input.left?1:0), vy=(input.down?1:0)-(input.up?1:0);
  const len=Math.hypot(vx,vy)||1; vx/=len; vy/=len;
  this.x=clamp(this.x+vx*s,0,world.w); this.y=clamp(this.y+vy*s,0,world.h);
  if(this.invuln>0) this.invuln-=dt; if(this.buffSpeedT>0) this.buffSpeedT-=dt;
  this.fireTimer-=dt; if(this.abilityCd>0) this.abilityCd-=dt;
  if(this.fireTimer<=0){ this.autoFire(); this.fireTimer=this.fireDelay; }
};
Player.prototype.autoFire = function(){
  if(enemies.length===0) return;
  const target = nearestEnemy(this, enemies, 9e9);
  if(!target) return;
  const base=angleTo(this,target);
  const count=this.projCount;
  const spread=this.projSpread*(count>1?(count-1):1);
  const start=base-spread/2;
  for(let i=0;i<count;i++){
    const ang=start+(count===1?0:(i/(count-1))*spread);
    let vx=Math.cos(ang)*this.projSpeed, vy=Math.sin(ang)*this.projSpeed;
    let size=this.projSize, pierce=this.projPierce, color=ELEMENT_INFO[this.element].color;
    if(this.element==='air'){ vx*=1.2; vy*=1.2; pierce+=1; }
    if(this.element==='fire'){ size*=1.1; }
    projectiles.push(new Projectile(this.x,this.y,vx,vy,size,this.damage,pierce,this.element,color));
  }
  audio.beep(840,.03,'triangle',.02);
};

function Enemy(x,y,tier=1){
  const r = 10 + tier * 2;
  const color = tier===1 ? '#ffd166' : tier===2 ? '#f97316' : '#ef4444';
  Entity.call(this, x, y, r, color);
  this.speed = 60 + tier * 20;
  this.maxHp = 4 + tier * 5;
  this.hp = this.maxHp;
  this.touch = 1 + (tier - 1); // <-- corrigido
  this.tier = tier;
  this.slowT = 0;
  this.burnT = 0;
  this._burnTick = 0;
}
Enemy.prototype = Object.create(Entity.prototype);
Enemy.prototype.constructor = Enemy;

Enemy.prototype.update = function(dt){
  const sp=this.speed*(this.slowT>0?0.5:1);
  const dx=player.x-this.x, dy=player.y-this.y; const len=Math.hypot(dx,dy)||1;
  this.x+=dx/len*sp*dt; this.y+=dy/len*sp*dt;
  if(this.slowT>0) this.slowT-=dt;
  if(this.burnT>0){ this.burnT-=dt; this._burnTick+=dt; if(this._burnTick>=0.5){ this._burnTick=0; this.hit(1); } }
};
Enemy.prototype.hit = function(d){
  this.hp-=d;
  if(this.hp<=0){ this.dead=true; onEnemyKilled(this); }
};

function Projectile(x,y,vx,vy,r,damage,pierce,element,color){
  Entity.call(this,x,y,r,color||'#a9f7ff');
  this.vx=vx; this.vy=vy; this.damage=damage; this.pierce=pierce; this.life=1.6; this.element=element;
}
Projectile.prototype = Object.create(Entity.prototype);
Projectile.prototype.constructor = Projectile;
Projectile.prototype.update = function(dt){
  this.x+=this.vx*dt; this.y+=this.vy*dt; this.life-=dt; if(this.life<=0) this.dead=true;
};

function Gem(x,y,value){ Entity.call(this,x,y,4,'#6ee7ff'); this.value=value||1; }
Gem.prototype = Object.create(Entity.prototype);
Gem.prototype.constructor = Gem;

function DamageText(x,y,text,isHeal,color,isCrit){
  this.x=x; this.y=y; this.text=text; this.life=0.7; this.isHeal=!!isHeal; this.color=color||'#ffffff'; this.isCrit=!!isCrit;
}
DamageText.prototype.update = function(dt){ this.y-=40*dt; this.life-=dt; };
DamageText.prototype.draw = function(){
  const alpha = Math.max(0, this.life/0.7);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = this.color;
  ctx.font = (this.isCrit?'bold 22px ':'bold 16px ') + 'system-ui, sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillText(this.text, this.x - camera.x, this.y - camera.y);
  ctx.restore();
};

/* =========================================================================================
   ENEMY HP BAR (grande + texto [  10/40 ] dentro)
   ========================================================================================= */
const ENEMY_HP_BAR_HEIGHT = 12;
const ENEMY_HP_BAR_GAP    = 6;

function formatHPText(cur, max){
  const width = String(max).length;
  const curStr = String(cur).padStart(width, ' ');
  return '[  ' + curStr + '/' + max + ' ]';
}
function drawEnemyHPBar(e){
  const w = e.r * 2 + 8;
  const h = ENEMY_HP_BAR_HEIGHT;
  const x = e.x - (w/2) - camera.x;
  const y = e.y - e.r - ENEMY_HP_BAR_GAP - h - camera.y;

  ctx.fillStyle = '#111827';
  ctx.fillRect(x, y, w, h);

  const pct = clamp(e.hp / e.maxHp, 0, 1);
  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(x, y, w * pct, h);

  const cur = Math.max(0, Math.ceil(e.hp));
  const txt = formatHPText(cur, e.maxHp);

  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeText(txt, x + w/2, y + h/2);
  ctx.fillStyle = '#e5e7eb';
  ctx.fillText(txt, x + w/2, y + h/2);
}

/* =========================================================================================
   LABEL DO PLAYER (Nick + [ hp/max ])
   ========================================================================================= */
function drawPlayerLabel(name, x, y, hp, maxHp){
  const txt = (name || 'Player') + '  ' + formatHPText(Math.max(0, Math.ceil(hp)), maxHp);
  const sx = x - camera.x;
  const sy = y - 10 - 18 - camera.y; // um pouco acima da cabeça

  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 3;
  ctx.strokeText(txt, sx, sy);
  ctx.fillStyle = '#e5e7eb';
  ctx.fillText(txt, sx, sy);
}

/* =========================================================================================
   ESTADO
   ========================================================================================= */
let state='menu';
let player=new Player();
let enemies=[], projectiles=[], gems=[], damageTexts=[];
let kills=0, timeSurvived=0, defaultProjColor='#a9f7ff';

let playerName = 'Player'; // definido no menu

// MULTI
let isMultiplayer = false;
let isHost = false;
let remotePlayers = {};

/* =========================================================================================
   INPUT
   ========================================================================================= */
const input={up:false,down:false,left:false,right:false};
const keyMap={'KeyW':'up','ArrowUp':'up','KeyS':'down','ArrowDown':'down','KeyA':'left','ArrowLeft':'left','KeyD':'right','ArrowRight':'right'};

addEventListener('keydown',function(e){
  if(e.code==='Space'){ if(state==='menu') startGame(); }
  if(e.code==='KeyP'){ if(state==='playing') togglePause(); }
  if(e.code==='Escape'){ if(state==='playing'){ showEsc(true); pause(true); } else if(state==='paused'){ showEsc(false); pause(false); } }
  if(e.code==='KeyM'){ toggleMute(); }
  if(state==='playing'){
    if(e.code==='KeyQ') cycleElement(-1);
    if(e.code==='KeyE') cycleElement(1);
    if(e.code==='Digit1') setElement(0);
    if(e.code==='Digit2') setElement(1);
    if(e.code==='Digit3') setElement(2);
    if(e.code==='Digit4') setElement(3);
    if(e.code==='KeyF') castSkill();
  }
  const m=keyMap[e.code]; if(m) input[m]=true;
});
addEventListener('keyup',e=>{ const m=keyMap[e.code]; if(m) input[m]=false; });

/* =========================================================================================
   UI REFS
   ========================================================================================= */
const hpEl=document.querySelector('#hpBar>i');
const xpEl=document.querySelector('#xpBar>i');
const abEl=document.querySelector('#abilityBar>i');
const timerEl=document.getElementById('timer');
const killsEl=document.getElementById('kills');
const levelEl=document.getElementById('level');
const msgEl=document.getElementById('centerMsg');
const pauseOverlay=document.getElementById('pause');

const startBtn=document.getElementById('startBtn');
const pauseBtn=document.getElementById('pauseBtn');
const muteBtn=document.getElementById('muteBtn');
const choices=document.getElementById('choices');
const choiceWrap=document.getElementById('choiceWrap');
const escMenu=document.getElementById('escMenu');
const classText=document.getElementById('classText');
const elementText=document.getElementById('elementText');
const skinText=document.getElementById('skinText');
const skillText=document.getElementById('skillText'); // pode não existir

const mainMenu=document.getElementById('mainMenu');
const btnPlay=document.getElementById('btnPlay'); // fallback
const btnOpenClasses=document.getElementById('btnOpenClasses');
const btnOpenSkins=document.getElementById('btnOpenSkins');
const btnCloseMenu=document.getElementById('btnCloseMenu');
const quickClasses=document.getElementById('quickClasses');

const classMenu=document.getElementById('classMenu');
const classGrid=document.getElementById('classGrid');
const btnClassBack=document.getElementById('btnClassBack');

const skinMenu=document.getElementById('skinMenu');
const skinGrid=document.getElementById('skinGrid');
const btnSkinBack=document.getElementById('btnSkinBack');

const btnContinue=document.getElementById('btnContinue');
const btnMainMenu=document.getElementById('btnMainMenu');

// NOVOS (menu Normal/Online + Nick)
const nickInput      = document.getElementById('nickInput');
const btnModeNormal  = document.getElementById('btnModeNormal');
const btnModeOnline  = document.getElementById('btnModeOnline');

/* =========================================================================================
   BINDINGS DE BOTÃO
   ========================================================================================= */
startBtn?.addEventListener('click',()=>{ if(state==='menu') startGame(); else togglePause(); });
pauseBtn?.addEventListener('click',()=>{ if(state==='playing') togglePause(); });
muteBtn?.addEventListener('click', toggleMute);

// (antigo) Jogar padrão → single player
btnPlay?.addEventListener('click', ()=>{ playerName = (nickInput?.value||'').trim() || 'Player'; isMultiplayer=false; isHost=false; startGame(); });

btnOpenClasses?.addEventListener('click', openClassMenu);
btnOpenSkins?.addEventListener('click', openSkinMenu);
btnCloseMenu?.addEventListener('click', ()=> mainMenu.style.display='none');

btnClassBack?.addEventListener('click', ()=>{ classMenu.style.display='none'; mainMenu.style.display='grid'; });
btnSkinBack?.addEventListener('click', ()=>{ skinMenu.style.display='none'; mainMenu.style.display='grid'; });

btnContinue?.addEventListener('click', ()=>{ showEsc(false); pause(false); });
btnMainMenu?.addEventListener('click', ()=>{ showEsc(false); gotoMenu(); });

// NOVOS: Normal / Online (manual)
btnModeNormal?.addEventListener('click', ()=>{
  playerName = (nickInput?.value||'').trim() || 'Player';
  isMultiplayer=false; isHost=false;
  startGame();
});

btnModeOnline?.addEventListener('click', async ()=>{
  playerName = (nickInput?.value||'').trim() || 'Player';
  isMultiplayer=true;
  const host = confirm('OK = Criar sala (host)\nCancelar = Entrar na sala');
  try{
    if (host){ await Net.createRoom(); isHost = true;  setMsg('Sala criada (manual).', 2500); }
    else      { await Net.joinRoom();  isHost = false; setMsg('Conectado (manual).', 2500); }
    startGame();
  }catch(err){
    console.error(err);
    isMultiplayer=false; isHost=false;
    setMsg('Falha ao conectar online.', 2200);
  }
});

/* =========================================================================================
   MENUS
   ========================================================================================= */
let selectedClass='hunter', selectedSkin='classic';

function renderClassCards(container){
  container.innerHTML='';
  CLASSES.forEach(c=>{
    const el=document.createElement('div');
    el.className='itemCard'+(selectedClass===c.id?' active':'');
    el.innerHTML=`<div class="itemRow"><div class="swatch" style="background:#0ea5b7"></div><div><b>${c.name}</b><br><small>${c.desc}</small></div></div>`;
    el.onclick=()=>{ selectedClass=c.id; renderClassCards(container); updateMetaHUD(); };
    container.appendChild(el);
  });
}
function renderSkinCards(container){
  container.innerHTML='';
  SKINS.forEach(s=>{
    const el=document.createElement('div');
    el.className='itemCard'+(selectedSkin===s.id?' active':'');
    el.innerHTML=`<div class="itemRow"><div class="swatch" style="background:${s.player}"></div><div><b>${s.name}</b><br><small>${s.player}</small></div></div>`;
    el.onclick=()=>{ selectedSkin=s.id; renderSkinCards(container); updateMetaHUD(); };
    container.appendChild(el);
  });
}
function openClassMenu(){ mainMenu.style.display='none'; classMenu.style.display='grid'; renderClassCards(classGrid); }
function openSkinMenu(){ mainMenu.style.display='none'; skinMenu.style.display='grid'; renderSkinCards(skinGrid); }
function renderQuick(){
  quickClasses.innerHTML='';
  CLASSES.slice(0,3).forEach(c=>{
    const el=document.createElement('div');
    el.className='itemCard'+(selectedClass===c.id?' active':'');
    el.innerHTML=`<b>${c.name}</b><p style="margin:6px 0 0;color:var(--muted)">${c.desc}</p>`;
    el.onclick=()=>{ selectedClass=c.id; renderQuick(); updateMetaHUD(); };
    quickClasses.appendChild(el);
  });
}

/* =========================================================================================
   SPAWN
   ========================================================================================= */
let spawnTimer=0, spawnDelay=1.4;
function updateSpawns(dt){
  spawnTimer-=dt;
  if(spawnTimer<=0){
    spawnTimer=Math.max(0.35, spawnDelay-timeSurvived*0.01);
    const ring=Math.max(W,H)/2+120, ang=rand(0,Math.PI*2);
    const rx=player.x+Math.cos(ang)*ring, ry=player.y+Math.sin(ang)*ring;
    const t=timeSurvived; let tier=1;
    if(t>60) tier=2; if(t>120) tier=Math.random()<0.5?2:3; if(t>200) tier=rint(2,3);
    enemies.push(new Enemy(clamp(rx,0,world.w), clamp(ry,0,world.h), tier));
  }
}
function onEnemyKilled(e){
  kills++; updateBars(); audio.beep(480,.04,'sawtooth',.02);
  const drops=rint(1, e.tier===3?3:2);
  for(let i=0;i<drops;i++) gems.push(new Gem(e.x+rand(-6,6), e.y+rand(-6,6), e.tier));
  if(Math.random()<0.04) player.heal(1);
}

/* =========================================================================================
   UPGRADES (inclui lendárias + crítico)
   ========================================================================================= */
const upgrades = [
  { id:'rate', name:'Mira Rápida', desc:'-15% no tempo entre disparos', apply:()=>{ player.fireDelay=Math.max(.08, player.fireDelay*0.85); } },
  { id:'dmg', name:'Projéteis Mais Fortes', desc:'+1 de dano', apply:()=>{ player.damage+=1; } },
  { id:'speed', name:'Tênis Velozes', desc:'+10% velocidade', apply:()=>{ player.speed*=1.10; } },
  { id:'count', name:'Tiro Duplo', desc:'+1 projétil', apply:()=>{ player.projCount=Math.min(6,player.projCount+1); } },
  { id:'spread', name:'Leque', desc:'Aumenta a abertura', apply:()=>{ player.projSpread=Math.min(0.6, player.projSpread+0.08); } },
  { id:'bulletSpd', name:'Pólvora Premium', desc:'+25% vel. projétil', apply:()=>{ player.projSpeed*=1.25; } },
  { id:'pierce', name:'Perfuração', desc:'+1 furo', apply:()=>{ player.projPierce=Math.min(4,player.projPierce+1); } },
  { id:'hp', name:'Vida Máxima', desc:'+2 de vida e cura +2', apply:()=>{ player.maxHp+=2; player.heal(2); } },
  { id:'magnet', name:'Ímã', desc:'+40% alcance', apply:()=>{ player.magnet*=1.4; } },
  { id:'size', name:'Projétil Maior', desc:'+30% tamanho', apply:()=>{ player.projSize=Math.min(14, player.projSize*1.3); } },

  // crítico
  { id:'crit1', name:'Lâmina Afiada', desc:'+8% chance de crítico', apply:()=>{ player.critChance = Math.min(0.6, player.critChance+0.08); } },
  { id:'crit2', name:'Golpe Preciso', desc:'+0.4x multiplicador crítico', apply:()=>{ player.critMult = Math.min(3.5, player.critMult+0.4); } },

  // extras
  { id:'rate2', name:'Gatilho Afiado', desc:'-10% tempo entre disparos', apply:()=>{ player.fireDelay=Math.max(.06, player.fireDelay*0.90); } },
  { id:'dmg2', name:'Núcleo Explosivo', desc:'+2 de dano', apply:()=>{ player.damage+=2; } },
  { id:'bulletSpd2', name:'Aerodinâmica', desc:'+60% vel. projétil', apply:()=>{ player.projSpeed*=1.60; } },
  { id:'count2', name:'Rajada Tripla', desc:'+2 projéteis', apply:()=>{ player.projCount=Math.min(10, player.projCount+2); } },
  { id:'tank', name:'Blindado', desc:'+6 vida e cura total, -10% velocidade', apply:()=>{ player.maxHp+=6; player.heal(999); player.speed*=0.90; } },
  { id:'steadyAim', name:'Mão Firme', desc:'-25% de abertura', apply:()=>{ player.projSpread=Math.max(0.02, player.projSpread*0.75); } },
  { id:'overclock', name:'Overclock', desc:'-40% tempo entre disparos, +15% vel. projétil', apply:()=>{ player.fireDelay=Math.max(.06, player.fireDelay*0.60); player.projSpeed*=1.15; } },
  { id:'ammoPouch', name:'Bolsa de Munição', desc:'+1 projétil e -5% cadência', apply:()=>{ player.projCount=Math.min(10, player.projCount+1); player.fireDelay=Math.max(.06, player.fireDelay*0.95); } },

  // ======== LENDÁRIAS ========
  { id:'legend_vamp', legend:true, name:'Sede de Sangue', desc:'Lendária: roubo de vida 8% do dano', apply:()=>{ player.lifeSteal = (player.lifeSteal||0) + 0.08; } },
  { id:'legend_phoenix', legend:true, name:'Coração da Fênix', desc:'Lendária: renasce 1x com 50%', apply:()=>{ player.reviveOnce = true; } },
  { id:'legend_split', legend:true, name:'Projétil Fragmentado', desc:'Lendária: divide em +2 fragmentos (40% dano)', apply:()=>{ player.splitShots = true; } },
  { id:'legend_arc', legend:true, name:'Arco Tempestuoso', desc:'Lendária: 10% chance de arco elétrico', apply:()=>{ player.arcChance = (player.arcChance||0)+0.10; } },
  { id:'legend_midas', legend:true, name:'Toque de Midas', desc:'Lendária: +50% XP de gemas', apply:()=>{ player.gemXpBoost = (player.gemXpBoost||0)+0.5; } }
];

const LEGEND_LEVEL_STEP = 5;
const LEGEND_BASE_CHANCE = 0.15;

let pendingUpgrades=[];
function levelUp(){
  const choicesToShow = 3;
  const pool = upgrades.slice();
  const mustLegend = (player.level%LEGEND_LEVEL_STEP===0);
  const rollLegend = Math.random() < LEGEND_BASE_CHANCE;

  const picked = [];
  if (mustLegend || rollLegend){
    const legends = pool.filter(u=>u.legend);
    if (legends.length){
      const L = legends[rint(0,legends.length-1)];
      picked.push(L);
      const i = pool.indexOf(L); if(i>=0) pool.splice(i,1);
    }
  }
  while(picked.length<choicesToShow && pool.length){
    const idx = rint(0, pool.length-1);
    picked.push(pool.splice(idx,1)[0]);
  }
  pendingUpgrades = picked;
  renderUpgradeCards(pendingUpgrades);
  if(running) pause(true);
  choices.style.display='flex';
}
function renderUpgradeCards(list){
  choiceWrap.innerHTML='';
  list.forEach((u, idx)=>{
    const el=document.createElement('button');
    el.className='card'+(u.legend?' legend':'');
    el.innerHTML=`<h3>${u.name}</h3><p>${u.desc}</p>`;
    el.addEventListener('click',()=> pickUpgrade(idx));
    choiceWrap.appendChild(el);
  });
}
function pickUpgrade(i){
  const u=pendingUpgrades[i]; if(!u) return;
  u.apply(); audio.beep(880,.08,'triangle',.03);
  pendingUpgrades.length=0;
  choices.style.display='none';
  if(running) pause(false);
  updateBars();
}

/* =========================================================================================
   ELEMENTOS & SKILL
   ========================================================================================= */
function setElement(idx){
  idx=clamp(idx,0,ELEMENTS.length-1);
  player.element=ELEMENTS[idx];
  audio.beep( player.element==='fire'?660: player.element==='ice'?520: player.element==='water'?440: 740, .06,'sine',.03 );
  updateMetaHUD();
}
function cycleElement(dir){
  const i=ELEMENTS.indexOf(player.element);
  setElement((i+dir+ELEMENTS.length)%ELEMENTS.length);
}
function castSkill(){
  if (player.abilityCd>0) return;
  const skill = SKILLS[player.currentSkillId] || SKILLS[DEFAULT_SKILL_ID];
  if (!skill) return;
  skill.cast(player, enemies);
  player.abilityCd = skill.cooldown || player.abilityCdMax;
  audio.beep(900,.1,'triangle',.04);
  updateBars();
}

/* =========================================================================================
   CONTROLE DE JOGO
   ========================================================================================= */
let running=false, paused=false, last=performance.now();

function startGame(){
  running=true; paused=false; state='playing';
  timeSurvived=0; kills=0;
  enemies.length=0; projectiles.length=0; gems.length=0; damageTexts.length=0;
  Object.assign(player, new Player());

  const cls = CLASSES.find(c=>c.id===selectedClass);
  if (cls) cls.mods(player);
  const skin = SKINS.find(s=>s.id===selectedSkin) || SKINS[0];
  player.color=skin.player; defaultProjColor=skin.proj;

  setElement(ELEMENTS.indexOf('fire'));
  player.currentSkillId = DEFAULT_SKILL_ID;

  updateBars(); updateMetaHUD();
  mainMenu.style.display='none'; classMenu.style.display='none'; skinMenu.style.display='none'; showEsc(false);
  setMsg('Fique vivo! Magia: F • Trocar elemento: Q/E ou 1–4', 3000);
  audio.beep(660,.12,'sine',.03);
  last=performance.now();
  requestAnimationFrame(loop);
}
async function gotoMenu(){
  if (isMultiplayer && Net?.connected){
    try{ Net.send('leave', {}); await Net.leave(); }catch(e){}
  }
  isMultiplayer=false; isHost=false; remotePlayers={};

  running=false; state='menu';
  mainMenu.style.display='grid'; classMenu.style.display='none'; skinMenu.style.display='none';
  msgEl.textContent='';
  renderQuick(); updateMetaHUD();
}
function togglePause(){ if(!running) return; pause(!paused); }
function pause(p){ paused=p; state=p?'paused':'playing'; togglePauseUIState(); }
function showEsc(v){ escMenu.style.display = v? 'grid':'none'; }
function gameOver(){
  if (player.reviveOnce){
    player.reviveOnce=false;
    player.hp = Math.ceil(player.maxHp*0.5);
    player.invuln = 1.2;
    addDamageText(player.x, player.y, 'RENASCER', true, '#f59e0b');
    audio.beep(520,.15,'sine',.05);
    return;
  }
  running=false; state='menu';
  msgEl.innerHTML='💀 Você caiu após <b>'+formatTime(timeSurvived)+'</b> com <b>'+kills+'</b> abates.';
  audio.beep(110,.25,'square',.03);
  mainMenu.style.display='grid';
}
function loop(t){
  if(!running) return;
  const dt=Math.min(.033,(t-last)/1000); last=t;
  if(!paused){ timeSurvived+=dt; timerEl.textContent=formatTime(timeSurvived); update(dt); draw(); }
  requestAnimationFrame(loop);
}

/* =========================================================================================
   UPDATE
   ========================================================================================= */
function update(dt){
  player.update(dt,input); centerCamera(); updateSpawns(dt);

  for(let i=0;i<enemies.length;i++){ const e=enemies[i]; if(!e.dead) e.update(dt); }
  for(let j=0;j<projectiles.length;j++){ const p=projectiles[j]; if(!p.dead) p.update(dt); }
  for(let k=0;k<gems.length;k++){
    const g=gems[k];
    const d2=dist2(player,g);
    if(d2<player.magnet*player.magnet){
      const a=angleTo(g,player); g.x+=Math.cos(a)*180*dt; g.y+=Math.sin(a)*180*dt;
    }
  }

  // colisões projéteis x inimigos
  for(let pi=0;pi<projectiles.length;pi++){
    const pr=projectiles[pi]; if(pr.dead) continue;
    for(let ei=0;ei<enemies.length;ei++){
      const en=enemies[ei]; if(en.dead) continue;
      const rr=pr.r+en.r;
      if (dist2(pr,en)<=rr*rr){
        const base = pr.damage;
        const isCrit = Math.random() < player.critChance;
        const dealt = Math.max(1, Math.round(base * (isCrit?player.critMult:1)));

        if(pr.element==='ice'){ en.slowT=Math.max(en.slowT,1.5); }
        if(pr.element==='fire'){ en.burnT+=2; }
        if(pr.element==='water'){
          const rad=42;
          for(let e2i=0;e2i<enemies.length;e2i++){
            const o=enemies[e2i]; if(o===en||o.dead) continue; if(dist2(en,o)<=rad*rad) o.hit(1);
          }
        }
        if(pr.element==='air'){
          const aa=Math.atan2(pr.vy,pr.vx); en.x+=Math.cos(aa)*-60; en.y+=Math.sin(aa)*-60;
        }

        en.hit(dealt);
        addDamageText(en.x, en.y - en.r - 6, dealt, false, isCrit ? '#fde047' : '#ffffff', isCrit);

        if (player.lifeSteal){ const heal = Math.max(1, Math.floor(dealt*player.lifeSteal)); player.heal(heal); }

        if (player.splitShots){
          for(let sk=0;sk<2;sk++){
            const angs = Math.atan2(pr.vy,pr.vx) + (sk===0?-0.5:0.5);
            const vx=Math.cos(angs)*player.projSpeed*0.7, vy=Math.sin(angs)*player.projSpeed*0.7;
            projectiles.push(new Projectile(pr.x,pr.y,vx,vy,Math.max(3,pr.r*0.8), Math.max(1,Math.floor(pr.damage*0.4)), 0, pr.element, pr.color));
          }
        }

        if (player.arcChance && Math.random()<player.arcChance){
          const next = nearestEnemy(en, enemies, 180, o=>o!==en);
          if(next){ next.hit(2); addDamageText(next.x,next.y,2,false,'#60a5fa'); }
        }

        if(pr.pierce>0){ pr.pierce--; } else { pr.dead=true; }
      }
    }
  }

  // player vs inimigos
  for(let ei2=0;ei2<enemies.length;ei2++){
    const en2=enemies[ei2]; if(en2.dead) continue;
    const r=en2.r+player.r;
    if(dist2(en2,player)<=r*r){
      player.hurt(en2.touch);
      const a2=angleTo(en2,player); en2.x+=Math.cos(a2)*-30; en2.y+=Math.sin(a2)*-30;
    }
  }

  // coleta gemas
  for(let gi=0;gi<gems.length;gi++){
    const gm=gems[gi]; if(gm.dead) continue;
    const rcol=gm.r+player.r+6;
    if(dist2(gm,player)<=rcol*rcol){
      gm.dead=true;
      let gain = gm.value;
      if (player.gemXpBoost) gain += Math.ceil(gm.value*player.gemXpBoost);
      player.addXp(gain);
    }
  }

  // damage texts
  for (let dtIdx=0;dtIdx<damageTexts.length;dtIdx++) damageTexts[dtIdx].update(dt);
  damageTexts = damageTexts.filter(d=>d.life>0);

  enemies=enemies.filter(e=>!e.dead);
  projectiles=projectiles.filter(p=>!p.dead);
  gems=gems.filter(g=>!g.dead);

  if(enemies.length>450) enemies.splice(0,enemies.length-450);
  if(projectiles.length>600) projectiles.splice(0,projectiles.length-600);
  if(gems.length>320) gems.splice(0,gems.length-320);

  // broadcast posição do player (multi)
  if (isMultiplayer && Net?.connected){
    if (!update._accum) update._accum = 0;
    update._accum += dt;
    if (update._accum >= 0.08){
      update._accum = 0;
      const s = SKINS.find(s=>s.id===selectedSkin);
      Net.send('pos', {
        x: player.x, y: player.y, r: player.r,
        element: player.element, hp: player.hp, maxHp: player.maxHp,
        skin: (s&&s.id)||'classic',
        name: playerName
      });
    }
  }

  updateBars();
}

/* =========================================================================================
   DRAW
   ========================================================================================= */
function draw(){
  ctx.clearRect(0,0,W,H); drawGrid();

  // gems
  for (let gi=0;gi<gems.length;gi++){ const g=gems[gi]; ctx.fillStyle='#37b6ff'; ctx.beginPath(); ctx.arc(g.x-camera.x,g.y-camera.y,g.r,0,Math.PI*2); ctx.fill(); }
  // projectiles
  for (let pj=0;pj<projectiles.length;pj++){ const p=projectiles[pj]; ctx.fillStyle=p.color||defaultProjColor; ctx.beginPath(); ctx.arc(p.x-camera.x,p.y-camera.y,p.r,0,Math.PI*2); ctx.fill(); }
  // enemies
  for (let ei=0;ei<enemies.length;ei++){
    const e=enemies[ei];
    e.draw();
    drawEnemyHPBar(e); // sempre mostra (pode condicionar se quiser)
  }

  // player (blink invuln)
  ctx.save(); ctx.globalAlpha = (player.invuln>0 && ((performance.now()/100)%2<1))? .4:1; player.draw(); ctx.restore();
  drawPlayerLabel(playerName, player.x, player.y, player.hp, player.maxHp);

  // remotos (multi)
  for (const id in remotePlayers){
    const rp = remotePlayers[id];
    const col = (SKINS.find(s=>s.id===rp.skin)||{}).player || '#9afff0';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(rp.x - camera.x, rp.y - camera.y, player.r, 0, Math.PI*2);
    ctx.fill();
    drawPlayerLabel(rp.name || id.slice(0,6), rp.x, rp.y, rp.hp||1, rp.maxHp||1);
  }

  // damage texts
  for (let dt=0;dt<damageTexts.length;dt++) damageTexts[dt].draw();

  // vignette
  const vg=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)/3, W/2,H/2,Math.max(W,H)/1.2);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.45)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
}
function drawGrid(){
  const size=64, offX=-(camera.x%size), offY=-(camera.y%size);
  ctx.lineWidth=1; ctx.strokeStyle='rgba(255,255,255,0.04)';
  for(let x=offX;x<W;x+=size){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for(let y=offY;y<H;y+=size){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.fillStyle='rgba(73,217,145,0.08)'; ctx.beginPath(); ctx.arc(W/2,H/2,60,0,Math.PI*2); ctx.fill();
}

/* =========================================================================================
   HUD / UTILS
   ========================================================================================= */
function updateBars(){
  if (hpEl) hpEl.style.width=(player.hp/player.maxHp*100)+'%';
  if (xpEl) xpEl.style.width=(player.xp/player.xpTo*100)+'%';
  const cdMax = (SKILLS[player.currentSkillId] && SKILLS[player.currentSkillId].cooldown) || player.abilityCdMax;
  if (abEl) abEl.style.width=(100-Math.max(0,player.abilityCd)/cdMax*100)+'%';
  if (levelEl) levelEl.textContent=player.level;
  if (killsEl) killsEl.textContent=kills;
}
function updateMetaHUD(){
  const c = CLASSES.find(c=>c.id===selectedClass);
  const s = SKINS.find(s=>s.id===selectedSkin);
  if (classText) classText.textContent=(c||{}).name||'—';
  if (elementText){ elementText.textContent=ELEMENT_INFO[player.element]?ELEMENT_INFO[player.element].name:'—'; elementText.style.color=ELEMENT_INFO[player.element]?ELEMENT_INFO[player.element].color:''; }
  if (skinText) skinText.textContent=(s||{}).name||'—';
  if (skillText) skillText.textContent=(SKILLS[player.currentSkillId]||SKILLS[DEFAULT_SKILL_ID]).name;
}
function toggleMute(){ audio.muted=!audio.muted; if(muteBtn) muteBtn.textContent=audio.muted?'🔇 Sem som':'🔊 Som'; }
function togglePauseUIState(){ if(pauseBtn) pauseBtn.textContent=paused?'▶ Retomar':'⏸ Pausa'; }
function setMsg(text, ms){
  if (msgEl) msgEl.textContent=text;
  if(ms){ setTimeout(()=>{ if(state==='playing' && msgEl) msgEl.textContent=''; }, ms); }
}
function msgFlash(t){ setMsg(t, 900); }
function addDamageText(x,y,amount,isHeal,color,isCrit){
  const text = (typeof amount==='number') ? (isHeal?('+'+amount):('-'+amount)) : amount;
  damageTexts.push(new DamageText(x,y,text,isHeal,color,isCrit));
}

/* =========================================================================================
   JOYSTICK MOBILE
   ========================================================================================= */
const joy=document.getElementById('joy'); const joyKnob=joy?joy.querySelector('i'):null;
let joyActive=false,joyCx=0,joyCy=0;
function joySet(x,y){
  const dx=x-joyCx,dy=y-joyCy; const ang=Math.atan2(dy,dx); const mag=Math.min(1,Math.hypot(dx,dy)/50);
  input.left=(mag>0.3&&Math.cos(ang)<-0.3); input.right=(mag>0.3&&Math.cos(ang)>0.3);
  input.up=(mag>0.3&&Math.sin(ang)<-0.3); input.down=(mag>0.3&&Math.sin(ang)>0.3);
  if(joyKnob) joyKnob.style.transform=`translate(${clamp(dx,-40,40)}px,${clamp(dy,-40,40)}px)`;
}
function joyReset(){ input.up=input.down=input.left=input.right=false; if(joyKnob) joyKnob.style.transform='translate(0,0)'; }
function pt(e){ if(e.touches&&e.touches[0]) return {x:e.touches[0].clientX,y:e.touches[0].clientY}; return {x:e.clientX,y:e.clientY}; }
if(joy){
  joy.addEventListener('pointerdown',e=>{ joyActive=true; const r=joy.getBoundingClientRect(); joyCx=r.left+r.width/2; joyCy=r.top+r.height/2; joySet(pt(e).x,pt(e).y); joy.setPointerCapture(e.pointerId); });
  joy.addEventListener('pointermove',e=>{ if(joyActive) joySet(pt(e).x,pt(e).y); });
  joy.addEventListener('pointerup',()=>{ joyActive=false; joyReset(); });
}

/* =========================================================================================
   NET MENSAGENS
   ========================================================================================= */
Net.on(function(msg, clientId){
  if(!msg || !msg.t) return;
  if(msg.t==='pos'){
    const d = msg.d || {};
    remotePlayers[clientId] = Object.assign(remotePlayers[clientId]||{}, d, { ts: Date.now() });
  }
  if(msg.t==='leave'){
    delete remotePlayers[clientId];
  }
});

/* =========================================================================================
   INIT / TESTES
   ========================================================================================= */
renderQuick(); updateMetaHUD();

window.runGameTests = function(){
  console.group('Mini Survivors – Testes');
  try{
    console.assert(typeof levelUp==='function', 'levelUp deve estar definido');
    const lvl=player.level;
    player.addXp(player.xpTo);
    console.assert(player.level===lvl+1, 'Ao ganhar XP suficiente, o nível deve aumentar');
    console.assert(choices.style.display==='flex', 'O menu de upgrades deve aparecer');
  }catch(err){ console.error('Falha nos testes:', err); }
  console.groupEnd();
};

})();
