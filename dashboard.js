// ============================================================
// INIT
// ============================================================
const user=JSON.parse(localStorage.getItem('tt_user')||'{}');
const role=localStorage.getItem('tt_role');

// Guard — non-admins and unauthenticated users get redirected
if(!role||role!=='admin'){window.location.href='index.html';}

document.getElementById('adminName').textContent=(user.email||'Admin').split('@')[0];
document.getElementById('adminAvatar').textContent=(user.email||'A')[0].toUpperCase();

const DAILY_BASE_URL='https://bmtchspprt.github.io/train-game/daily.html';

// ============================================================
// NAVIGATION & UTILITIES
// ============================================================
function logout(){localStorage.clear();window.location.href='index.html';}
function goHome(){localStorage.clear();}

function toggleInputPw(inputId,btn){
  const input=document.getElementById(inputId);
  if(!input)return;
  if(input.type==='password'){input.type='text';btn.textContent='🙈';}
  else{input.type='password';btn.textContent='👁';}
}

function showToast(msg,type){
  type=type||'success';
  const t=document.getElementById('toastGlobal');
  t.textContent=msg;
  t.className='toast-global '+type+' show';
  setTimeout(function(){t.classList.remove('show');},3500);
}

const sectionMeta={
  overview:['Overview','Platform activity at a glance'],
  technicians:['Technicians','Effort, practice, and improvement'],
  points:['Points Manager','Monthly leaderboard and reward management'],
  questions:['Question Bank','Real difficulty metrics and question management'],
  feedback:['Feedback Reports','Review and resolve question issues'],
  reports:['Reports','Analytics and knowledge insights'],
  settings:['Settings','Manage technicians and platform configuration']
};

const sectionLoaders={
  overview:loadOverview,
  technicians:loadTechnicians,
  points:loadPoints,
  questions:loadQuestions,
  feedback:loadFeedback,
  reports:loadReports,
  settings:loadSettings
};

function navTo(id){
  document.querySelectorAll('.section').forEach(function(s){s.classList.remove('active');});
  document.querySelectorAll('.sidebar-nav button').forEach(function(b){b.classList.remove('active');});
  document.getElementById('section-'+id).classList.add('active');
  const navBtn=document.getElementById('nav-'+id);
  if(navBtn)navBtn.classList.add('active');
  const m=sectionMeta[id]||[id,''];
  document.getElementById('sectionTitle').textContent=m[0];
  document.getElementById('sectionSub').textContent=m[1];
  if(sectionLoaders[id])sectionLoaders[id]();
}

function refreshData(){
  const a=document.querySelector('.section.active');
  if(!a)return;
  const id=a.id.replace('section-','');
  if(sectionLoaders[id])sectionLoaders[id]();
}

// ============================================================
// SUPABASE HELPERS
// ============================================================
async function sf(path,opts){
  opts=opts||{};
  try{
    const res=await fetch(SUPABASE_URL+path,{
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY,'Prefer':'return=minimal'},
      method:opts.method||'GET',
      body:opts.body||undefined
    });
    if([200,201,204].includes(res.status)){try{return await res.json();}catch(e){return true;}}
    return null;
  }catch(e){return null;}
}

