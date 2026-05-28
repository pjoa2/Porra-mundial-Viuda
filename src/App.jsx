import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase.js'

const C = {
  bg:'#13131a',surface:'#1e1e28',surfaceHigh:'#28283a',border:'#35354a',
  accent:'#c0392b',accentHover:'#e74c3c',gold:'#e8a020',silver:'#9aa0b8',
  green:'#1e9e5a',greenSoft:'#27c46e',blue:'#2271c4',text:'#e8e8f2',
  textMuted:'#7878a0',textDim:'#50507a',
}

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
  {id:'r32',label:'Dieciseisavos',short:'1/32',icon:'🔵',deadline:'2026-07-01T17:00:00',pts:2},
  {id:'r16',label:'Octavos de Final',short:'Octavos',icon:'🟡',deadline:'2026-07-05T17:00:00',pts:3},
  {id:'qf',label:'Cuartos de Final',short:'Cuartos',icon:'🟠',deadline:'2026-07-09T17:00:00',pts:4},
  {id:'sf',label:'Semifinales',short:'Semis',icon:'🔴',deadline:'2026-07-13T17:00:00',pts:5},
  {id:'final',label:'Final',short:'Final',icon:'🏆',deadline:'2026-07-18T20:00:00'},
]

function isClosed(d){return new Date()>new Date(d)}
function timeLeft(deadline){
  const diff=new Date(deadline)-new Date()
  if(diff<=0)return'🔒 Cerrado'
  const d=Math.floor(diff/86400000),h=Math.floor((diff%86400000)/3600000),m=Math.floor((diff%3600000)/60000)
  if(d>0)return`⏳ ${d}d ${h}h`
  if(h>0)return`⏳ ${h}h ${m}m`
  return`⏳ ${m}m`
}
function hashPassword(str){
  let hash=5381
  for(let i=0;i<str.length;i++)hash=((hash<<5)+hash)^str.charCodeAt(i)
  return(hash>>>0).toString(16)
}
function calcScore(userBets,results){
  let total=0;const breakdown=[]
  if(userBets?.groups&&results?.groups){
    let pts=0
    Object.keys(GROUPS).forEach(g=>{
      const bet=userBets.groups[g]||[],real=results.groups[g]||[]
      if(real.length<2)return
      if(bet[0]&&bet[0]===real[0])pts+=3
      else if(bet[1]&&bet[1]===real[1])pts+=2
      else{
        if(bet[0]&&real.slice(0,2).includes(bet[0]))pts+=1
        if(bet[1]&&real.slice(0,2).includes(bet[1]))pts+=1
      }
    })
    if(pts>0){total+=pts;breakdown.push({label:'Grupos',pts})}
  }
  ;['r32','r16','qf','sf'].forEach(pid=>{
    const phase=PHASES.find(p=>p.id===pid)
    if(!userBets?.[pid]||!results?.[pid])return
    let pts=0
    Object.keys(results[pid]).forEach(mid=>{
      if(results[pid][mid]&&userBets[pid][mid]===results[pid][mid])pts+=phase.pts
    })
    if(pts>0){total+=pts;breakdown.push({label:phase.short,pts})}
  })
  if(userBets?.final&&results?.final){
    let pts=0
    if(results.final.winner&&userBets.final.winner===results.final.winner)pts+=10
    if(results.final.runnerUp&&userBets.final.runnerUp===results.final.runnerUp)pts+=5
    if(results.final.third&&userBets.final.third===results.final.third)pts+=5
    if(pts>0){total+=pts;breakdown.push({label:'Final',pts})}
  }
  return{total,breakdown}
}

