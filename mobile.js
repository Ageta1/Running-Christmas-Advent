(() => {
  'use strict';
  const id = name => document.getElementById(name);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = id('reduceMotion');
  let preferred = false;
  try { preferred = localStorage.getItem('runadv:reduce-motion') === '1'; } catch {}
  function applyMotion() {
    motion.checked = preferred || media.matches;
    motion.disabled = media.matches;
    document.documentElement.classList.toggle('low-motion', motion.checked);
  }
  applyMotion();
  media.addEventListener('change', applyMotion);
  motion.onchange = () => {
    preferred = motion.checked;
    try { localStorage.setItem('runadv:reduce-motion', preferred ? '1' : '0'); } catch {}
    applyMotion();
  };

  const nav = id('appNav');
  nav.onclick = event => {
    const link = event.target.closest('a');
    if (!link) return;
    event.preventDefault();
    const section = link.hash.slice(1);
    let target = id(section);
    if (section === 'ranking') {
      id('dpSocial').open = true;
      if (id('liveMembers').hidden) {
        id('manualBoard').open = true;
        target = id('manualBoard').querySelector('summary');
      }
    } else if (target.tagName === 'DETAILS') {
      target.open = true;
      target = target.querySelector('summary');
    }
    nav.querySelectorAll('a').forEach(a => a.removeAttribute('aria-current'));
    link.setAttribute('aria-current','location');
    target.focus({preventScroll:true});
    (section === 'ranking' ? target : id(section)).scrollIntoView({block:'start',behavior:motion.checked?'instant':'smooth'});
  };
  // Keep the dashboard out of the accessibility tree while a sheet is open.
  const dashboard=document.querySelector('.wrap');
  const overlays=Array.from(document.querySelectorAll('.ov'));
  let activeSheet=null, returnFocus=null;
  function syncDialogs(){
    const open=overlays.filter(node=>node.classList.contains('show'));
    const top=open.at(-1);
    dashboard.inert=!!top;
    open.forEach(node=>{node.inert=node!==top;});
    if(top===activeSheet)return;
    if(top){
      if(!activeSheet&&dashboard.contains(document.activeElement))returnFocus=document.activeElement;
      if(!top.contains(document.activeElement)){
        const first=Array.from(top.querySelectorAll('button:not(:disabled),input,textarea,select')).find(node=>node.getClientRects().length);
        first?.focus({preventScroll:true});
      }
    }else if(returnFocus?.isConnected){
      returnFocus.focus({preventScroll:true});returnFocus=null;
    }
    activeSheet=top;
  }
  const observer=new MutationObserver(syncDialogs);
  overlays.forEach(node=>observer.observe(node,{attributes:true,attributeFilter:['class']}));
  // Keep keyboards inside an open sheet, including its last action on small screens.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const sheets = Array.from(document.querySelectorAll('.ov.show'));
    const sheet = sheets.at(-1);
    if (!sheet) return;
    const controls = Array.from(sheet.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select, textarea, summary')).filter(x => x.getClientRects().length);
    if (!controls.length) return;
    const first=controls[0], last=controls.at(-1), active=document.activeElement;
    if (!sheet.contains(active) || (event.shiftKey ? active===first : active===last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  });
  function connection() {
    id('connection').hidden = navigator.onLine;
    id('connection').textContent = navigator.onLine ? '' : 'Offline · Your calendar saves on this device. Friends and account changes need internet.';
  }
  connection();
  window.addEventListener('online',connection);
  window.addEventListener('offline',connection);

  let prompt = null;
  const install=id('installApp'), help=id('installHelp');
  const standalone=matchMedia('(display-mode: standalone)');
  function installed(){ install.hidden=standalone.matches || navigator.standalone===true; }
  installed();standalone.addEventListener('change',installed);
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;});
  window.addEventListener('appinstalled',()=>{prompt=null;install.hidden=true;help.textContent='Run Advent installed.';});
  install.onclick=async()=>{
    if(prompt){
      const request=prompt;prompt=null;
      try { await request.prompt();await request.userChoice;return; } catch {}
    }
    help.textContent='iPhone: in Safari tap Share, then Add to Home Screen and Add. Android: open the browser menu and choose Install app or Add to Home screen.';
  };

  if(!('serviceWorker' in navigator)) {
    id('offlineReady').textContent='This browser can save progress locally. Offline launch needs service worker support.';
    return;
  }
  let requested=false;
  const button=id('applyUpdate');
  let controlled=!!navigator.serviceWorker.controller, needsReload=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(requested){location.reload();return;}
    if(controlled){needsReload=true;button.hidden=false;}
    controlled=true;
  });
  async function register(){
    try{
      const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      function waiting(){button.hidden=!needsReload&&!(reg.waiting && navigator.serviceWorker.controller);}
      function watch(worker){
        if(!worker)return;
        worker.addEventListener('statechange',()=>{
          waiting();
          if(worker.state==='redundant'&&!reg.active)id('offlineReady').textContent='Offline setup was interrupted. Reopen online to retry.';
        });
      }
      reg.addEventListener('updatefound',()=>watch(reg.installing));watch(reg.installing);waiting();
      button.onclick=()=>{
        if(!reg.waiting){location.reload();return;}
        requested=true;reg.waiting.postMessage('activate');
      };
      const update=()=>{if(navigator.onLine&&!document.hidden)reg.update().catch(()=>{});};
      document.addEventListener('visibilitychange',update);
      window.addEventListener('online',update);setInterval(update,3600000);
      await navigator.serviceWorker.ready;
      id('offlineReady').textContent='Calendar ready for offline use on this device.';
    }catch{ id('offlineReady').textContent='Offline setup is unavailable. Reopen the calendar online to try again.'; }
  }
  register();
})();
