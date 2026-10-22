/* Study Planner — all app behaviour lives here. Python only persists data. */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const T=['tasks','assignments','attendance','goals','notes','courses'];
let ME=JSON.parse(localStorage.getItem('sp_me')||'null'),TOK=localStorage.getItem('sp_tok'),POSTED=[],STU=[];
const K=t=>'sp_'+(ME?ME.id:'x')+'_'+t;
const S={};const loadLocal=()=>T.forEach(t=>S[t]=JSON.parse(localStorage.getItem(K(t))||'[]'));loadLocal();
const api=(u,o={})=>fetch('/api/'+u,{...o,headers:{'Content-Type':'application/json',Authorization:'Bearer '+TOK}});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const today=()=>new Date().toLocaleDateString('en-CA');
const setNet=o=>$('#net').textContent=o?'● synced':'○ offline — saved locally';

/* ---------- storage: localStorage cache + background sync to Python ---------- */
async function push(t){
  localStorage.setItem(K(t),JSON.stringify(S[t]));
  try{const r=await api(t,{method:'PUT',body:JSON.stringify(S[t])});if(!r.ok)throw 0;localStorage.removeItem(K('dirty_'+t));setNet(1)}
  catch{localStorage.setItem(K('dirty_'+t),1);setNet(0)}
}
async function pull(){
  for(const t of T){
    if(localStorage.getItem(K('dirty_'+t))){await push(t);continue}
    try{const r=await api(t);if(!r.ok)throw 0;const d=await r.json();
      if(!d.length&&S[t].length){await push(t);continue}
      S[t]=d;localStorage.setItem(K(t),JSON.stringify(d));setNet(1)}
    catch{setNet(0)}
  }
}
const save=t=>{push(t);render()};

/* ---------- helpers ---------- */
let view='dashboard',cal=new Date(),q='',pf='',sort='due';
const card=(a,b)=>`<div class=card><small>${a}</small><h2>${b}</h2></div>`;
const byDue=(a,b)=>(a.due||'9')>(b.due||'9')?1:-1;
const left=d=>{if(!d)return'no date';const ms=new Date(d)-Date.now();if(ms<0)return'<span class=over>overdue</span>';
  const h=Math.floor(ms/36e5);return h<48?`<span class=due>${h}h left</span>`:Math.floor(h/24)+'d left'};
const pct=a=>a.total?a.att/a.total*100:0;
const avgAtt=()=>S.attendance.length?Math.round(S.attendance.reduce((s,a)=>s+pct(a),0)/S.attendance.length)+'%':'–';
const bar=p=>`<div class=bar><i style="width:${Math.min(100,p)}%"></i></div>`;
const pomo=()=>JSON.parse(localStorage.getItem('sp_pomo')||'{}');
const form=(t,fields,btn='Add')=>`<form data-add=${t} class=row>${fields}<button>${btn}</button></form>`;