const inp={background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:10,padding:'11px 14px',color:C.text,fontSize:15,width:'100%',outline:'none',fontFamily:'inherit'}
function Input({style,...props}){return<input style={{...inp,...style}}{...props}/>}
function Btn({children,onClick,variant='primary',disabled,small,full,style={}}){
  const base={border:'none',borderRadius:10,cursor:disabled?'not-allowed':'pointer',fontWeight:700,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1,transition:'transform .1s',opacity:disabled?.45:1,padding:small?'7px 16px':'12px 24px',fontSize:small?13:15,width:full?'100%':undefined,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}
  const v={primary:{background:`linear-gradient(135deg,${C.accent},${C.accentHover})`,color:'#fff',boxShadow:`0 4px 18px ${C.accent}55`},success:{background:`linear-gradient(135deg,${C.green},${C.greenSoft})`,color:'#fff'},ghost:{background:'transparent',color:C.textMuted,border:`1px solid ${C.border}`},gold:{background:`linear-gradient(135deg,${C.gold},#f5c518)`,color:'#13131a'}}
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
          {[['login','Entrar'],['register','Registrarse']].map(([t,l])=>(
            <button key={t} onClick={()=>{setTab(t);setErr('')}} style={{flex:1,padding:'9px 0',border:'none',borderRadius:9,cursor:'pointer',background:tab===t?C.accent:'transparent',color:tab===t?'#fff':C.textMuted,fontWeight:800,fontSize:13,letterSpacing:1,textTransform:'uppercase',fontFamily:"'Barlow Condensed',sans-serif",transition:'all .2s'}}>{l}</button>
          ))}
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

function Leaderboard({users,betsMap,results,currentUserId}){
  const scored=users.filter(u=>u.role!=='admin').map(u=>{const{total,breakdown}=calcScore(betsMap[u.id]||{},results);return{...u,total,breakdown}}).sort((a,b)=>b.total-a.total)
  const medals=['🥇','🥈','🥉']
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text,marginBottom:4}}>Clasificación</div>
      {scored.length===0&&<Card><div style={{color:C.textMuted,textAlign:'center',padding:16}}>Nadie ha apostado todavía</div></Card>}
      {scored.map((u,i)=>(
        <div key={u.id} style={{background:u.id===currentUserId?`${C.accent}18`:C.surface,border:`1px solid ${u.id===currentUserId?C.accent:C.border}`,borderRadius:14,padding:'14px 16px',boxShadow:i===0&&u.total>0?`0 0 24px ${C.gold}22`:'none'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{fontSize:22,minWidth:30,textAlign:'center'}}>{medals[i]||<span style={{color:C.textDim,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16}}>{i+1}</span>}</div>
              <div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:18,color:u.id===currentUserId?C.accentHover:C.text}}>{u.name}{u.id===currentUserId&&<span style={{fontSize:11,color:C.textMuted}}> (tú)</span>}</div>
                {u.breakdown.length>0&&<div style={{fontSize:11,color:C.textMuted,marginTop:3}}>{u.breakdown.map(b=>`${b.label}: +${b.pts}`).join(' · ')}</div>}
              </div>
            </div>
            <div style={{textAlign:'right',flexShrink:0,marginLeft:8}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:30,color:i===0&&u.total>0?C.gold:C.text,lineHeight:1}}>{u.total}</div>
              <div style={{fontSize:10,color:C.textMuted,letterSpacing:1}}>PTS</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function GroupBets({groupBets,onChange,disabled}){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>🥇 <b style={{color:C.gold}}>1º exacto +3pts</b> · 🥈 <b style={{color:C.silver}}>2º exacto +2pts</b> · ✅ Clasificado <b>+1pt</b></div>
      {Object.entries(GROUPS).map(([g,teams])=>{
        const bet=groupBets?.[g]||['','']
        return(
          <Card key={g} style={{padding:'13px 15px'}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:15,color:C.accent,marginBottom:10,letterSpacing:1.5}}>GRUPO {g}</div>
            {[0,1].map(pos=>(
              <div key={pos} style={{display:'flex',alignItems:'center',gap:8,marginBottom:pos===0?8:0}}>
                <span style={{fontSize:16,minWidth:22}}>{pos===0?'🥇':'🥈'}</span>
                <select disabled={disabled} value={bet[pos]||''} onChange={e=>{const nb=[...bet];nb[pos]=e.target.value;if(pos===0&&nb[1]===e.target.value)nb[1]='';if(pos===1&&nb[0]===e.target.value)nb[0]='';onChange(g,nb)}} style={{flex:1,background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:bet[pos]?C.text:C.textMuted,fontSize:14,fontFamily:'inherit',cursor:disabled?'not-allowed':'pointer'}}>
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

function KnockoutBets({phaseId,phaseBets,results,onChange,disabled}){
  const phase=PHASES.find(p=>p.id===phaseId)
  function getTeams(){
    if(phaseId==='r32'){const q=[];Object.keys(GROUPS).forEach(g=>{const r=results?.groups?.[g]||[];q.push(r[0]||`1º Grupo ${g}`);q.push(r[1]||`2º Grupo ${g}`)});for(let i=0;i<8;i++)q.push(`Mejor 3º #${i+1}`);return q}
    const prev={r16:'r32',qf:'r16',sf:'qf'}[phaseId]
    return Object.values(results?.[prev]||{}).filter(Boolean)
  }
  const teams=getTeams()
  const matches=[]
  for(let i=0;i<teams.length;i+=2){if(teams[i+1])matches.push({id:`m${i}`,t1:teams[i],t2:teams[i+1]})}
  if(matches.length===0)return<Card><div style={{color:C.textMuted,textAlign:'center',padding:24,fontSize:14}}>Los enfrentamientos se actualizarán cuando termine la fase anterior</div></Card>
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{background:`${C.blue}18`,border:`1px solid ${C.blue}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>✅ Acierto por partido: <b style={{color:'#5bb3f5'}}>+{phase?.pts} pts</b></div>
      {matches.map((m,idx)=>{
        const bet=phaseBets?.[m.id]
        return(
          <Card key={m.id} style={{padding:'13px 15px'}}>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:9,letterSpacing:1}}>PARTIDO {idx+1}</div>
            <div style={{display:'flex',gap:8}}>
              {[m.t1,m.t2].map(team=>(
                <button key={team} disabled={disabled} onClick={()=>!disabled&&onChange(m.id,team)} style={{flex:1,padding:'10px 6px',borderRadius:10,cursor:disabled?'not-allowed':'pointer',border:`2px solid ${bet===team?C.green:C.border}`,background:bet===team?`${C.green}22`:C.surfaceHigh,color:bet===team?C.greenSoft:C.text,fontWeight:700,fontSize:13,fontFamily:'inherit',transition:'all .15s',textAlign:'center',wordBreak:'break-word'}}>{bet===team&&'✓ '}{team}</button>
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function FinalBets({finalBet,results,onChange,disabled}){
  const sfW=Object.values(results?.sf||{}).filter(Boolean)
  const finalists=sfW.length>=2?sfW.slice(0,2):['Finalista 1','Finalista 2']
  const semilosers=sfW.length>=4?sfW.slice(2,4):['Semifinalista 3','Semifinalista 4']
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>🏆 <b style={{color:C.gold}}>Campeón +10pts</b> · 🥈 <b style={{color:C.silver}}>Subcampeón +5pts</b> · 🥉 <b>3er puesto +5pts</b></div>
      {[{field:'winner',label:'🏆 Campeón',teams:finalists},{field:'runnerUp',label:'🥈 Subcampeón',teams:finalists},{field:'third',label:'🥉 3er Puesto',teams:semilosers}].map(({field,label,teams})=>(
        <Card key={field} style={{padding:'13px 15px'}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text,marginBottom:10}}>{label}</div>
          <div style={{display:'flex',gap:8}}>
            {teams.map(t=><button key={t} disabled={disabled} onClick={()=>!disabled&&onChange({...finalBet,[field]:t})} style={{flex:1,padding:'10px 6px',borderRadius:10,cursor:disabled?'not-allowed':'pointer',border:`2px solid ${finalBet?.[field]===t?C.gold:C.border}`,background:finalBet?.[field]===t?`${C.gold}22`:C.surfaceHigh,color:finalBet?.[field]===t?C.gold:C.text,fontWeight:700,fontSize:13,fontFamily:'inherit',transition:'all .15s',textAlign:'center',wordBreak:'break-word'}}>{finalBet?.[field]===t&&'✓ '}{t}</button>)}
          </div>
        </Card>
      ))}
    </div>
  )
}

function AdminPanel({results,onSave}){
  const[local,setLocal]=useState(JSON.parse(JSON.stringify(results||{})))
  const[activePhase,setActivePhase]=useState('groups')
  const[saved,setSaved]=useState(false)
  const save=async()=>{await onSave(local);setSaved(true);setTimeout(()=>setSaved(false),2000)}
  const setGR=(g,pos,val)=>setLocal(r=>{const arr=[...(r?.groups?.[g]||['',''])];arr[pos]=val;return{...r,groups:{...(r.groups||{}),[g]:arr}}})
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.accent}}>⚙ Panel de Administración</div>
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
      {activePhase!=='groups'&&<Card><div style={{color:C.textMuted,textAlign:'center',padding:20,fontSize:13}}>Los resultados de eliminatorias se añaden al completar la fase anterior.</div></Card>}
      <Btn onClick={save} variant='success' full>{saved?'✓ Guardado':'💾 Guardar resultados'}</Btn>
    </div>
  )
}

export default function App(){
  const[session,setSession]=useState(null)
  const[users,setUsers]=useState([])
  const[betsMap,setBetsMap]=useState({})
  const[results,setResults]=useState({})
  const[activeTab,setActiveTab]=useState('ranking')
  const[activePhase,setActivePhase]=useState('groups')
  const[saveMsg,setSaveMsg]=useState('')
  const[loaded,setLoaded]=useState(false)

  useEffect(()=>{const s=localStorage.getItem('porra_user');if(s)try{setSession(JSON.parse(s))}catch{}},[])

  const loadAll=useCallback(async()=>{
    const[{data:ud},{data:bd},{data:rd}]=await Promise.all([
      supabase.from('porra_users').select('id,name,role'),
      supabase.from('porra_bets').select('user_id,phase,data'),
      supabase.from('porra_results').select('phase,data'),
    ])
    setUsers(ud||[])
    const map={};(bd||[]).forEach(b=>{if(!map[b.user_id])map[b.user_id]={};map[b.user_id][b.phase]=b.data});setBetsMap(map)
    const res={};(rd||[]).forEach(r=>{res[r.phase]=r.data});setResults(res)
    setLoaded(true)
  },[])

  useEffect(()=>{loadAll()},[loadAll])

  useEffect(()=>{
    const ch=supabase.channel('porra-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_bets'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_results'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_users'},loadAll)
      .subscribe()
    return()=>supabase.removeChannel(ch)
  },[loadAll])

  function notify(msg){setSaveMsg(msg);setTimeout(()=>setSaveMsg(''),2500)}

  async function handleSaveBet(phaseId,phaseData){
    if(!session)return
    const{error}=await supabase.from('porra_bets').upsert({user_id:session.id,phase:phaseId,data:phaseData,updated_at:new Date().toISOString()},{onConflict:'user_id,phase'})
    if(error){notify('❌ Error al guardar');return}
    notify('✓ Apuesta guardada')
  }

  async function handleSaveResults(newResults){
    for(const[phase,data]of Object.entries(newResults)){
      await supabase.from('porra_results').upsert({phase,data,updated_at:new Date().toISOString()},{onConflict:'phase'})
    }
    notify('✓ Resultados guardados')
  }

  function handleLogout(){localStorage.removeItem('porra_user');setSession(null)}

  if(!loaded)return(
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:14}}>
      <div style={{fontSize:28}}>⚽</div>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:3,color:C.textMuted,fontSize:14,textTransform:'uppercase'}}>Cargando…</div>
    </div>
  )

  if(!session)return<LoginScreen onLogin={setSession}/>

  const userBets=betsMap[session.id]||{}
  const phase=PHASES.find(p=>p.id===activePhase)
  const closed=isClosed(phase?.deadline||'')
  const TABS=[{id:'ranking',label:'Ranking',icon:'🏆'},{id:'bets',label:'Mis apuestas',icon:'⚽'},...(session.role==='admin'?[{id:'admin',label:'Admin',icon:'⚙'}]:[])]

  return(
    <div style={{minHeight:'100vh',background:C.bg,paddingBottom:72}}>
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <Logo small/>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {saveMsg&&<span style={{fontSize:12,color:saveMsg.startsWith('✓')?C.greenSoft:C.accentHover,fontWeight:600}}>{saveMsg}</span>}
          <div style={{fontSize:13,color:C.textMuted,maxWidth:80,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session.name}</div>
          <Btn onClick={handleLogout} variant='ghost' small>Salir</Btn>
        </div>
      </header>
      <main style={{maxWidth:560,margin:'0 auto',padding:'16px 14px'}}>
        {activeTab==='ranking'&&<Leaderboard users={users} betsMap={betsMap} results={results} currentUserId={session.id}/>}
        {activeTab==='bets'&&(
          <>
            <div style={{display:'flex',overflowX:'auto',gap:6,marginBottom:16,paddingBottom:4,scrollbarWidth:'none'}}>
              {PHASES.map(p=>{const done=isClosed(p.deadline);return<button key={p.id} onClick={()=>setActivePhase(p.id)} style={{whiteSpace:'nowrap',padding:'6px 14px',borderRadius:20,flexShrink:0,border:`1px solid ${activePhase===p.id?C.accent:C.border}`,background:activePhase===p.id?C.accent:'transparent',color:activePhase===p.id?'#fff':done?C.textDim:C.text,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>{p.icon} {p.short}</button>})}
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text}}>{phase?.label}</div>
              <Tag color={closed?C.accent:C.greenSoft}>{timeLeft(phase?.deadline||'')}</Tag>
            </div>
            {activePhase==='groups'&&<GroupBets groupBets={userBets.groups||{}} onChange={(g,bet)=>handleSaveBet('groups',{...(userBets.groups||{}),[g]:bet})} disabled={closed}/>}
            {['r32','r16','qf','sf'].includes(activePhase)&&<KnockoutBets phaseId={activePhase} phaseBets={userBets[activePhase]||{}} results={results} onChange={(mid,team)=>handleSaveBet(activePhase,{...(userBets[activePhase]||{}),[mid]:team})} disabled={closed}/>}
            {activePhase==='final'&&<FinalBets finalBet={userBets.final||{}} results={results} onChange={bet=>handleSaveBet('final',bet)} disabled={closed}/>}
          </>
        )}
        {activeTab==='admin'&&session.role==='admin'&&<AdminPanel results={results} onSave={handleSaveResults}/>}
      </main>
      <nav style={{position:'fixed',bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'center',zIndex:100}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{flex:1,maxWidth:180,padding:'9px 0 11px',border:'none',background:activeTab===t.id?`${C.accent}1a`:'transparent',color:activeTab===t.id?C.accentHover:C.textMuted,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,borderTop:`2px solid ${activeTab===t.id?C.accent:'transparent'}`,transition:'all .15s'}}>
            <span style={{fontSize:18}}>{t.icon}</span>
            <span style={{fontSize:10,fontWeight:800,letterSpacing:1,fontFamily:"'Barlow Condensed',sans-serif"}}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