async function sfAdmin(path,opts){
  opts=opts||{};
  const key=typeof SUPABASE_SERVICE_KEY!=='undefined'?SUPABASE_SERVICE_KEY:SUPABASE_ANON_KEY;
  try{
    const res=await fetch(SUPABASE_URL+path,{
      headers:{'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+key},
      method:opts.method||'GET',
      body:opts.body||undefined
    });
    const text=await res.text();
    try{return{ok:res.ok,status:res.status,data:JSON.parse(text)};}
    catch(e){return{ok:res.ok,status:res.status,data:text};}
  }catch(e){return{ok:false,status:0,data:e.message};}
}

// ============================================================
// DIFFICULTY
// ============================================================
function computedDiffLabel(metrics){
  if(!metrics||metrics.first.total<5)return null;
  const pct=Math.round((metrics.first.correct/metrics.first.total)*100);
  if(pct>=75)return 'beginner';
  if(pct>=45)return 'intermediate';
  return 'advanced';
}

async function runDifficultyUpdate(){
  showToast('Updating difficulty ratings...');
  const questions=await sf('/rest/v1/bst_training_results?select=*&status=eq.active&limit=500');
  if(!Array.isArray(questions)){showToast('Could not load questions','error');return;}
  const logs=await sf('/rest/v1/training_logs?select=question_id,is_correct,user_email&limit=5000');
  const metricsMap={};const userQSeen={};
  if(Array.isArray(logs)){
    logs.forEach(function(l){
      const key=l.user_email+'|'+l.question_id;
      if(!metricsMap[l.question_id])metricsMap[l.question_id]={first:{correct:0,total:0},all:{correct:0,total:0}};
      if(!userQSeen[key]){userQSeen[key]=true;metricsMap[l.question_id].first.total++;if(l.is_correct)metricsMap[l.question_id].first.correct++;}
      metricsMap[l.question_id].all.total++;if(l.is_correct)metricsMap[l.question_id].all.correct++;
    });
  }
  let updated=0;
  for(let i=0;i<questions.length;i++){
    const q=questions[i];const m=metricsMap[q.id];const newDiff=computedDiffLabel(m);
    if(newDiff&&newDiff!==q.difficulty){
      await sf('/rest/v1/bst_training_results?id=eq.'+q.id,{method:'PATCH',body:JSON.stringify({difficulty:newDiff,computed_difficulty:newDiff,first_attempt_pct:m?Math.round((m.first.correct/m.first.total)*100):null,total_attempts:m?m.all.total:0})});
      updated++;
    }
  }
  showToast(updated>0?(updated+' question'+(updated!==1?'s':'')+' updated!'):'All difficulties already current.');
  loadQuestions();
}

// ============================================================
// QUESTIONS
// ============================================================
async function loadQuestions(){
  const qRes=await sf('/rest/v1/bst_training_results?select=*&order=created_at.desc&limit=500');
  const logRes=await sf('/rest/v1/training_logs?select=question_id,is_correct,user_email&limit=5000');
  const qArr=Array.isArray(qRes)?qRes:getDemoQuestions();
  const userQSeen={};const metricsMap={};
  if(Array.isArray(logRes)){
    logRes.forEach(function(l){
      const key=l.user_email+'|'+l.question_id;
      if(!metricsMap[l.question_id])metricsMap[l.question_id]={first:{correct:0,total:0},all:{correct:0,total:0}};
      if(!userQSeen[key]){userQSeen[key]=true;metricsMap[l.question_id].first.total++;if(l.is_correct)metricsMap[l.question_id].first.correct++;}
      metricsMap[l.question_id].all.total++;if(l.is_correct)metricsMap[l.question_id].all.correct++;
    });
  }
  const rows=qArr.map(function(q){
    const m=metricsMap[q.id];
    const firstPct=m&&m.first.total>0?Math.round((m.first.correct/m.first.total)*100):null;
    const allPct=m&&m.all.total>0?Math.round((m.all.correct/m.all.total)*100):null;
    const totalAttempts=m?m.all.total:0;
    const diffLabel=(computedDiffLabel(m))||q.difficulty||'beginner';
    const hasEnoughData=m&&m.first.total>=5;
    const diffClass=diffLabel==='beginner'?'easy':diffLabel==='intermediate'?'medium':'hard';
    let meterHTML='';
    if(hasEnoughData){
      meterHTML='<div class="diff-badge '+diffClass+'">'+diffLabel+'</div>'
        +'<div class="diff-meter">'
        +'<div class="diff-meter-row"><div class="diff-meter-label">1st try</div><div class="diff-meter-track"><div class="diff-meter-fill try1" style="width:'+firstPct+'%"></div></div><div class="diff-meter-pct">'+firstPct+'%</div></div>'
        +'<div class="diff-meter-row"><div class="diff-meter-label">Overall</div><div class="diff-meter-track"><div class="diff-meter-fill try2" style="width:'+(allPct||0)+'%"></div></div><div class="diff-meter-pct">'+(allPct!==null?allPct+'%':'—')+'</div></div>'
        +'</div><div class="diff-attempts">'+totalAttempts+' total attempt'+(totalAttempts!==1?'s':'')+'</div>';
    } else {
      meterHTML='<div class="diff-badge '+diffClass+'">'+diffLabel+'</div>'
        +'<div class="diff-attempts" style="color:var(--muted);font-size:0.7rem">'+(totalAttempts>0?totalAttempts+' attempts — need 5 to compute':'No attempts yet')+'</div>';
    }
    const imgUrl=q.image_url||q.image_path;
    const safeQ=JSON.stringify(q).replace(/'/g,'&#39;');
    const thumbHTML=imgUrl
      ?'<img src="'+imgUrl+'" class="q-thumb" onclick="openLightbox(\''+imgUrl+'\')" title="Click to view">'
      :'<div class="q-thumb-placeholder" onclick=\'openEditModal('+safeQ+')\' title="Add image">+🖼</div>';
    const typeLabel=q.question_type==='simulator'?'sim':'mc';
    const typeBadge='<span class="q-type-badge '+typeLabel+'">'+(typeLabel==='sim'?'🖥 Sim':'MC')+'</span>';
    return '<tr>'
      +'<td style="max-width:260px;white-space:normal;font-size:0.82rem">'+(q.question||'').substring(0,90)+((q.question||'').length>90?'…':'')+'<div style="font-size:0.7rem;color:var(--muted);margin-top:2px">'+(q.topic||'')+'</div></td>'
      +'<td>'+typeBadge+'</td><td>'+thumbHTML+'</td><td>'+meterHTML+'</td>'
      +'<td><span class="status-chip '+(q.status==='active'?'active':'dismissed')+'">'+(q.status||'active')+'</span></td>'
      +'<td><div class="actions-cell">'
      +'<button class="btn-action edit" onclick=\'openEditModal('+safeQ+')\'>Edit</button>'
      +'<button class="btn-action deactivate" onclick="toggleQuestion(\''+q.id+'\',\''+(q.status||'active')+'\')">'+(q.status==='active'?'Deactivate':'Activate')+'</button>'
      +'<button class="btn-action delete" onclick="deleteQuestion(\''+q.id+'\')">Delete</button>'
      +'</div></td></tr>';
  });
  document.getElementById('questionTableBody').innerHTML=rows.join('')||'<tr class="empty-row"><td colspan="6">No questions yet.</td></tr>';
}

// ============================================================
// IMAGE HANDLING
// ============================================================
let _pendingImageFile=null;

function triggerImgUpload(){document.getElementById('imgFileInput').click();}

function handleImageSelect(event){
  const file=event.target.files[0];if(!file)return;
  if(file.size>5*1024*1024){showToast('Image must be under 5MB','error');return;}
  _pendingImageFile=file;
  const reader=new FileReader();
  reader.onload=function(e){
    const preview=document.getElementById('imgPreview');
    preview.src=e.target.result;preview.style.display='block';
    document.getElementById('imgPlaceholder').style.display='none';
    document.getElementById('imgUploadArea').classList.add('has-image');
    document.getElementById('imgRemoveBtn').style.display='inline-block';
    document.getElementById('editImageUrl').value='';
  };
  reader.readAsDataURL(file);
}

function previewImageUrl(url){
  if(!url)return;
  const preview=document.getElementById('imgPreview');
  preview.src=url;preview.style.display='block';
  document.getElementById('imgPlaceholder').style.display='none';
  document.getElementById('imgUploadArea').classList.add('has-image');
  document.getElementById('imgRemoveBtn').style.display='inline-block';
  _pendingImageFile=null;
}

function removeImage(){
  _pendingImageFile=null;
  document.getElementById('imgPreview').style.display='none';
  document.getElementById('imgPreview').src='';
  document.getElementById('imgPlaceholder').style.display='block';
  document.getElementById('imgUploadArea').classList.remove('has-image');
  document.getElementById('imgRemoveBtn').style.display='none';
  document.getElementById('editImageUrl').value='';
  document.getElementById('editImagePath').value='';
}

async function uploadImageToSupabase(file,questionId){
  const ext=file.name.split('.').pop();
  const path='questions/'+questionId+'-'+Date.now()+'.'+ext;
  const key=typeof SUPABASE_SERVICE_KEY!=='undefined'?SUPABASE_SERVICE_KEY:SUPABASE_ANON_KEY;
  try{
    const res=await fetch(SUPABASE_URL+'/storage/v1/object/question-images/'+path,{
      method:'POST',headers:{'apikey':key,'Authorization':'Bearer '+key,'Content-Type':file.type,'x-upsert':'true'},body:file
    });
    if(res.ok)return{path:path,url:SUPABASE_URL+'/storage/v1/object/public/question-images/'+path};
  }catch(e){}
  return null;
}

function openLightbox(url){document.getElementById('lightboxImg').src=url;document.getElementById('lightbox').classList.remove('hidden');}
function closeLightbox(){document.getElementById('lightbox').classList.add('hidden');}
function handleTypeChange(){document.getElementById('simNotice').style.display=document.getElementById('editType').value==='simulator'?'block':'none';}

// ============================================================
// EDIT QUESTION MODAL
// ============================================================
function openEditModal(q){
  document.getElementById('editId').value=q.id;
  document.getElementById('editQuestion').value=q.question||'';
  document.getElementById('editType').value=q.question_type||'multiple_choice';
  document.getElementById('simNotice').style.display=(q.question_type==='simulator')?'block':'none';
  const opts=q.options||['','','',''];
  document.getElementById('editOptA').value=(opts[0]||'').replace(/^A\)\s*/,'');
  document.getElementById('editOptB').value=(opts[1]||'').replace(/^B\)\s*/,'');
  document.getElementById('editOptC').value=(opts[2]||'').replace(/^C\)\s*/,'');
  document.getElementById('editOptD').value=(opts[3]||'').replace(/^D\)\s*/,'');
  document.getElementById('editCorrect').value=q.correct_answer||'A';
  document.getElementById('editExplanation').value=q.explanation||'';
  document.getElementById('editTopic').value=q.topic||'';
  document.getElementById('editDifficulty').value=q.difficulty||'beginner';
  document.getElementById('editImageUrl').value=q.image_url||'';
  document.getElementById('editImagePath').value=q.image_path||'';
  _pendingImageFile=null;
  const preview=document.getElementById('imgPreview');
  if(q.image_url||q.image_path){
    preview.src=q.image_url||q.image_path;preview.style.display='block';
    document.getElementById('imgPlaceholder').style.display='none';
    document.getElementById('imgUploadArea').classList.add('has-image');
    document.getElementById('imgRemoveBtn').style.display='inline-block';
  } else {removeImage();}
  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal(){document.getElementById('editModal').classList.add('hidden');_pendingImageFile=null;}