/* ---------- views ---------- */
const V={};
V.dashboard=()=>{
  const tk=[...S.tasks,...POSTED],done=tk.filter(x=>x.status=='done').length,pend=S.assignments.filter(a=>!a.done);
  const goals=S.goals.length?Math.round(S.goals.reduce((s,g)=>s+Math.min(100,g.cur/g.target*100),0)/S.goals.length):0;
  const p=pomo(),days=[...Array(7)].map((_,i)=>{const d=new Date(Date.now()-(6-i)*864e5).toLocaleDateString('en-CA');return[d.slice(5),(p[d]||0)*25]});
  const max=Math.max(25,...days.map(d=>d[1])),nm=ME.name;
  return `<h2>Hi, ${esc(nm||'student')} 👋</h2>
  <div class=cards>${card('Tasks done',done+' / '+tk.length)}${card('Assignments pending',pend.length)}${card('Avg goal progress',goals+'%')}${card('Avg attendance',avgAtt())}</div>
  <h3>Focus minutes — last 7 days</h3><div class=chart>${days.map(([d,m])=>`<div><b>${m}</b><i style="height:${m/max*80}%"></i><span>${d}</span></div>`).join('')}</div>
  <h3>Next deadlines</h3>${pend.sort(byDue).slice(0,5).map(a=>`<p>${esc(a.title)} — ${left(a.due)}</p>`).join('')||'<p class=muted>Nothing pending 🎉</p>'}`;
};
V.tasks=()=>{
  const all=[...POSTED.map(p=>({...p,id:'F'+p.id,pri:'h',fac:1})),...S.tasks];
  const l=all.filter(t=>(!q||t.title.toLowerCase().includes(q))&&(!pf||t.pri==pf))
    .sort(sort=='pri'?(a,b)=>'hml'.indexOf(a.pri)-'hml'.indexOf(b.pri):byDue);
  const opt=(v,n,c)=>`<option value="${v}" ${c==v?'selected':''}>${n}</option>`;
  return form('tasks',`<input name=title id=newtask placeholder="New personal task…" required><select name=pri><option value=h>High</option><option value=m selected>Medium</option><option value=l>Low</option></select><input type=date name=due>`)+
  `<div class=row><select id=pf>${opt('','All priorities',pf)}${opt('h','High',pf)}${opt('m','Medium',pf)}${opt('l','Low',pf)}</select>
  <select id=sort>${opt('due','Sort: due date',sort)}${opt('pri','Sort: priority',sort)}</select><small>🏫 = assigned by faculty · drag cards between columns</small></div>
  <div class=board>${[['todo','To do'],['doing','In progress'],['done','Done']].map(([s,n])=>`<div class=col data-s=${s}><h3>${n}</h3>${l.filter(t=>t.status==s).map(t=>
  `<div class="item p${t.pri} ${s}" draggable=true data-id=${t.id}><span>${t.fac?'🏫 ':''}${esc(t.title)}<br><small>${t.fac?`${esc(t.faculty_name)} · ${esc(t.subject)} · due ${t.due} · ${left(t.due)}${t.desc?'<br>'+esc(t.desc):''}`:(t.due||'')}</small></span>${t.fac?'':`<button data-del=tasks data-id=${t.id}>×</button>`}</div>`).join('')}</div>`).join('')}</div>`;
};
V.assignments=()=>form('assignments',`<input name=title placeholder="Assignment" required><input name=subject placeholder="Subject"><input type=datetime-local name=due required>`)+
  [...S.assignments].sort(byDue).map(a=>`<div class="item ${a.done?'done':''}"><span><b>${esc(a.title)}</b> <small>${esc(a.subject)}</small><br>${a.done?'completed':left(a.due)} <small>${(a.due||'').replace('T',' ')}</small></span>
  <span><button data-tog=${a.id}>${a.done?'Undo':'Done'}</button> <button data-del=assignments data-id=${a.id}>×</button></span></div>`).join('');
V.calendar=()=>{
  const y=cal.getFullYear(),m=cal.getMonth(),first=new Date(y,m,1).getDay(),n=new Date(y,m+1,0).getDate(),ev={};
  [...S.assignments.filter(a=>a.due).map(a=>[a.due.slice(0,10),'📄 '+a.title]),...[...S.tasks,...POSTED].filter(t=>t.due).map(t=>[t.due,'✅ '+t.title])].forEach(([d,t])=>(ev[d]=ev[d]||[]).push(t));
  let c='';for(let i=0;i<first;i++)c+='<div></div>';
  for(let d=1;d<=n;d++){const k=`${y}-${String(m+1).padStart(2,0)}-${String(d).padStart(2,0)}`;
    c+=`<div class="day ${k==today()?'today':''}"><b>${d}</b>${(ev[k]||[]).map(t=>`<small>${esc(t)}</small>`).join('')}</div>`}
  return `<div class=row><button data-cal=-1>‹</button><h3>${cal.toLocaleString('default',{month:'long'})} ${y}</h3><button data-cal=1>›</button></div>
  <div class=cal>${[...'SMTWTFS'].map(x=>`<em>${x}</em>`).join('')}${c}</div>`;
};
V.attendance=()=>form('attendance',`<input name=subject placeholder="Subject" required><input type=number name=att min=0 placeholder="Attended" required><input type=number name=total min=1 placeholder="Total classes" required>`)+
  S.attendance.map(a=>{const p=pct(a),adv=p<75?`Attend the next <b>${Math.ceil((0.75*a.total-a.att)/0.25)}</b> classes to reach 75%`:`You can miss <b>${Math.floor(a.att/0.75-a.total)}</b> more classes and stay ≥75%`;
  return `<div class=item><span><b>${esc(a.subject)}</b> ${a.att}/${a.total} (${p.toFixed(1)}%)<br><small>${adv}</small></span>${bar(p)}
  <span><button data-att=p data-id=${a.id}>+Present</button> <button data-att=a data-id=${a.id}>+Absent</button> <button data-del=attendance data-id=${a.id}>×</button></span></div>`}).join('');
