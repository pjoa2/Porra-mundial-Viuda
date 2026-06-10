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
  {key:'groups_first',   label:'Grupos — 1º exacto',       icon:'⚽'},
  {key:'groups_second',  label:'Grupos — 2º exacto',       icon:'⚽'},
  {key:'groups_qualified',label:'Grupos — Clasificado',    icon:'⚽'},
  {key:'r32',            label:'Dieciseisavos — Acierto',  icon:'🔵'},
  {key:'r16',            label:'Octavos — Acierto',        icon:'🟡'},
  {key:'qf',             label:'Cuartos — Acierto',        icon:'🟠'},
  {key:'sf',             label:'Semis — Acierto',          icon:'🔴'},
  {key:'third',          label:'3º/4º — Ganador',          icon:'🥉'},
  {key:'final_winner',   label:'Final — Campeón',          icon:'🏆'},
  {key:'final_runner',   label:'Final — Subcampeón',       icon:'🥈'},
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

const PHASE_MATCH_COUNT = {r32:16,r16:8,qf:4,sf:2,third:1,final:1}

const DEFAULT_PHASES = [
  {id:'groups',label:'Fase de Grupos',short:'Grupos',icon:'⚽',start:'2026-06-12T18:00:00'},
  {id:'r32',label:'Dieciseisavos de Final',short:'1/16F',icon:'🔵',start:'2026-07-02T18:00:00'},
  {id:'r16',label:'Octavos de Final',short:'Octavos',icon:'🟡',start:'2026-07-06T18:00:00'},
  {id:'qf',label:'Cuartos de Final',short:'Cuartos',icon:'🟠',start:'2026-07-10T18:00:00'},
  {id:'sf',label:'Semifinales',short:'Semis',icon:'🔴',start:'2026-07-14T18:00:00'},
  {id:'third',label:'3er y 4º Puesto',short:'3º/4º',icon:'🥉',start:'2026-07-18T18:00:00'},
  {id:'final',label:'Final',short:'Final',icon:'🏆',start:'2026-07-19T21:00:00'},
]

// Deadline = 1h before start
function getDeadline(start){
  const d=new Date(start);d.setHours(d.getHours()-1);return d.toISOString()
}
function isClosed(start){return new Date()>new Date(getDeadline(start))}
function timeLeft(start){
  const diff=new Date(getDeadline(start))-new Date()
  if(diff<=0)return'🔒 Cerrado'
  const days=Math.floor(diff/86400000),hours=Math.floor((diff%86400000)/3600000),mins=Math.floor((diff%3600000)/60000)
  if(days>0)return`⏳ ${days}d ${hours}h`
  if(hours>0)return`⏳ ${hours}h ${mins}m`
  return`⏳ ${mins}m`
}
function formatDatetimeLocal(iso){
  if(!iso)return''
  const d=new Date(iso)
  const pad=n=>String(n).padStart(2,'0')
  return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function hashPassword(str){
  let hash=5381
  for(let i=0;i<str.length;i++)hash=((hash<<5)+hash)^str.charCodeAt(i)
  return(hash>>>0).toString(16)
}
function shuffle(arr){
  const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]};return a
}
function getSFLosers(results,matches){
  const sfMatches=matches?.sf||[]
  const sfWinners=sfMatches.map(m=>results?.sf?.[m.id]).filter(Boolean)
  return sfMatches.map(m=>sfWinners.includes(m.t1)?m.t2:sfWinners.includes(m.t2)?m.t1:null).filter(Boolean).slice(0,2)
}
function isPhaseComplete(phaseId,results,matches){
  if(phaseId==='groups'){const r=results?.groups||{};return Object.keys(GROUPS).every(g=>r[g]&&r[g][0]&&r[g][1])}
  const phaseMatches=matches?.[phaseId]||[],phaseResults=results?.[phaseId]||{}
  if(phaseMatches.length===0)return false
  return phaseMatches.every(m=>phaseResults[m.id]||(phaseId==='final'&&phaseResults[m.id+'_winner']))
}
function isPhaseVisible(phaseId,results,matches,phases){
  const p=(phases||DEFAULT_PHASES).find(ph=>ph.id===phaseId)
  if(p&&isClosed(p.start))return true
  return isPhaseComplete(phaseId,results,matches)
}
function isPhaseUnlocked(phaseId,results,matches){
  if(phaseId==='groups')return true
  const prev={r32:'groups',r16:'r32',qf:'r16',sf:'qf',third:'sf',final:'sf'}[phaseId]
  if(!isPhaseComplete(prev,results,matches))return false
  if(phaseId==='third'){return getSFLosers(results,matches).length>=2}
  if(phaseId==='final'){const sfMatches=matches?.sf||[];const sfResults=results?.sf||{};return sfMatches.length>0&&sfMatches.every(m=>sfResults[m.id])}
  return(matches?.[phaseId]||[]).length>0
}

function generateSimMatches(phaseId,results,matches){
  const newMatches={...matches}
  if(phaseId==='r32'){
    const teams=[]
    Object.keys(GROUPS).forEach(g=>{teams.push(results?.groups?.[g]?.[0]||`1º G${g}`);teams.push(results?.groups?.[g]?.[1]||`2º G${g}`)})
    const thirds=Object.keys(GROUPS).slice(0,8).map(g=>results?.groups?.[g]?.[2]||`3º G${g}`)
    const all=shuffle([...teams,...thirds.slice(0,8)])
    const ms=[];for(let i=0;i<Math.min(all.length,32);i+=2){if(all[i+1])ms.push({id:`m${i}`,t1:all[i],t2:all[i+1]})}
    newMatches.r32=ms;return newMatches
  }
  const prevMap={r16:'r32',qf:'r16',sf:'qf'}
  const prev=prevMap[phaseId]
  if(prev){
    const prevMatches=newMatches[prev]||[],prevResults=results?.[prev]||{}
    const winners=prevMatches.map(m=>prevResults[m.id]).filter(Boolean)
    const ms=[];for(let i=0;i<winners.length;i+=2){if(winners[i+1])ms.push({id:`m${i}`,t1:winners[i],t2:winners[i+1]})}
    newMatches[phaseId]=ms;return newMatches
  }
  if(phaseId==='third'){
    const losers=getSFLosers(results,newMatches)
    if(losers.length>=2)newMatches.third=[{id:'m0',t1:losers[0],t2:losers[1]}]
    return newMatches
  }
  if(phaseId==='final'){
    const sfMatches=newMatches.sf||[],sfResults=results?.sf||{}
    const winners=sfMatches.map(m=>sfResults[m.id]).filter(Boolean)
    if(winners.length>=2)newMatches.final=[{id:'m0',t1:winners[0],t2:winners[1]}]
    return newMatches
  }
  return newMatches
}

function simulatePhaseResults(phaseId,currentResults,matches){
  const r=JSON.parse(JSON.stringify(currentResults||{}))
  if(phaseId==='groups'){r.groups={};Object.entries(GROUPS).forEach(([g,teams])=>{const s=shuffle(teams);r.groups[g]=[s[0],s[1]]});return r}
  const phaseMatches=matches?.[phaseId]||[];if(phaseMatches.length===0)return r
  r[phaseId]={}
  phaseMatches.forEach(m=>{r[phaseId][m.id]=shuffle([m.t1,m.t2])[0]})
  return r
}

