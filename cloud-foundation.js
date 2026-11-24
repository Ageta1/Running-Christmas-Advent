/* Run Advent Stage 6 cloud foundation.
 * No logins, background upload or cloud data mutations in this stage.
 * Safe RPC readiness check: public.run_advent_stage6_ready() returns 6 only.
 */
(function(root){
  'use strict';
  var POOLS={
    beginner:[1,2,3,4,5,1,2,3,4,5,1,2,3,4,5,1,2,3,4,5,1,2,3,4,5],
    intermediate:[1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10,1,2,3,4,5],
    advanced:Array.from({length:25},function(_,i){return i+1})
  };
  var TOTALS={beginner:75, intermediate:125, advanced:325};
  function config(){
    var c=root.RUN_ADVENT_BACKEND_CONFIG||{};
    var url=typeof c.url==='string'?c.url.trim().replace(/\/+$/,''):'';
    var key=typeof c.publishableKey==='string'?c.publishableKey.trim():'';
    if(!url&&!key)return {status:'local',message:'Local-only mode. No account or cloud upload is enabled.'};
    if(!url||!key)return {status:'invalid',message:'Enter both the Supabase project URL and a publishable key in backend-config.js.'};
    var u;
    try{u=new URL(url);}catch(e){return {status:'invalid',message:'The Supabase project URL is invalid.'};}
    if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||u.pathname!=='/'){
      return {status:'invalid',message:'Use only the HTTPS Supabase project origin (no path, query or login).'};
    }
    if(key.indexOf('sb_secret_')===0)return {status:'invalid',message:'STOP: a secret key must never be published. Rotate it and use a publishable key.'};
    if(key.indexOf('sb_publishable_')!==0){
      if(key.split('.').length!==3)return {status:'invalid',message:'Use a Supabase publishable key (sb_publishable_...) or the legacy anon key.'};
      try{
        var token=key.split('.')[1],raw=atob(token.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-token.length%4)%4));
        var claims=JSON.parse(raw);
        if(claims.role!=='anon')return {status:'invalid',message:'STOP: this is not an anon/publishable key. Never publish service_role credentials.'};
      }catch(e){return {status:'invalid',message:'Could not verify this legacy API key. Use the publishable key instead.'};}
    }
    return {status:'configured',url:url,key:key,message:'Configuration found. Open Runner account to sign in and enable optional private backups.'};
  }
  function localSummary(state,year,isPreview){
    var st=state&&typeof state==='object'?state:{};
    var difficulty=Object.prototype.hasOwnProperty.call(TOTALS,st.difficulty)?st.difficulty:'advanced';
    var op=st.opened&&typeof st.opened==='object'?st.opened:{};
    var done=st.done&&typeof st.done==='object'?st.done:{};
    var problems=[],seen={},allowed={},opened=0,completed=0,km=0;
    POOLS[difficulty].forEach(function(k){allowed[k]=(allowed[k]||0)+1;});
    Object.keys(op).forEach(function(d){
      var number=Number(d),distance=op[d];
      if(!Number.isInteger(number)||number<1||number>25||!Number.isInteger(distance)||!allowed[distance]){
        problems.push('Invalid day or distance in existing local data.');return;
      }
      seen[distance]=(seen[distance]||0)+1;
      if(seen[distance]>allowed[distance])problems.push('Distance pool contains duplicates beyond the challenge rules.');
      opened++;
      if(done[d]){completed++;km+=distance;}
    });
    Object.keys(done).forEach(function(d){if(done[d]&&!Object.prototype.hasOwnProperty.call(op,d))problems.push('Completed day has no opened distance.');});
    if(opened>25||completed>25||km>TOTALS[difficulty])problems.push('Local progress totals are outside the challenge rules.');
    return {
      stage:6,year:year,mode:isPreview?'preview':'real',difficulty:difficulty,targetKm:TOTALS[difficulty],
      openedDays:opened,completedRuns:completed,completedKm:km,valid:problems.length===0,
      warnings:Array.from(new Set(problems)),
      note:'Local summary only. This Stage 6 helper does not upload any data.'
    };
  }
  async function preflight(){
    var c=config();
    if(c.status!=='configured')return {ok:false,message:c.message};
    if(typeof fetch!=='function')return {ok:false,message:'This browser cannot perform the connectivity check.'};
    var ctrl=typeof AbortController==='function'?new AbortController():null;
    var timer=ctrl?setTimeout(function(){ctrl.abort()},10000):null;
    try{
      var r=await fetch(c.url+'/rest/v1/rpc/run_advent_stage6_ready',{
        method:'POST',mode:'cors',cache:'no-store',
        headers:{'apikey':c.key,'Content-Type':'application/json'},
        body:'{}',signal:ctrl?ctrl.signal:undefined
      });
      if(!r.ok){
        return {ok:false,message:r.status===404?'Supabase reached, but Stage 6 SQL/RPC is missing. Run database/001_stage6_foundation.sql first.':'Supabase responded with HTTP '+r.status+'. Check the URL, publishable key and SQL installation.'};
      }
      var version=await r.json();
      if(version===6)return {ok:true,message:'Supabase Stage 6 database is reachable. All runner data remains private; Stage 7 account functionality requires its own SQL migration.'};
      return {ok:false,message:'Supabase responded, but the Stage 6 database version could not be confirmed.'};
    }catch(e){return {ok:false,message:'Could not connect to Supabase. Check your internet, project URL and browser network settings.'};}
    finally{if(timer)clearTimeout(timer);}
  }
  root.RunAdventCloud=Object.freeze({stage:6,configStatus:config,localSummary:localSummary,preflight:preflight});
})(window);