V.cgpa=()=>{
  const cr=S.courses.reduce((s,c)=>s+c.credits,0),pts=S.courses.reduce((s,c)=>s+c.credits*c.gp,0);
  return form('courses',`<input name=name placeholder="Course" required><input type=number name=credits min=1 placeholder="Credits" required><select name=gp>${[10,9,8,7,6,5,4,0].map(g=>`<option value=${g}>Grade point ${g}</option>`).join('')}</select>`)+
  `<div class=card><small>CGPA (10-point scale)</small><h2>${cr?(pts/cr).toFixed(2):'–'}</h2></div>`+
  S.courses.map(c=>`<div class=item><span>${esc(c.name)} — ${c.credits} credits, GP ${c.gp}</span><button data-del=courses data-id=${c.id}>×</button></div>`).join('');
};
V.goals=()=>form('goals',`<input name=title placeholder="Goal (e.g. Solve 100 DSA problems)" required><input type=number name=target min=1 placeholder="Target" required>`)+
  S.goals.map(g=>`<div class=item><span><b>${esc(g.title)}</b> ${g.cur}/${g.target}</span>${bar(g.cur/g.target*100)}
  <span><button data-inc=1 data-id=${g.id}>+1</button> <button data-del=goals data-id=${g.id}>×</button></span></div>`).join('');
V.notes=()=>`<form data-add=notes class=row><input name=title placeholder="Title" required><textarea name=body placeholder="Write a note…" rows=3 style="flex:2;min-width:200px"></textarea><button>Save</button></form>`+
  S.notes.map(n=>`<div class=item><span><b>${esc(n.title)}</b><br><small style="white-space:pre-wrap">${esc(n.body)}</small></span><button data-del=notes data-id=${n.id}>×</button></div>`).join('');

/* Pomodoro (timer state lives outside render so it keeps running) */
const P={mode:'focus',left:1500,run:false,t:null},fmt=s=>`${String(Math.floor(s/60)).padStart(2,0)}:${String(s%60).padStart(2,0)}`;
V.pomodoro=()=>`<div class=clock id=clock>${fmt(P.left)}</div><div class=row style="justify-content:center">
  <button data-p=toggle>${P.run?'Pause':'Start'}</button><button data-p=reset>Reset</button><button data-p=mode>${P.mode=='focus'?'Switch to break':'Switch to focus'}</button></div>
  <p style="text-align:center" class=muted>${P.mode=='focus'?'Focus · 25 min':'Break · 5 min'} — sessions today: ${pomo()[today()]||0}</p>`;
function tick(){
  if(--P.left>0){$('#clock')&&($('#clock').textContent=fmt(P.left));document.title=fmt(P.left)+' · Study Planner';return}
  clearInterval(P.t);P.run=false;
  if(P.mode=='focus'){const p=pomo();p[today()]=(p[today()]||0)+1;localStorage.setItem('sp_pomo',JSON.stringify(p))}
  notify(P.mode=='focus'?'Focus session done — take a break!':'Break over — back to work!');
  P.mode=P.mode=='focus'?'break':'focus';P.left=P.mode=='focus'?1500:300;document.title='Study Planner';render();
}