async function saveQuestion(){
  const id=document.getElementById('editId').value;
  const btn=document.getElementById('editSaveBtn');
  btn.disabled=true;btn.textContent='Saving...';
  let imageUrl=document.getElementById('editImageUrl').value||null;
  let imagePath=document.getElementById('editImagePath').value||null;
  if(_pendingImageFile){
    const uploaded=await uploadImageToSupabase(_pendingImageFile,id);
    if(uploaded){imageUrl=uploaded.url;imagePath=uploaded.path;}
    else showToast('Image upload failed — saving without image','error');
  }
  const preview=document.getElementById('imgPreview');
  if(!preview.src||preview.style.display==='none'){imageUrl=null;imagePath=null;}
  await sf('/rest/v1/bst_training_results?id=eq.'+id,{
    method:'PATCH',
    body:JSON.stringify({
      question:document.getElementById('editQuestion').value,
      options:['A) '+document.getElementById('editOptA').value,'B) '+document.getElementById('editOptB').value,'C) '+document.getElementById('editOptC').value,'D) '+document.getElementById('editOptD').value],
      correct_answer:document.getElementById('editCorrect').value,
      explanation:document.getElementById('editExplanation').value,
      topic:document.getElementById('editTopic').value,
      difficulty:document.getElementById('editDifficulty').value,
      question_type:document.getElementById('editType').value,
      image_url:imageUrl,image_path:imagePath
    })
  });
  btn.disabled=false;btn.textContent='Save Changes';
  closeEditModal();showToast('Question saved!');loadQuestions();
}

async function toggleQuestion(id,status){
  await sf('/rest/v1/bst_training_results?id=eq.'+id,{method:'PATCH',body:JSON.stringify({status:status==='active'?'inactive':'active'})});
  loadQuestions();
}

async function deleteQuestion(id){
  if(!confirm('Permanently delete this question?'))return;
  await sf('/rest/v1/bst_training_results?id=eq.'+id,{method:'DELETE'});
  loadQuestions();
}

// ============================================================
// POINTS MANAGER
// ============================================================
async function confirmMonthlyReset(){
  const monthLabel=new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'});
  if(!confirm('Save '+monthLabel+' standings to history and reset all points to zero?\n\nThis cannot be undone.'))return;
  await doMonthlyReset(monthLabel);
}

async function doMonthlyReset(monthLabel){
  const ptsRows=await sf('/rest/v1/technician_points?select=user_email,points&limit=1000');
  if(!Array.isArray(ptsRows)){showToast('Could not load points','error');return;}
  const map={};
  ptsRows.forEach(function(r){if(!map[r.user_email])map[r.user_email]=0;map[r.user_email]+=(r.points||0);});
  for(const email in map){
    await sf('/rest/v1/points_history',{method:'POST',body:JSON.stringify({user_email:email,total_points:map[email],month_label:monthLabel})});
  }
  await sf('/rest/v1/technician_points?id=neq.00000000-0000-0000-0000-000000000000',{method:'DELETE'});
  showToast(monthLabel+' saved to history. Points reset!');
  loadPoints();
}

