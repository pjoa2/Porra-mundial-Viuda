import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase.js'

const C = {
  bg:'#13131a',surface:'#1e1e28',surfaceHigh:'#28283a',border:'#35354a',
  accent:'#c0392b',accentHover:'#e74c3c',gold:'#e8a020',silver:'#9aa0b8',
  green:'#1e9e5a',greenSoft:'#27c46e',blue:'#2271c4',text:'#e8e8f2',
  textMuted:'#7878a0',textDim:'#50507a',
}

const DEFAULT_SCORING = {
  groups_first:4,groups_second:3,groups_qualified:1,
  r32:3,r16:5,qf:8,sf:12,third:10,final_winner:25,final_runner:15
}

const SCORING_LABELS = [
  {key:'groups_first',   label:'Grupos — 1º exacto',        icon:'⚽'},
  {key:'groups_second',  label:'Grupos — 2º exacto',        icon:'⚽'},
  {key:'groups_qualified',label:'Grupos — Clasificado',     icon:'⚽'},
  {key:'r32',            label:'Dieciseisavos — Acierto',   icon:'🔵'},
  {key:'r16',            label:'Octavos — Acierto',         icon:'🟡'},
  {key:'qf',             label:'Cuartos — Acierto',         icon:'🟠'},
  {key:'sf',             label:'Semis — Acierto',           icon:'🔴'},
  {key:'third',          label:'3º/4º — Ganador',           icon:'🥉'},
  {key:'final_winner',   label:'Final — Campeón',           icon:'🏆'},
  {key:'final_runner',   label:'Final — Subcampeón',        icon:'🥈'},
]

const GROUPS = {
  A:['México','Sudáfrica','Corea del Sur','Rep. Checa'],
  B:['Canadá','Bosnia-Herz.','Qatar','Suiza'],
  C:['Brasil','Marruecos','Haití','Escocia'],
  D:['EE.UU.','Paraguay','Türkiye','Australia'],
  E:['Alemania','Curazao','C. de Marfil','Ecuador'],
  F:['Países Bajos','Japón','Suecia','Túnez'],
  G:['Bélgica','Egipto','Irán','Nueva Zelanda'],
  H:['España','Arabia Saudita','Uruguay','Cabo Verde'],
  I:['Francia','Senegal','Noruega','Irak'],
  J:['Argentina','Argelia','Jordania','Austria'],
  K:['Portugal','DR Congo','Colombia','Uzbekistán'],
  L:['Inglaterra','Croacia','Ghana','Panamá'],
}

const PHASES = [
  {id:'groups',label:'Fase de Grupos',short:'Grupos',icon:'⚽',deadline:'2026-06-11T17:00:00'},
  {id:'r32',label:'Dieciseisavos de Final',short:'1/16F',icon:'🔵',deadline:'2026-07-01T17:00:00'},
  {id:'r16',label:'Octavos de Final',short:'Octavos',icon:'🟡',deadline:'2026-07-05T17:00:00'},
  {id:'qf',label:'Cuartos de Final',short:'Cuartos',icon:'🟠',deadline:'2026-07-09T17:00:00'},
  {id:'sf',label:'Semifinales',short:'Semis',icon:'🔴',deadline:'2026-07-13T17:00:00'},
  {id:'third',label:'3er y 4º Puesto',short:'3º/4º',icon:'🥉',deadline:'2026-07-17T17:00:00'},
  {id:'final',label:'Final',short:'Final',icon:'🏆',deadline:'2026-07-18T20:00:00'},
]

function isClosed(d){return new Date()>new Date(d)}
function timeLeft(deadline){
  const diff=new Date(deadline)-new Date()
  if(diff<=0)return'🔒 Cerrado'
  const days=Math.floor(diff/86400000),hours=Math.floor((diff%86400000)/3600000),mins=Math.floor((diff%3600000)/60000)
  if(days>0)return`⏳ ${days}d ${hours}h`
  if(hours>0)return`⏳ ${hours}h ${mins}m`
  return`⏳ ${mins}m`
}
function hashPassword(str){
  let hash=5381
  for(let i=0;i<str.length;i++)hash=((hash<<5)+hash)^str.charCodeAt(i)
  return(hash>>>0).toString(16)
}
function shuffle(arr){
  const a=[...arr]
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a
}
function getSFLosers(results){
  const sfWinners=Object.values(results?.sf||{}).filter(Boolean)
  const qfWinners=Object.values(results?.qf||{}).filter(Boolean)
  return qfWinners.filter(t=>!sfWinners.includes(t)).slice(0,2)
}

function simulatePhase(phaseId,currentResults){
  const r=JSON.parse(JSON.stringify(currentResults||{}))
  if(phaseId==='groups'){
    r.groups={}
    Object.entries(GROUPS).forEach(([g,teams])=>{const s=shuffle(teams);r.groups[g]=[s[0],s[1]]})
    return r
  }
  if(phaseId==='r32'){
    if(!r.groups)return r
    const teams=[]
    Object.keys(GROUPS).forEach(g=>{teams.push(r.groups[g]?.[0]||`1º Grupo ${g}`);teams.push(r.groups[g]?.[1]||`2º Grupo ${g}`)})
    for(let i=0;i<8;i++)teams.push(shuffle(Object.values(GROUPS).map(t=>t[2]))[i])
    r.r32={}
    for(let i=0;i<teams.length;i+=2){if(teams[i+1])r.r32[`m${i}`]=shuffle([teams[i],teams[i+1]])[0]}
    return r
  }
  if(phaseId==='r16'){
    if(!r.r32)return r
    const teams=Object.values(r.r32).filter(Boolean);r.r16={}
    for(let i=0;i<teams.length;i+=2){if(teams[i+1])r.r16[`m${i}`]=shuffle([teams[i],teams[i+1]])[0]}
    return r
  }
  if(phaseId==='qf'){
    if(!r.r16)return r
    const teams=Object.values(r.r16).filter(Boolean);r.qf={}
    for(let i=0;i<teams.length;i+=2){if(teams[i+1])r.qf[`m${i}`]=shuffle([teams[i],teams[i+1]])[0]}
    return r
  }
  if(phaseId==='sf'){
    if(!r.qf)return r
    const teams=Object.values(r.qf).filter(Boolean);r.sf={}
    for(let i=0;i<teams.length;i+=2){if(teams[i+1])r.sf[`m${i}`]=shuffle([teams[i],teams[i+1]])[0]}
    return r
  }
  if(phaseId==='third'){
    if(!r.sf||!r.qf)return r
    const losers=Object.values(r.qf).filter(t=>!Object.values(r.sf).includes(t)).slice(0,2)
    r.third={winner:shuffle(losers)[0]||''}
    return r
  }
  if(phaseId==='final'){
    if(!r.sf)return r
    const finalists=shuffle(Object.values(r.sf).filter(Boolean))
    r.final={winner:finalists[0]||'',runnerUp:finalists[1]||''}
    return r
  }
  return r
}