function calcScore(userBets,results,matches,scoring){
  const S={...DEFAULT_SCORING,...scoring};let total=0;const breakdown=[]
  if(userBets?.groups&&results?.groups){
    let pts=0
    Object.keys(GROUPS).forEach(g=>{
      const bet=userBets.groups[g]||[],real=results.groups[g]||[]
      if(real.length<2)return
      if(bet[0]&&bet[0]===real[0])pts+=S.groups_first
      else if(bet[1]&&bet[1]===real[1])pts+=S.groups_second
      else{if(bet[0]&&real.slice(0,2).includes(bet[0]))pts+=S.groups_qualified;if(bet[1]&&real.slice(0,2).includes(bet[1]))pts+=S.groups_qualified}
    })
    if(pts>0){total+=pts;breakdown.push({label:'Grupos',pts})}
  }
  ;[['r32',S.r32],['r16',S.r16],['qf',S.qf],['sf',S.sf]].forEach(([pid,ppts])=>{
    if(!userBets?.[pid]||!results?.[pid])return
    let pts=0;const phaseMatches=matches?.[pid]||[]
    phaseMatches.forEach(m=>{if(results[pid][m.id]&&userBets[pid][m.id]===results[pid][m.id])pts+=ppts})
    if(pts>0){total+=pts;breakdown.push({label:DEFAULT_PHASES.find(p=>p.id===pid)?.short,pts})}
  })
  if(userBets?.third&&results?.third){
    const tm=(matches?.third||[])[0]
    if(tm){const bet=userBets.third[tm.id],real=results.third[tm.id];if(bet&&real&&bet===real){total+=S.third;breakdown.push({label:'3º/4º',pts:S.third})}}
  }
  if(userBets?.final&&results?.final){
    const fm=(matches?.final||[])[0]
    if(fm){
      let pts=0
      if(userBets.final[fm.id+'_winner']&&results.final[fm.id+'_winner']&&userBets.final[fm.id+'_winner']===results.final[fm.id+'_winner'])pts+=S.final_winner
      if(userBets.final[fm.id+'_runner']&&results.final[fm.id+'_runner']&&userBets.final[fm.id+'_runner']===results.final[fm.id+'_runner'])pts+=S.final_runner
      if(pts>0){total+=pts;breakdown.push({label:'Final',pts})}
    }
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

function PendingScreen({user,onLogout}){
  return(
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{maxWidth:400,width:'100%',textAlign:'center',display:'flex',flexDirection:'column',gap:20}}>
        <Logo/>
        <Card style={{padding:28}}>
          <div style={{fontSize:40,marginBottom:16}}>⏳</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text,marginBottom:10}}>Cuenta pendiente</div>
          <div style={{fontSize:14,color:C.textMuted,lineHeight:1.6,marginBottom:20}}>Hola <b style={{color:C.text}}>{user.display_name||user.name}</b>, tu cuenta está pendiente de aprobación. En cuanto el administrador te apruebe podrás acceder.</div>
          <Btn onClick={onLogout} variant='ghost' full>Cerrar sesión</Btn>
        </Card>
      </div>
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

function KnockoutBets({phaseId,phaseBets,results,matches,onChange,disabled,scoring}){
  const S={...DEFAULT_SCORING,...scoring}
  const[local,setLocal]=useState(phaseBets||{})
  useEffect(()=>setLocal(phaseBets||{}),[phaseBets])
  const phaseMatches=matches?.[phaseId]||[]
  const pts=S[phaseId]||0
  function handleChange(matchId,team){setLocal(prev=>({...prev,[matchId]:team}));onChange(matchId,team)}
  if(phaseMatches.length===0)return<Card><div style={{color:C.textMuted,textAlign:'center',padding:24,fontSize:14}}>⏳ El administrador aún no ha publicado los cruces de esta fase</div></Card>
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{background:`${C.blue}18`,border:`1px solid ${C.blue}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>✅ Acierto por partido: <b style={{color:'#5bb3f5'}}>+{pts} pts</b></div>
      {phaseMatches.map((m,idx)=>{
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

function ThirdPlaceBet({thirdBet,results,matches,onChange,disabled,scoring}){
  const S={...DEFAULT_SCORING,...scoring}
  const[local,setLocal]=useState(thirdBet||{})
  useEffect(()=>setLocal(thirdBet||{}),[thirdBet])
  const thirdMatch=(matches?.third||[])[0]
  function handleChange(matchId,team){setLocal(prev=>({...prev,[matchId]:team}));onChange(matchId,team)}
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{background:`${C.silver}18`,border:`1px solid ${C.silver}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>🥉 <b style={{color:C.silver}}>Acertar ganador: +{S.third} pts</b></div>
      {!thirdMatch?<Card><div style={{color:C.textMuted,textAlign:'center',padding:24,fontSize:14}}>⏳ El administrador aún no ha publicado este partido</div></Card>:(
        <Card style={{padding:'13px 15px'}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text,marginBottom:10}}>🥉 ¿Quién gana el 3er puesto?</div>
          <div style={{display:'flex',gap:8}}>
            {[thirdMatch.t1,thirdMatch.t2].map(team=><button key={team} disabled={disabled} onClick={()=>!disabled&&handleChange(thirdMatch.id,team)} style={{flex:1,padding:'12px 8px',borderRadius:10,cursor:disabled?'not-allowed':'pointer',border:`2px solid ${local[thirdMatch.id]===team?C.silver:C.border}`,background:local[thirdMatch.id]===team?`${C.silver}22`:C.surfaceHigh,color:local[thirdMatch.id]===team?C.silver:C.text,fontWeight:700,fontSize:14,fontFamily:'inherit',transition:'all .15s',textAlign:'center',wordBreak:'break-word'}}>{local[thirdMatch.id]===team&&'✓ '}{team}</button>)}
          </div>
        </Card>
      )}
    </div>
  )
}

