(function(){
'use strict';

/* ===========================================================
   REGISTROS GLOBAIS (skins, classes, elementos, skills)
   =========================================================== */

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

/* ============== SKILLS: edite/adicione aqui ================
   Cada skill tem: id, name, cooldown, cast(player,enemies,dt)
   Você pode criar novas skills copiando o formato abaixo.
   =========================================================== */
const SKILLS = {
  elemental_burst: {
    id:'elemental_burst',
    name:'Explosão Elemental',
    cooldown: 12,
    cast: function(player, enemies){
      // Explosão circular com efeito por elemento
      const rad = 160;
      let affected = 0;
      for (let mob of enemies){
        if(mob.dead) continue;
        const d2 = dist2(player, mob);
        if (d2 <= rad*rad){
          affected++;
          if (player.element==='fire'){ mob.hit(2); mob.burnT += 3; }
          else if (player.element==='ice'){ mob.hit(1); mob.slowT = Math.max(mob.slowT, 3); }
          else if (player.element==='water'){ mob.hit(1); const a=angleTo(player,mob); mob.x+=Math.cos(a)*50; mob.y+=Math.sin(a)*50; }
          else if (player.element==='air'){ const a=angleTo(player,mob); mob.x+=Math.cos(a)*120; mob.y+=Math.sin(a)*120; }
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
      for (let mob of enemies){
        if(mob.dead) continue;
        if (dist2(player,mob) <= rad*rad){
          mob.hit(1);
          mob.slowT = Math.max(mob.slowT, 4);
        }
      }
      msgFlash("Gelo profundo!");
    }
  },

  fire_bomb: {
    id:'fire_bomb',
    name:'Bomba Ígnea',
    cooldown: 9,
    cast: function(player, enemies){
      // Causa burn longo nos 5 mais próximos
      let near = enemies.filter(e=>!e.dead).sort((a,b)=>dist2(player,a)-dist2(player,b)).slice(0,5);
      for (let e of near){ e.hit(2); e.burnT += 5; }
      msgFlash("Queimando!");
    }
  },

  chain_lightning: {
    id:'chain_lightning',
    name:'Cadeia Relâmpago',
    cooldown: 11,
    cast: function(player, enemies){
      // salta até 5 inimigos, dano decrescente
      let pool = enemies.filter(e=>!e.dead).sort((a,b)=>dist2(player,a)-dist2(player,b)).slice(0,1);
      let hops = 5, dmg = 4, last = pool[0];
      while(hops>0 && last){
        last.hit(dmg);
        addDamageText(last.x,last.y,dmg,false,'#fde047');
        let next = nearestEnemy(last, enemies, 180, function(e){return e!==last;});
        last = next; dmg = Math.max(1, Math.floor(dmg*0.7)); hops--;
      }
      msgFlash("ZAP!");
    }
  }
};
// skill padrão
const DEFAULT_SKILL_ID = 'elemental_burst';

/* ===========================================================
   UTILIDADES
   =========================================================== */
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
  let best=null, bestD=Infinity, r2=range*range;
  for (let e of enemies){
    if(e.dead) continue;
    if (extraFilter && !extraFilter(e)) continue;
    const d2 = dist2(from,e);
    if (d2<bestD && d2<=r2){ bestD=d2; best=e; }
  }
  return best;
}

/* ===========================================================
   ÁUDIO
   =========================================================== */
const audio = {
  muted:false, ctx:null,
  beep:function(freq=660,len=0.05,type='sine',vol=0.05){
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

/* ===========================================================
   CANVAS E MUNDO
   =========================================================== */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W=0, H=0;
function resize(){ W=canvas.width=innerWidth; H=canvas.height=innerHeight; }
addEventListener('resize',resize); resize();

const world = { w:6000, h:6000 };
const camera = { x:0, y:0 };
function centerCamera(){ camera.x = player.x - W/2; camera.y = player.y - H/2; }

/* ===========================================================
   ENTIDADES
   =========================================================== */
class Entity{
  constructor(x,y,r,color){ this.x=x; this.y=y; this.r=r; this.color=color; this.dead=false; }
  draw(){ ctx.fillStyle=this.color; ctx.beginPath(); ctx.arc(this.x-camera.x,this.y-camera.y,this.r,0,Math.PI*2); ctx.fill(); }
}

class Player extends Entity{
  constructor(){
    super(world.w/2, world.h/2, 10, '#9afff0');
    this.speed=200; this.maxHp=6; this.hp=this.maxHp; this.damage=2;
    this.fireDelay=.35; this.fireTimer=0;
    this.projSpeed=500; this.projSize=5; this.projPierce=0; this.projCount=1; this.projSpread=.15;
    this.magnet=100; this.level=1; this.xp=0; this.xpTo=5; this.invuln=0;
    this.element='fire';
    this.abilityCd=0; this.abilityCdMax=12; this.buffSpeedT=0;
    // crítico
    this.critChance = 0.10;   // 10%
    this.critMult   = 1.6;    // 60% a mais
    // skill atual
    this.currentSkillId = DEFAULT_SKILL_ID;
  }
  hurt(d){ if(this.invuln>0) return; this.hp-=d; this.invuln=.6; audio.beep(200,.08,'square',.03); if(this.hp<=0){ gameOver(); } }
  heal(v){ this.hp=clamp(this.hp+v,0,this.maxHp); addDamageText(this.x,this.y, v, true, '#4ade80'); }
  addXp(v){ this.xp+=v; while(this.xp>=this.xpTo){ this.xp-=this.xpTo; this.level++; this.xpTo=Math.floor(this.xpTo*1.4+3); levelUp(); } updateBars(); }
  update(dt,input){
    const s=(this.speed*(this.buffSpeedT>0?1.35:1))*dt;
    let vx=(input.right?1:0)-(input.left?1:0), vy=(input.down?1:0)-(input.up?1:0);
    const len=Math.hypot(vx,vy)||1; vx/=len; vy/=len;
    this.x=clamp(this.x+vx*s,0,world.w); this.y=clamp(this.y+vy*s,0,world.h);
    if(this.invuln>0) this.invuln-=dt; if(this.buffSpeedT>0) this.buffSpeedT-=dt;
    this.fireTimer-=dt; if(this.abilityCd>0) this.abilityCd-=dt;
    if(this.fireTimer<=0){ this.autoFire(); this.fireTimer=this.fireDelay; }
  }
  autoFire(){
    if(enemies.length===0) return;
    let target = nearestEnemy(this, enemies, 99999);
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
  }
}

class Enemy extends Entity{
  constructor(x,y,tier=1){
    const r=10+tier*2; const color=tier===1?'#ffd166':tier===2?'#f97316':'#ef4444';
    super(x,y,r,color);
    this.speed=60+tier*20; this.maxHp=4+tier*5; this.hp=this.maxHp; this.touch=1+(tier-1); this.tier=tier;
    this.slowT=0; this.burnT=0; this._burnTick=0;
  }
  update(dt){
    const sp=this.speed*(this.slowT>0?0.5:1);
    const dx=player.x-this.x, dy=player.y-this.y; const len=Math.hypot(dx,dy)||1;
    this.x+=dx/len*sp*dt; this.y+=dy/len*sp*dt;
    if(this.slowT>0) this.slowT-=dt;
    if(this.burnT>0){ this.burnT-=dt; this._burnTick+=dt; if(this._burnTick>=0.5){ this._burnTick=0; this.hit(1); } }
  }
  hit(d){
    this.hp-=d;
    if(this.hp<=0){ this.dead=true; onEnemyKilled(this); }
  }
}

class Projectile extends Entity{
  constructor(x,y,vx,vy,r,damage,pierce,element,color){
    super(x,y,r,color||'#a9f7ff');
    this.vx=vx; this.vy=vy; this.damage=damage; this.pierce=pierce; this.life=1.6; this.element=element;
  }
  update(dt){ this.x+=this.vx*dt; this.y+=this.vy*dt; this.life-=dt; if(this.life<=0) this.dead=true; }
}

class Gem extends Entity{
  constructor(x,y,value=1){ super(x,y,4,'#6ee7ff'); this.value=value; }
}

class DamageText{
  constructor(x,y,text,isHeal,color,isCrit=false){
    this.x=x; this.y=y; this.text=text; this.life=0.7; this.isHeal=!!isHeal; this.color=color||'#ffffff'; this.isCrit=isCrit;
  }
  update(dt){ this.y-=40*dt; this.life-=dt; }
  draw(){
    const alpha = Math.max(0, this.life/0.7);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.font = (this.isCrit?'bold 22px ':'bold 16px ') + 'system-ui, sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(this.text, this.x - camera.x, this.y - camera.y);
    ctx.restore();
  }
}

/* ===========================================================
   ESTADO DE JOGO
   =========================================================== */
let state='menu';
const player=new Player();
let enemies=[], projectiles=[], gems=[], damageTexts=[];
let kills=0, timeSurvived=0, defaultProjColor='#a9f7ff';

/* ===========================================================
   INPUT
   =========================================================== */
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
addEventListener('keyup',function(e){ const m=keyMap[e.code]; if(m) input[m]=false; });

/* ===========================================================
   UI REFS
   =========================================================== */
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
const skillText=document.getElementById('skillText');

const mainMenu=document.getElementById('mainMenu');
const btnPlay=document.getElementById('btnPlay');
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

startBtn.addEventListener('click',function(){ if(state==='menu') startGame(); else togglePause(); });
pauseBtn.addEventListener('click',function(){ if(state==='playing') togglePause(); });
muteBtn.addEventListener('click', toggleMute);

btnPlay.onclick=function(){ startGame(); };
btnOpenClasses.onclick=function(){ openClassMenu(); };
btnOpenSkins.onclick=function(){ openSkinMenu(); };
btnCloseMenu.onclick=function(){ mainMenu.style.display='none'; };

btnClassBack.onclick=function(){ classMenu.style.display='none'; mainMenu.style.display='grid'; };
btnSkinBack.onclick=function(){ skinMenu.style.display='none'; mainMenu.style.display='grid'; };

btnContinue.onclick=function(){ showEsc(false); pause(false); };
btnMainMenu.onclick=function(){ showEsc(false); gotoMenu(); };

/* ===========================================================
   MENUS
   =========================================================== */
let selectedClass='hunter', selectedSkin='classic';

function renderClassCards(container){
  container.innerHTML='';
  CLASSES.forEach(function(c){
    const el=document.createElement('div');
    el.className='itemCard'+(selectedClass===c.id?' active':'');
    el.innerHTML='<div class="itemRow"><div class="swatch" style="background:#0ea5b7"></div><div><b>'+c.name+
      '</b><br><small>'+c.desc+'</small></div></div>';
    el.onclick=function(){ selectedClass=c.id; renderClassCards(container); updateMetaHUD(); };
    container.appendChild(el);
  });
}
function renderSkinCards(container){
  container.innerHTML='';
  SKINS.forEach(function(s){
    const el=document.createElement('div');
    el.className='itemCard'+(selectedSkin===s.id?' active':'');
    el.innerHTML='<div class="itemRow"><div class="swatch" style="background:'+s.player+'"></div><div><b>'+s.name+
      '</b><br><small>'+s.player+'</small></div></div>';
    el.onclick=function(){ selectedSkin=s.id; renderSkinCards(container); updateMetaHUD(); };
    container.appendChild(el);
  });
}
function openClassMenu(){ mainMenu.style.display='none'; classMenu.style.display='grid'; renderClassCards(classGrid); }
function openSkinMenu(){ mainMenu.style.display='none'; skinMenu.style.display='grid'; renderSkinCards(skinGrid); }
function renderQuick(){
  quickClasses.innerHTML='';
  CLASSES.slice(0,3).forEach(function(c){
    const el=document.createElement('div');
    el.className='itemCard'+(selectedClass===c.id?' active':'');
    el.innerHTML='<b>'+c.name+'</b><p style="margin:6px 0 0;color:var(--muted)">'+c.desc+'</p>';
    el.onclick=function(){ selectedClass=c.id; renderQuick(); updateMetaHUD(); };
    quickClasses.appendChild(el);
  });
}

/* ===========================================================
   SPAWN
   =========================================================== */
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

/* ===========================================================
   UPGRADES (inclui lendárias + crítico)
   =========================================================== */
const upgrades = [
  { id:'rate', name:'Mira Rápida', desc:'-15% no tempo entre disparos', apply:function(){ player.fireDelay=Math.max(.08, player.fireDelay*0.85); } },
  { id:'dmg', name:'Projéteis Mais Fortes', desc:'+1 de dano', apply:function(){ player.damage+=1; } },
  { id:'speed', name:'Tênis Velozes', desc:'+10% velocidade', apply:function(){ player.speed*=1.10; } },
  { id:'count', name:'Tiro Duplo', desc:'+1 projétil', apply:function(){ player.projCount=Math.min(6,player.projCount+1); } },
  { id:'spread', name:'Leque', desc:'Aumenta a abertura', apply:function(){ player.projSpread=Math.min(0.6, player.projSpread+0.08); } },
  { id:'bulletSpd', name:'Pólvora Premium', desc:'+25% vel. projétil', apply:function(){ player.projSpeed*=1.25; } },
  { id:'pierce', name:'Perfuração', desc:'+1 furo', apply:function(){ player.projPierce=Math.min(4,player.projPierce+1); } },
  { id:'hp', name:'Vida Máxima', desc:'+2 de vida e cura +2', apply:function(){ player.maxHp+=2; player.heal(2); } },
  { id:'magnet', name:'Ímã', desc:'+40% alcance de coleta', apply:function(){ player.magnet*=1.4; } },
  { id:'size', name:'Projétil Maior', desc:'+30% tamanho', apply:function(){ player.projSize=Math.min(14, player.projSize*1.3); } },

  // crítico
  { id:'crit1', name:'Lâmina Afiada', desc:'+8% chance de crítico', apply:function(){ player.critChance = Math.min(0.6, player.critChance+0.08); } },
  { id:'crit2', name:'Golpe Preciso', desc:'+0.4x no multiplicador crítico', apply:function(){ player.critMult = Math.min(3.5, player.critMult+0.4); } },

  // MAIS upgrades (alguns do seu set)
  { id:'rate2', name:'Gatilho Afiado', desc:'-10% tempo entre disparos', apply:function(){ player.fireDelay=Math.max(.06, player.fireDelay*0.90); } },
  { id:'dmg2', name:'Núcleo Explosivo', desc:'+2 de dano', apply:function(){ player.damage+=2; } },
  { id:'bulletSpd2', name:'Aerodinâmica', desc:'+60% vel. projétil', apply:function(){ player.projSpeed*=1.60; } },
  { id:'count2', name:'Rajada Tripla', desc:'+2 projéteis', apply:function(){ player.projCount=Math.min(10, player.projCount+2); } },
  { id:'tank', name:'Blindado', desc:'+6 vida e cura total, -10% velocidade', apply:function(){ player.maxHp+=6; player.heal(999); player.speed*=0.90; } },
  { id:'steadyAim', name:'Mão Firme', desc:'-25% de abertura', apply:function(){ player.projSpread=Math.max(0.02, player.projSpread*0.75); } },
  { id:'overclock', name:'Overclock', desc:'-40% tempo entre disparos, +15% vel. projétil', apply:function(){ player.fireDelay=Math.max(.06, player.fireDelay*0.60); player.projSpeed*=1.15; } },
  { id:'ammoPouch', name:'Bolsa de Munição', desc:'+1 projétil e -5% cadência', apply:function(){ player.projCount=Math.min(10, player.projCount+1); player.fireDelay=Math.max(.06, player.fireDelay*0.95); } },

  // ======== LENDÁRIAS ========
  { id:'legend_vamp', legend:true, name:'Sede de Sangue', desc:'Lendária: roubo de vida 8% do dano', apply:function(){ player.lifeSteal = (player.lifeSteal||0) + 0.08; } },
  { id:'legend_phoenix', legend:true, name:'Coração da Fênix', desc:'Lendária: ao morrer, renasce com 50% (1x por run)', apply:function(){ player.reviveOnce = true; } },
  { id:'legend_split', legend:true, name:'Projétil Fragmentado', desc:'Lendária: ao atingir, divide em +2 fragmentos (dano 40%)', apply:function(){ player.splitShots = true; } },
  { id:'legend_arc', legend:true, name:'Arco Tempestuoso', desc:'Lendária: projéteis dão 10% chance de arco elétrico', apply:function(){ player.arcChance = (player.arcChance||0)+0.10; } },
  { id:'legend_midas', legend:true, name:'Toque de Midas', desc:'Lendária: +50% XP de gemas', apply:function(){ player.gemXpBoost = (player.gemXpBoost||0)+0.5; } }
];

const LEGEND_LEVEL_STEP = 5;     // garante 1 lendária a cada 5 níveis
const LEGEND_BASE_CHANCE = 0.15; // chance extra fora do step

// === Enemy HP bar config ===
const ENEMY_HP_BAR_HEIGHT = 12;   // aumente aqui se quiser ainda maior (ex.: 14/16)
const ENEMY_HP_BAR_GAP    = 6;    // distância entre o inimigo e a barra

function formatHPText(cur, max){
  // formata como: [  10/40 ] com padding baseado no número de dígitos do MAX
  const width = String(max).length;
  const curStr = String(cur).padStart(width, ' ');
  return '[  ' + curStr + '/' + max + ' ]';
}

function drawEnemyHPBar(e){
  const w = e.r * 2 + 8;                    // um pouco mais larga
  const h = ENEMY_HP_BAR_HEIGHT;
  const x = e.x - (w/2) - camera.x;
  const y = e.y - e.r - ENEMY_HP_BAR_GAP - h - camera.y;

  // fundo
  ctx.fillStyle = '#111827';
  ctx.fillRect(x, y, w, h);

  // preenchimento (vida)
  const pct = clamp(e.hp / e.maxHp, 0, 1);
  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(x, y, w * pct, h);

  // texto "[  10/40 ]" centrado dentro da barra
  const cur = Math.max(0, Math.ceil(e.hp));
  const txt = formatHPText(cur, e.maxHp);

  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // leve contorno pra legibilidade
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeText(txt, x + w/2, y + h/2);

  ctx.fillStyle = '#e5e7eb';
  ctx.fillText(txt, x + w/2, y + h/2);
}


function levelUp(){
  const choicesToShow = 3;
  const pool = upgrades.slice(); // cópia

  // decide se deve forçar 1 lendária
  let mustLegend = (player.level%LEGEND_LEVEL_STEP===0);
  let rollLegend = Math.random() < LEGEND_BASE_CHANCE;

  let picked = [];
  if (mustLegend || rollLegend){
    // puxa 1 lendária
    const legends = pool.filter(u=>u.legend);
    if (legends.length){
      const L = legends[rint(0,legends.length-1)];
      picked.push(L);
      // remove do pool para não repetir
      const i = pool.indexOf(L); if(i>=0) pool.splice(i,1);
    }
  }
  // completa demais escolhas com não-lendárias
  while(picked.length<choicesToShow && pool.length){
    const idx = rint(0, pool.length-1);
    picked.push(pool.splice(idx,1)[0]);
  }

  pendingUpgrades = picked;
  renderUpgradeCards(pendingUpgrades);
  if(running) pause(true);
  choices.style.display='flex';
}

let pendingUpgrades=[];
function renderUpgradeCards(list){
  choiceWrap.innerHTML='';
  list.forEach(function(u,i){
    const el=document.createElement('button');
    el.className='card'+(u.legend?' legend':'');
    el.innerHTML='<h3>'+u.name+'</h3><p>'+u.desc+'</p>';
    el.addEventListener('click',function(){ pickUpgrade(i); });
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

/* ===========================================================
   ELEMENTOS & SKILL CAST
   =========================================================== */
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

/* ===========================================================
   GAME CONTROL
   =========================================================== */
let running=false, paused=false, last=performance.now();

function startGame(){
  running=true; paused=false; state='playing';
  timeSurvived=0; kills=0;
  enemies.length=0; projectiles.length=0; gems.length=0; damageTexts.length=0;
  Object.assign(player, new Player());

  // classe e skin
  const cls = CLASSES.find(c=>c.id===selectedClass);
  if (cls) cls.mods(player);
  const skin = SKINS.find(s=>s.id===selectedSkin) || SKINS[0];
  player.color=skin.player; defaultProjColor=skin.proj;

  // padrão
  setElement(ELEMENTS.indexOf('fire'));
  player.currentSkillId = DEFAULT_SKILL_ID;

  updateBars(); updateMetaHUD();
  mainMenu.style.display='none'; classMenu.style.display='none'; skinMenu.style.display='none'; showEsc(false);
  setMsg('Fique vivo! Magia: F • Trocar elemento: Q/E ou 1–4', 3000);
  audio.beep(660,.12,'sine',.03);
  last=performance.now();
  requestAnimationFrame(loop);
}

function gotoMenu(){
  running=false; state='menu';
  mainMenu.style.display='grid'; classMenu.style.display='none'; skinMenu.style.display='none';
  msgEl.textContent='';
  renderQuick(); updateMetaHUD();
}

function togglePause(){ if(!running) return; pause(!paused); }
function pause(p){ paused=p; state=p?'paused':'playing'; togglePauseUIState(); }
function showEsc(v){ escMenu.style.display = v? 'grid':'none'; }
function gameOver(){
  // Revive lendário?
  if (player.reviveOnce){
    player.reviveOnce=false;
    player.hp = Math.ceil(player.maxHp*0.5);
    player.invuln = 1.2;
    addDamageText(player.x, player.y, 'RENASCER', true, '#f59e0b');
    audio.beep(520,.15,'sine',.05);
    return; // continua
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

/* ===========================================================
   UPDATE
   =========================================================== */
function update(dt){
  player.update(dt,input); centerCamera(); updateSpawns(dt);

  for(let e of enemies){ if(!e.dead) e.update(dt); }
  for(let p of projectiles){ if(!p.dead) p.update(dt); }
  for(let g of gems){
    const d2=dist2(player,g);
    if(d2<player.magnet*player.magnet){
      const a=angleTo(g,player); g.x+=Math.cos(a)*180*dt; g.y+=Math.sin(a)*180*dt;
    }
  }

  // colisões projéteis x inimigos
  for(let p of projectiles){
    if(p.dead) continue;
    for(let e of enemies){
      if(e.dead) continue;
      const r=p.r+e.r;
      if (dist2(p,e)<=r*r){
        // calcula dano com crítico
        let base = p.damage;
        let isCrit = Math.random() < player.critChance;
        let dealt = Math.max(1, Math.round(base * (isCrit?player.critMult:1)));

        // efeitos elementais
        if(p.element==='ice'){ e.slowT=Math.max(e.slowT,1.5); }
        if(p.element==='fire'){ e.burnT+=2; }
        if(p.element==='water'){ const rad=42; for(const o of enemies){ if(o===e||o.dead) continue; if(dist2(e,o)<=rad*rad) o.hit(1); } }
        if(p.element==='air'){ const a=Math.atan2(p.vy,p.vx); e.x+=Math.cos(a)*-60; e.y+=Math.sin(a)*-60; }

        // aplica dano
        e.hit(dealt);
        addDamageText(e.x, e.y - e.r - 6, dealt, false, isCrit ? '#fde047' : '#ffffff', isCrit);

        // life steal
        if (player.lifeSteal){ const heal = Math.max(1, Math.floor(dealt*player.lifeSteal)); player.heal(heal); }

        // split shots
        if (player.splitShots){
          for(let k=0;k<2;k++){
            const ang = Math.atan2(p.vy,p.vx) + (k===0?-0.5:0.5);
            const vx=Math.cos(ang)*player.projSpeed*0.7, vy=Math.sin(ang)*player.projSpeed*0.7;
            projectiles.push(new Projectile(p.x,p.y,vx,vy,Math.max(3,p.r*0.8), Math.max(1,Math.floor(p.damage*0.4)), 0, p.element, p.color));
          }
        }

        // arco elétrico
        if (player.arcChance && Math.random()<player.arcChance){
          const next = nearestEnemy(e, enemies, 180, function(o){return o!==e;});
          if(next){ next.hit(2); addDamageText(next.x,next.y,2,false,'#60a5fa'); }
        }

        if(p.pierce>0){ p.pierce--; } else { p.dead=true; }
      }
    }
  }

  // player vs inimigos
  for(let e of enemies){
    if(e.dead) continue;
    const r=e.r+player.r;
    if(dist2(e,player)<=r*r){
      player.hurt(e.touch);
      const a=angleTo(e,player); e.x+=Math.cos(a)*-30; e.y+=Math.sin(a)*-30;
    }
  }

  // coleta gemas
  for(let g of gems){
    if(g.dead) continue;
    const r=g.r+player.r+6;
    if(dist2(g,player)<=r*r){
      g.dead=true;
      let gain = g.value;
      if (player.gemXpBoost) gain += Math.ceil(g.value*player.gemXpBoost);
      player.addXp(gain);
    }
  }

  // lixo
  enemies=enemies.filter(e=>!e.dead); projectiles=projectiles.filter(p=>!p.dead); gems=gems.filter(g=>!g.dead);

  // damage texts
  for (let dtxt of damageTexts) dtxt.update(dt);
  damageTexts = damageTexts.filter(d=>d.life>0);

  if(enemies.length>450) enemies.splice(0,enemies.length-450);
  if(projectiles.length>600) projectiles.splice(0,projectiles.length-600);
  if(gems.length>320) gems.splice(0,gems.length-320);

  updateBars();
}

/* ===========================================================
   DRAW
   =========================================================== */
function draw(){
  ctx.clearRect(0,0,W,H); drawGrid();

  // gems
  for (let g of gems){ ctx.fillStyle='#37b6ff'; ctx.beginPath(); ctx.arc(g.x-camera.x,g.y-camera.y,g.r,0,Math.PI*2); ctx.fill(); }
  // projectiles
  for (let p of projectiles){ ctx.fillStyle=p.color||defaultProjColor; ctx.beginPath(); ctx.arc(p.x-camera.x,p.y-camera.y,p.r,0,Math.PI*2); ctx.fill(); }
  // enemies + hp bar + números de HP
    for (const e of enemies){
    e.draw();
    if (e.hp < e.maxHp){
        drawEnemyHPBar(e); // agora desenha a barra maior com o texto "[  10/40 ]" dentro
    }
    }
  // player (blink invuln)
  ctx.save(); ctx.globalAlpha = (player.invuln>0 && ((performance.now()/100)%2<1))? .4:1; player.draw(); ctx.restore();

  // damage texts
  for (let dtxt of damageTexts) dtxt.draw();

  // vignette
  const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)/3, W/2,H/2,Math.max(W,H)/1.2);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.45)');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
}

function drawGrid(){
  const size=64, offX=-(camera.x%size), offY=-(camera.y%size);
  ctx.lineWidth=1; ctx.strokeStyle='rgba(255,255,255,0.04)';
  for(let x=offX;x<W;x+=size){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for(let y=offY;y<H;y+=size){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.fillStyle='rgba(73,217,145,0.08)'; ctx.beginPath(); ctx.arc(W/2,H/2,60,0,Math.PI*2); ctx.fill();
}

/* ===========================================================
   HUD / UTILS
   =========================================================== */
function updateBars(){
  hpEl.style.width=(player.hp/player.maxHp*100)+'%';
  xpEl.style.width=(player.xp/player.xpTo*100)+'%';
  abEl.style.width=(100-Math.max(0,player.abilityCd)/(SKILLS[player.currentSkillId]?.cooldown||player.abilityCdMax)*100)+'%';
  levelEl.textContent=player.level; killsEl.textContent=kills;
}
function updateMetaHUD(){
  classText.textContent=(CLASSES.find(c=>c.id===selectedClass)||{}).name||'—';
  elementText.textContent=ELEMENT_INFO[player.element]?.name||'—';
  elementText.style.color=ELEMENT_INFO[player.element]?.color||'';
  skinText.textContent=(SKINS.find(s=>s.id===selectedSkin)||{}).name||'—';
  skillText.textContent=(SKILLS[player.currentSkillId]||SKILLS[DEFAULT_SKILL_ID]).name;
}
function toggleMute(){ audio.muted=!audio.muted; muteBtn.textContent=audio.muted?'🔇 Sem som':'🔊 Som'; }
function togglePauseUIState(){ pauseBtn.textContent=paused?'▶ Retomar':'⏸ Pausa'; }
function setMsg(text, ms){
  msgEl.textContent=text;
  if(ms){ setTimeout(function(){ if(state==='playing') msgEl.textContent=''; }, ms); }
}
function msgFlash(t){ setMsg(t, 900); }

function addDamageText(x,y,amount,isHeal,color,isCrit){
  const text = (typeof amount==='number') ? (isHeal?('+'+amount):('-'+amount)) : amount;
  damageTexts.push(new DamageText(x,y,text,isHeal,color,isCrit));
}

/* ===========================================================
   JOYSTICK MOBILE (mesmo comportamento)
   =========================================================== */
const joy=document.getElementById('joy'); const joyKnob=joy.querySelector('i');
let joyActive=false,joyCx=0,joyCy=0;
function joySet(x,y){
  const dx=x-joyCx,dy=y-joyCy; const ang=Math.atan2(dy,dx); const mag=Math.min(1,Math.hypot(dx,dy)/50);
  input.left=(mag>0.3&&Math.cos(ang)<-0.3); input.right=(mag>0.3&&Math.cos(ang)>0.3);
  input.up=(mag>0.3&&Math.sin(ang)<-0.3); input.down=(mag>0.3&&Math.sin(ang)>0.3);
  joyKnob.style.transform='translate('+clamp(dx,-40,40)+'px,'+clamp(dy,-40,40)+'px)';
}
function joyReset(){ input.up=input.down=input.left=input.right=false; joyKnob.style.transform='translate(0,0)'; }
function pt(e){ if(e.touches&&e.touches[0]) return {x:e.touches[0].clientX,y:e.touches[0].clientY}; return {x:e.clientX,y:e.clientY}; }
joy.addEventListener('pointerdown',function(e){ joyActive=true; const r=joy.getBoundingClientRect(); joyCx=r.left+r.width/2; joyCy=r.top+r.height/2; joySet(pt(e).x,pt(e).y); joy.setPointerCapture(e.pointerId); });
joy.addEventListener('pointermove',function(e){ if(joyActive) joySet(pt(e).x,pt(e).y); });
joy.addEventListener('pointerup',function(){ joyActive=false; joyReset(); });

/* ===========================================================
   INIT
   =========================================================== */
renderQuick(); updateMetaHUD();

/* ===========================================================
   TESTES (opcional)
   =========================================================== */
window.runGameTests = function(){
  console.group('Mini Survivors – Testes');
  try{
    console.assert(typeof levelUp==='function', 'levelUp deve estar definido');
    const lvl=player.level; const prev=choices.style.display;
    player.addXp(player.xpTo);
    console.assert(player.level===lvl+1, 'Ao ganhar XP suficiente, o nível deve aumentar');
    console.assert(choices.style.display==='flex', 'O menu de upgrades deve aparecer');
  }catch(err){ console.error('Falha nos testes:', err); }
  console.groupEnd();
};

})();