function calcScore(userBets,results,scoring){
  const S={...DEFAULT_SCORING,...scoring}
  let total=0;const breakdown=[]
  if(userBets?.groups&&results?.groups){
    let pts=0
    Object.keys(GROUPS).forEach(g=>{
      const bet=userBets.groups[g]||[],real=results.groups[g]||[]
      if(real.length<2)return
      if(bet[0]&&bet[0]===real[0])pts+=S.groups_first
      else if(bet[1]&&bet[1]===real[1])pts+=S.groups_second
      else{
        if(bet[0]&&real.slice(0,2).includes(bet[0]))pts+=S.groups_qualified
        if(bet[1]&&real.slice(0,2).includes(bet[1]))pts+=S.groups_qualified
      }
    })
    if(pts>0){total+=pts;breakdown.push({label:'Grupos',pts})}
  }
  ;[['r32',S.r32],['r16',S.r16],['qf',S.qf],['sf',S.sf]].forEach(([pid,ppts])=>{
    if(!userBets?.[pid]||!results?.[pid])return
    let pts=0
    Object.keys(results[pid]).forEach(mid=>{if(results[pid][mid]&&userBets[pid][mid]===results[pid][mid])pts+=ppts})
    if(pts>0){total+=pts;breakdown.push({label:PHASES.find(p=>p.id===pid)?.short,pts})}
  })
  if(userBets?.third&&results?.third){
    let pts=0
    if(results.third.winner&&userBets.third.winner===results.third.winner)pts+=S.third
    if(pts>0){total+=pts;breakdown.push({label:'3º/4º',pts})}
  }
  if(userBets?.final&&results?.final){
    let pts=0
    if(results.final.winner&&userBets.final.winner===results.final.winner)pts+=S.final_winner
    if(results.final.runnerUp&&userBets.final.runnerUp===results.final.runnerUp)pts+=S.final_runner
    if(pts>0){total+=pts;breakdown.push({label:'Final',pts})}
  }
  return{total,breakdown}
}

const inp={background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:10,padding:'11px 14px',color:C.text,fontSize:15,width:'100%',outline:'none',fontFamily:'inherit'}
function Input({style,...props}){return<input style={{...inp,...style}}{...props}/>}
function Btn({children,onClick,variant='primary',disabled,small,full,style={}}){
  const base={border:'none',borderRadius:10,cursor:disabled?'not-allowed':'pointer',fontWeight:700,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1,transition:'transform .1s',opacity:disabled?.45:1,padding:small?'7px 16px':'12px 24px',fontSize:small?13:15,width:full?'100%':undefined,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}
  const v={
    primary:{background:`linear-gradient(135deg,${C.accent},${C.accentHover})`,color:'#fff',boxShadow:`0 4px 18px ${C.accent}55`},
    success:{background:`linear-gradient(135deg,${C.green},${C.greenSoft})`,color:'#fff'},
    ghost:{background:'transparent',color:C.textMuted,border:`1px solid ${C.border}`},
    gold:{background:`linear-gradient(135deg,${C.gold},#f5c518)`,color:'#13131a'},
    danger:{background:`linear-gradient(135deg,#7f1010,${C.accent})`,color:'#fff'},
    blue:{background:`linear-gradient(135deg,#1a5ca8,${C.blue})`,color:'#fff'},
  }
  return<button onClick={onClick} disabled={disabled} style={{...base,...v[variant],...style}} onMouseDown={e=>{if(!disabled)e.currentTarget.style.transform='scale(.97)'}} onMouseUp={e=>{e.currentTarget.style.transform='scale(1)'}}>{children}</button>
}
function Card({children,style={},glow}){return<div style={{background:C.surface,border:`1px solid ${glow?C.accent:C.border}`,borderRadius:14,padding:18,boxShadow:glow?`0 0 20px ${C.accent}22`:'none',...style}}>{children}</div>}
function Tag({children,color=C.textMuted}){return<span style={{fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:'uppercase',padding:'3px 9px',borderRadius:20,background:`${color}22`,color,border:`1px solid ${color}44`}}>{children}</span>}

function Logo({small}){
  return(
    <div style={{display:'flex',alignItems:'center',gap:small?8:11,userSelect:'none'}}>
      <div style={{width:small?30:40,height:small?30:40,background:`linear-gradient(135deg,${C.accent},${C.accentHover})`,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:small?15:20,boxShadow:`0 0 16px ${C.accent}44`,flexShrink:0}}>🪟</div>
      <div>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:small?17:22,letterSpacing:2,color:C.text,lineHeight:1}}>La<span style={{color:C.accent}}>V</span>iuda</div>
        <div style={{fontSize:small?9:10,color:C.textMuted,letterSpacing:3,textTransform:'uppercase',lineHeight:1.2}}>World Cup Challenge 2026</div>
      </div>
    </div>
  )
}