function FinalBets({finalBet,results,matches,onChange,disabled,scoring}){
  const S={...DEFAULT_SCORING,...scoring}
  const[local,setLocal]=useState(finalBet||{})
  useEffect(()=>setLocal(finalBet||{}),[finalBet])
  const finalMatch=(matches?.final||[])[0]
  function handleChange(key,team){setLocal(prev=>({...prev,[key]:team}));onChange(key,team)}
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>🏆 <b style={{color:C.gold}}>Campeón +{S.final_winner}pts</b> · 🥈 <b style={{color:C.silver}}>Subcampeón +{S.final_runner}pts</b></div>
      {!finalMatch?<Card><div style={{color:C.textMuted,textAlign:'center',padding:24,fontSize:14}}>⏳ El administrador aún no ha publicado la final</div></Card>:(
        <>
          {[{key:finalMatch.id+'_winner',label:'🏆 Campeón'},{key:finalMatch.id+'_runner',label:'🥈 Subcampeón'}].map(({key,label})=>(
            <Card key={key} style={{padding:'13px 15px'}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text,marginBottom:10}}>{label}</div>
              <div style={{display:'flex',gap:8}}>
                {[finalMatch.t1,finalMatch.t2].map(team=><button key={team} disabled={disabled} onClick={()=>!disabled&&handleChange(key,team)} style={{flex:1,padding:'10px 6px',borderRadius:10,cursor:disabled?'not-allowed':'pointer',border:`2px solid ${local[key]===team?C.gold:C.border}`,background:local[key]===team?`${C.gold}22`:C.surfaceHigh,color:local[key]===team?C.gold:C.text,fontWeight:700,fontSize:13,fontFamily:'inherit',transition:'all .15s',textAlign:'center',wordBreak:'break-word'}}>{local[key]===team&&'✓ '}{team}</button>)}
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}

function UserBetsViewer({user,bets,results,matches,scoring,phases,onBack}){
  const[activePhase,setActivePhase]=useState('groups')
  const S={...DEFAULT_SCORING,...scoring}
  const visiblePhases=(phases||DEFAULT_PHASES).filter(p=>isPhaseVisible(p.id,results,matches,phases))

  function GroupsView(){
    const gb=bets?.groups||{}
    return(
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {Object.entries(GROUPS).map(([g])=>{
          const bet=gb[g]||[],real=results?.groups?.[g]||[]
          return(
            <Card key={g} style={{padding:'12px 15px'}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:14,color:C.accent,marginBottom:8,letterSpacing:1.5}}>GRUPO {g}</div>
              {[0,1].map(pos=>{
                const team=bet[pos],correct=real[pos]&&team===real[pos],partial=!correct&&team&&real.slice(0,2).includes(team)
                return(
                  <div key={pos} style={{display:'flex',alignItems:'center',gap:8,marginBottom:pos===0?6:0,background:C.surfaceHigh,borderRadius:8,padding:'7px 10px'}}>
                    <span style={{fontSize:14}}>{pos===0?'🥇':'🥈'}</span>
                    <div style={{flex:1,fontSize:13,color:team?C.text:C.textDim}}>{team||'— Sin apostar —'}</div>
                    {correct&&<span style={{color:C.greenSoft,fontSize:12,fontWeight:700}}>✓ +{pos===0?S.groups_first:S.groups_second}pts</span>}
                    {partial&&<span style={{color:C.gold,fontSize:12,fontWeight:700}}>~ +{S.groups_qualified}pt</span>}
                    {real[pos]&&!correct&&!partial&&team&&<span style={{color:C.accent,fontSize:12}}>✗</span>}
                  </div>
                )
              })}
            </Card>
          )
        })}
      </div>
    )
  }
  function KnockoutView({phaseId}){
    const pb=bets?.[phaseId]||{},ppts=S[phaseId]||0
    const phaseMatches=matches?.[phaseId]||[]
    if(phaseMatches.length===0)return<Card><div style={{color:C.textMuted,textAlign:'center',padding:20,fontSize:13}}>Sin cruces disponibles</div></Card>
    return(
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {phaseMatches.map((m,idx)=>{
          const bet=pb[m.id],real=results?.[phaseId]?.[m.id],correct=bet&&real&&bet===real
          return(
            <Card key={m.id} style={{padding:'12px 15px'}}>
              <div style={{fontSize:11,color:C.textMuted,marginBottom:8,letterSpacing:1}}>PARTIDO {idx+1}: {m.t1} vs {m.t2}</div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <div style={{flex:1,background:C.surfaceHigh,borderRadius:8,padding:'8px 10px',fontSize:13,color:bet?C.text:C.textDim,textAlign:'center'}}>{bet||'— Sin apostar —'}</div>
                {real&&<div style={{fontSize:11,color:C.textMuted,flexShrink:0}}>Real: <b style={{color:C.text}}>{real}</b></div>}
                {correct&&<span style={{color:C.greenSoft,fontSize:12,fontWeight:700,flexShrink:0}}>✓ +{ppts}pts</span>}
                {bet&&real&&!correct&&<span style={{color:C.accent,fontSize:12,flexShrink:0}}>✗</span>}
              </div>
            </Card>
          )
        })}
      </div>
    )
  }
  function ThirdView(){
    const tm=(matches?.third||[])[0];if(!tm)return<Card><div style={{color:C.textMuted,textAlign:'center',padding:20}}>Sin partido</div></Card>
    const bet=bets?.third?.[tm.id],real=results?.third?.[tm.id],correct=bet&&real&&bet===real
    return(
      <Card style={{padding:'13px 15px'}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:C.text,marginBottom:10}}>🥉 {tm.t1} vs {tm.t2}</div>
        <div style={{display:'flex',gap:8,alignItems:'center',background:C.surfaceHigh,borderRadius:8,padding:'10px 12px'}}>
          <div style={{flex:1,fontSize:14,color:bet?C.text:C.textDim}}>{bet||'— Sin apostar —'}</div>
          {real&&<div style={{fontSize:11,color:C.textMuted}}>Real: <b style={{color:C.text}}>{real}</b></div>}
          {correct&&<span style={{color:C.greenSoft,fontSize:13,fontWeight:700}}>✓ +{S.third}pts</span>}
          {bet&&real&&!correct&&<span style={{color:C.accent,fontSize:13}}>✗</span>}
        </div>
      </Card>
    )
  }
  function FinalView(){
    const fm=(matches?.final||[])[0];if(!fm)return<Card><div style={{color:C.textMuted,textAlign:'center',padding:20}}>Sin partido</div></Card>
    const fb=bets?.final||{}
    return(
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <div style={{fontSize:13,color:C.textMuted,textAlign:'center'}}>{fm.t1} vs {fm.t2}</div>
        {[{key:fm.id+'_winner',label:'🏆 Campeón',pts:S.final_winner},{key:fm.id+'_runner',label:'🥈 Subcampeón',pts:S.final_runner}].map(({key,label,pts})=>{
          const bet=fb[key],real=results?.final?.[key],correct=bet&&real&&bet===real
          return(
            <Card key={key} style={{padding:'12px 15px'}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:14,color:C.text,marginBottom:8}}>{label}</div>
              <div style={{display:'flex',gap:8,alignItems:'center',background:C.surfaceHigh,borderRadius:8,padding:'10px 12px'}}>
                <div style={{flex:1,fontSize:14,color:bet?C.text:C.textDim}}>{bet||'— Sin apostar —'}</div>
                {real&&<div style={{fontSize:11,color:C.textMuted}}>Real: <b style={{color:C.text}}>{real}</b></div>}
                {correct&&<span style={{color:C.greenSoft,fontSize:13,fontWeight:700}}>✓ +{pts}pts</span>}
                {bet&&real&&!correct&&<span style={{color:C.accent,fontSize:13}}>✗</span>}
              </div>
            </Card>
          )
        })}
      </div>
    )
  }
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',fontSize:20,padding:0}}>←</button>
        <div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:20,color:C.text}}>{user.display_name||user.name}</div>
          {user.display_name&&<div style={{fontSize:11,color:C.textDim}}>@{user.name}</div>}
        </div>
      </div>
      {visiblePhases.length===0&&<Card><div style={{color:C.textMuted,textAlign:'center',padding:20}}>Las apuestas se mostrarán cuando comience cada fase</div></Card>}
      {visiblePhases.length>0&&(
        <>
          <div style={{display:'flex',overflowX:'auto',gap:6,paddingBottom:4,scrollbarWidth:'none'}}>
            {visiblePhases.map(p=><button key={p.id} onClick={()=>setActivePhase(p.id)} style={{whiteSpace:'nowrap',padding:'6px 14px',borderRadius:20,flexShrink:0,border:`1px solid ${activePhase===p.id?C.accent:C.border}`,background:activePhase===p.id?C.accent:'transparent',color:activePhase===p.id?'#fff':C.text,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>{p.icon} {p.short}</button>)}
          </div>
          {activePhase==='groups'&&<GroupsView/>}
          {['r32','r16','qf','sf'].includes(activePhase)&&<KnockoutView phaseId={activePhase}/>}
          {activePhase==='third'&&<ThirdView/>}
          {activePhase==='final'&&<FinalView/>}
        </>
      )}
    </div>
  )
}

