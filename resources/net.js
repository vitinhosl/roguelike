// net-manual.js — WebRTC com sinalização manual (100% GitHub Pages)
const Net = (function(){
  let pc = null, dc = null, onMessage = ()=>{}, connected = false;

  // STRICT GitHub-only: sem STUN/TURN => [].
  // Para melhorar conexão (ainda sem servidor próprio), ative STUN público:
  // const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  function init(){ /* nada a fazer */ }

  function encode(desc){ return btoa(unescape(encodeURIComponent(JSON.stringify(desc)))); }
  function decode(s){ return JSON.parse(decodeURIComponent(escape(atob(s)))); }

  function waitIceComplete(peer){
    return new Promise(res=>{
      if (peer.iceGatheringState === 'complete') return res();
      function on(){ if(peer.iceGatheringState==='complete'){ peer.removeEventListener('icegatheringstatechange', on); res(); } }
      peer.addEventListener('icegatheringstatechange', on);
    });
  }

  function wireChannel(channel){
    dc = channel;
    dc.onopen = ()=>{ connected = true; };
    dc.onclose = ()=>{ connected = false; };
    dc.onmessage = (ev)=>{
      let data = null; try{ data = JSON.parse(ev.data); }catch{ data = ev.data; }
      if (data && data.t) onMessage(data, 'peer');
    };
  }

  async function createRoom(){
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    // host cria o canal
    wireChannel(pc.createDataChannel('game', { ordered: true }));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceComplete(pc);
    const offerStr = encode(pc.localDescription);

    const answerStr = await promptLarge(
      '1) Copie e envie o CÓDIGO DE OFERTA abaixo para seu amigo.\n' +
      '2) Cole aqui o CÓDIGO DE RESPOSTA que ele devolver.',
      offerStr
    );
    if(!answerStr) throw new Error('Conexão cancelada.');
    const answerDesc = decode(answerStr);
    await pc.setRemoteDescription(answerDesc);
    return 'manual';
  }

  async function joinRoom(){
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.ondatachannel = (e)=> wireChannel(e.channel);

    const offerStr = await promptLarge('Cole aqui o CÓDIGO DE OFERTA do host:');
    if(!offerStr) throw new Error('Sem oferta.');
    const offerDesc = decode(offerStr);
    await pc.setRemoteDescription(offerDesc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIceComplete(pc);
    const answerStr = encode(pc.localDescription);
    await promptLarge('Envie este CÓDIGO DE RESPOSTA de volta ao host:', answerStr);
    return 'manual';
  }

  function send(type, payload){
    if (dc && dc.readyState==='open'){
      dc.send(JSON.stringify({ t:type, d:payload, ts:Date.now() }));
    }
  }

  function on(fn){ onMessage = fn || (()=>{}); }

  async function leave(){
    try{ dc?.close(); }catch{}
    try{ pc?.close(); }catch{}
    connected = false; dc = null; pc = null;
  }

  // UI simples (overlay) para copiar/colar blocos grandes
  function promptLarge(message, preset){
    return new Promise(resolve=>{
      const old = document.getElementById('netPrompt'); if(old) old.remove();
      const wrap = document.createElement('div');
      wrap.id = 'netPrompt';
      wrap.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.6);z-index:9999';
      wrap.innerHTML = `
        <div style="background:#0f172acc;color:#e6f1ff;border:1px solid #1f2937;padding:16px;border-radius:14px;max-width:800px;width:92vw;box-shadow:0 20px 80px rgba(0,0,0,.5)">
          <div style="margin-bottom:10px;white-space:pre-wrap;font-weight:700">${message}</div>
          <textarea style="width:100%;height:200px;background:#0e1622;color:#e6f1ff;border:1px solid #223047;border-radius:10px;padding:8px">${preset||''}</textarea>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
            <button id="netOk" class="btn">OK</button>
            <button id="netCancel" class="btn">Cancelar</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      wrap.querySelector('#netOk').onclick = ()=>{ const v = wrap.querySelector('textarea').value.trim(); wrap.remove(); resolve(v||null); };
      wrap.querySelector('#netCancel').onclick = ()=>{ wrap.remove(); resolve(null); };
    });
  }

  return {
    init, createRoom, joinRoom, send, on, leave,
    get id(){ return 'peer'; },
    get room(){ return 'manual'; },
    get connected(){ return connected; },
    get available(){ return true; } // sempre “disponível” no Pages
  };
})();