function ScoringScreen({scoring}){
  const S={...DEFAULT_SCORING,...scoring}
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text,marginBottom:4}}>Sistema de puntuación</div>
      <div style={{background:`${C.blue}18`,border:`1px solid ${C.blue}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.textMuted}}>
        Los puntos pueden ser modificados por el administrador antes del inicio del torneo.
      </div>
      {[
        {phase:'Fase de Grupos',icon:'⚽',items:[
          {label:'1º clasificado exacto',pts:S.groups_first,color:C.gold},
          {label:'2º clasificado exacto',pts:S.groups_second,color:C.silver},
          {label:'Clasificado (sin orden)',pts:S.groups_qualified,color:C.text},
        ]},
        {phase:'Dieciseisavos de Final',icon:'🔵',items:[{label:'Acertar clasificado',pts:S.r32,color:C.blue}]},
        {phase:'Octavos de Final',icon:'🟡',items:[{label:'Acertar clasificado',pts:S.r16,color:C.gold}]},
        {phase:'Cuartos de Final',icon:'🟠',items:[{label:'Acertar clasificado',pts:S.qf,color:C.accentHover}]},
        {phase:'Semifinales',icon:'🔴',items:[{label:'Acertar clasificado',pts:S.sf,color:C.accent}]},
        {phase:'3er y 4º Puesto',icon:'🥉',items:[{label:'Acertar ganador',pts:S.third,color:C.silver}]},
        {phase:'Final',icon:'🏆',items:[
          {label:'Campeón',pts:S.final_winner,color:C.gold},
          {label:'Subcampeón',pts:S.final_runner,color:C.silver},
        ]},
      ].map((section,i)=>(
        <Card key={i} style={{padding:'14px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <span style={{fontSize:20}}>{section.icon}</span>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text}}>{section.phase}</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {section.items.map((item,j)=>(
              <div key={j} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:C.surfaceHigh,borderRadius:8,padding:'8px 12px'}}>
                <div style={{fontSize:13,color:C.textMuted,flex:1}}>{item.label}</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:18,color:item.color,marginLeft:10}}>+{item.pts}</div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

function Rules(){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text,marginBottom:4}}>Reglas del juego</div>
      {[
        {icon:'📋',title:'¿En qué consiste?',text:'Cada participante hace sus predicciones antes de que empiece cada fase. Cuantos más aciertos, más puntos. Al final del torneo gana quien más puntos haya acumulado.'},
        {icon:'⏳',title:'Plazos',text:'Las apuestas se cierran automáticamente 1 hora antes del primer partido de cada fase. Una vez cerrada la fase, no se pueden modificar las predicciones.'},
        {icon:'📈',title:'Puntuación progresiva',text:'Cada fase vale más puntos que la anterior. La Final tiene tanto peso que cualquiera puede remontar hasta el último momento. Consulta la pestaña Puntos para ver el detalle.'},
        {icon:'💡',title:'Consejos',text:'Las fases eliminatorias dependen de los resultados reales de la fase anterior, así que los enfrentamientos se irán desbloqueando progresivamente. ¡Atentos a los plazos!'},
      ].map((s,i)=>(
        <Card key={i} style={{padding:'14px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <span style={{fontSize:20}}>{s.icon}</span>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text}}>{s.title}</div>
          </div>
          <div style={{fontSize:13,color:C.textMuted,lineHeight:1.6}}>{s.text}</div>
        </Card>
      ))}
    </div>
  )
}

function ProfileScreen({session,onUpdate,onDelete,onBack}){
  const[displayName,setDisplayName]=useState(session.display_name||'')
  const[newPass,setNewPass]=useState('')
  const[confirmDelete,setConfirmDelete]=useState(false)
  const[msg,setMsg]=useState('')
  const[loading,setLoading]=useState(false)
  async function saveProfile(){
    setLoading(true);setMsg('')
    const updates={display_name:displayName.trim()||null}
    if(newPass.length>0&&newPass.length<4){setMsg('⚠ Contraseña mínimo 4 caracteres');setLoading(false);return}
    if(newPass.length>=4)updates.password_hash=hashPassword(newPass)
    const{error}=await supabase.from('porra_users').update(updates).eq('id',session.id)
    if(error){setMsg('❌ Error al guardar');setLoading(false);return}
    const updated={...session,...updates}
    localStorage.setItem('porra_user',JSON.stringify(updated))
    onUpdate(updated);setMsg('✓ Perfil actualizado');setNewPass('');setLoading(false)
  }
  async function deleteAccount(){
    setLoading(true)
    await supabase.from('porra_bets').delete().eq('user_id',session.id)
    await supabase.from('porra_users').delete().eq('id',session.id)
    localStorage.removeItem('porra_user');onDelete()
  }
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',fontSize:20,padding:0}}>←</button>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text}}>Mi perfil</div>
      </div>
      <Card>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><div style={{fontSize:11,color:C.textMuted,marginBottom:6,letterSpacing:1,textTransform:'uppercase'}}>Nombre de usuario</div><div style={{background:C.surfaceHigh,borderRadius:10,padding:'11px 14px',color:C.textDim,fontSize:15}}>{session.name}</div><div style={{fontSize:11,color:C.textDim,marginTop:4}}>El nombre de usuario no se puede cambiar</div></div>
          <div><div style={{fontSize:11,color:C.textMuted,marginBottom:6,letterSpacing:1,textTransform:'uppercase'}}>Nombre para el ranking</div><Input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder={`Por defecto: ${session.name}`}/><div style={{fontSize:11,color:C.textDim,marginTop:4}}>Este es el nombre que verán todos en la clasificación</div></div>
          <div><div style={{fontSize:11,color:C.textMuted,marginBottom:6,letterSpacing:1,textTransform:'uppercase'}}>Nueva contraseña (opcional)</div><Input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="Dejar vacío para no cambiar"/></div>
          {msg&&<div style={{background:msg.startsWith('✓')?`${C.green}22`:`${C.accent}22`,border:`1px solid ${msg.startsWith('✓')?C.green:C.accent}55`,borderRadius:8,padding:'8px 12px',fontSize:13,color:msg.startsWith('✓')?C.greenSoft:C.accentHover,textAlign:'center'}}>{msg}</div>}
          <Btn onClick={saveProfile} disabled={loading} full>{loading?'Guardando…':'💾 Guardar cambios'}</Btn>
        </div>
      </Card>
      <Card style={{borderColor:`${C.accent}44`}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:C.accent,marginBottom:10}}>⚠ Zona peligrosa</div>
        {!confirmDelete?<Btn onClick={()=>setConfirmDelete(true)} variant='danger' full>🗑 Eliminar mi cuenta</Btn>:(
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div style={{fontSize:13,color:C.textMuted,textAlign:'center'}}>¿Seguro? Se borrarán tu cuenta y todas tus apuestas. Esta acción no se puede deshacer.</div>
            <div style={{display:'flex',gap:8}}><Btn onClick={()=>setConfirmDelete(false)} variant='ghost' full>Cancelar</Btn><Btn onClick={deleteAccount} variant='danger' full disabled={loading}>Sí, eliminar</Btn></div>
          </div>
        )}
      </Card>
    </div>
  )
}

function LoginScreen({onLogin}){
  const[tab,setTab]=useState('login')
  const[name,setName]=useState('')
  const[pass,setPass]=useState('')
  const[pass2,setPass2]=useState('')
  const[err,setErr]=useState('')
  const[loading,setLoading]=useState(false)
  async function doLogin(){
    setErr('');setLoading(true)
    const{data,error}=await supabase.from('porra_users').select('*').ilike('name',name.trim()).single()
    if(error||!data){setErr('Usuario no encontrado');setLoading(false);return}
    if(data.password_hash!==hashPassword(pass)){setErr('Contraseña incorrecta');setLoading(false);return}
    localStorage.setItem('porra_user',JSON.stringify(data));onLogin(data);setLoading(false)
  }
  async function doRegister(){
    setErr('');setLoading(true)
    if(!name.trim()){setErr('Escribe tu nombre');setLoading(false);return}
    if(pass.length<4){setErr('Mínimo 4 caracteres');setLoading(false);return}
    if(pass!==pass2){setErr('Las contraseñas no coinciden');setLoading(false);return}
    const{data:existing}=await supabase.from('porra_users').select('id').ilike('name',name.trim()).single()
    if(existing){setErr('Ese nombre ya está en uso');setLoading(false);return}
    const{data,error}=await supabase.from('porra_users').insert({name:name.trim(),password_hash:hashPassword(pass),role:'user'}).select().single()
    if(error){setErr('Error al crear cuenta');setLoading(false);return}
    localStorage.setItem('porra_user',JSON.stringify(data));onLogin(data);setLoading(false)
  }
  const onKey=e=>e.key==='Enter'&&(tab==='login'?doLogin():doRegister())
  return(
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:20,backgroundImage:`radial-gradient(ellipse at 20% 50%,${C.accent}0d 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,${C.blue}0a 0%,transparent 55%)`}}>
      <div style={{width:'100%',maxWidth:400}}>
        <div style={{textAlign:'center',marginBottom:36}}><Logo/><div style={{marginTop:14,fontSize:12,color:C.textMuted,letterSpacing:3,textTransform:'uppercase'}}>Porra de empresa · Mundial 2026</div></div>
        <div style={{display:'flex',gap:4,marginBottom:18,background:C.surface,borderRadius:12,padding:4}}>
          {[['login','Entrar'],['register','Registrarse']].map(([t,l])=><button key={t} onClick={()=>{setTab(t);setErr('')}} style={{flex:1,padding:'9px 0',border:'none',borderRadius:9,cursor:'pointer',background:tab===t?C.accent:'transparent',color:tab===t?'#fff':C.textMuted,fontWeight:800,fontSize:13,letterSpacing:1,textTransform:'uppercase',fontFamily:"'Barlow Condensed',sans-serif",transition:'all .2s'}}>{l}</button>)}
        </div>
        <Card>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div><div style={{fontSize:11,color:C.textMuted,marginBottom:6,letterSpacing:1,textTransform:'uppercase'}}>Nombre</div><Input value={name} onChange={e=>setName(e.target.value)} onKeyDown={onKey} placeholder="Tu nombre"/></div>
            <div><div style={{fontSize:11,color:C.textMuted,marginBottom:6,letterSpacing:1,textTransform:'uppercase'}}>Contraseña</div><Input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={onKey} placeholder="••••••"/></div>
            {tab==='register'&&<div><div style={{fontSize:11,color:C.textMuted,marginBottom:6,letterSpacing:1,textTransform:'uppercase'}}>Repite contraseña</div><Input type="password" value={pass2} onChange={e=>setPass2(e.target.value)} onKeyDown={onKey} placeholder="••••••"/></div>}
            {err&&<div style={{background:`${C.accent}22`,border:`1px solid ${C.accent}55`,borderRadius:8,padding:'8px 12px',fontSize:13,color:C.accentHover,textAlign:'center'}}>⚠ {err}</div>}
            <Btn onClick={tab==='login'?doLogin:doRegister} disabled={loading} full variant={tab==='login'?'primary':'success'}>{loading?'Cargando…':tab==='login'?'⚽ Entrar':'✓ Crear cuenta'}</Btn>
          </div>
        </Card>
        <div style={{textAlign:'center',marginTop:20,fontSize:11,color:C.textDim}}>Los datos se comparten en tiempo real entre todos los participantes</div>
      </div>
    </div>
  )
}

function Leaderboard({users,betsMap,results,scoring,currentUserId}){
  const scored=users.filter(u=>u.role!=='admin').map(u=>{const{total,breakdown}=calcScore(betsMap[u.id]||{},results,scoring);return{...u,total,breakdown}}).sort((a,b)=>b.total-a.total)
  const medals=['🥇','🥈','🥉']
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text,marginBottom:4}}>Clasificación</div>
      {scored.length===0&&<Card><div style={{color:C.textMuted,textAlign:'center',padding:16}}>Nadie ha apostado todavía</div></Card>}
      {scored.map((u,i)=>{
        const display=u.display_name||u.name
        return(
          <div key={u.id} style={{background:u.id===currentUserId?`${C.accent}18`:C.surface,border:`1px solid ${u.id===currentUserId?C.accent:C.border}`,borderRadius:14,padding:'14px 16px',boxShadow:i===0&&u.total>0?`0 0 24px ${C.gold}22`:'none'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{fontSize:22,minWidth:30,textAlign:'center'}}>{medals[i]||<span style={{color:C.textDim,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16}}>{i+1}</span>}</div>
                <div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:18,color:u.id===currentUserId?C.accentHover:C.text}}>{display}{u.id===currentUserId&&<span style={{fontSize:11,color:C.textMuted}}> (tú)</span>}</div>
                  {display!==u.name&&<div style={{fontSize:11,color:C.textDim,marginTop:1}}>@{u.name}</div>}
                  {u.breakdown.length>0&&<div style={{fontSize:11,color:C.textMuted,marginTop:3}}>{u.breakdown.map(b=>`${b.label}: +${b.pts}`).join(' · ')}</div>}
                </div>
              </div>
              <div style={{textAlign:'right',flexShrink:0,marginLeft:8}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:30,color:i===0&&u.total>0?C.gold:C.text,lineHeight:1}}>{u.total}</div>
                <div style={{fontSize:10,color:C.textMuted,letterSpacing:1}}>PTS</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GroupBets({groupBets,onChange,disabled,scoring}){
  const S={...DEFAULT_SCORING,...scoring}
  const[local,setLocal]=useState(groupBets||{})
  useEffect(()=>setLocal(groupBets||{}),[groupBets])
  function handleChange(g,nb){setLocal(prev=>({...prev,[g]:nb}));onChange(g,nb)}
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>🥇 <b style={{color:C.gold}}>1º exacto +{S.groups_first}pts</b> · 🥈 <b style={{color:C.silver}}>2º exacto +{S.groups_second}pts</b> · ✅ Clasificado <b>+{S.groups_qualified}pt</b></div>
      {Object.entries(GROUPS).map(([g,teams])=>{
        const bet=local[g]||['','']
        return(
          <Card key={g} style={{padding:'13px 15px'}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:15,color:C.accent,marginBottom:10,letterSpacing:1.5}}>GRUPO {g}</div>
            {[0,1].map(pos=>(
              <div key={pos} style={{display:'flex',alignItems:'center',gap:8,marginBottom:pos===0?8:0}}>
                <span style={{fontSize:16,minWidth:22}}>{pos===0?'🥇':'🥈'}</span>
                <select disabled={disabled} value={bet[pos]||''} onChange={e=>{const nb=[...bet];nb[pos]=e.target.value;if(pos===0&&nb[1]===e.target.value)nb[1]='';if(pos===1&&nb[0]===e.target.value)nb[0]='';handleChange(g,nb)}} style={{flex:1,background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:bet[pos]?C.text:C.textMuted,fontSize:14,fontFamily:'inherit',cursor:disabled?'not-allowed':'pointer'}}>
                  <option value=''>— {pos===0?'1º':'2º'} clasificado —</option>
                  {teams.map(t=><option key={t} value={t} disabled={pos===1?bet[0]===t:bet[1]===t}>{t}</option>)}
                </select>
              </div>
            ))}
          </Card>
        )
      })}
    </div>
  )
}

function KnockoutBets({phaseId,phaseBets,results,onChange,disabled,scoring}){
  const S={...DEFAULT_SCORING,...scoring}
  const[local,setLocal]=useState(phaseBets||{})
  useEffect(()=>setLocal(phaseBets||{}),[phaseBets])
  function handleChange(mid,team){setLocal(prev=>({...prev,[mid]:team}));onChange(mid,team)}
  function getTeams(){
    if(phaseId==='r32'){const q=[];Object.keys(GROUPS).forEach(g=>{const r=results?.groups?.[g]||[];q.push(r[0]||`1º Grupo ${g}`);q.push(r[1]||`2º Grupo ${g}`)});for(let i=0;i<8;i++)q.push(`Mejor 3º #${i+1}`);return q}
    const prev={r16:'r32',qf:'r16',sf:'qf'}[phaseId]
    return Object.values(results?.[prev]||{}).filter(Boolean)
  }
  const teams=getTeams()
  const matches=[]
  for(let i=0;i<teams.length;i+=2){if(teams[i+1])matches.push({id:`m${i}`,t1:teams[i],t2:teams[i+1]})}
  const pts=S[phaseId]||0
  if(matches.length===0)return<Card><div style={{color:C.textMuted,textAlign:'center',padding:24,fontSize:14}}>Los enfrentamientos se actualizarán cuando termine la fase anterior</div></Card>
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{background:`${C.blue}18`,border:`1px solid ${C.blue}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>✅ Acierto por partido: <b style={{color:'#5bb3f5'}}>+{pts} pts</b></div>
      {matches.map((m,idx)=>{
        const bet=local[m.id]
        return(
          <Card key={m.id} style={{padding:'13px 15px'}}>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:9,letterSpacing:1}}>PARTIDO {idx+1}</div>
            <div style={{display:'flex',gap:8}}>
              {[m.t1,m.t2].map(team=><button key={team} disabled={disabled} onClick={()=>!disabled&&handleChange(m.id,team)} style={{flex:1,padding:'10px 6px',borderRadius:10,cursor:disabled?'not-allowed':'pointer',border:`2px solid ${bet===team?C.green:C.border}`,background:bet===team?`${C.green}22`:C.surfaceHigh,color:bet===team?C.greenSoft:C.text,fontWeight:700,fontSize:13,fontFamily:'inherit',transition:'all .15s',textAlign:'center',wordBreak:'break-word'}}>{bet===team&&'✓ '}{team}</button>)}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function ThirdPlaceBet({thirdBet,results,onChange,disabled,scoring}){
  const S={...DEFAULT_SCORING,...scoring}
  const[local,setLocal]=useState(thirdBet||{})
  useEffect(()=>setLocal(thirdBet||{}),[thirdBet])
  const losers=getSFLosers(results)
  const t1=losers[0]||'Perdedor Semi 1',t2=losers[1]||'Perdedor Semi 2'
  function handleChange(team){setLocal({winner:team});onChange({winner:team})}
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{background:`${C.silver}18`,border:`1px solid ${C.silver}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>🥉 <b style={{color:C.silver}}>Acertar ganador: +{S.third} pts</b></div>
      <Card style={{padding:'13px 15px'}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text,marginBottom:10}}>🥉 ¿Quién gana el 3er puesto?</div>
        {losers.length<2?<div style={{color:C.textMuted,fontSize:13,textAlign:'center',padding:12}}>Los equipos se conocerán tras las Semifinales</div>:(
          <div style={{display:'flex',gap:8}}>
            {[t1,t2].map(team=><button key={team} disabled={disabled} onClick={()=>!disabled&&handleChange(team)} style={{flex:1,padding:'12px 8px',borderRadius:10,cursor:disabled?'not-allowed':'pointer',border:`2px solid ${local.winner===team?C.silver:C.border}`,background:local.winner===team?`${C.silver}22`:C.surfaceHigh,color:local.winner===team?C.silver:C.text,fontWeight:700,fontSize:14,fontFamily:'inherit',transition:'all .15s',textAlign:'center',wordBreak:'break-word'}}>{local.winner===team&&'✓ '}{team}</button>)}
          </div>
        )}
      </Card>
    </div>
  )
}