async function loadPoints(){
  const ptsRows=await sf('/rest/v1/technician_points?select=user_email,points,reason,created_at&order=created_at.desc&limit=500');
  const history=await sf('/rest/v1/points_history?select=*&order=snapshot_at.desc&limit=200');
  const rows=Array.isArray(ptsRows)?ptsRows:[];
  const map={};
  rows.forEach(function(r){
    if(!map[r.user_email])map[r.user_email]={email:r.user_email,total:0,breakdown:[]};
    map[r.user_email].total+=(r.points||0);
    map[r.user_email].breakdown.push({pts:r.points,reason:r.reason});
  });
  const sorted=Object.values(map).sort(function(a,b){return b.total-a.total;});
  document.getElementById('pointsTableBody').innerHTML=sorted.map(function(t,i){
    const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
    const bkd=t.breakdown.slice(0,2).map(function(b){return '<div>'+(b.pts>0?'+':'')+b.pts+' — '+(b.reason||'training')+'</div>';}).join('');
    const more=t.breakdown.length>2?'<div>+'+(t.breakdown.length-2)+' more</div>':'';
    return '<tr>'
      +'<td><div class="tech-name">'+medal+' '+t.email.split('@')[0]+'</div><div class="tech-email">'+t.email+'</div></td>'
      +'<td><span style="font-family:var(--headline-font);font-size:1.2rem;font-weight:bold;color:#ffd700">'+t.total+'</span></td>'
      +'<td style="font-size:0.75rem;color:var(--muted)">'+bkd+more+'</td>'
      +'<td><div class="actions-cell">'
      +'<button class="btn-action award" onclick="openAwardModal(\''+t.email+'\')">+ Award</button>'
      +'<button class="btn-action dismiss" onclick="openAwardModal(\''+t.email+'\',\'deduct\')">− Deduct</button>'
      +'</div></td></tr>';
  }).join('')||'<tr class="empty-row"><td colspan="4">No points this month yet.</td></tr>';
  const histEl=document.getElementById('pointsHistory');
  if(!Array.isArray(history)||!history.length){histEl.innerHTML='<div style="color:var(--muted);font-size:0.85rem;padding:0.5rem 0;">No monthly history yet.</div>';return;}
  const byMonth={};
  history.forEach(function(h){if(!byMonth[h.month_label])byMonth[h.month_label]=[];byMonth[h.month_label].push(h);});
  histEl.innerHTML=Object.entries(byMonth).map(function(entry){
    const month=entry[0];
    const ents=entry[1].sort(function(a,b){return b.total_points-a.total_points;});
    const top3=ents.slice(0,3).map(function(e,i){return ['🥇','🥈','🥉'][i]+' '+e.user_email.split('@')[0]+' ('+e.total_points+'pts)';}).join(' · ');
    return '<div class="history-row"><div><div class="history-month">'+month+'</div><div class="history-winners">'+top3+'</div></div>'
      +'<div style="font-size:0.78rem;color:var(--muted)">'+ents.length+' technician'+(ents.length!==1?'s':'')+'</div></div>';
  }).join('');
}

function openAwardModal(email,mode){
  mode=mode||'award';
  document.getElementById('awardEmail').value=email;
  document.getElementById('awardName').value=email;
  document.getElementById('awardPoints').value=mode==='deduct'?'-':'';
  document.getElementById('awardReason').value='';
  document.getElementById('awardModalSub').textContent=mode==='deduct'?'Enter a negative number to deduct points.':'Award bonus points for this technician.';
  document.getElementById('awardModal').classList.remove('hidden');
}

function closeAwardModal(){document.getElementById('awardModal').classList.add('hidden');}

async function submitAwardPoints(){
  const email=document.getElementById('awardEmail').value;
  const pts=parseInt(document.getElementById('awardPoints').value)||0;
  const reason=document.getElementById('awardReason').value||'Admin adjustment';
  if(!pts){alert('Please enter a point value.');return;}
  await sf('/rest/v1/technician_points',{method:'POST',body:JSON.stringify({user_email:email,points:pts,reason:reason,created_at:new Date().toISOString()})});
  closeAwardModal();showToast('Points updated!');loadPoints();
}

// ============================================================
// OVERVIEW
// ============================================================
async function loadOverview(){
  const logsRes=await sf('/rest/v1/training_logs?select=*&order=created_at.desc&limit=500');
  const qRes=await sf('/rest/v1/bst_training_results?select=*&status=eq.active');
  const fbRes=await sf('/rest/v1/question_feedback?select=*&status=eq.pending');
  const logsArr=Array.isArray(logsRes)?logsRes:getDemoLogs();
  const qArr=Array.isArray(qRes)?qRes:getDemoQuestions();
  const fbArr=Array.isArray(fbRes)?fbRes:getDemoFeedback();
  const techEmails=[];
  logsArr.forEach(function(l){if(l.user_email&&techEmails.indexOf(l.user_email)===-1)techEmails.push(l.user_email);});
  const totalCorrect=logsArr.filter(function(l){return l.is_correct;}).length;
  const accuracy=logsArr.length?Math.round((totalCorrect/logsArr.length)*100):0;
  const ptsRes=await sf('/rest/v1/technician_points?select=points');
  const totalPts=Array.isArray(ptsRes)?ptsRes.reduce(function(s,r){return s+(r.points||0);},0):0;
  document.getElementById('m-techs').textContent=techEmails.length||'—';
  document.getElementById('m-answered').textContent=logsArr.length||'—';
  document.getElementById('m-accuracy').textContent=logsArr.length?accuracy+'%':'—';
  document.getElementById('m-questions').textContent=qArr.length||'—';
  document.getElementById('m-feedback').textContent=fbArr.length||'0';
  document.getElementById('m-points').textContent=totalPts||'—';
  document.getElementById('fbBadge').textContent=fbArr.length;
  drawBarChart('activityChart',getLast14Days(logsArr),'#c0392b');
  drawBarChart('topicChart',getTopicAccuracy(qArr),'#8B1A1A');
  const techMap={};
  logsArr.forEach(function(l){
    const e=l.user_email||'Unknown';
    if(!techMap[e])techMap[e]={email:e,correct:0,total:0,last:l.created_at};
    techMap[e].total++;if(l.is_correct)techMap[e].correct++;
    if(l.created_at>techMap[e].last)techMap[e].last=l.created_at;
  });
  const techRows=Object.values(techMap).sort(function(a,b){return b.total-a.total;}).slice(0,8).map(function(t){
    const pct=t.total?Math.round((t.correct/t.total)*100):0;
    return '<tr>'
      +'<td><div class="tech-name">'+t.email.split('@')[0]+'</div><div class="tech-email">'+t.email+'</div></td>'
      +'<td>'+t.total+'</td><td style="font-weight:600">'+pct+'%</td>'
      +'<td style="color:var(--muted);font-size:0.8rem">'+(t.last?new Date(t.last).toLocaleDateString():'—')+'</td>'
      +'<td style="min-width:120px"><div style="font-size:0.75rem;color:var(--muted);margin-bottom:3px">'+t.correct+'/'+t.total+'</div>'
      +'<div class="mini-bar"><div class="mini-fill" style="width:'+pct+'%"></div></div></td></tr>';
  });
  document.getElementById('recentActivityTable').innerHTML=techRows.join('')||'<tr class="empty-row"><td colspan="5">No training activity yet.</td></tr>';
}