/* ---------- render + events ---------- */
let NAV;const SNAV=[['dashboard','🏠 Dashboard'],['tasks','✅ Tasks'],['assignments','📄 Assignments'],['calendar','📅 Calendar'],['attendance','🎯 Attendance'],['cgpa','🎓 CGPA'],['goals','🏆 Goals'],['notes','📝 Notes'],['pomodoro','⏱ Pomodoro']];
function render(){
  $('#nav').innerHTML=NAV.map(([k,n])=>`<button data-view=${k} class="${k==view?'on':''}">${n}</button>`).join('');
  $('#main').innerHTML=V[view]();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.view){view=d.view;render()}
  if(d.del){S[d.del]=S[d.del].filter(x=>x.id!=d.id);save(d.del)}
  if(d.tog){const a=S.assignments.find(x=>x.id==d.tog);a.done=!a.done;save('assignments')}
  if(d.att){const a=S.attendance.find(x=>x.id==d.id);a.total++;if(d.att=='p')a.att++;save('attendance')}
  if(d.inc){const g=S.goals.find(x=>x.id==d.id);g.cur=Math.min(g.target,g.cur+1);save('goals')}
  if(d.cal){cal.setMonth(cal.getMonth()+ +d.cal);render()}
  if(d.p=='toggle'){P.run=!P.run;clearInterval(P.t);if(P.run)P.t=setInterval(tick,1000);render()}
  if(d.p=='reset'){clearInterval(P.t);P.run=false;P.left=P.mode=='focus'?1500:300;render()}
  if(d.p=='mode'){clearInterval(P.t);P.run=false;P.mode=P.mode=='focus'?'break':'focus';P.left=P.mode=='focus'?1500:300;render()}
});
document.addEventListener('submit',e=>{
  const f=e.target.closest('form[data-add]');if(!f)return;e.preventDefault();
  const t=f.dataset.add,o=Object.fromEntries(new FormData(f));o.id=uid();
  ['att','total','target','credits','gp'].forEach(k=>k in o&&(o[k]=+o[k]));
  if(t=='tasks')o.status='todo';if(t=='assignments')o.done=false;if(t=='goals')o.cur=0;
  if(t=='attendance'&&o.att>o.total)return alert('Attended cannot exceed total');
  S[t].push(o);save(t);
});
document.addEventListener('change',e=>{
  if(e.target.id=='pf'){pf=e.target.value;render()}if(e.target.id=='sort'){sort=e.target.value;render()}
});
/* drag & drop for kanban */
let dragId=null;
document.addEventListener('dragstart',e=>{const i=e.target.closest?.('.item[draggable]');if(i)dragId=i.dataset.id});
document.addEventListener('dragover',e=>{if(e.target.closest?.('.col'))e.preventDefault()});
document.addEventListener('drop',e=>{
  const c=e.target.closest?.('.col');if(!c||!dragId)return;e.preventDefault();
  const fp=POSTED.find(p=>'F'+p.id==dragId);
  if(fp){fp.status=c.dataset.s;api('progress',{method:'POST',body:JSON.stringify({aid:fp.id,status:fp.status})});render()}
  else{const t=S.tasks.find(x=>x.id==dragId);if(t){t.status=c.dataset.s;save('tasks')}}dragId=null;
});
/* search, theme, shortcuts */
$('#q').addEventListener('input',e=>{q=e.target.value.toLowerCase();if(ME.role=='student'&&view!='tasks')view='tasks';render()});
const setTheme=t=>{document.documentElement.dataset.theme=t;localStorage.setItem('sp_theme',t)};
const toggleTheme=()=>setTheme(document.documentElement.dataset.theme=='dark'?'light':'dark');
$('#theme').onclick=toggleTheme;
document.addEventListener('keydown',e=>{
  if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey)return;
  if(e.key=='/'){e.preventDefault();$('#q').focus()}
  else if(e.key=='d')toggleTheme();
  else if(e.key=='n'&&ME&&ME.role=='student'){view='tasks';render();e.preventDefault();$('#newtask').focus()}
  else if(/^[1-9]$/.test(e.key)&&NAV&&NAV[e.key-1]){view=NAV[e.key-1][0];render()}
});
/* notifications: ask once, then warn about assignments due within 24h */
function notify(msg){if('Notification' in window&&Notification.permission=='granted')new Notification('Study Planner',{body:msg});else console.log(msg)}
$('#bell').onclick=()=>'Notification' in window&&Notification.requestPermission().then(p=>p=='granted'&&notify('Notifications enabled ✅'));
function checkDue(){
  const seen=JSON.parse(localStorage.getItem('sp_seen')||'[]');
  S.assignments.filter(a=>!a.done&&a.due&&!seen.includes(a.id)).forEach(a=>{
    const ms=new Date(a.due)-Date.now();if(ms>0&&ms<864e5){notify(`"${a.title}" is due in ${Math.ceil(ms/36e5)}h`);seen.push(a.id)}});
  localStorage.setItem('sp_seen',JSON.stringify(seen));
  if(view=='assignments'||view=='dashboard')render();
}
/* boot */
setTheme(localStorage.getItem('sp_theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
/* ---------- faculty side ---------- */
const FNAV=[['assign','📋 Assign tasks'],['notes','📝 Notes']];
const prog=p=>{const n=p.students.length,d=p.students.filter(s=>s.status=='done').length;return `${d}/${n} done${bar(n?d/n*100:0)}`};
V.assign=()=>`<h2>Assign a task</h2><form id=af class=row><input name=title placeholder="Task title" required><input name=subject placeholder="Subject"><input type=date name=due required title="Last date">
  <input name=desc placeholder="Instructions (optional)" style="flex:2"><select name=aud><option value=all>All students</option>${STU.map(s=>`<option value=${s.id}>${esc(s.name)} only</option>`).join('')}</select><button>Assign</button></form>
  <h3>Assigned tasks</h3>${POSTED.map(p=>`<div class=item><span><b>${esc(p.title)}</b> <small>${esc(p.subject)} · last date ${p.due}</small><br>${p.students.map(s=>`<small>${esc(s.name)}: ${s.status}</small>`).join(' · ')||'<small>No students registered yet</small>'}<br>${prog(p)}</span><button data-delp=${p.id}>×</button></div>`).join('')||'<p class=muted>Nothing assigned yet.</p>'}`;
document.addEventListener('submit',async e=>{
  if(e.target.id!='af')return;e.preventDefault();
  const o=Object.fromEntries(new FormData(e.target));o.audience=o.aud=='all'?'all':[o.aud];delete o.aud;
  const r=await api('posted',{method:'POST',body:JSON.stringify(o)});
  if(r.ok){await loadPosted();render()}else alert('Could not assign task');
});
document.addEventListener('click',async e=>{
  if(e.target.id=='out')logout();
  const id=e.target.dataset?.delp;if(id&&confirm('Delete this task for all students?')){await api('posted/'+id,{method:'DELETE'});await loadPosted();render()}
});
async function loadPosted(){
  try{const r=await api('posted');if(r.status==401)return logout();POSTED=await r.json();localStorage.setItem(K('posted'),JSON.stringify(POSTED));
    if(ME.role=='faculty')STU=await(await api('students')).json()}
  catch{POSTED=JSON.parse(localStorage.getItem(K('posted'))||'[]')}
}
async function refresh(){   // auto-pull new faculty tasks every 30s
  const old=POSTED.map(p=>p.id),b=JSON.stringify(POSTED);await loadPosted();if(!ME)return;
  if(ME.role=='student')POSTED.filter(p=>!old.includes(p.id)).forEach(p=>notify('New task from '+p.faculty_name+': '+p.title));
  if(b!=JSON.stringify(POSTED)&&!document.activeElement.closest?.('form'))render();
}
/* ---------- login / register ---------- */
let reg=false;
function authUI(){
  $('#auth').innerHTML=`<div class=overlay><form id=lf class=box><h2>📚 StudyPlanner</h2>${reg?'<input name=name placeholder="Full name" required>':''}
  <input name=email type=email placeholder="Email" required><input name=password type=password placeholder="Password (min 4)" required>
  ${reg?'<select name=role><option value=student>I am a student</option><option value=faculty>I am faculty</option></select><input name=code placeholder="Faculty code (faculty only)">':''}
  <button>${reg?'Create account':'Login'}</button><small id=err class=over></small><a href="#" id=sw>${reg?'Have an account? Login':'New here? Register'}</a></form></div>`;
  $('#sw').onclick=e=>{e.preventDefault();reg=!reg;authUI()};
  $('#lf').onsubmit=async e=>{e.preventDefault();
    const r=await fetch('/api/'+(reg?'register':'login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});
    const d=await r.json();if(!r.ok)return $('#err').textContent=d.error;
    TOK=d.token;ME=d.user;localStorage.setItem('sp_tok',TOK);localStorage.setItem('sp_me',JSON.stringify(ME));start()};
}
function logout(){['sp_tok','sp_me'].forEach(k=>localStorage.removeItem(k));TOK=ME=null;POSTED=[];authUI()}
async function start(){
  $('#auth').innerHTML='';loadLocal();NAV=ME.role=='faculty'?FNAV:SNAV;view=NAV[0][0];
  POSTED=JSON.parse(localStorage.getItem(K('posted'))||'[]');render();
  await loadPosted();if(!ME)return;await pull();render();checkDue();
}
ME&&TOK?start():authUI();
setInterval(()=>ME&&refresh(),30000);setInterval(()=>ME&&checkDue(),60000);
addEventListener('online',()=>ME&&pull().then(render));