function FinalBets({finalBet,results,onChange,disabled,scoring}){
  const S={...DEFAULT_SCORING,...scoring}
  const[local,setLocal]=useState(finalBet||{})
  useEffect(()=>setLocal(finalBet||{}),[finalBet])
  const sfW=Object.values(results?.sf||{}).filter(Boolean)
  const finalists=sfW.length>=2?sfW.slice(0,2):['Finalista 1','Finalista 2']
  function handleChange(bet){setLocal(bet);onChange(bet)}
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>🏆 <b style={{color:C.gold}}>Campeón +{S.final_winner}pts</b> · 🥈 <b style={{color:C.silver}}>Subcampeón +{S.final_runner}pts</b></div>
      {[{field:'winner',label:'🏆 Campeón'},{field:'runnerUp',label:'🥈 Subcampeón'}].map(({field,label})=>(
        <Card key={field} style={{padding:'13px 15px'}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text,marginBottom:10}}>{label}</div>
          <div style={{display:'flex',gap:8}}>
            {finalists.map(t=><button key={t} disabled={disabled} onClick={()=>!disabled&&handleChange({...local,[field]:t})} style={{flex:1,padding:'10px 6px',borderRadius:10,cursor:disabled?'not-allowed':'pointer',border:`2px solid ${local[field]===t?C.gold:C.border}`,background:local[field]===t?`${C.gold}22`:C.surfaceHigh,color:local[field]===t?C.gold:C.text,fontWeight:700,fontSize:13,fontFamily:'inherit',transition:'all .15s',textAlign:'center',wordBreak:'break-word'}}>{local[field]===t&&'✓ '}{t}</button>)}
          </div>
        </Card>
      ))}
    </div>
  )
}