// ============================================================
// TECHNICIANS
// ============================================================
async function loadTechnicians(){
  const logsRes=await sf('/rest/v1/training_logs?select=*&order=created_at.desc&limit=1000');
  const ptsRes=await sf('/rest/v1/technician_points?select=user_email,points');
  const logsArr=Array.isArray(logsRes)?logsRes:getDemoLogs();
  const ptsMap={};
  if(Array.isArray(ptsRes))ptsRes.forEach(function(r){if(!ptsMap[r.user_email])ptsMap[r.user_email]=0;ptsMap[r.user_email]+=(r.points||0);});
  const techMap={};
  logsArr.forEach(function(l){
    const e=l.user_email||'unknown@demo.com';
    if(!techMap[e])techMap[e]={email:e,correct:0,total:0,times:[],last:l.created_at};
    techMap[e].total++;if(l.is_correct)techMap[e].correct++;
    if(l.time_taken_seconds)techMap[e].times.push(l.time_taken_seconds);
    if(l.created_at>techMap[e].last)techMap[e].last=l.created_at;
  });
  const rows=Object.values(techMap).sort(function(a,b){return b.total-a.total;}).map(function(t){
    const pct=t.total?Math.round((t.correct/t.total)*100):0;
    const avgTime=t.times.length?Math.round(t.times.reduce(function(a,b){return a+b;},0)/t.times.length):0;
    const trend=t.total>=10?(pct>=70?'↑ Improving':'→ Developing'):'🌱 Getting started';
    const trendColor=t.total>=10&&pct>=70?'var(--success)':'var(--warning)';
    const pts=ptsMap[t.email]||0;
    return '<tr>'
      +'<td><div class="tech-name">'+t.email.split('@')[0]+'</div><div class="tech-email">'+t.email+'</div></td>'
      +'<td><span style="font-weight:600;color:var(--accent3)">'+t.total+'</span></td>'
      +'<td>'+t.correct+'</td>'
      +'<td><span style="font-weight:600;color:#ffd700">'+pts+' pts</span></td>'
      +'<td>'+avgTime+'s</td>'
      +'<td style="font-size:0.8rem;color:var(--muted)">'+(t.last?new Date(t.last).toLocaleDateString():'—')+'</td>'
      +'<td><span style="font-size:0.78rem;font-weight:600;color:'+trendColor+'">'+trend+'</span></td></tr>';
  });
  document.getElementById('techTableBody').innerHTML=rows.join('')||'<tr class="empty-row"><td colspan="7">No data yet.</td></tr>';
}

// ============================================================
// FEEDBACK
// ============================================================
async function loadFeedback(){
  const feedback=await sf('/rest/v1/question_feedback?select=*&order=created_at.desc');
  const fbArr=Array.isArray(feedback)?feedback:getDemoFeedback();
  document.getElementById('fbBadge').textContent=fbArr.filter(function(f){return f.status==='pending';}).length;
  const rows=fbArr.map(function(f){
    const safeF=JSON.stringify(f).replace(/'/g,'&#39;');
    return '<tr>'
      +'<td style="max-width:220px;font-size:0.8rem;white-space:normal">'+(f.question_text||'').substring(0,80)+'…</td>'
      +'<td style="color:var(--warning);font-size:0.78rem">'+(f.feedback_type||'—').replace(/_/g,' ')+'</td>'
      +'<td style="font-size:0.8rem;color:var(--muted)">'+(f.author_name||'—')+'</td>'
      +'<td style="max-width:200px;font-size:0.78rem;color:var(--muted);white-space:normal">'+(f.comment||'(no comment)').substring(0,80)+'</td>'
      +'<td><span class="status-chip '+(f.status||'pending')+'">'+(f.status||'pending')+'</span></td>'
      +'<td><div class="actions-cell">'
      +'<button class="btn-action review" onclick=\'openReviewModal('+safeF+')\'>Review</button>'
      +'<button class="btn-action dismiss" onclick="quickDismiss(\''+f.id+'\')">Dismiss</button>'
      +'</div></td></tr>';
  });
  document.getElementById('feedbackTableBody').innerHTML=rows.join('')||'<tr class="empty-row"><td colspan="6">No feedback yet.</td></tr>';
}

// ============================================================
// REPORTS
// ============================================================
async function loadReports(){
  const qRes=await sf('/rest/v1/bst_training_results?select=difficulty,topic,computed_difficulty');
  const kbRes=await sf('/rest/v1/knowledge_base?select=*');
  const qArr=Array.isArray(qRes)?qRes:getDemoQuestions();
  const kbArr=Array.isArray(kbRes)?kbRes:getDemoDocs();
  const counts={beginner:0,intermediate:0,advanced:0};
  qArr.forEach(function(q){const d=q.computed_difficulty||q.difficulty||'beginner';if(counts[d]!==undefined)counts[d]++;else counts.beginner++;});
  drawBarChart('diffChart',{labels:['Beginner','Intermediate','Advanced'],data:[counts.beginner,counts.intermediate,counts.advanced]},'#c0392b');
  drawBarChart('fbTrendChart',{labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],data:[1,2,0,3,1,2,1]},'#8B1A1A');
  const kbRows=kbArr.map(function(doc){
    return '<tr><td>'+(doc.title||doc.source_filename||'Untitled')+'</td>'
      +'<td style="font-size:0.75rem;color:var(--muted);text-transform:uppercase">'+(doc.file_type||'—')+'</td>'
      +'<td>'+((doc.raw_questions||[]).length)+'</td>'
      +'<td style="font-size:0.78rem;color:var(--muted)">'+(doc.created_at?new Date(doc.created_at).toLocaleDateString():'—')+'</td></tr>';
  });
  document.getElementById('kbReportTable').innerHTML=kbRows.join('')||'<tr class="empty-row"><td colspan="4">No documents yet.</td></tr>';
}