function ScoringScreen({scoring}){
  const S={...DEFAULT_SCORING,...scoring}
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text,marginBottom:4}}>Sistema de puntuación</div>
      <div style={{background:`${C.blue}18`,border:`1px solid ${C.blue}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.textMuted}}>Los puntos pueden ser modificados por el administrador.</div>
      {[
        {phase:'Fase de Grupos',icon:'⚽',items:[{label:'1º clasificado exacto',pts:S.groups_first,color:C.gold},{label:'2º clasificado exacto',pts:S.groups_second,color:C.silver},{label:'Clasificado (sin orden)',pts:S.groups_qualified,color:C.text}]},
        {phase:'Dieciseisavos',icon:'🔵',items:[{label:'Acertar clasificado',pts:S.r32,color:C.blue}]},
        {phase:'Octavos',icon:'🟡',items:[{label:'Acertar clasificado',pts:S.r16,color:C.gold}]},
        {phase:'Cuartos',icon:'🟠',items:[{label:'Acertar clasificado',pts:S.qf,color:C.accentHover}]},
        {phase:'Semis',icon:'🔴',items:[{label:'Acertar clasificado',pts:S.sf,color:C.accent}]},
        {phase:'3º/4º',icon:'🥉',items:[{label:'Acertar ganador',pts:S.third,color:C.silver}]},
        {phase:'Final',icon:'🏆',items:[{label:'Campeón',pts:S.final_winner,color:C.gold},{label:'Subcampeón',pts:S.final_runner,color:C.silver}]},
      ].map((s,i)=>(
        <Card key={i} style={{padding:'14px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}><span style={{fontSize:20}}>{s.icon}</span><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text}}>{s.phase}</div></div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>{s.items.map((item,j)=><div key={j} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:C.surfaceHigh,borderRadius:8,padding:'8px 12px'}}><div style={{fontSize:13,color:C.textMuted,flex:1}}>{item.label}</div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:18,color:item.color,marginLeft:10}}>+{item.pts}</div></div>)}</div>
        </Card>
      ))}
    </div>
  )
}

function Rules({phases}){
  const ph=phases||DEFAULT_PHASES
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text,marginBottom:4}}>Reglas del juego</div>
      {[
        {icon:'📋',title:'¿En qué consiste?',text:'Cada participante hace sus predicciones antes de que empiece cada fase. Cuantos más aciertos, más puntos. Al final del torneo gana quien más puntos haya acumulado.'},
        {icon:'⏳',title:'Plazos',text:'Las apuestas se cierran automáticamente 1 hora antes del inicio de cada fase. Una vez cerrada, no se pueden modificar las predicciones.'},
        {icon:'🔓',title:'Desbloqueo de fases',text:'Cada fase eliminatoria se desbloquea cuando el administrador completa la fase anterior y publica los cruces. Los cruces los introduce manualmente el admin según el sorteo oficial de la FIFA.'},
        {icon:'👁',title:'Ver apuestas de otros',text:'Las apuestas se pueden ver cuando la fase ha comenzado o el administrador ha introducido todos sus resultados.'},
        {icon:'✅',title:'Acceso',text:'El registro está sujeto a aprobación del administrador.'},
        {icon:'📈',title:'Puntuación progresiva',text:'Cada fase vale más puntos que la anterior. La Final tiene tanto peso que cualquiera puede remontar hasta el último momento.'},
      ].map((s,i)=>(
        <Card key={i} style={{padding:'14px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}><span style={{fontSize:20}}>{s.icon}</span><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text}}>{s.title}</div></div>
          <div style={{fontSize:13,color:C.textMuted,lineHeight:1.6}}>{s.text}</div>
        </Card>
      ))}
      <Card style={{padding:'14px 16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}><span style={{fontSize:20}}>📅</span><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text}}>Fechas de cierre</div></div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {ph.map(p=>(
            <div key={p.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:C.surfaceHigh,borderRadius:8,padding:'8px 12px'}}>
              <div style={{fontSize:13,color:C.textMuted}}>{p.icon} {p.label}</div>
              <div style={{fontSize:12,color:isClosed(p.start)?C.accent:C.greenSoft,fontWeight:700}}>{timeLeft(p.start)}</div>
            </div>
          ))}
        </div>
      </Card>
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
  const[realName,setRealName]=useState('')
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
    if(!name.trim()){setErr('Escribe tu nombre de usuario');setLoading(false);return}
    if(!realName.trim()){setErr('Escribe tu nombre real');setLoading(false);return}
    if(pass.length<4){setErr('Mínimo 4 caracteres');setLoading(false);return}
    if(pass!==pass2){setErr('Las contraseñas no coinciden');setLoading(false);return}
    const{data:existing}=await supabase.from('porra_users').select('id').ilike('name',name.trim()).single()
    if(existing){setErr('Ese nombre ya está en uso');setLoading(false);return}
    const{data,error}=await supabase.from('porra_users').insert({name:name.trim(),password_hash:hashPassword(pass),role:'user',status:'pending',display_name:realName.trim()}).select().single()
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
            {tab==='register'&&(
              <div>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:6,letterSpacing:1,textTransform:'uppercase'}}>Tu nombre real</div>
                <Input value={realName} onChange={e=>setRealName(e.target.value)} onKeyDown={onKey} placeholder="Ej: Pedro García"/>
                <div style={{fontSize:11,color:C.textDim,marginTop:4}}>El administrador lo usará para identificarte y aprobar tu cuenta</div>
              </div>
            )}
            <div><div style={{fontSize:11,color:C.textMuted,marginBottom:6,letterSpacing:1,textTransform:'uppercase'}}>{tab==='register'?'Nombre en el ranking':'Nombre'}</div><Input value={name} onChange={e=>setName(e.target.value)} onKeyDown={onKey} placeholder={tab==='register'?'Apodo para la clasificación':'Tu nombre'}/></div>
            <div><div style={{fontSize:11,color:C.textMuted,marginBottom:6,letterSpacing:1,textTransform:'uppercase'}}>Contraseña</div><Input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={onKey} placeholder="••••••"/></div>
            {tab==='register'&&<div><div style={{fontSize:11,color:C.textMuted,marginBottom:6,letterSpacing:1,textTransform:'uppercase'}}>Repite contraseña</div><Input type="password" value={pass2} onChange={e=>setPass2(e.target.value)} onKeyDown={onKey} placeholder="••••••"/></div>}
            {tab==='register'&&<div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}33`,borderRadius:8,padding:'8px 12px',fontSize:12,color:C.textMuted}}>⏳ Tu cuenta quedará pendiente hasta que el administrador la apruebe</div>}
            {err&&<div style={{background:`${C.accent}22`,border:`1px solid ${C.accent}55`,borderRadius:8,padding:'8px 12px',fontSize:13,color:C.accentHover,textAlign:'center'}}>⚠ {err}</div>}
            <Btn onClick={tab==='login'?doLogin:doRegister} disabled={loading} full variant={tab==='login'?'primary':'success'}>{loading?'Cargando…':tab==='login'?'⚽ Entrar':'✓ Solicitar acceso'}</Btn>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Leaderboard({users,betsMap,results,matches,scoring,phases,currentUserId,onViewUser}){
  const scored=users.filter(u=>u.role!=='admin'&&u.status==='approved').map(u=>{const{total,breakdown}=calcScore(betsMap[u.id]||{},results,matches,scoring);return{...u,total,breakdown}}).sort((a,b)=>b.total-a.total)
  const medals=['🥇','🥈','🥉']
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text,marginBottom:4}}>Clasificación</div>
      <div style={{fontSize:12,color:C.textMuted,marginBottom:4}}>Pulsa sobre un participante para ver sus pronósticos</div>
      {scored.length===0&&<Card><div style={{color:C.textMuted,textAlign:'center',padding:16}}>Nadie ha apostado todavía</div></Card>}
      {scored.map((u,i)=>{
        const display=u.display_name||u.name
        return(
          <div key={u.id} onClick={()=>onViewUser(u)} style={{background:u.id===currentUserId?`${C.accent}18`:C.surface,border:`1px solid ${u.id===currentUserId?C.accent:C.border}`,borderRadius:14,padding:'14px 16px',boxShadow:i===0&&u.total>0?`0 0 24px ${C.gold}22`:'none',cursor:'pointer'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{fontSize:22,minWidth:30,textAlign:'center'}}>{medals[i]||<span style={{color:C.textDim,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16}}>{i+1}</span>}</div>
                <div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:18,color:u.id===currentUserId?C.accentHover:C.text}}>{display}{u.id===currentUserId&&<span style={{fontSize:11,color:C.textMuted}}> (tú)</span>}</div>
                  {display!==u.name&&<div style={{fontSize:11,color:C.textDim,marginTop:1}}>@{u.name}</div>}
                  {u.breakdown.length>0&&<div style={{fontSize:11,color:C.textMuted,marginTop:3}}>{u.breakdown.map(b=>`${b.label}: +${b.pts}`).join(' · ')}</div>}
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{textAlign:'right'}}><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:30,color:i===0&&u.total>0?C.gold:C.text,lineHeight:1}}>{u.total}</div><div style={{fontSize:10,color:C.textMuted,letterSpacing:1}}>PTS</div></div>
                <div style={{color:C.textDim,fontSize:16}}>›</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AdminPanel({results,matches,scoring,phases,users,onSave,onSaveMatches,onSaveScoring,onSavePhases,onApprove,onReject}){
  const[local,setLocal]=useState(JSON.parse(JSON.stringify(results||{})))
  const[localMatches,setLocalMatches]=useState(JSON.parse(JSON.stringify(matches||{})))
  const[localScoring,setLocalScoring]=useState({...DEFAULT_SCORING,...scoring})
  const[localPhases,setLocalPhases]=useState(phases||DEFAULT_PHASES)
  const[activeSection,setActiveSection]=useState('users')
  const[activePhase,setActivePhase]=useState('r32')
  const[saved,setSaved]=useState(false)
  const[simulating,setSimulating]=useState(null)

  useEffect(()=>setLocal(JSON.parse(JSON.stringify(results||{}))),[results])
  useEffect(()=>setLocalMatches(JSON.parse(JSON.stringify(matches||{}))),[matches])
  useEffect(()=>setLocalScoring({...DEFAULT_SCORING,...scoring}),[scoring])
  useEffect(()=>setLocalPhases(phases||DEFAULT_PHASES),[phases])

  const pending=users.filter(u=>u.status==='pending')
  const approved=users.filter(u=>u.role!=='admin'&&u.status==='approved')

  function getGroupQualifiers(){
    const teams=[]
    Object.keys(GROUPS).forEach(g=>{const r=local?.groups?.[g]||[];if(r[0])teams.push(r[0]);if(r[1])teams.push(r[1])})
    Object.values(GROUPS).forEach(gt=>gt.forEach(t=>{if(!teams.includes(t))teams.push(t)}))
    return teams
  }
  function getAvailableTeams(phaseId){
    if(phaseId==='r32')return getGroupQualifiers()
    const prev={r16:'r32',qf:'r16',sf:'qf',third:'sf',final:'sf'}[phaseId]
    if(!prev)return[]
    const prevMatches=localMatches[prev]||[],prevResults=local[prev]||{}
    const winners=prevMatches.map(m=>prevResults[m.id]).filter(Boolean)
    if(phaseId==='third'){const sfAll=prevMatches.flatMap(m=>[m.t1,m.t2]).filter(Boolean);return sfAll.filter(t=>!winners.includes(t))}
    return winners.length>0?winners:prevMatches.flatMap(m=>[m.t1,m.t2]).filter(Boolean)
  }
  function ensureMatches(phaseId){
    const count=PHASE_MATCH_COUNT[phaseId]||0,existing=localMatches[phaseId]||[],ms=[...existing]
    while(ms.length<count)ms.push({id:`m${ms.length*2}`,t1:'',t2:''})
    return ms.slice(0,count)
  }
  function setMatchTeam(phaseId,matchId,field,val){
    setLocalMatches(prev=>{
      const count=PHASE_MATCH_COUNT[phaseId]||0
      let ms=(prev[phaseId]||[]).map(m=>m.id===matchId?{...m,[field]:val}:m)
      while(ms.length<count)ms.push({id:`m${ms.length*2}`,t1:'',t2:''})
      return{...prev,[phaseId]:ms.slice(0,count)}
    })
  }
  function setMatchWinner(phaseId,matchId,winner){
    setLocal(prev=>({...prev,[phaseId]:{...(prev[phaseId]||{}),[matchId]:winner}}))
  }
  async function saveAll(){await onSave(local);await onSaveMatches(localMatches);setSaved(true);setTimeout(()=>setSaved(false),2000)}
  async function saveScoring(){await onSaveScoring(localScoring);setSaved(true);setTimeout(()=>setSaved(false),2000)}
  async function savePhases(){await onSavePhases(localPhases);setSaved(true);setTimeout(()=>setSaved(false),2000)}
  const setGR=(g,pos,val)=>setLocal(r=>{const arr=[...(r?.groups?.[g]||['',''])];arr[pos]=val;return{...r,groups:{...(r.groups||{}),[g]:arr}}})

 async function simPhase(phaseId){
  setSimulating(phaseId)
  let nm={...localMatches}
  if(phaseId!=='groups'){
    nm=generateSimMatches(phaseId,local,localMatches)
    setLocalMatches(nm)
    await onSaveMatches(nm)
  }
  const nr=simulatePhaseResults(phaseId,local,nm)
  setLocal(nr)
  await onSave(nr)
  setSimulating(null);setSaved(true);setTimeout(()=>setSaved(false),2000)
}
  async function simAll(){
  setSimulating('all');let r={},m={}
  // Groups: results go to porra_results, matches structure for knockouts
  r=simulatePhaseResults('groups',r,m)
  // Each knockout: generate match pairs first, then simulate results separately
  for(const pid of['r32','r16','qf','sf','third','final']){
    m=generateSimMatches(pid,r,m)
    r=simulatePhaseResults(pid,r,m)
  }
  setLocal(r);setLocalMatches(m)
  await onSaveMatches(m)
  await onSave(r)
  setSimulating(null);setSaved(true);setTimeout(()=>setSaved(false),2000)
}

  const knockoutPhases=DEFAULT_PHASES.filter(p=>p.id!=='groups')

  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.accent}}>⚙ Administración</div>
        {pending.length>0&&<div style={{background:`${C.gold}33`,border:`1px solid ${C.gold}`,borderRadius:20,padding:'4px 12px',fontSize:12,color:C.gold,fontWeight:700}}>⏳ {pending.length} pendiente{pending.length>1?'s':''}</div>}
      </div>

      <div style={{display:'flex',gap:3,background:C.surfaceHigh,borderRadius:10,padding:4,overflowX:'auto'}}>
        {[['users',`👥${pending.length>0?`(${pending.length})`:''}`],['matches','⚽ Cruces'],['results','📋 Result.'],['dates','📅 Fechas'],['sim','🎲 Sim'],['scoring','🏅 Pts']].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveSection(id)} style={{flex:1,whiteSpace:'nowrap',padding:'8px 4px',border:'none',borderRadius:8,cursor:'pointer',background:activeSection===id?C.accent:'transparent',color:activeSection===id?'#fff':C.textMuted,fontWeight:800,fontSize:11,fontFamily:"'Barlow Condensed',sans-serif"}}>{label}</button>
        ))}
      </div>

      {/* USUARIOS */}
      {activeSection==='users'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {pending.length>0&&(
            <>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:C.gold}}>⏳ Pendientes de aprobación</div>
              {pending.map(u=>(
                <Card key={u.id} style={{borderColor:`${C.gold}44`,padding:'14px 16px'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                    <div>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text}}>{u.display_name||u.name}</div>
                      {u.display_name&&<div style={{fontSize:11,color:C.textDim}}>@{u.name}</div>}
                    </div>
                    <div style={{display:'flex',gap:8,flexShrink:0}}>
                      <Btn onClick={()=>onApprove(u.id)} variant='success' small>✓ Aprobar</Btn>
                      <Btn onClick={()=>onReject(u.id)} variant='danger' small>✗ Rechazar</Btn>
                    </div>
                  </div>
                </Card>
              ))}
              <div style={{height:1,background:C.border}}/>
            </>
          )}
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:C.textMuted}}>✅ Aprobados ({approved.length})</div>
          {approved.map(u=>(
            <div key={u.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px'}}>
              <div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15,color:C.text}}>{u.display_name||u.name}</div>{u.display_name&&<div style={{fontSize:11,color:C.textDim}}>@{u.name}</div>}</div>
              <Tag color={C.greenSoft}>Aprobado</Tag>
            </div>
          ))}
        </div>
      )}

      {/* CRUCES */}
      {activeSection==='matches'&&(
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{background:`${C.blue}18`,border:`1px solid ${C.blue}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.textMuted}}>Selecciona los equipos de cada partido. Al guardar, los participantes podrán apostar.</div>
          <div style={{display:'flex',overflowX:'auto',gap:6,paddingBottom:4,scrollbarWidth:'none'}}>
            {knockoutPhases.map(p=><button key={p.id} onClick={()=>setActivePhase(p.id)} style={{whiteSpace:'nowrap',padding:'6px 14px',borderRadius:20,flexShrink:0,border:`1px solid ${activePhase===p.id?C.accent:C.border}`,background:activePhase===p.id?C.accent:'transparent',color:activePhase===p.id?'#fff':C.textMuted,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>{p.icon} {p.short}</button>)}
          </div>
          {knockoutPhases.filter(p=>p.id===activePhase).map(p=>{
            const ms=ensureMatches(p.id),availableTeams=getAvailableTeams(p.id)
            return(
              <div key={p.id} style={{display:'flex',flexDirection:'column',gap:10}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.text}}>{p.label} — {ms.length} partidos</div>
                {ms.map((m,idx)=>{
                  const usedTeams=ms.filter(om=>om.id!==m.id).flatMap(om=>[om.t1,om.t2]).filter(Boolean)
                  return(
                    <Card key={m.id} style={{padding:'13px 15px'}}>
                      <div style={{fontSize:11,color:C.textMuted,marginBottom:10,letterSpacing:1}}>PARTIDO {idx+1}</div>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <select value={m.t1||''} onChange={e=>setMatchTeam(p.id,m.id,'t1',e.target.value)} style={{flex:1,background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:m.t1?C.text:C.textMuted,fontSize:13,fontFamily:'inherit'}}>
                          <option value=''>— Equipo 1 —</option>
                          {availableTeams.map(t=><option key={t} value={t} disabled={usedTeams.includes(t)||t===m.t2}>{t}</option>)}
                        </select>
                        <div style={{color:C.textMuted,fontWeight:800,flexShrink:0,fontSize:12}}>vs</div>
                        <select value={m.t2||''} onChange={e=>setMatchTeam(p.id,m.id,'t2',e.target.value)} style={{flex:1,background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:m.t2?C.text:C.textMuted,fontSize:13,fontFamily:'inherit'}}>
                          <option value=''>— Equipo 2 —</option>
                          {availableTeams.map(t=><option key={t} value={t} disabled={usedTeams.includes(t)||t===m.t1}>{t}</option>)}
                        </select>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )
          })}
          <Btn onClick={saveAll} variant='success' full>{saved?'✓ Publicado':'📢 Publicar cruces'}</Btn>
        </div>
      )}

      {/* RESULTADOS */}
      {activeSection==='results'&&(
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{background:`${C.accent}18`,border:`1px solid ${C.accent}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.silver}}>Introduce el ganador de cada partido una vez disputado.</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:C.text}}>⚽ Fase de Grupos</div>
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
          {knockoutPhases.map(p=>{
            const phaseMatches=localMatches[p.id]||[],validMatches=phaseMatches.filter(m=>m.t1&&m.t2)
            if(validMatches.length===0)return null
            return(
              <div key={p.id} style={{display:'flex',flexDirection:'column',gap:10}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:C.text}}>{p.icon} {p.label}</div>
                {validMatches.map((m,idx)=>(
                  <Card key={m.id} style={{padding:'12px 15px'}}>
                    <div style={{fontSize:11,color:C.textMuted,marginBottom:8,letterSpacing:1}}>PARTIDO {idx+1}</div>
                    {p.id==='final'?(
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        <div style={{fontSize:12,color:C.textMuted,marginBottom:4}}>🏆 Selecciona el campeón (el otro será subcampeón)</div>
                        <div style={{display:'flex',gap:6}}>
                          {[m.t1,m.t2].map(team=><button key={team} onClick={()=>{setMatchWinner('final',m.id+'_winner',team);setMatchWinner('final',m.id+'_runner',team===m.t1?m.t2:m.t1)}} style={{flex:1,padding:'10px 6px',borderRadius:8,border:`2px solid ${local.final?.[m.id+'_winner']===team?C.gold:C.border}`,background:local.final?.[m.id+'_winner']===team?`${C.gold}22`:C.surfaceHigh,color:local.final?.[m.id+'_winner']===team?C.gold:C.text,fontWeight:700,fontSize:13,fontFamily:'inherit',cursor:'pointer',textAlign:'center',wordBreak:'break-word'}}>{local.final?.[m.id+'_winner']===team&&'🏆 '}{team}</button>)}
                        </div>
                      </div>
                    ):(
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        <div style={{fontSize:12,color:C.textMuted}}>{m.t1} vs {m.t2}</div>
                        <div style={{display:'flex',gap:6}}>
                          {[m.t1,m.t2].map(team=><button key={team} onClick={()=>setMatchWinner(p.id,m.id,team)} style={{flex:1,padding:'10px 6px',borderRadius:8,border:`2px solid ${local[p.id]?.[m.id]===team?C.green:C.border}`,background:local[p.id]?.[m.id]===team?`${C.green}22`:C.surfaceHigh,color:local[p.id]?.[m.id]===team?C.greenSoft:C.text,fontWeight:700,fontSize:13,fontFamily:'inherit',cursor:'pointer',textAlign:'center',wordBreak:'break-word'}}>{local[p.id]?.[m.id]===team&&'✓ '}{team}</button>)}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )
          })}
          <Btn onClick={saveAll} variant='success' full>{saved?'✓ Guardado':'💾 Guardar resultados'}</Btn>
        </div>
      )}

      {/* FECHAS */}
      {activeSection==='dates'&&(
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.textMuted}}>
            Introduce la fecha y hora de inicio de cada fase. Las apuestas se cerrarán automáticamente <b style={{color:C.gold}}>1 hora antes</b>.
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {localPhases.map((p,i)=>(
              <Card key={p.id} style={{padding:'13px 15px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                  <span style={{fontSize:18}}>{p.icon}</span>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:C.text}}>{p.label}</div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <div style={{fontSize:11,color:C.textMuted,letterSpacing:1,textTransform:'uppercase'}}>Fecha y hora de inicio</div>
                  <input
                    type="datetime-local"
                    value={formatDatetimeLocal(p.start)}
                    onChange={e=>{
                      const newPhases=[...localPhases]
                      newPhases[i]={...p,start:new Date(e.target.value).toISOString()}
                      setLocalPhases(newPhases)
                    }}
                    style={{...inp,fontSize:14,padding:'8px 12px',colorScheme:'dark'}}
                  />
                  <div style={{fontSize:11,color:C.textDim}}>
                    Cierre de apuestas: <b style={{color:isClosed(p.start)?C.accent:C.greenSoft}}>{timeLeft(p.start)}</b>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Btn onClick={savePhases} variant='success' full>{saved?'✓ Guardado':'💾 Guardar fechas'}</Btn>
        </div>
      )}

      {/* SIMULADOR */}
      {activeSection==='sim'&&(
        <Card style={{borderColor:`${C.blue}44`}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:'#5bb3f5',marginBottom:8}}>🎲 Simulador por fases</div>
          <div style={{fontSize:12,color:C.textMuted,marginBottom:12}}>Genera cruces y resultados aleatorios para probar la app.</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {DEFAULT_PHASES.map(p=>(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,background:C.surfaceHigh,borderRadius:10,padding:'10px 12px'}}>
                <div style={{flex:1,fontSize:13,color:C.text}}>{p.icon} {p.label}</div>
                <Btn onClick={()=>simPhase(p.id)} disabled={simulating===p.id} variant='blue' small style={{minWidth:80}}>{simulating===p.id?'…':'🎲 Sim'}</Btn>
              </div>
            ))}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:4}}>
              <Btn onClick={simAll} disabled={!!simulating} variant='gold' full>{simulating==='all'?'Simulando…':'🎲 Simular todo'}</Btn>
            </div>
          </div>
        </Card>
      )}

      {/* PUNTUACIÓN */}
      {activeSection==='scoring'&&(
        <>
          <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'9px 13px',fontSize:12,color:C.textMuted}}>Modifica los puntos de cada fase. Los cambios afectan a todos en tiempo real.</div>
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
  const[matches,setMatches]=useState({})
  const[scoring,setScoring]=useState(DEFAULT_SCORING)
  const[phases,setPhases]=useState(DEFAULT_PHASES)
  const[activeTab,setActiveTab]=useState('ranking')
  const[activePhase,setActivePhase]=useState('groups')
  const[saveMsg,setSaveMsg]=useState('')
  const[loaded,setLoaded]=useState(false)
  const[showProfile,setShowProfile]=useState(false)
  const[viewingUser,setViewingUser]=useState(null)

  useEffect(()=>{const s=localStorage.getItem('porra_user');if(s)try{setSession(JSON.parse(s))}catch{}},[])

  const loadAll=useCallback(async()=>{
    const[{data:ud},{data:bd},{data:rd},{data:cd},{data:md}]=await Promise.all([
      supabase.from('porra_users').select('id,name,role,display_name,status'),
      supabase.from('porra_bets').select('user_id,phase,data'),
      supabase.from('porra_results').select('phase,data'),
      supabase.from('porra_config').select('key,value'),
      supabase.from('porra_matches').select('key,value'),
    ])
    setUsers(ud||[])
    const map={};(bd||[]).forEach(b=>{if(!map[b.user_id])map[b.user_id]={};map[b.user_id][b.phase]=b.data});setBetsMap(map)
    const res={};(rd||[]).forEach(r=>{res[r.phase]=r.data});setResults(res)
    const matchData={};(md||[]).forEach(m=>{matchData[m.key]=m.value});setMatches(matchData)
    if(cd){
      const sc=(cd).find(c=>c.key==='scoring');if(sc)setScoring({...DEFAULT_SCORING,...sc.value})
      const ph=(cd).find(c=>c.key==='phases');if(ph)setPhases(ph.value)
    }
    setLoaded(true)
  },[])

  useEffect(()=>{loadAll()},[loadAll])

  useEffect(()=>{
    if(!session)return
    const interval=setInterval(async()=>{
      const{data}=await supabase.from('porra_users').select('*').eq('id',session.id).single()
      if(data&&data.status!==session.status){localStorage.setItem('porra_user',JSON.stringify(data));setSession(data)}
    },10000)
    return()=>clearInterval(interval)
  },[session])

  useEffect(()=>{
    const ch=supabase.channel('porra-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_bets'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_results'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_users'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_config'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'porra_matches'},loadAll)
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
    for(const[phase,data]of Object.entries(newResults)){await supabase.from('porra_results').upsert({phase,data,updated_at:new Date().toISOString()},{onConflict:'phase'})}
    notify('✓ Resultados guardados')
  }
  async function handleSaveMatches(newMatches){
    setMatches(newMatches)
    for(const[key,value]of Object.entries(newMatches)){await supabase.from('porra_matches').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'})}
    notify('✓ Cruces guardados')
  }
  async function handleSaveScoring(newScoring){
    setScoring(newScoring)
    await supabase.from('porra_config').upsert({key:'scoring',value:newScoring,updated_at:new Date().toISOString()},{onConflict:'key'})
    notify('✓ Puntuación actualizada')
  }
  async function handleSavePhases(newPhases){
    setPhases(newPhases)
    await supabase.from('porra_config').upsert({key:'phases',value:newPhases,updated_at:new Date().toISOString()},{onConflict:'key'})
    notify('✓ Fechas actualizadas')
  }
  async function handleApprove(userId){await supabase.from('porra_users').update({status:'approved'}).eq('id',userId);await loadAll();notify('✓ Usuario aprobado')}
  async function handleReject(userId){await supabase.from('porra_bets').delete().eq('user_id',userId);await supabase.from('porra_users').delete().eq('id',userId);await loadAll();notify('✓ Usuario rechazado')}
  function handleShare(){
    const url=window.location.href,text='¡Únete a la Porra Mundial 2026 de La Viuda!'
    if(navigator.share){navigator.share({title:'Porra Mundial 2026',text,url}).catch(()=>{})}
    else{navigator.clipboard.writeText(url).then(()=>notify('✓ URL copiada')).catch(()=>{})}
  }
  function handleLogout(){localStorage.removeItem('porra_user');setSession(null)}

  if(!loaded)return(
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:14}}>
      <div style={{fontSize:28}}>⚽</div>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:3,color:C.textMuted,fontSize:14,textTransform:'uppercase'}}>Cargando…</div>
    </div>
  )
  if(!session)return<LoginScreen onLogin={setSession}/>
  if(session.status==='pending'&&session.role!=='admin')return<PendingScreen user={session} onLogout={handleLogout}/>

  if(showProfile)return(
    <div style={{minHeight:'100vh',background:C.bg,paddingBottom:72}}>
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <Logo small/><div style={{fontSize:13,color:C.textMuted}}>{session.display_name||session.name}</div>
      </header>
      <main style={{maxWidth:560,margin:'0 auto',padding:'16px 14px'}}>
        <ProfileScreen session={session} onUpdate={updated=>{setSession(updated);loadAll()}} onDelete={()=>{localStorage.removeItem('porra_user');setSession(null)}} onBack={()=>setShowProfile(false)}/>
      </main>
    </div>
  )

  if(viewingUser)return(
    <div style={{minHeight:'100vh',background:C.bg,paddingBottom:72}}>
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <Logo small/><div style={{fontSize:13,color:C.textMuted}}>{session.display_name||session.name}</div>
      </header>
      <main style={{maxWidth:560,margin:'0 auto',padding:'16px 14px'}}>
        <UserBetsViewer user={viewingUser} bets={betsMap[viewingUser.id]||{}} results={results} matches={matches} scoring={scoring} phases={phases} onBack={()=>setViewingUser(null)}/>
      </main>
    </div>
  )

  const userBets=betsMap[session.id]||{}
  const phase=phases.find(p=>p.id===activePhase)||DEFAULT_PHASES.find(p=>p.id===activePhase)
  const closed=phase?isClosed(phase.start):true
  const unlocked=isPhaseUnlocked(activePhase,results,matches)
  const pendingCount=users.filter(u=>u.status==='pending').length

  const TABS=[
    {id:'ranking',label:'Ranking',icon:'🏆'},
    {id:'bets',label:'Apuestas',icon:'⚽'},
    {id:'scoring',label:'Puntos',icon:'🏅'},
    {id:'rules',label:'Reglas',icon:'📋'},
    ...(session.role==='admin'?[{id:'admin',label:`Admin${pendingCount>0?` (${pendingCount})`:''}`,icon:'⚙'}]:[]),
  ]

  return(
    <div style={{minHeight:'100vh',background:C.bg,paddingBottom:72}}>
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <Logo small/>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {saveMsg&&<span style={{fontSize:12,color:saveMsg.startsWith('✓')?C.greenSoft:C.accentHover,fontWeight:600}}>{saveMsg}</span>}
          <Btn onClick={handleShare} variant='ghost' small>🔗</Btn>
          <button onClick={()=>setShowProfile(true)} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:8,padding:'5px 10px',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
            <div style={{fontSize:13,color:C.text,fontWeight:700,lineHeight:1}}>{session.display_name||session.name}</div>
            {session.display_name&&<div style={{fontSize:10,color:C.textDim,lineHeight:1.3}}>@{session.name}</div>}
          </button>
          <Btn onClick={handleLogout} variant='ghost' small>Salir</Btn>
        </div>
      </header>

      <main style={{maxWidth:560,margin:'0 auto',padding:'16px 14px'}}>
        {activeTab==='ranking'&&<Leaderboard users={users} betsMap={betsMap} results={results} matches={matches} scoring={scoring} phases={phases} currentUserId={session.id} onViewUser={setViewingUser}/>}
        {activeTab==='scoring'&&<ScoringScreen scoring={scoring}/>}
        {activeTab==='rules'&&<Rules phases={phases}/>}
        {activeTab==='bets'&&(
          <>
            <div style={{display:'flex',overflowX:'auto',gap:6,marginBottom:16,paddingBottom:4,scrollbarWidth:'none'}}>
              {phases.map(p=>{
                const done=isClosed(p.start),open=isPhaseUnlocked(p.id,results,matches)
                return<button key={p.id} onClick={()=>setActivePhase(p.id)} style={{whiteSpace:'nowrap',padding:'6px 14px',borderRadius:20,flexShrink:0,border:`1px solid ${activePhase===p.id?C.accent:C.border}`,background:activePhase===p.id?C.accent:'transparent',color:activePhase===p.id?'#fff':!open?C.textDim:done?C.textMuted:C.text,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>{p.icon} {p.short}{!open&&' 🔒'}</button>
              })}
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.text}}>{phase?.label}</div>
              <Tag color={closed?C.accent:C.greenSoft}>{phase?timeLeft(phase.start):'—'}</Tag>
            </div>
            {!unlocked&&<Card><div style={{color:C.textMuted,textAlign:'center',padding:24,fontSize:14}}>🔒 Esta fase se desbloqueará cuando el administrador complete la fase anterior y publique los cruces</div></Card>}
            {unlocked&&activePhase==='groups'&&<GroupBets groupBets={userBets.groups||{}} onChange={(g,bet)=>handleSaveBet('groups',{...(userBets.groups||{}),[g]:bet})} disabled={closed} scoring={scoring}/>}
            {unlocked&&['r32','r16','qf','sf'].includes(activePhase)&&<KnockoutBets phaseId={activePhase} phaseBets={userBets[activePhase]||{}} results={results} matches={matches} onChange={(mid,team)=>handleSaveBet(activePhase,{...(userBets[activePhase]||{}),[mid]:team})} disabled={closed} scoring={scoring}/>}
            {unlocked&&activePhase==='third'&&<ThirdPlaceBet thirdBet={userBets.third||{}} results={results} matches={matches} onChange={(mid,team)=>handleSaveBet('third',{...(userBets.third||{}),[mid]:team})} disabled={closed} scoring={scoring}/>}
            {unlocked&&activePhase==='final'&&<FinalBets finalBet={userBets.final||{}} results={results} matches={matches} onChange={(key,team)=>handleSaveBet('final',{...(userBets.final||{}),[key]:team})} disabled={closed} scoring={scoring}/>}
          </>
        )}
        {activeTab==='admin'&&session.role==='admin'&&(
          <AdminPanel results={results} matches={matches} scoring={scoring} phases={phases} users={users} onSave={handleSaveResults} onSaveMatches={handleSaveMatches} onSaveScoring={handleSaveScoring} onSavePhases={handleSavePhases} onApprove={handleApprove} onReject={handleReject}/>
        )}
      </main>

      <nav style={{position:'fixed',bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'center',zIndex:100}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{flex:1,maxWidth:120,padding:'9px 0 11px',border:'none',background:activeTab===t.id?`${C.accent}1a`:'transparent',color:activeTab===t.id?C.accentHover:C.textMuted,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,borderTop:`2px solid ${activeTab===t.id?C.accent:'transparent'}`,transition:'all .15s'}}>
            <span style={{fontSize:18}}>{t.icon}</span>
            <span style={{fontSize:10,fontWeight:800,letterSpacing:.5,fontFamily:"'Barlow Condensed',sans-serif"}}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