function AdminPanel({results,scoring,onSave,onSaveScoring}){
  const[local,setLocal]=useState(JSON.parse(JSON.stringify(results||{})))
  const[localScoring,setLocalScoring]=useState({...DEFAULT_SCORING,...scoring})
  const[activePhase,setActivePhase]=useState('groups')
  const[activeSection,setActiveSection]=useState('sim')
  const[saved,setSaved]=useState(false)
  const[simulating,setSimulating]=useState(null)
  useEffect(()=>setLocal(JSON.parse(JSON.stringify(results||{}))),[results])
  useEffect(()=>setLocalScoring({...DEFAULT_SCORING,...scoring}),[scoring])

  const save=async(data)=>{await onSave(data||local);setSaved(true);setTimeout(()=>setSaved(false),2000)}
  const setGR=(g,pos,val)=>setLocal(r=>{const arr=[...(r?.groups?.[g]||['',''])];arr[pos]=val;return{...r,groups:{...(r.groups||{}),[g]:arr}}})

  async function simPhase(phaseId){
    setSimulating(phaseId)
    const updated=simulatePhase(phaseId,local)
    setLocal(updated);await onSave(updated)
    setSimulating(null);setSaved(true);setTimeout(()=>setSaved(false),2000)
  }
  async function simAll(){
    setSimulating('all')
    let r={}
    for(const p of['groups','r32','r16','qf','sf','third','final'])r=simulatePhase(p,r)
    setLocal(r);await onSave(r)
    setSimulating(null);setSaved(true);setTimeout(()=>setSaved(false),2000)
  }
  async function saveScoring(){
    await onSaveScoring(localScoring)
    setSaved(true);setTimeout(()=>setSaved(false),2000)
  }

  const phaseRequires={groups:null,r32:'groups',r16:'r32',qf:'r16',sf:'qf',third:'sf',final:'sf'}

  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.accent}}>⚙ Panel de Administración</div>

      {/* Section tabs */}
      <div style={{display:'flex',gap:4,background:C.surfaceHigh,borderRadius:10,padding:4}}>
        {[['sim','🎲 Simulador'],['results','📋 Resultados'],['scoring','🏅 Puntuación']].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveSection(id)} style={{flex:1,padding:'8px 4px',border:'none',borderRadius:8,cursor:'pointer',background:activeSection===id?C.accent:'transparent',color:activeSection===id?'#fff':C.textMuted,fontWeight:800,fontSize:12,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:.5}}>{label}</button>
        ))}
      </div>

      {/* Simulador */}
      {activeSection==='sim'&&(
        <Card style={{borderColor:`${C.blue}44`}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:'#5bb3f5',marginBottom:8}}>🎲 Simulador por fases</div>
          <div style={{fontSize:12,color:C.textMuted,marginBottom:12}}>Simula cada fase de forma independiente para probar la app paso a paso.</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {PHASES.map(p=>{
              const req=phaseRequires[p.id]
              const blocked=req&&!local[req]
              return(
                <div key={p.id} style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1,fontSize:13,color:blocked?C.textDim:C.text}}>{p.icon} {p.label}</div>
                  <Btn onClick={()=>!blocked&&simPhase(p.id)} disabled={!!blocked||simulating===p.id} variant='blue' small style={{minWidth:90}}>{simulating===p.id?'…':'🎲 Simular'}</Btn>
                </div>
              )
            })}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:4}}>
              <Btn onClick={simAll} disabled={!!simulating} variant='gold' full>{simulating==='all'?'Simulando todo…':'🎲 Simular competición completa'}</Btn>
            </div>
          </div>
        </Card>
      )}

      {/* Resultados manuales */}
      {activeSection==='results'&&(
        <>
          <div style={{background:`${C.accent}18`,border:`1px solid ${C.accent}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>Introduce los resultados reales para calcular los puntos automáticamente.</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {PHASES.map(p=><button key={p.id} onClick={()=>setActivePhase(p.id)} style={{padding:'6px 16px',borderRadius:20,border:`1px solid ${activePhase===p.id?C.accent:C.border}`,background:activePhase===p.id?C.accent:'transparent',color:activePhase===p.id?'#fff':C.textMuted,cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>{p.short}</button>)}
          </div>
          {activePhase==='groups'&&(
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {Object.entries(GROUPS).map(([g,teams])=>{
                const res=local?.groups?.[g]||['','']
                return(
                  <Card key={g} style={{padding:'12px 15px'}}>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,color:C.accent,marginBottom:8,letterSpacing:1}}>GRUPO {g}</div>
                    {[0,1].map(pos=>(
                      <div key={pos} style={{display:'flex',gap:8,marginBottom:pos===0?6:0,alignItems:'center'}}>
                        <span style={{fontSize:15}}>{pos===0?'🥇':'🥈'}</span>
                        <select value={res[pos]||''} onChange={e=>setGR(g,pos,e.target.value)} style={{flex:1,background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:'7px 10px',color:res[pos]?C.text:C.textMuted,fontSize:13,fontFamily:'inherit'}}>
                          <option value=''>— {pos===0?'1º':'2º'} —</option>
                          {teams.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    ))}
                  </Card>
                )
              })}
            </div>
          )}
          {activePhase!=='groups'&&<Card><div style={{color:C.textMuted,textAlign:'center',padding:20,fontSize:13}}>Los resultados de eliminatorias se generan al simular o al completar la fase anterior.</div></Card>}
          <Btn onClick={()=>save()} variant='success' full>{saved?'✓ Guardado':'💾 Guardar resultados'}</Btn>
        </>
      )}

      {/* Editar puntuación */}
      {activeSection==='scoring'&&(
        <>
          <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.textMuted}}>
            Modifica los puntos de cada fase. Los cambios afectan a todos los participantes en tiempo real.
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {SCORING_LABELS.map(({key,label,icon})=>(
              <div key={key} style={{display:'flex',alignItems:'center',gap:12,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 14px'}}>
                <span style={{fontSize:16,minWidth:22}}>{icon}</span>
                <div style={{flex:1,fontSize:13,color:C.textMuted}}>{label}</div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <button onClick={()=>setLocalScoring(s=>({...s,[key]:Math.max(0,(s[key]||0)-1)}))} style={{width:28,height:28,borderRadius:8,border:`1px solid ${C.border}`,background:C.surfaceHigh,color:C.text,cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>−</button>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:20,color:C.gold,minWidth:30,textAlign:'center'}}>{localScoring[key]||0}</div>
                  <button onClick={()=>setLocalScoring(s=>({...s,[key]:(s[key]||0)+1}))} style={{width:28,height:28,borderRadius:8,border:`1px solid ${C.border}`,background:C.surfaceHigh,color:C.text,cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>+</button>
                </div>
              </div>
            ))}
          </div>
          <Btn onClick={saveScoring} variant='success' full>{saved?'✓ Guardado':'💾 Guardar puntuación'}</Btn>
        </>
      )}
    </div>
  )
}

export default function App(){
  const[session,setSession]=useState(null)
  const[users,setUsers]=useState([])
  const[betsMap,setBetsMap]=useState({})
  const[results,setResults]=useState({})
  const[scoring,setScoring]=useState(DEFAULT_SCORING)
  const[activeTab,setActiveTab]=useState('ranking')
  const[activePhase,setActivePhase]=useState('groups')
  const[saveMsg,setSaveMsg]=useState('')
  const[loaded,setLoaded]=useState(false)
  const[showProfile,setShowProfile]=useState(false)

  useEffect(()=>{const s=localStorage.getItem('porra_user');if(s)try{setSession(JSON.parse(s))}catch{}},[])

  const loadAll=useCallback(async()=>{
    const[{data:ud},{data:bd},{data:rd},{data:cd}]=await Promise.all([
      supabase.from('porra_users').select('id,name,role,display_name'),
      supabase.from('porra_bets').select('user_id,phase,data'),
      supabase.from('porra_results').select('phase,data'),
      supabase.from('porra_config').select('key,value'),
    ])
    setUsers(ud||[])
    const map={};(bd||[]).forEach(b=>{if(!map[b.user_id])map[b.user_id]={};map[b.user_id][b.phase]=b.data});setBetsMap(map)
    const res={};(rd||[]).forEach(r=>{res[r.phase]=r.data});setResults(res)
    const cfg=(cd||[]).find(c=>c.key==='scoring')
    if(cfg)setScoring({...DEFAULT_SCORING,...cfg.value})
    setLoaded(true)
  },[])

  useEffect(()=>{loadAll()},[loadAll])

  useEffect(()=>{
    const ch=supabase.channel('porra-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_bets'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_results'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_users'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_config'},loadAll)
      .subscribe()
    return()=>supabase.removeChannel(ch)
  },[loadAll])

  function notify(msg){setSaveMsg(msg);setTimeout(()=>setSaveMsg(''),2500)}

  async function handleSaveBet(phaseId,phaseData){
    if(!session)return
    setBetsMap(prev=>({...prev,[session.id]:{...(prev[session.id]||{}),[phaseId]:phaseData}}))
    const{error}=await supabase.from('porra_bets').upsert({user_id:session.id,phase:phaseId,data:phaseData,updated_at:new Date().toISOString()},{onConflict:'user_id,phase'})
    if(error){notify('❌ Error al guardar');return}
    notify('✓ Apuesta guardada')
  }

  async function handleSaveResults(newResults){
    setResults(newResults)
    for(const[phase,data]of Object.entries(newResults)){
      await supabase.from('porra_results').upsert({phase,data,updated_at:new Date().toISOString()},{onConflict:'phase'})
    }
    notify('✓ Resultados guardados')
  }

  async function handleSaveScoring(newScoring){
    setScoring(newScoring)
    await supabase.from('porra_config').upsert({key:'scoring',value:newScoring,updated_at:new Date().toISOString()},{onConflict:'key'})
    notify('✓ Puntuación actualizada')
  }

  function handleLogout(){localStorage.removeItem('porra_user');setSession(null)}

  if(!loaded)return(
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:14}}>
      <div style={{fontSize:28}}>⚽</div>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:3,color:C.textMuted,fontSize:14,textTransform:'uppercase'}}>Cargando…</div>
    </div>
  )

  if(!session)return<LoginScreen onLogin={setSession}/>

  if(showProfile)return(
    <div style={{minHeight:'100vh',background:C.bg,paddingBottom:72}}>
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <Logo small/>
        <div style={{fontSize:13,color:C.textMuted}}>{session.display_name||session.name}</div>
      </header>
      <main style={{maxWidth:560,margin:'0 auto',padding:'16px 14px'}}>
        <ProfileScreen session={session} onUpdate={updated=>{setSession(updated);loadAll()}} onDelete={()=>{localStorage.removeItem('porra_user');setSession(null)}} onBack={()=>setShowProfile(false)}/>
      </main>
    </div>
  )

  const userBets=betsMap[session.id]||{}
  const phase=PHASES.find(p=>p.id===activePhase)
  const closed=isClosed(phase?.deadline||'')
  const TABS=[
    {id:'ranking',label:'Ranking',icon:'🏆'},
    {id:'bets',label:'Apuestas',icon:'⚽'},
    {id:'scoring',label:'Puntos',icon:'🏅'},
    {id:'rules',label:'Reglas',icon:'📋'},
    ...(session.role==='admin'?[{id:'admin',label:'Admin',icon:'⚙'}]:[]),
  ]

  return(
    <div style={{minHeight:'100vh',background:C.bg,paddingBottom:72}}>
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <Logo small/>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {saveMsg&&<span style={{fontSize:12,color:saveMsg.startsWith('✓')?C.greenSoft:C.accentHover,fontWeight:600}}>{saveMsg}</span>}
          <button onClick={()=>setShowProfile(true)} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:8,padding:'5px 10px',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
            <div style={{fontSize:13,color:C.text,fontWeight:700,lineHeight:1}}>{session.display_name||session.name}</div>
            {session.display_name&&<div style={{fontSize:10,color:C.textDim,lineHeight:1.3}}>@{session.name}</div>}
          </button>
          <Btn onClick={handleLogout} variant='ghost' small>Salir</Btn>
        </div>
      </header>
      <main style={{maxWidth:560,margin:'0 auto',padding:'16px 14px'}}>
        {activeTab==='ranking'&&<Leaderboard users={users} betsMap={betsMap} results={results} scoring={scoring} currentUserId={session.id}/>}
        {activeTab==='scoring'&&<ScoringScreen scoring={scoring}/>}
        {activeTab==='rules'&&<Rules/>}
        {activeTab==='bets'&&(
          <>
            <div style={{display:'flex',overflowX:'auto',gap:6,marginBottom:16,paddingBottom:4,scrollbarWidth:'none'}}>
              {PHASES.map(p=>{const done=isClosed(p.deadline);return<button key={p.id} onClick={()=>setActivePhase(p.id)} style={{whiteSpace:'nowrap',padding:'6px 14px',borderRadius:20,flexShrink:0,border:`1px solid ${activePhase===p.id?C.accent:C.border}`,background:activePhase===p.id?C.accent:'transparent',color:activePhase===p.id?'#fff':done?C.textDim:C.text,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>{p.icon} {p.short}</button>})}
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text}}>{phase?.label}</div>
              <Tag color={closed?C.accent:C.greenSoft}>{timeLeft(phase?.deadline||'')}</Tag>
            </div>
            {activePhase==='groups'&&<GroupBets groupBets={userBets.groups||{}} onChange={(g,bet)=>handleSaveBet('groups',{...(userBets.groups||{}),[g]:bet})} disabled={closed} scoring={scoring}/>}
            {['r32','r16','qf','sf'].includes(activePhase)&&<KnockoutBets phaseId={activePhase} phaseBets={userBets[activePhase]||{}} results={results} onChange={(mid,team)=>handleSaveBet(activePhase,{...(userBets[activePhase]||{}),[mid]:team})} disabled={closed} scoring={scoring}/>}
            {activePhase==='third'&&<ThirdPlaceBet thirdBet={userBets.third||{}} results={results} onChange={bet=>handleSaveBet('third',bet)} disabled={closed} scoring={scoring}/>}
            {activePhase==='final'&&<FinalBets finalBet={userBets.final||{}} results={results} onChange={bet=>handleSaveBet('final',bet)} disabled={closed} scoring={scoring}/>}
          </>
        )}
        {activeTab==='admin'&&session.role==='admin'&&<AdminPanel results={results} scoring={scoring} onSave={handleSaveResults} onSaveScoring={handleSaveScoring}/>}
      </main>
      <nav style={{position:'fixed',bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'center',zIndex:100}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{flex:1,maxWidth:130,padding:'9px 0 11px',border:'none',background:activeTab===t.id?`${C.accent}1a`:'transparent',color:activeTab===t.id?C.accentHover:C.textMuted,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,borderTop:`2px solid ${activeTab===t.id?C.accent:'transparent'}`,transition:'all .15s'}}>
            <span style={{fontSize:18}}>{t.icon}</span>
            <span style={{fontSize:10,fontWeight:800,letterSpacing:1,fontFamily:"'Barlow Condensed',sans-serif"}}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
