/* Run Advent — accounts and Stage 8 friends.
 * Email/password accounts, private profile, revision-checked opt-in cloud backup.
 * Existing calendar and localStorage always work without this script or Supabase.
 * The board reads completed totals from synced challenges.
 */
(function(root){
 'use strict';
 const el = id => document.getElementById(id);
 const app = root.RunAdventApp;
 const cloud = root.RunAdventCloud;
 const year = app && app.year;
 const config = cloud && cloud.configStatus();
 let client = null, user = null, profile = null, remote = null;
 let revision = 0, authMode = 'signin', syncing = false, consent = false;
 let saveTimer = null, loadingSession = false, recovery = false, lastSessionId = null;
 let initComplete = false, lastSynced = '', pendingChanges = false;
 const ui = {
  status:el('accountStatus'),label:el('accountLabel'),guest:el('accountGuest'),signed:el('accountSignedIn'),
  cloudSummary:el('accountCloudSummary'),summary:el('accountProfileSummary'),
  hint:el('accountSyncExplanation'),upload:el('accountUpload'),download:el('accountDownload')
 };
 if(!app||!cloud||!ui.status)return;

 function msg(t,type){ui.status.textContent=t;ui.status.className='account-alert'+(type?' '+type:'');}
 function safeText(e,t){if(e)e.textContent=t == null?'':String(t);}
 // Stage 8 uses the signed-in account's existing Supabase client.
 const friendsPanel = el('dpSocial');
 const liveBoard = el('liveRows');
 let boardVersion = 0, sending = false, previousBoard = '', previousLinks = '';
 function resetFriends(){
   if(!liveBoard)return;
   boardVersion++;
   sending=false;
   previousBoard=previousLinks='';
   liveBoard.replaceChildren();
   el('liveConnections').replaceChildren();
   el('liveGuest').hidden=!!user;
   el('liveMembers').hidden=!user;
   el('liveScope').value='friends';
   el('liveStatus').textContent='';
   el('liveUsername').value='';
   el('liveAdd').querySelector('button').disabled=false;
   el('liveSummary').textContent=user?'Live rankings':'Friends & rankings';
   refreshFriends();
 }
 function line(tag,text,className){
   const node=document.createElement(tag);
   node.textContent=text;
   if(className)node.className=className;
   return node;
 }
 function renderConnections(links){
   const root=el('liveConnections');
   const signature=JSON.stringify(links);
   if(signature===previousLinks)return;
   previousLinks=signature;
   root.replaceChildren();
   const groups={received:['Incoming requests','accept','decline'],sent:['Sent requests','cancel'],friend:['Friends','remove']};
   for(const [state,[title,...actions]] of Object.entries(groups)){
     const rows=links.filter(link=>link.state===state);
     if(!rows.length)continue;
     root.append(line('h4',title));
     for(const link of rows){
       const name=link.username?link.display_name+' (@'+link.username+')':'Private runner';
       root.append(line('p',name));
       const buttons=line('div','','social-actionbar');
       for(const action of actions){
         if(action==='accept'&&!link.username)continue;
         const caption=action[0].toUpperCase()+action.slice(1);
         const button=line('button',caption,'btn');
         button.type='button';
         button.setAttribute('aria-label',caption+' · '+name);
         button.onclick=()=>{
           if(action==='remove'&&!window.confirm('Remove '+name+' from your friends?'))return;
           friendAction(action,null,link.request_id);
         };
         buttons.append(button);
       }
       root.append(buttons);
     }
   }
   if(!links.length)root.append(line('p','No requests or friends yet.','account-hint'));
   const count=links.filter(x=>x.state==='friend').length;
   el('liveSummary').textContent=count+' live friend'+(count===1?'':'s');
 }
 function renderBoard(rows){
   const scope=el('liveScope').value;
   const signature=scope+JSON.stringify(rows);
   if(signature===previousBoard)return;
   previousBoard=signature;
   liveBoard.replaceChildren();
   if(!rows.length){
     liveBoard.append(line('p',scope==='public'?'No runners have shared synced totals on the public board for '+year+'.':'No synced challenges to rank for '+year+' yet.','social-empty'));
   }
   rows.forEach((row,i)=>{
     const item=line('div','','social-row'), info=line('div','','social-runner');
     info.append(line('b',row.display_name+(row.is_me?' (you)':'')));
     if(row.username)info.append(line('small','@'+row.username));
     const percent=(100*row.completed_km/row.target_km).toFixed(1);
     info.append(line('small',row.difficulty+' · '+row.completed_km+'/'+row.target_km+' km · '+row.completed_runs+'/25 runs'));
     item.append(line('div',String(i+1),'social-rank'),info,line('b',percent+'%'));
     liveBoard.append(item);
   });
 }
 async function refreshFriends(successMessage){
   if(!liveBoard||!client||!user||sending||!friendsPanel.open||document.hidden)return;
   const version=++boardVersion;
   const status=el('liveStatus');
   try{
     const [links,board]=await Promise.all([client.rpc('run_advent_connections'),client.rpc('run_advent_board',{p_year:year,p_scope:el('liveScope').value})]);
     if(version!==boardVersion)return;
     if(links.error||board.error)throw links.error||board.error;
     renderConnections(links.data||[]);
     renderBoard(board.data||[]);
     status.textContent=successMessage||'Updated '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'.';
   }catch(error){
     if(version!==boardVersion)return;
     previousBoard=previousLinks='';
     liveBoard.replaceChildren();
     el('liveConnections').replaceChildren();
     el('liveSummary').textContent='Live rankings';
     status.textContent=error.code==='PGRST202'?'Live boards need the Stage 8 SQL migration.':'Could not update the board. '+error.message;
   }
 }
 async function friendAction(action,username,request){
   if(sending||!client||!user)return;
   const owner=user.id, version=++boardVersion;
   sending=true;
   el('liveAdd').querySelector('button').disabled=true;
   const messages={send:'Request sent.',accept:'Request accepted.',decline:'Request declined.',cancel:'Request cancelled.',remove:'Friend removed.'};
   let message;
   try{
     const {error}=await client.rpc('run_advent_friend_action',{p_action:action,p_username:username,p_request:request});
     if(error)throw error;
     if(version!==boardVersion)return;
     if(action==='send')el('liveUsername').value='';
     message=messages[action];
   }catch(error){message=error.code==='PGRST202'?'Live boards need the Stage 8 SQL migration.':error.message;}
   finally{
     if(user&&user.id===owner&&version===boardVersion){
       sending=false;
       el('liveAdd').querySelector('button').disabled=false;
       el('liveStatus').textContent=message;
       refreshFriends(message);
     }
   }
 }
 if(liveBoard){
   el('liveAdd').onsubmit=e=>{
     e.preventDefault();
     const name=el('liveUsername').value.trim().replace(/^@/,'').toLowerCase();
     if(!/^[a-z0-9_]{3,24}$/.test(name)){el('liveStatus').textContent='Enter a username with 3–24 letters, numbers or underscores.';return;}
     friendAction('send',name,null);
   };
   el('liveRefresh').onclick=()=>refreshFriends();
   el('liveScope').onchange=()=>{previousBoard='';liveBoard.replaceChildren();refreshFriends();};
   friendsPanel.addEventListener('toggle',()=>refreshFriends());
   document.addEventListener('visibilitychange',()=>refreshFriends());
   setInterval(()=>refreshFriends(),30000);
 }

 function setGuest(){
  ui.guest.hidden=false;ui.signed.hidden=true;ui.label.textContent='Guest · local';
  ui.status.className='account-alert';
 }
 function currentSnapshot(){
  if(app.isPreview())return null;
  const s=app.getRealSnapshot();
  const summary=cloud.localSummary(s,year,false);
  if(!summary.valid)throw new Error('Your device progress needs checking before syncing: '+summary.warnings.join(' '));
  return s;
 }
 function sortObject(x){
  if(Array.isArray(x))return x.map(sortObject);
  if(x && typeof x==='object'){
   let out={};Object.keys(x).sort().forEach(k=>{if(x[k]!==undefined)out[k]=sortObject(x[k])});return out;
  }
  return x;
 }
 const canonical = x=>JSON.stringify(sortObject(x||{}));
 function getRemoteSnapshot(){return remote && remote.snapshot && typeof remote.snapshot==='object'?remote.snapshot:null;}
 function describe(s){
  if(!s)return 'No cloud challenge stored yet.';
  const d=cloud.localSummary(s,year,false);
  if(!d.valid)return 'Cloud backup needs attention ('+d.warnings.join(', ')+').';
  return (d.difficulty.charAt(0).toUpperCase()+d.difficulty.slice(1))+' · '+d.completedKm+'/'+d.targetKm+' km · '+d.completedRuns+' runs · '+d.openedDays+' opened';
 }
 function showSync(){
  const logged=!!user;
  ui.upload.disabled=!logged||syncing||app.isPreview();
  ui.download.disabled=!logged||syncing||app.isPreview()||!getRemoteSnapshot();
  el('accountRefresh').disabled=!logged||syncing;
  el('accountSyncPause').disabled=!logged||syncing||!consent;
  if(!logged)return;
  let local='';try{local=describe(currentSnapshot())}catch(e){local=e.message}
  const r=getRemoteSnapshot();
  const eq=r&&!app.isPreview()&&canonical(r)===canonical(app.getRealSnapshot());
  const cloudText = r ? describe(r)+' · cloud revision '+revision : 'Nothing saved to this account yet.';
  ui.cloudSummary.textContent='This device: '+local+'\nCloud: '+cloudText;
  ui.cloudSummary.style.whiteSpace='pre-line';
  ui.hint.textContent=app.isPreview()?'Preview Mode: cloud uploads and downloads are disabled. Switch to your real calendar.':
   consent ? 'Automatic private backups are ON. Changes made here save to your account, with protection against edits made on another device.' :
   eq?'Device and cloud match. Select “Use this device → cloud” to enable automatic backups.':
   'Nothing has been replaced. Choose “Use this device → cloud” or “Use cloud → this device” after reviewing both versions. Local backup is kept before replacing either copy.';
  el('accountSyncPause').hidden=!consent;
  ui.label.textContent=consent?'Account · syncing':'Account · signed in';
 }
 function markPending(){if(consent&&user&&!app.isPreview()){
  pendingChanges=true;clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>syncLocal(false),1400);
 }}
 function stopAuto(){
  clearTimeout(saveTimer);saveTimer=null;consent=false;pendingChanges=false;
  if(user){try{localStorage.removeItem('runadv:auto:'+user.id+':'+year)}catch(e){}}
  showSync();
 }
 function allowAuto(){
  consent=true;lastSynced=canonical(app.getRealSnapshot());
  if(user){try{localStorage.setItem('runadv:auto:'+user.id+':'+year,'1')}catch(e){}}
  showSync();
 }
 function stampSafety(reason){
  try{return app.safetyBackup(reason)}catch(e){
   throw new Error('Cannot create a safety backup on this device. Export the calendar backup first: '+e.message);
  }
 }
 function downloadSafety(s,filename){
  // Keep the previous cloud state in a second local safety record before overwriting it.
  try{localStorage.setItem('runadv:preCloudReplace:'+user.id+':'+year,
      JSON.stringify({savedAt:new Date().toISOString(),year:year,snapshot:s}));}
  catch(e){throw new Error('Could not preserve the existing cloud copy on this device. Export a backup first.');}
 }
 function exportSafetyBackup(){
  if(!user)return;
  try{
   const keys=[];
   for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && k.startsWith('runadv:safety:'+year+':'))keys.push(k);
   }
   keys.sort().reverse();
   let state=null;
   const t=localStorage.getItem('runadv:preCloudReplace:'+user.id+':'+year);
   const useCloud=t&&(!keys.length||root.confirm('A previous cloud version and a local safety copy are available. Download the previous CLOUD version? Select Cancel for the local safety copy.'));
   if(useCloud){const record=JSON.parse(t);state=record.snapshot;}
   else if(keys.length){const record=JSON.parse(localStorage.getItem(keys[0]));state=record&&record.state;}
   if(!state||typeof state!=='object')throw Error('No safety backup exists for this year yet.');
   const backup={app:'run-advent',version:3,year:year,exportedAt:new Date().toISOString(),
     difficulty:state.difficulty,strict:!!state.strict,swapsUsed:state.swapsUsed||0,
     swapLog:state.swapLog||[],opened:state.opened||{},done:state.done||{},
     doneAt:state.doneAt||{},notes:state.notes||{},ach:state.ach||{},finishedAt:state.finishedAt};
   const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
   const a=document.createElement('a');a.href=url;a.download='run-advent-safety-'+year+'.json';
   document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
   msg('Safety backup download started. It can be restored using Import backup.','success');
  }catch(e){msg(e.message,'error');}
 }
 function cloudIssue(err){
  const s=String(err&&err.message||err||'Unexpected error');
  if(s.includes('CLOUD_REVISION_CONFLICT'))return 'Another device changed the cloud progress. Your local progress is safe. Select “Compare progress”, review the differences, and choose which copy to keep.';
  if(s.includes('Could not find the function')||s.includes('PGRST202')||s.includes('relation')||s.includes('runner_cloud_saves'))return 'Stage 7 SQL is not installed in Supabase yet. Run database/002_stage7_accounts.sql first.';
  return s;
 }
 async function reloadCloud(){
  if(!client||!user)return;
  const {data,error}=await client.from('runner_cloud_saves').select('revision,snapshot,updated_at')
   .eq('user_id',user.id).eq('challenge_year',year).maybeSingle();
  if(error)throw error;
  remote=data||null;revision=data?Number(data.revision):0;
  return remote;
 }
 async function syncLocal(manual){
  if(!client||!user||app.isPreview()||syncing||(!consent&&!manual))return;
  clearTimeout(saveTimer);saveTimer=null;
  let snap;
  try{snap=currentSnapshot();}catch(e){msg(e.message,'error');stopAuto();return;}
  syncing=true;showSync();if(manual)msg('Saving this device’s progress to your private account…');
  const expected=revision;
  const hash=canonical(snap);
  try{
   const {data,error}=await client.rpc('run_advent_stage7_save',{
    p_year:year,p_expected_revision:expected,p_snapshot:snap
   });
   if(error)throw error;
   revision=Number(data);remote={revision,snapshot:snap,updated_at:new Date().toISOString()};
   lastSynced=hash;pendingChanges=false;
   if(manual)allowAuto();
   msg('✓ Private account backup saved. Leaderboard totals follow your profile settings.','success');
  }catch(e){
   msg(cloudIssue(e),'error');
   stopAuto(); // especially on a revision conflict; never silently overwrite newer cloud data
  }finally{
   syncing=false;showSync();
   if(consent&&!app.isPreview()&&canonical(app.getRealSnapshot())!==lastSynced)markPending();
  }
 }
 async function uploadChoice(){
  if(!user)return;
  if(app.isPreview()){msg('Exit Preview Mode before syncing your account.','error');return;}
  try{
   const snapshot=currentSnapshot();
   await reloadCloud();
   const other=getRemoteSnapshot();
   if(other&&canonical(snapshot)!==canonical(other)){
    if(!root.confirm('Your account already has different saved progress. This will REPLACE the cloud copy with this device’s challenge. The existing cloud copy will be saved locally for recovery. Continue?')){showSync();return;}
    downloadSafety(other);
   }
   if(other&&canonical(snapshot)===canonical(other)){
    allowAuto();msg('✓ Your device and cloud match. Automatic private backups are enabled.','success');return;
   }
   stampSafety('Before uploading to cloud');
   await syncLocal(true);
  }catch(e){msg(cloudIssue(e),'error');showSync();}
 }
 async function downloadChoice(){
  if(!user||app.isPreview()){
   msg('Sign in and exit Preview Mode to restore cloud progress.','error');return;
  }
  try{
   await reloadCloud();
   const s=getRemoteSnapshot();
   if(!s){msg('No cloud copy exists for this year. Save your local challenge first.');return;}
   const report=cloud.localSummary(s,year,false);
   if(!report.valid)throw Error('Cloud progress is invalid: '+report.warnings.join(' '));
   const loc=currentSnapshot();
   if(canonical(s)!==canonical(loc)){
    if(!root.confirm('Use the cloud challenge on this device? This will REPLACE the current local calendar, difficulty, notes and completed runs. A local safety copy will be created. Continue?')){showSync();return;}
    stampSafety('Before restoring cloud progress');
    app.applyRealSnapshot(s);
   }
   allowAuto();msg('✓ Cloud challenge restored to this device. Automatic private backups are enabled.','success');
  }catch(e){msg(cloudIssue(e),'error');}finally{showSync();}
 }
 function updateProfileUi(){
  if(!profile)return;
  el('accountUsername').value=profile.username||'';
  el('accountDisplayName').value=profile.display_name||'Runner';
  el('accountAvatar').value=profile.avatar_url||'';
  const pic=el('accountAvatarPreview');pic.style.display=profile.avatar_url?'block':'none';
  if(profile.avatar_url)pic.src=profile.avatar_url;else pic.removeAttribute('src');
  el('accountPrivacy').value=profile.privacy||'private';
  el('accountLeaderboardOpt').checked=!!profile.leaderboard_opt_in;
  safeText(el('accountGreeting'),profile.display_name||'Runner');
  const privacyLabel={private:'Private profile',friends:'Friends only',public:'Public profile'}[profile.privacy];
  safeText(el('accountProfileSummary'),profile.username?'@'+profile.username+' · '+privacyLabel:privacyLabel+' · Choose a username below so friends can recognise you.');
  safeText(el('accountPrivateEmail'),user?user.email:'');
 }
 async function fetchProfile(){
  const {data,error}=await client.from('runner_profiles').select('id,username,display_name,avatar_url,privacy,leaderboard_opt_in,created_at').eq('id',user.id).single();
  if(error)throw error;
  profile=data;updateProfileUi();
 }
 async function signOut(){
  clearTimeout(saveTimer);
  if(consent && pendingChanges) {
   if(!root.confirm('Some changes have not finished backing up. Sign out anyway? Your current device progress will remain saved locally.'))return;
  }
  try{
   if(client){const {error}=await client.auth.signOut();if(error)throw error;}
   await sessionChange(null);
   msg('Signed out. This device still has its saved calendar; you can continue as a guest.');
  }catch(e){msg(cloudIssue(e),'error');}
 }
 async function sessionChange(next){
  const id=next&&next.user&&next.user.id||null;
  if(id===lastSessionId&&initComplete)return;
  lastSessionId=id;
  clearTimeout(saveTimer);consent=false;pendingChanges=false;
  user=next&&next.user||null;profile=null;remote=null;revision=0;
  clearProfileFeedback();
  resetFriends();
  if(!user){setGuest();showAuth('signin');return;}
  ui.guest.hidden=true;ui.signed.hidden=false;ui.label.textContent='Account · signed in';
  msg('Signed in. Checking your private account progress…');
  loadingSession=true;
  try{
   await fetchProfile();
   await reloadCloud();
   // Never enable syncing before reviewing cloud and device copies, even if
   // this browser previously synced to the same account.
   consent=false;
   msg('✓ Signed in. Choose your cloud backup or device progress to start syncing.','success');
  }catch(e){msg(cloudIssue(e),'error');}
  finally{loadingSession=false;showSync();}
 }
 function showAuth(mode){
  authMode=mode;
  const up=mode==='signup';
  el('accountTabSignIn').classList.toggle('on',!up);
  el('accountTabSignUp').classList.toggle('on',up);
  el('accountAuthSubmit').textContent=up?'Create account':'Sign in';
  el('accountPassword').autocomplete=up?'new-password':'current-password';
  el('accountForgot').hidden=up;
  el('accountAuthForm').hidden=false;el('accountResetPane').hidden=true;
 }
 async function authSubmit(e){
  e.preventDefault();if(!client){msg('Configure Supabase before creating an account.','error');return;}
  const email=el('accountEmail').value.trim(), password=el('accountPassword').value;
  if(password.length<8){msg('Please enter a password of at least 8 characters.','error');return;}
  const btn=el('accountAuthSubmit');btn.disabled=true;msg('Contacting Supabase…');
  try{
   let r;
   if(authMode==='signup'){
    r=await client.auth.signUp({email,password,options:{emailRedirectTo:root.location.origin+root.location.pathname}});
    if(r.error)throw r.error;
    if(!r.data.session)msg('Account request received. Check your email to confirm your address, then sign in.','success');
    else msg('✓ Account created and signed in. Your calendar is still local until you choose to sync.','success');
   }else{
    r=await client.auth.signInWithPassword({email,password});if(r.error)throw r.error;
    msg('✓ Signed in. Your local calendar has not been changed.','success');
   }
   el('accountPassword').value='';
   if(r.data&&r.data.session)await sessionChange(r.data.session);
  }catch(err){msg(cloudIssue(err),'error');}finally{btn.disabled=false;}
 }
 function profileFeedback(text,type,field){
  const feedback=el('accountProfileFeedback');
  if(!feedback){if(text)msg(text,type);return;}
  feedback.textContent=text;
  feedback.className=text?'account-alert '+(type||''):'';
  if(field){
   field.setAttribute('aria-invalid','true');
   field.setAttribute('aria-errormessage','accountProfileFeedback');
   field.focus();
  }
 }
 function clearProfileFeedback(){
  for(const field of el('accountProfileForm').querySelectorAll('[aria-invalid]')){
   field.removeAttribute('aria-invalid');
   field.removeAttribute('aria-errormessage');
  }
  profileFeedback('');
 }
 async function saveProfile(e){
  e.preventDefault();
  clearProfileFeedback();
  if(!client||!user){profileFeedback('Sign in again to save your profile.','error');return;}
  const usernameField=el('accountUsername'), nameField=el('accountDisplayName'), avatarField=el('accountAvatar');
  const typed=usernameField.value.trim();
  const username=typed.replace(/^@/,'').toLowerCase();
  const name=nameField.value.replace(/\s+/g,' ').trim();
  const avatar=avatarField.value.trim();
  if(typed&&!/^[a-z0-9_]{3,24}$/.test(username)){
   profileFeedback('Use 3–24 letters (a–z), digits (0–9) or underscores. For example: christmas_runner. Spaces and hyphens are not allowed.','error',usernameField);return;
  }
  if(name.length<1||name.length>48){
   profileFeedback('Enter a display name of 1–48 characters. Spaces are allowed here.','error',nameField);return;
  }
  if(avatar){
   try{if(new URL(avatar).protocol!=='https:')throw Error();}catch{
    profileFeedback('Enter a photo link starting with https:// or leave the photo field empty.','error',avatarField);return;
   }
  }
  const button=e.currentTarget.querySelector('button[type="submit"]');
  if(button.disabled)return;
  const owner=user.id;
  button.disabled=true;
  profileFeedback('Saving your profile…');
  const row={username:username||null,display_name:name,avatar_url:avatar||null,
    privacy:el('accountPrivacy').value,leaderboard_opt_in:el('accountLeaderboardOpt').checked};
  try{
   const {data,error}=await client.from('runner_profiles').update(row).eq('id',owner)
    .select('id,username,display_name,avatar_url,privacy,leaderboard_opt_in,created_at').single();
   if(error)throw error;
   if(user?.id!==owner)return;
   profile=data;updateProfileUi();refreshFriends();
   profileFeedback(data.username?'Profile saved. Your username is @'+data.username+'.':'Profile saved without a username.','success');
  }catch(error){
   if(user?.id!==owner)return;
   if(error.code==='23505')profileFeedback('@'+username+' is already taken. Try adding a number or choosing another name.','error',usernameField);
   else profileFeedback('Could not save your profile. '+cloudIssue(error),'error');
  }finally{button.disabled=false;}
 }
 async function forgot(e){
  e.preventDefault();if(!client)return;
  const email=el('accountResetEmail').value.trim();
  try{
   const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:root.location.origin+root.location.pathname});
   if(error)throw error;
   msg('If that email has an account, you will receive a password reset link.','success');
   el('accountResetPane').hidden=true;el('accountAuthForm').hidden=false;
  }catch(e){msg(cloudIssue(e),'error');}
 }
 async function recoverPassword(e){
  e.preventDefault();if(!client)return;
  const password=el('accountNewPassword').value;
  if(password.length<8)return;
  try{
   const {error}=await client.auth.updateUser({password});if(error)throw error;
   recovery=false;el('accountRecoveryPane').hidden=true;el('accountNewPassword').value='';
   msg('✓ Password updated. You can now continue to your calendar.','success');
  }catch(e){msg(cloudIssue(e),'error');}
 }
 function routeRecovery(){
  // A Supabase recovery event is more reliable than URL guessing.
  if(user){el('accountRecoveryPane').hidden=false;el('dpAccount').open=true;el('dpAccount').scrollIntoView({block:'start'});}
 }
 async function init(){
  setGuest();
  showAuth('signin');
  if(!config||config.status!=='configured'){
   el('accountAuthForm').querySelectorAll('input,button').forEach(x=>x.disabled=true);
   el('accountForgot').disabled=true;el('accountTabSignUp').disabled=true;
   msg(config&&config.status==='invalid'?config.message:'Guest mode is active. Configure your Supabase project to enable optional accounts. Your calendar remains fully usable.');
   initComplete=true;return;
  }
  msg('Connecting to the account service. Your calendar is still available without signing in.');
  try{
   if(!root.supabase || typeof root.supabase.createClient!=='function'){
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async=true;
    await new Promise((ok,fail)=>{script.onload=ok;script.onerror=()=>fail(Error('Could not load the account library. Try again online.'));document.head.appendChild(script)});
   }
   if(!root.supabase||typeof root.supabase.createClient!=='function')throw Error('Account library is unavailable.');
   client=root.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
   client.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'){recovery=true;setTimeout(()=>routeRecovery(),0);}
    if(['SIGNED_IN','SIGNED_OUT','INITIAL_SESSION','USER_UPDATED'].includes(event)){
     // Supabase warns against awaiting client queries from inside this callback.
     setTimeout(()=>sessionChange(session),0);
    }
   });
   const {data,error}=await client.auth.getSession();if(error)throw error;
   await sessionChange(data.session||null);
   if(recovery)routeRecovery();
  }catch(e){msg(cloudIssue(e)+' Guest calendar works normally.','error');}
  finally{initComplete=true;}
 }

 el('accountTabSignIn').onclick=()=>showAuth('signin');
 el('accountTabSignUp').onclick=()=>showAuth('signup');
 el('accountAuthForm').addEventListener('submit',authSubmit);
 el('accountForgot').onclick=()=>{el('accountAuthForm').hidden=true;el('accountResetPane').hidden=false;el('accountForgot').hidden=true;el('accountResetEmail').value=el('accountEmail').value};
 el('accountResetCancel').onclick=()=>showAuth('signin');
 el('accountResetForm').addEventListener('submit',forgot);
 el('accountNewPasswordForm').addEventListener('submit',recoverPassword);
 el('accountProfileForm').noValidate=true;
 el('accountProfileForm').addEventListener('input',clearProfileFeedback);
 el('accountProfileForm').addEventListener('submit',saveProfile);
 el('accountSignOut').onclick=signOut;
 el('accountRefresh').onclick=async()=>{
  try{await reloadCloud();showSync();msg('Progress compared. Your existing local runs have not changed.','success');}
  catch(e){msg(cloudIssue(e),'error');}
 };
 ui.upload.onclick=uploadChoice;
 ui.download.onclick=downloadChoice;
 el('accountSyncPause').onclick=()=>{stopAuto();msg('Automatic backup paused. Your local and cloud progress are unchanged.');};
 el('accountSafetyDownload').onclick=exportSafetyBackup;
 root.RunAdventAccounts=Object.freeze({onLocalSave:markPending,onModeChange:showSync,pauseForExternalChange:stopAuto,stage:8});
 // Show a private-account status only after the existing welcome flow is initialized.
 init();
})(window);