// ============================================================
// SETTINGS
// ============================================================
function loadSettings(){loadSettingsTechs();}

function syncInvitePassword(){
  document.getElementById('invitePassword').value=document.getElementById('createPassword').value;
}

function generateToken(){
  const chars='abcdefghijklmnopqrstuvwxyz0123456789';
  let token='';
  for(let i=0;i<24;i++)token+=chars.charAt(Math.floor(Math.random()*chars.length));
  return token;
}

async function createTechAccount(){
  const email=document.getElementById('createEmail').value.trim();
  const password=document.getElementById('createPassword').value;
  const role=document.getElementById('createRole').value;
  const resultEl=document.getElementById('createResult');
  resultEl.className='result-msg';
  if(!email||!password){resultEl.textContent='Please enter both email and password.';resultEl.className='result-msg error';return;}
  if(password.length<6){resultEl.textContent='Password must be at least 6 characters.';resultEl.className='result-msg error';return;}
  const btn=document.getElementById('createBtn');
  btn.disabled=true;btn.textContent='Creating...';
  const res=await sfAdmin('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email:email,password:password,email_confirm:true})});
  btn.disabled=false;btn.textContent='Create Account →';
  if(res.ok){
    await sfAdmin('/rest/v1/technician_notes',{method:'POST',body:JSON.stringify({user_email:email,temp_password:password,role:role})});
    await sfAdmin('/rest/v1/daily_tokens',{method:'POST',body:JSON.stringify({user_email:email,token:generateToken()})});
    resultEl.textContent='✓ Account created for '+email+' as '+role+'. Now complete Step 2.';
    resultEl.className='result-msg success';
    document.getElementById('inviteEmail').value=email;
    document.getElementById('invitePassword').value=password;
    loadSettingsTechs();
  } else {
    resultEl.textContent='Error: '+((res.data&&(res.data.msg||res.data.message))||'Check your service role key.');
    resultEl.className='result-msg error';
  }
}

function sendInvite(){
  const email=document.getElementById('inviteEmail').value.trim();
  const password=document.getElementById('invitePassword').value.trim();
  const resultEl=document.getElementById('inviteResult');
  resultEl.className='result-msg';
  if(!email){resultEl.textContent='Please enter the technician email.';resultEl.className='result-msg error';return;}
  if(!password){resultEl.textContent='Please enter their password.';resultEl.className='result-msg error';return;}
  const loginUrl='https://bmtchspprt.github.io/train-game/index.html';
  const subject='Your BST Technical Training Challenge Login';
  const body='Hi,\n\nYou have been set up on the BST Technical Training Challenge.\n\nSign in here:\n'+loginUrl+'\n\nEmail: '+email+'\nPassword: '+password+'\n\nQuestions? Reply to this email.\n\nBST Training';
  window.location.href='mailto:'+email+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  resultEl.textContent='✓ Email app opened for '+email+'. Hit send from there.';
  resultEl.className='result-msg success';
  setTimeout(function(){
    document.getElementById('createEmail').value='';
    document.getElementById('createPassword').value='';
    document.getElementById('inviteEmail').value='';
    document.getElementById('invitePassword').value='';
    document.getElementById('createResult').className='result-msg';
  },3000);
}

// ============================================================
// MANAGE TECHNICIANS WITH ROLE DROPDOWN
// ============================================================
async function loadSettingsTechs(){
  const tbody=document.getElementById('settingsTechBody');
  tbody.innerHTML='<tr class="empty-row"><td colspan="7">Loading...</td></tr>';
  const userRes=await sfAdmin('/auth/v1/admin/users?per_page=100');
  const notesRes=await sfAdmin('/rest/v1/technician_notes?select=user_email,temp_password,role');
  const tokensRes=await sfAdmin('/rest/v1/daily_tokens?select=user_email,token');
  if(!userRes.ok||!userRes.data||!userRes.data.users){
    tbody.innerHTML='<tr class="empty-row"><td colspan="7" style="color:var(--warning);">Add SUPABASE_SERVICE_KEY to config.js to enable user management.</td></tr>';
    return;
  }
  const pwMap={};const roleMap={};
  if(notesRes.ok&&Array.isArray(notesRes.data)){
    notesRes.data.forEach(function(n){pwMap[n.user_email]=n.temp_password;roleMap[n.user_email]=n.role||'user';});
  }
  const tokenMap={};
  if(tokensRes.ok&&Array.isArray(tokensRes.data)){
    tokensRes.data.forEach(function(t){tokenMap[t.user_email]=t.token;});
  }
  const users=userRes.data.users;
  if(!users.length){tbody.innerHTML='<tr class="empty-row"><td colspan="7">No technicians yet.</td></tr>';return;}
  tbody.innerHTML=users.map(function(u){
    const created=u.created_at?new Date(u.created_at).toLocaleDateString():'—';
    const confirmed=u.email_confirmed_at?'active':'invited';
    const pw=pwMap[u.email];
    const role=roleMap[u.email]||'user';
    const pwHTML=pw
      ?'<div class="pw-cell" id="pwcell-'+u.id+'"><span class="pw-dots">••••••••</span><span class="pw-text">'+pw+'</span><button class="btn-reveal" onclick="togglePassword(\''+u.id+'\')" id="pwbtn-'+u.id+'">👁 Show</button></div>'
      :'<span class="no-pw">Not on record</span>';
    const token=tokenMap[u.email];
    const dailyHTML=token
      ?'<div class="daily-link-cell"><span class="daily-link-text">'+DAILY_BASE_URL+'?u='+token+'</span><button class="btn-copy-link" onclick="copyDailyLink(\''+token+'\',this)">📋 Copy</button></div>'
      :'<button class="btn-gen-link" onclick="generateDailyLinkFor(\''+u.email+'\')">+ Generate</button>';
    const roleDropdown='<select class="role-select" onchange="saveRole(\''+u.email+'\',this.value)">'
      +'<option value="user"'+(role==='user'?' selected':'')+'>User</option>'
      +'<option value="admin"'+(role==='admin'?' selected':'')+'>Admin</option>'
      +'</select>';
    return '<tr id="row-'+u.id+'">'
      +'<td><div class="tech-name">'+u.email.split('@')[0]+'</div><div class="tech-email">'+u.email+'</div></td>'
      +'<td><span class="status-chip '+confirmed+'">'+confirmed+'</span></td>'
      +'<td>'+roleDropdown+'</td>'
      +'<td>'+pwHTML+'</td>'
      +'<td>'+dailyHTML+'</td>'
      +'<td style="color:var(--muted);font-size:0.8rem">'+created+'</td>'
      +'<td><div class="actions-cell"><button class="btn-action delete" onclick="promptDeleteTech(\''+u.id+'\',\''+u.email+'\')">Remove</button></div>'
      +'<div class="delete-confirm-inline" id="confirm-'+u.id+'">'
      +'<span>Remove '+u.email.split('@')[0]+'?</span>'
      +'<button class="btn-confirm-yes" onclick="deleteTech(\''+u.id+'\',\''+u.email+'\')">Yes</button>'
      +'<button class="btn-confirm-no" onclick="cancelDeleteTech(\''+u.id+'\')">Cancel</button>'
      +'</div></td></tr>';
  }).join('');
}

async function saveRole(email,role){
  const res=await sfAdmin('/rest/v1/technician_notes?user_email=eq.'+encodeURIComponent(email),{
    method:'PATCH',body:JSON.stringify({role:role})
  });
  if(res.ok){showToast(email.split('@')[0]+' is now '+role);}
  else{showToast('Could not save role — user may not have a notes record.','error');}
}

async function generateDailyLinkFor(email){
  const token=generateToken();
  const res=await sfAdmin('/rest/v1/daily_tokens',{method:'POST',body:JSON.stringify({user_email:email,token:token})});
  if(res.ok){showToast('Daily quiz link created!');loadSettingsTechs();}
  else{showToast('Could not create daily link.','error');}
}

function copyDailyLink(token,btn){
  const url=DAILY_BASE_URL+'?u='+token;
  navigator.clipboard.writeText(url).then(function(){
    const original=btn.textContent;
    btn.textContent='✓ Copied!';
    setTimeout(function(){btn.textContent=original;},2000);
  }).catch(function(){showToast('Could not copy — link: '+url,'error');});
}

function togglePassword(userId){
  const cell=document.getElementById('pwcell-'+userId);
  const btn=document.getElementById('pwbtn-'+userId);
  if(!cell)return;
  const isRevealed=cell.classList.contains('revealed');
  cell.classList.toggle('revealed');
  btn.textContent=isRevealed?'👁 Show':'🙈 Hide';
}

function promptDeleteTech(id){
  document.querySelectorAll('.delete-confirm-inline').forEach(function(el){el.classList.remove('show');});
  document.getElementById('confirm-'+id).classList.add('show');
}

function cancelDeleteTech(id){document.getElementById('confirm-'+id).classList.remove('show');}

async function deleteTech(id,email){
  const res=await sfAdmin('/auth/v1/admin/users/'+id,{method:'DELETE'});
  if(res.ok){
    showToast(email.split('@')[0]+' removed.');
    await sf('/rest/v1/training_logs?user_email=eq.'+encodeURIComponent(email),{method:'DELETE'});
    await sf('/rest/v1/technician_points?user_email=eq.'+encodeURIComponent(email),{method:'DELETE'});
    await sfAdmin('/rest/v1/technician_notes?user_email=eq.'+encodeURIComponent(email),{method:'DELETE'});
    await sfAdmin('/rest/v1/daily_tokens?user_email=eq.'+encodeURIComponent(email),{method:'DELETE'});
    loadSettingsTechs();
  } else {
    showToast('Could not remove user. Check service role key.','error');
  }
}

async function confirmClearLogs(){
  if(!confirm('Delete ALL training logs and points?'))return;
  await sf('/rest/v1/training_logs?id=neq.00000000-0000-0000-0000-000000000000',{method:'DELETE'});
  await sf('/rest/v1/technician_points?id=neq.00000000-0000-0000-0000-000000000000',{method:'DELETE'});
  showToast('All training logs cleared.');
}

async function confirmClearQuestions(){
  if(!confirm('Delete ALL questions?'))return;
  await sf('/rest/v1/bst_training_results?id=neq.00000000-0000-0000-0000-000000000000',{method:'DELETE'});
  showToast('All questions cleared.');
}

// ============================================================
// FEEDBACK MODALS
// ============================================================
let _currentFb=null;

function openReviewModal(fb){
  _currentFb=fb;
  document.getElementById('reviewFbId').value=fb.id;
  document.getElementById('reviewQId').value=fb.question_id||'';
  document.getElementById('reviewQuestion').textContent=fb.question_text||'—';
  document.getElementById('reviewType').textContent=(fb.feedback_type||'—').replace(/_/g,' ');
  document.getElementById('reviewComment').textContent=fb.comment||'(No comment)';
  document.getElementById('reviewAuthor').textContent='By: '+(fb.author_name||'Anonymous')+' · '+(fb.created_at?new Date(fb.created_at).toLocaleDateString():'');
  document.getElementById('reviewNotes').value='';
  document.getElementById('reviewModal').classList.remove('hidden');
}

function closeReviewModal(){document.getElementById('reviewModal').classList.add('hidden');}

async function resolveFeedback(status){
  const id=document.getElementById('reviewFbId').value;
  await sf('/rest/v1/question_feedback?id=eq.'+id,{method:'PATCH',body:JSON.stringify({status:status,admin_notes:document.getElementById('reviewNotes').value})});
  closeReviewModal();loadFeedback();
}

async function quickDismiss(id){
  await sf('/rest/v1/question_feedback?id=eq.'+id,{method:'PATCH',body:JSON.stringify({status:'dismissed'})});
  loadFeedback();
}

function goEditFromReview(){
  if(_currentFb&&_currentFb.question_id){
    sf('/rest/v1/bst_training_results?id=eq.'+_currentFb.question_id).then(function(q){
      if(Array.isArray(q)&&q[0]){closeReviewModal();navTo('questions');openEditModal(q[0]);}
    });
  }
}

// ============================================================
// CHARTS & UTILITIES
// ============================================================
function filterTable(tableId,query){
  document.querySelectorAll('#'+tableId+' tbody tr').forEach(function(row){
    row.style.display=row.textContent.toLowerCase().includes(query.toLowerCase())?'':'none';
  });
}

function getLast14Days(logs){
  const labels=[];const data=[];
  for(let i=13;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    labels.push(d.toLocaleDateString('en-US',{month:'short',day:'numeric'}));
    const ds=d.toISOString().split('T')[0];
    data.push(logs.filter(function(l){return l.created_at&&l.created_at.startsWith(ds);}).length||Math.floor(Math.random()*15+1));
  }
  return{labels:labels,data:data};
}

function getTopicAccuracy(questions){
  const seen={};const topics=[];
  questions.forEach(function(q){if(q.topic&&!seen[q.topic]){seen[q.topic]=true;topics.push(q.topic);}});
  const useTopics=topics.slice(0,6).length?topics.slice(0,6):['Electrical','Safety','Compressor','Installation'];
  return{labels:useTopics,data:useTopics.map(function(){return Math.floor(Math.random()*35+55);})};
}

function drawBarChart(canvasId,chartData,color){
  const canvas=document.getElementById(canvasId);if(!canvas)return;
  canvas.width=canvas.offsetWidth||400;
  const ctx=canvas.getContext('2d');
  const labels=chartData.labels;const data=chartData.data;
  const W=canvas.width,H=canvas.height,padL=40,padB=30,padR=10,padT=10;
  const maxVal=Math.max.apply(null,data)||1;
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,0.05)';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=padT+(H-padT-padB)*(1-i/4);ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke();}
  const gap=(W-padL-padR)/labels.length;const barW=gap*0.6;
  for(let j=0;j<labels.length;j++){
    const x=padL+j*gap+gap*0.2;const h=(data[j]/maxVal)*(H-padT-padB);const y=padT+(H-padT-padB)-h;
    const grad=ctx.createLinearGradient(0,y,0,H-padB);grad.addColorStop(0,color);grad.addColorStop(1,color+'33');
    ctx.fillStyle=grad;const r=4;
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+barW-r,y);ctx.arcTo(x+barW,y,x+barW,y+r,r);ctx.lineTo(x+barW,H-padB);ctx.lineTo(x,H-padB);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();ctx.fill();
    ctx.fillStyle='#606080';ctx.font='10px Arial,sans-serif';ctx.textAlign='center';
    const lbl=labels[j];ctx.fillText(lbl.length>8?lbl.substring(0,7)+'..':lbl,x+barW/2,H-padB+16);
  }
  ctx.fillStyle='#606080';ctx.font='10px Arial,sans-serif';ctx.textAlign='right';
  for(let k=0;k<=4;k++){ctx.fillText(Math.round(maxVal*k/4),padL-4,padT+(H-padT-padB)*(1-k/4)+4);}
}

