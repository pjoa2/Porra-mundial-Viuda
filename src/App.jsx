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
  {id:'r32',label:'Dieciseisavos de Final',short:'1/16F',icon:'🔵',deadline:'2026-07-01T17:00:00',pts:2},
  {id:'r16',label:'Octavos de Final',short:'Octavos',icon:'🟡',deadline:'2026-07-05T17:00:00',pts:3},
  {id:'qf',label:'Cuartos de Final',short:'Cuartos',icon:'🟠',deadline:'2026-07-09T17:00:00',pts:4},
  {id:'sf',label:'Semifinales',short:'Semis',icon:'🔴',deadline:'2026-07-13T17:00:00',pts:5},
  {id:'final',label:'Final',short:'Final',icon:'🏆',deadline:'2026-07-18T20:00:00'},
]

function isClosed(d){return new Date()>new Date(d)}

function timeLeft(deadline){
  const diff=new Date(deadline)-new Date()
  if(diff<=0)return'🔒 Cerrado'
  const days=Math.floor(diff/86400000)
  const hours=Math.floor((diff%86400000)/3600000)
  const mins=Math.floor((diff%3600000)/60000)
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

function generateRandomResults(){
  const results={}
  // Groups
  results.groups={}
  Object.entries(GROUPS).forEach(([g,teams])=>{
    const s=shuffle(teams)
    results.groups[g]=[s[0],s[1]]
  })
  // Build r32 teams (24 group qualifiers + 8 best 3rd)
  const r32teams=[]
  Object.keys(GROUPS).forEach(g=>{
    r32teams.push(results.groups[g][0])
    r32teams.push(results.groups[g][1])
  })
  for(let i=0;i<8;i++)r32teams.push(shuffle(Object.values(GROUPS).map(t=>t[2]))[i])
  // r32
  results.r32={}
  for(let i=0;i<r32teams.length;i+=2){
    if(r32teams[i+1])results.r32[`m${i}`]=shuffle([r32teams[i],r32teams[i+1]])[0]
  }
  // r16
  const r16teams=Object.values(results.r32)
  results.r16={}
  for(let i=0;i<r16teams.length;i+=2){
    if(r16teams[i+1])results.r16[`m${i}`]=shuffle([r16teams[i],r16teams[i+1]])[0]
  }
  // qf
  const qfteams=Object.values(results.r16)
  results.qf={}
  for(let i=0;i<qfteams.length;i+=2){
    if(qfteams[i+1])results.qf[`m${i}`]=shuffle([qfteams[i],qfteams[i+1]])[0]
  }
  // sf
  const sfteams=Object.values(results.qf)
  results.sf={}
  for(let i=0;i<sfteams.length;i+=2){
    if(sfteams[i+1])results.sf[`m${i}`]=shuffle([sfteams[i],sfteams[i+1]])[0]
  }
  // final
  const sfwinners=Object.values(results.sf)
  const sflosers=Object.values(results.qf).filter(t=>!sfwinners.includes(t)).slice(0,2)
  const finalists=shuffle(sfwinners)
  results.final={
    winner:finalists[0],
    runnerUp:finalists[1],
    third:shuffle(sflosers)[0]||sfteams[0]||'',
  }
  return results
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
  const v={
    primary:{background:`linear-gradient(135deg,${C.accent},${C.accentHover})`,color:'#fff',boxShadow:`0 4px 18px ${C.accent}55`},
    success:{background:`linear-gradient(135deg,${C.green},${C.greenSoft})`,color:'#fff'},
    ghost:{background:'transparent',color:C.textMuted,border:`1px solid ${C.border}`},
    gold:{background:`linear-gradient(135deg,${C.gold},#f5c518)`,color:'#13131a'},
    danger:{background:`linear-gradient(135deg,#7f1010,${C.accent})`,color:'#fff'},
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

function Rules(){
  const sections=[
    {icon:'📋',title:'¿En qué consiste?',text:'Cada participante hace sus predicciones antes de que empiece cada fase. Cuantos más aciertos, más puntos. Al final del torneo gana quien más puntos haya acumulado.'},
    {icon:'⏳',title:'Plazos',text:'Las apuestas se cierran automáticamente 1 hora antes del primer partido de cada fase. Una vez cerrada la fase, no se pueden modificar las predicciones.'},
    {icon:'⚽',title:'Fase de Grupos',content:[
      {label:'1º clasificado exacto',pts:'+3 pts',color:C.gold},
      {label:'2º clasificado exacto',pts:'+2 pts',color:C.silver},
      {label:'Equipo clasificado (sin importar orden)',pts:'+1 pt',color:C.text},
    ]},
    {icon:'🔵',title:'Dieciseisavos de Final',content:[{label:'Acertar el clasificado de cada partido',pts:'+2 pts',color:C.blue}]},
    {icon:'🟡',title:'Octavos de Final',content:[{label:'Acertar el clasificado de cada partido',pts:'+3 pts',color:C.gold}]},
    {icon:'🟠',title:'Cuartos de Final',content:[{label:'Acertar el clasificado de cada partido',pts:'+4 pts',color:C.accentHover}]},
    {icon:'🔴',title:'Semifinales',content:[{label:'Acertar el clasificado de cada partido',pts:'+5 pts',color:C.accent}]},
    {icon:'🏆',title:'Final',content:[
      {label:'Campeón del mundo',pts:'+10 pts',color:C.gold},
      {label:'Subcampeón',pts:'+5 pts',color:C.silver},
      {label:'3er puesto',pts:'+5 pts',color:C.text},
    ]},
    {icon:'💡',title:'Consejos',text:'Las fases eliminatorias dependen de los resultados reales de la fase anterior, así que los enfrentamientos se irán desbloqueando progresivamente. ¡Atentos a los plazos!'},
  ]
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text,marginBottom:4}}>Reglas del juego</div>
      {sections.map((s,i)=>(
        <Card key={i} style={{padding:'14px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:s.text||s.content?10:0}}>
            <span style={{fontSize:20}}>{s.icon}</span>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text}}>{s.title}</div>
          </div>
          {s.text&&<div style={{fontSize:13,color:C.textMuted,lineHeight:1.6}}>{s.text}</div>}
          {s.content&&(
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {s.content.map((c,j)=>(
                <div key={j} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:C.surfaceHigh,borderRadius:8,padding:'8px 12px'}}>
                  <div style={{fontSize:13,color:C.textMuted,flex:1}}>{c.label}</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:16,color:c.color,marginLeft:10}}>{c.pts}</div>
                </div>
              ))}
            </div>
          )}
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
  const[loading,setLoading]=useSt