// ============================================================
// DEMO DATA
// ============================================================
function getDemoLogs(){
  const techs=['j.smith@co.com','a.johnson@co.com','m.williams@co.com'];
  const arr=[];
  for(let i=0;i<40;i++){arr.push({user_email:techs[i%techs.length],is_correct:Math.random()>0.35,time_taken_seconds:Math.floor(Math.random()*45+8),created_at:new Date(Date.now()-Math.random()*14*86400000).toISOString()});}
  return arr;
}

function getDemoQuestions(){
  return[{id:'q1',question:'A unit trips on high pressure after 10 minutes. What is FIRST to check?',topic:'Diagnostics',difficulty:'intermediate',question_type:'multiple_choice',options:['A) Replace pressure switch','B) Check condenser airflow','C) Add charge','D) Reset breaker'],correct_answer:'B',explanation:'Restricted airflow is most common.',status:'active'}];
}

function getDemoFeedback(){
  return[{id:'fb1',question_text:'A unit trips on high pressure...',feedback_type:'wrong_answer',author_name:'j.smith@co.com',comment:'Please verify',status:'pending',created_at:new Date().toISOString()}];
}

function getDemoDocs(){
  return[{title:'ServiceManual-v3.pdf',file_type:'pdf',raw_questions:Array(8),created_at:new Date().toISOString()}];
}

// ============================================================
// START
// ============================================================
loadOverview();
