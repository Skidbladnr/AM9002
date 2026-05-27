import { useState, useCallback, createContext, useContext, useMemo } from 'react'

/* ════════════════════════════════════════════════════════════
   CONTEXT — passes "revealed" state down to AK/WB/AL
════════════════════════════════════════════════════════════ */
const QCtx = createContext({ revealed:false, qn:null, partId:null })
const useQ = () => useContext(QCtx)
const useRev = () => Boolean(useContext(QCtx).revealed)

function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : initialValue
    } catch {
      return initialValue
    }
  })
  const setStoredValue = useCallback((updater) => {
    setValue(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
      return next
    })
  }, [key])
  return [value, setStoredValue]
}

const partKey = (qn, partId) => qn && partId ? `q${qn}-${partId}` : 'unknown'
const TOTAL_PARTS = 65


/* ════════════════════════════════════════════════════════════
   INSTANT FEEDBACK ANSWER CHECKING
   - Checks final-answer boxes when the student presses Done / Enter.
   - This is intentionally forgiving about spaces, brackets, case,
     unicode minus signs, and common equivalent formats.
════════════════════════════════════════════════════════════ */
const ANSWER_RULES = {
  'q1-a': { any:['x>5','>5'] },
  'q1-b': { any:['-2<=x<4','-2≤x<4','x>=-2 and x<4','x≥-2 and x<4'] },
  'q1-c': { any:['-2<x<3','x>-2 and x<3'] },
  'q1-d': { set:[2,3,4,5] },
  'q2-a': { pairs:{x:4,y:2} },
  'q2-b': { coords:[[2,3],[-1,0]] },
  'q3-a': { any:['r=sqrt(a/pi)','r=√(a/π)','sqrt(a/pi)','√(a/π)'] },
  'q3-b': { any:['x=(y+3)/(y-2)','(y+3)/(y-2)'] },
  'q4-a': { any:['12.35,12.45','12.35cm,12.45cm','lb=12.35,ub=12.45','lower=12.35,upper=12.45'] },
  'q4-b': { number:97.7325, tolerance:0.0001 },
  'q4-c': { number:135, tolerance:0.5 },
  'q5-a': { set:[2,7,12,17], ordered:true },
  'q5-c': { any:['4n+3','nthterm=4n+3','u_n=4n+3'] },
  'q6-a': { any:['n^2+2n','n²+2n'] },
  'q6-b': { number:120 },
  'q6-c': { number:13 },
  'q7-a': { set:[9,16,25,41], ordered:true },
  'q7-b': { number:4 },
  'q8-a': { number:125 },
  'q8-b': { number:4 },
  'q9-b': { any:['gradient=2,y-intercept=3','m=2,c=3','2,3','gradient2intercept3'] },
  'q10-a': { any:['y=2x','2x'] },
  'q10-b': { any:['y=2x-5','2x-5'] },
  'q10-c': { any:['x+2y=10','2y+x=10','y=-1/2x+5','y=-0.5x+5'] },
  'q10-d': { coords:[[3,6]], singleCoord:true },
  'q11-a': { any:['3x+4y=25','4y+3x=25'] },
  'q12-a': { number:11 },
  'q12-b': { number:1 },
  'q12-c': { any:['2x^2-5','2x²-5'] },
  'q12-d': { any:['4x^2+4x-2','4x²+4x-2'] },
  'q12-e': { any:['(x-1)/2','f^-1(x)=(x-1)/2','f⁻¹(x)=(x-1)/2'] },
  'q13-a': { set:[6,12] },
  'q13-b': { set:[2,4,5,6,8,10,12,14,15] },
  'q13-c': { set:[1,2,4,5,7,8,10,11,13,14] },
  'q13-d': { set:[5,6,10,12,15] },
  'q13-e': { number:0 },
  'q14-a': { number:0.31, tolerance:0.0001 },
  'q14-b': { any:['1/4','0.25'] },
  'q14-c': { number:85 },
  'q15-b': { any:['9/25','18/50','0.36'] },
  'q15-c': { any:['37/50','0.74'] },
  'q15-d': { any:['4/13','8/26'], number:0.3077, tolerance:0.002 },
  'q16-b': { any:['2/15','12/90'], number:0.1333, tolerance:0.002 },
  'q16-c': { any:['8/15','48/90'], number:0.5333, tolerance:0.002 },
  'q16-d': { any:['13/15'], number:0.8667, tolerance:0.002 },
  'q17-b': { any:['1/4','0.25'] },
  'q17-c': { any:['3/16'], number:0.1875, tolerance:0.0001 },
  'q17-d': { any:['1/2','0.5'] },
  'q18-b': { any:['1/2','0.5','26/52'] },
  'q19-b': { number:0.85, tolerance:0.0001 },
  'q19-c': { any:['0.20','0.2','1/5'] },
  'q19-d': { any:['13/18'], number:0.722, tolerance:0.002 },
}

function normAnswer(v) {
  return String(v ?? '')
    .toLowerCase()
    .replace(/−|–|—/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/\s+/g, '')
    .replace(/[{}\[\]]/g, '')
    .replace(/cm²|cm2|cm/g, '')
    .replace(/answer:|therefore|∴/g, '')
}

function extractNumbers(v) {
  return String(v ?? '').replace(/−|–|—/g, '-').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || []
}

function fractionToNumber(v) {
  const m = normAnswer(v).match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/)
  return m && Number(m[2]) !== 0 ? Number(m[1]) / Number(m[2]) : null
}

function sameNumber(input, target, tolerance=0) {
  const frac = fractionToNumber(input)
  const nums = extractNumbers(input)
  const candidates = frac !== null ? [frac, ...nums] : nums
  return candidates.some(n => Math.abs(n - target) <= tolerance)
}

function sameSet(input, target, ordered=false) {
  const nums = extractNumbers(input)
  if (nums.length !== target.length) return false
  const a = ordered ? nums : [...nums].sort((x,y)=>x-y)
  const b = ordered ? target : [...target].sort((x,y)=>x-y)
  return a.every((n,i)=>n === b[i])
}

function samePairs(input, pairs) {
  const t = normAnswer(input)
  return Object.entries(pairs).every(([k,v]) => t.includes(`${k}=${v}`))
}

function sameCoords(input, coords, singleCoord=false) {
  const nums = extractNumbers(input)
  const flat = coords.flat()
  if (singleCoord) return nums.length === 2 && nums[0] === flat[0] && nums[1] === flat[1]
  if (nums.length !== flat.length) return false
  const chunks = []
  for (let i=0; i<nums.length; i+=2) chunks.push(`${nums[i]},${nums[i+1]}`)
  const want = coords.map(([x,y])=>`${x},${y}`).sort()
  return chunks.sort().every((c,i)=>c === want[i])
}

function checkAnswerValue(key, raw) {
  const rule = ANSWER_RULES[key]
  const input = String(raw ?? '').trim()
  if (!input) return 'blank'
  if (!rule) return 'review'
  const normalized = normAnswer(input)
  if (rule.any?.some(a => normalized === normAnswer(a))) return 'correct'
  if (typeof rule.number === 'number' && sameNumber(input, rule.number, rule.tolerance || 0)) return 'correct'
  if (rule.set && sameSet(input, rule.set, rule.ordered)) return 'correct'
  if (rule.pairs && samePairs(input, rule.pairs)) return 'correct'
  if (rule.coords && sameCoords(input, rule.coords, rule.singleCoord)) return 'correct'
  return 'incorrect'
}


/* ════════════════════════════════════════════════════════════
   SVG COMPONENTS
════════════════════════════════════════════════════════════ */
function NumberLine() {
  const vals = [-1,0,1,2,3,4,5,6,7,8,9,10]
  const S=28, sx=18, y=24
  return (
    <div className="svg-wrap">
      <svg width={vals.length*S+sx+28} height={48}>
        <line x1={sx} y1={y} x2={vals.length*S+sx+12} y2={y} stroke="#0f172a" strokeWidth="1.8"/>
        <polygon points={`${vals.length*S+sx+12},${y} ${vals.length*S+sx+2},${y-5} ${vals.length*S+sx+2},${y+5}`} fill="#0f172a"/>
        {vals.map((v,i)=>(
          <g key={v}>
            <line x1={sx+i*S} y1={y-6} x2={sx+i*S} y2={y+6} stroke="#0f172a" strokeWidth="1.6"/>
            <text x={sx+i*S} y={y+20} textAnchor="middle" fontSize="10" fontFamily="Georgia,serif" fill="#374151">{v}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function CoordGrid({ showLine=false }) {
  const S=30,ML=42,MT=22,MR=28,MB=30
  const xMn=-2,xMx=4,yMn=-4,yMx=6
  const W=(xMx-xMn)*S+ML+MR, H=(yMx-yMn)*S+MT+MB
  const ox=ML+(-xMn)*S, oy=MT+yMx*S
  const px=v=>ox+v*S, py=v=>oy-v*S
  return (
    <div className="svg-wrap">
      <svg width={W} height={H}>
        <g stroke="#eee" strokeWidth="0.8">
          {[-2,-1,0,1,2,3,4].map(v=><line key={`xg${v}`} x1={px(v)} y1={MT} x2={px(v)} y2={H-MB}/>)}
          {[-4,-3,-2,-1,0,1,2,3,4,5,6].map(v=><line key={`yg${v}`} x1={ML} y1={py(v)} x2={W-MR} y2={py(v)}/>)}
        </g>
        <line x1={ML} y1={oy} x2={W-MR+14} y2={oy} stroke="#0f172a" strokeWidth="1.8"/>
        <line x1={ox} y1={H-MB} x2={ox} y2={MT-12} stroke="#0f172a" strokeWidth="1.8"/>
        <polygon points={`${W-MR+14},${oy} ${W-MR+4},${oy-4} ${W-MR+4},${oy+4}`} fill="#0f172a"/>
        <polygon points={`${ox},${MT-12} ${ox-4},${MT-2} ${ox+4},${MT-2}`} fill="#0f172a"/>
        <text x={W-MR+16} y={oy+5} fontSize="12" fontStyle="italic" fontFamily="Georgia,serif">x</text>
        <text x={ox+5} y={MT-8} fontSize="12" fontStyle="italic" fontFamily="Georgia,serif">y</text>
        {[-2,-1,1,2,3,4].map(v=>(
          <g key={`xt${v}`}>
            <line x1={px(v)} y1={oy-4} x2={px(v)} y2={oy+4} stroke="#0f172a" strokeWidth="1.4"/>
            <text x={px(v)} y={oy+17} textAnchor="middle" fontSize="10" fontFamily="Georgia,serif">{v}</text>
          </g>
        ))}
        {[-4,-3,-2,-1,1,2,3,4,5,6].map(v=>(
          <g key={`yt${v}`}>
            <line x1={ox-4} y1={py(v)} x2={ox+4} y2={py(v)} stroke="#0f172a" strokeWidth="1.4"/>
            <text x={ox-8} y={py(v)+4} textAnchor="end" fontSize="10" fontFamily="Georgia,serif">{v}</text>
          </g>
        ))}
        <text x={ox-16} y={oy+17} fontSize="10" fontFamily="Georgia,serif">O</text>
        {showLine && <line x1={px(-1)} y1={py(-3)} x2={px(3)} y2={py(5)} stroke="#c0392b" strokeWidth="2.5" strokeLinecap="round"/>}
      </svg>
    </div>
  )
}

function CircleDiagram({ showTangent=false }) {
  const S=20, OX=155, OY=155
  const px=v=>OX+v*S, py=v=>OY-v*S, R=5*S
  return (
    <div className="svg-wrap" style={{flexDirection:'column'}}>
      <svg width={320} height={320}>
        <g stroke="#f4f4f8" strokeWidth="0.6">
          {[-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7].map(v=>(
            <g key={v}>
              <line x1={px(v)} y1={8} x2={px(v)} y2={312}/>
              <line x1={8} y1={py(v)} x2={312} y2={py(v)}/>
            </g>
          ))}
        </g>
        <line x1={10} y1={OY} x2={308} y2={OY} stroke="#0f172a" strokeWidth="1.6"/>
        <line x1={OX} y1={308} x2={OX} y2={10} stroke="#0f172a" strokeWidth="1.6"/>
        <polygon points={`308,${OY} 298,${OY-4} 298,${OY+4}`} fill="#0f172a"/>
        <polygon points={`${OX},8 ${OX-4},18 ${OX+4},18`} fill="#0f172a"/>
        <text x={311} y={OY+5} fontSize="11" fontStyle="italic" fontFamily="Georgia,serif">x</text>
        <text x={OX+5} y={13} fontSize="11" fontStyle="italic" fontFamily="Georgia,serif">y</text>
        {[-5,-4,-3,-2,-1,1,2,3,4,5].map(v=>(
          <g key={v}>
            <line x1={px(v)} y1={OY-3} x2={px(v)} y2={OY+3} stroke="#666" strokeWidth="1"/>
            <text x={px(v)} y={OY+14} textAnchor="middle" fontSize="8" fill="#888" fontFamily="Georgia,serif">{v}</text>
            <line x1={OX-3} y1={py(v)} x2={OX+3} y2={py(v)} stroke="#666" strokeWidth="1"/>
            <text x={OX-7} y={py(v)+3} textAnchor="end" fontSize="8" fill="#888" fontFamily="Georgia,serif">{v}</text>
          </g>
        ))}
        <text x={OX-14} y={OY+14} fontSize="8" fill="#888" fontFamily="Georgia,serif">O</text>
        <circle cx={OX} cy={OY} r={R} fill="rgba(21,101,192,0.06)" stroke="#1565c0" strokeWidth="2"/>
        <line x1={OX} y1={OY} x2={px(3)} y2={py(4)} stroke="#ea580c" strokeWidth="1.5" strokeDasharray="4,3"/>
        <circle cx={px(3)} cy={py(4)} r={4.5} fill="#c62828"/>
        <text x={px(3)+8} y={py(4)-6} fontSize="11" fontWeight="bold" fill="#c62828" fontFamily="Georgia,serif">P(3, 4)</text>
        {showTangent && (
          <>
            <line x1={px(-1)} y1={py(7)} x2={px(7)} y2={py(1)} stroke="#166534" strokeWidth="2.2"/>
            <text x={px(3.5)} y={py(4.2)-12} fontSize="9" fill="#166534" textAnchor="middle" fontFamily="Georgia,serif">3x + 4y = 25</text>
          </>
        )}
      </svg>
      <p className="svg-caption">Circle x² + y² = 25 with centre O. Point P(3, 4) on the circle.</p>
    </div>
  )
}

function VennTwo({ showV=false }) {
  return (
    <div className="svg-wrap">
      <svg width={370} height={225}>
        <rect x="3" y="3" width="364" height="219" fill="none" stroke="#555" strokeWidth="1.5" rx="6"/>
        <text x="13" y="23" fontSize="14" fontStyle="italic" fontFamily="Georgia,serif">ξ</text>
        <circle cx="143" cy="114" r="77" fill="rgba(37,99,235,0.09)" stroke="#2563eb" strokeWidth="2"/>
        <circle cx="227" cy="114" r="77" fill="rgba(234,88,12,0.09)" stroke="#ea580c" strokeWidth="2"/>
        <text x="82" y="52" fontSize="18" fontWeight="bold" fill="#2563eb" fontFamily="Georgia,serif">F</text>
        <text x="265" y="52" fontSize="18" fontWeight="bold" fill="#ea580c" fontFamily="Georgia,serif">T</text>
        {showV ? (
          <>
            <text x="92" y="120" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#1e40af">18</text>
            <text x="185" y="120" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#374151">8</text>
            <text x="278" y="120" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#c2410c">11</text>
            <text x="338" y="192" textAnchor="middle" fontSize="15" fill="#374151">13</text>
          </>
        ) : (
          <>
            {[[64,104],[157,104],[249,104],[318,173]].map(([x,y],i)=>(
              <rect key={i} x={x} y={y} width={56} height={24} fill="white" stroke="#ddd" strokeWidth="1" rx="4" fillOpacity="0.9"/>
            ))}
          </>
        )}
      </svg>
    </div>
  )
}

function VennThree({ showV=false }) {
  return (
    <div className="svg-wrap" style={{flexDirection:'column'}}>
      <svg width={390} height={318}>
        <rect x="3" y="3" width="384" height="312" fill="none" stroke="#555" strokeWidth="1.5" rx="6"/>
        <text x="13" y="24" fontSize="14" fontStyle="italic" fontFamily="Georgia,serif">ξ</text>
        <circle cx="158" cy="128" r="87" fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth="2"/>
        <circle cx="232" cy="128" r="87" fill="rgba(220,38,38,0.08)" stroke="#dc2626" strokeWidth="2"/>
        <circle cx="195" cy="198" r="87" fill="rgba(22,163,74,0.08)" stroke="#16a34a" strokeWidth="2"/>
        <text x="93" y="56" fontSize="17" fontWeight="bold" fill="#2563eb" fontFamily="Georgia,serif">A</text>
        <text x="282" y="56" fontSize="17" fontWeight="bold" fill="#dc2626" fontFamily="Georgia,serif">B</text>
        <text x="190" y="308" fontSize="17" fontWeight="bold" fill="#16a34a" fontFamily="Georgia,serif">C</text>
        {showV && (
          <g fontSize="11" fontFamily="Georgia,serif" textAnchor="middle">
            <text x="108" y="118" fill="#1d4ed8" fontWeight="bold">2, 4, 8, 14</text>
            <text x="282" y="118" fill="#b91c1c" fontWeight="bold">3, 9</text>
            <text x="195" y="272" fill="#15803d" fontWeight="bold">5</text>
            <text x="195" y="91" fontWeight="bold" fill="#111">6, 12</text>
            <text x="146" y="196" fontWeight="bold" fill="#111">10</text>
            <text x="244" y="196" fontWeight="bold" fill="#111">15</text>
            <text x="195" y="158" fill="#aaa" fontSize="11">∅</text>
            <text x="36" y="280" fill="#555">1, 7, 11, 13</text>
          </g>
        )}
      </svg>
      {showV && <p className="svg-caption">Completed Venn diagram. Outside all sets: &#123;1, 7, 11, 13&#125;</p>}
    </div>
  )
}

function TreeDiagram({ showV=false }) {
  const Lbl = (x,y,val,col) => showV
    ? <text key={`${x}${y}`} x={x} y={y} textAnchor="middle" fontSize="12" fill={col} fontWeight="bold" fontFamily="Georgia,serif">{val}</text>
    : <rect key={`${x}${y}`} x={x-15} y={y-12} width={30} height={17} fill="white" stroke="#ccc" strokeWidth="1" rx="3"/>
  return (
    <div className="svg-wrap" style={{overflowX:'auto'}}>
      <svg width={560} height={345} style={{minWidth:420}}>
        <text x="62" y="13" textAnchor="middle" fontSize="9" fill="#888" fontFamily="Georgia,serif">Start</text>
        <text x="218" y="13" textAnchor="middle" fontSize="9" fill="#888" fontFamily="Georgia,serif">1st pick</text>
        <text x="392" y="13" textAnchor="middle" fontSize="9" fill="#888" fontFamily="Georgia,serif">2nd pick</text>
        <circle cx={62} cy={168} r={5} fill="#222"/>
        <line x1={67} y1={164} x2={211} y2={83} stroke="#374151" strokeWidth="1.6"/>
        {Lbl(134,114,"2/5","#c62828")}
        <line x1={67} y1={172} x2={211} y2={253} stroke="#374151" strokeWidth="1.6"/>
        {Lbl(134,220,"3/5","#1565c0")}
        <circle cx={216} cy={81} r={4} fill="#c62828"/>
        <text x={226} y={86} fontSize="13" fontWeight="bold" fill="#c62828" fontFamily="Georgia,serif">R</text>
        <line x1={220} y1={78} x2={384} y2={33} stroke="#374151" strokeWidth="1.6"/>
        {Lbl(304,48,"1/3","#c62828")}
        <line x1={220} y1={84} x2={384} y2={129} stroke="#374151" strokeWidth="1.6"/>
        {Lbl(304,110,"2/3","#1565c0")}
        <circle cx={216} cy={255} r={4} fill="#1565c0"/>
        <text x={226} y={260} fontSize="13" fontWeight="bold" fill="#1565c0" fontFamily="Georgia,serif">B</text>
        <line x1={220} y1={252} x2={384} y2={207} stroke="#374151" strokeWidth="1.6"/>
        {Lbl(304,222,"4/9","#c62828")}
        <line x1={220} y1={258} x2={384} y2={313} stroke="#374151" strokeWidth="1.6"/>
        {Lbl(304,297,"5/9","#1565c0")}
        {[
          {cx:388,cy:30,lbl:"R, R",col:"#c62828",out:"P = 2/15"},
          {cx:388,cy:132,lbl:"R, B",col:"#555",out:"P = 4/15"},
          {cx:388,cy:204,lbl:"B, R",col:"#555",out:"P = 4/15"},
          {cx:388,cy:316,lbl:"B, B",col:"#1565c0",out:"P = 1/3"},
        ].map(({cx,cy,lbl,col,out},i)=>(
          <g key={i}>
            <circle cx={cx} cy={cy} r={3} fill="#555"/>
            <text x={cx+8} y={cy+5} fontSize="12" fontFamily="Georgia,serif" fill={col} fontWeight="bold">{lbl}</text>
            {showV && <text x={cx+58} y={cy+5} fontSize="10" fontFamily="JetBrains Mono,monospace" fill="#166534">{out}</text>}
          </g>
        ))}
      </svg>
    </div>
  )
}

function SampleGrid({ showV=false }) {
  return (
    <div className="tbl-wrap" style={{marginLeft:0}}>
      <table className="exam-tbl">
        <thead>
          <tr>
            <td style={{background:'#f1f5f9',fontWeight:'bold',padding:'6px 10px'}} colSpan={2} rowSpan={2}>+</td>
            <th colSpan={4} style={{background:'#dbeafe',padding:'5px 16px',textAlign:'center'}}>Die 2</th>
          </tr>
          <tr>
            {[1,2,3,4].map(v=><th key={v}>{v}</th>)}
          </tr>
        </thead>
        <tbody>
          {[1,2,3,4].map((v1,ri)=>(
            <tr key={v1}>
              {ri===0 && <td rowSpan={4} style={{background:'#fef2f2',fontWeight:'bold',textAlign:'center',writingMode:'vertical-lr',padding:'8px 6px'}}>Die 1</td>}
              <td className="header-cell" style={{background:'#fff7f7'}}>{v1}</td>
              {[1,2,3,4].map(v2=>(
                <td key={v2} className={showV?'answer-cell':'blank-cell'}>
                  {showV ? v1+v2 : '_'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   EXAM PRIMITIVES
════════════════════════════════════════════════════════════ */
function AK({ children }) {
  const rev = useRev()
  if (!rev) return null
  return (
    <div className="ak">
      <div className="ak-head">Answer / Mark Scheme</div>
      <div className="ak-body">{children}</div>
    </div>
  )
}

function WB({ h=80 }) {
  const { revealed, qn, partId, workings, setWorkings } = useQ()
  if (revealed) return null
  const key = partKey(qn, partId)
  const value = workings?.[key] || ''
  return (
    <label className="wb interactive-working" style={{minHeight:h}}>
      <span className="wb-label">Working space — autosaved</span>
      <textarea
        value={value}
        onChange={e => setWorkings(prev => ({...prev, [key]: e.target.value}))}
        placeholder="Type working here, or leave it blank if using paper..."
        aria-label={`Working for question ${qn}${partId}`}
      />
    </label>
  )
}

function AL({ pre='', placeholder='Type final answer...' }) {
  const { revealed, qn, partId, answers, setAnswers, checkPart } = useQ()
  if (revealed) return null
  const key = partKey(qn, partId)
  const value = answers?.[key] || ''
  return (
    <label className="al interactive-answer">
      {pre && <span className="al-pre">{pre}</span>}
      <input
        value={value}
        onChange={e => setAnswers(prev => ({...prev, [key]: e.target.value}))}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); checkPart?.(key) } }}
        placeholder={placeholder}
        aria-label={`Final answer for question ${qn}${partId}`}
      />
    </label>
  )
}

function Info({ children }) {
  return <div className="q-info">{children}</div>
}

function Eq({ lines }) {
  return (
    <div className="eq-block">
      {lines.map((l,i)=><span key={i} className="eq-line">{l}</span>)}
    </div>
  )
}

function Q({ n, topic, tm, revealed, onToggle, answers, setAnswers, workings, setWorkings, completed, setCompleted, checked, setChecked, checkPart, children }) {
  const ctxBase = useMemo(() => ({ revealed, qn:n, answers, setAnswers, workings, setWorkings, completed, setCompleted, checked, setChecked, checkPart }), [revealed, n, answers, setAnswers, workings, setWorkings, completed, setCompleted, checked, setChecked, checkPart])
  const qCompleted = Object.keys(completed || {}).filter(k => k.startsWith(`q${n}-`) && completed[k]).length
  const qAnswered = Object.entries(answers || {}).filter(([k,v]) => k.startsWith(`q${n}-`) && String(v).trim()).length
  const qCorrect = Object.entries(checked || {}).filter(([k,v]) => k.startsWith(`q${n}-`) && v === 'correct').length
  const qIncorrect = Object.entries(checked || {}).filter(([k,v]) => k.startsWith(`q${n}-`) && v === 'incorrect').length
  return (
    <QCtx.Provider value={ctxBase}>
      <section className={`question${revealed?' is-revealed':''}${qCompleted?' has-completed':''}${qIncorrect?' has-incorrect':qCorrect?' has-correct':''}`} id={`q${n}`}>
        <div className="q-header">
          <div className="q-header-left">
            <span className="q-num">{n}</span>
            <span className="q-topic">{topic}</span>
          </div>
          <div className="q-header-right">
            <span className="q-status-pill">{qAnswered} answered · {qCorrect} correct · {qIncorrect} retry</span>
            <span className="q-marks">[{tm} marks]</span>
            <button className={`q-reveal-btn${revealed?' active':''}`} onClick={()=>onToggle(n)}>
              <svg viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 0a6 6 0 100 12A6 6 0 006 0zm.75 9H5.25V5.25h1.5V9zm0-4.5H5.25v-1.5h1.5v1.5z"/>
              </svg>
              {revealed ? 'Hide Answer' : 'Show Answer'}
            </button>
          </div>
        </div>
        <div className="q-body">{children}</div>
      </section>
    </QCtx.Provider>
  )
}

function Part({ lbl, m, children }) {
  const ctx = useQ()
  const key = partKey(ctx.qn, lbl)
  const status = ctx.checked?.[key]
  const done = Boolean(ctx.completed?.[key])
  const value = ctx.answers?.[key] || ''
  const working = ctx.workings?.[key] || ''
  const attempted = Boolean(String(value).trim() || String(working).trim())
  const hasAutoRule = Boolean(ANSWER_RULES[key])
  const statusText = status === 'correct' ? 'Correct' : status === 'incorrect' ? 'Try again' : status === 'review' ? 'Self-review' : attempted ? 'Autosaved' : 'Not started'
  return (
    <QCtx.Provider value={{...ctx, partId:lbl}}>
      <div className={`part${done?' is-done':''}${attempted?' is-attempted':''}${status?` feedback-${status}`:''}`}>
        <span className="part-label">({lbl})</span>
        <div className="part-content">{children}</div>
        <div className="part-actions no-print">
          <button
            type="button"
            className={`part-done-btn${status?' active':''}${status==='correct'?' correct':''}${status==='incorrect'?' incorrect':''}`}
            onClick={() => ctx.checkPart?.(key)}
          >
            {status === 'correct' ? 'Correct' : status === 'incorrect' ? 'Try again' : hasAutoRule ? 'Done / Check' : 'Done / Review'}
          </button>
          <span className={`part-attempted status-${status || 'idle'}`}>{statusText}</span>
        </div>
        <span className="part-marks">[{m}]</span>
      </div>
    </QCtx.Provider>
  )
}

function InlineTbl({ xVals, yFn }) {
  const rev = useRev()
  return (
    <div className="tbl-wrap">
      <table className="exam-tbl">
        <tbody>
          <tr>
            <td className="header-cell">x</td>
            {xVals.map(v=><td key={v}>{v}</td>)}
          </tr>
          <tr>
            <td className="header-cell">y</td>
            {xVals.map(v=>(
              <td key={v} className={rev?'answer-cell':'blank-cell'} style={{minWidth:36}}>
                {rev ? yFn(v) : '_'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function DataTbl({ hdrs, rows }) {
  return (
    <div className="tbl-wrap">
      <table className="exam-tbl">
        <thead><tr>{hdrs.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((row,ri)=><tr key={ri}>{row.map((c,ci)=><td key={ci}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   SIDEBAR CONFIG
════════════════════════════════════════════════════════════ */
const SECTIONS = [
  { letter:'A', title:'Algebra & Number', color:'#0f2044', qs:[
    {n:1,label:'Inequalities'},{n:2,label:'Simultaneous Eqns'},{n:3,label:'Changing Subject'},{n:4,label:'Bounds'},
  ]},
  { letter:'B', title:'Sequences & Proportion', color:'#0d3321', qs:[
    {n:5,label:'Linear Sequences'},{n:6,label:'Quadratic Sequences'},{n:7,label:'Fibonacci'},{n:8,label:'Proportion'},
  ]},
  { letter:'C', title:'Graphs & Functions', color:'#2d1544', qs:[
    {n:9,label:'Linear Graphs'},{n:10,label:'Eqns of Lines'},{n:11,label:'Tangent to Circle'},{n:12,label:'Functions'},
  ]},
  { letter:'D', title:'Probability & Sets', color:'#3d1908', qs:[
    {n:13,label:'Sets — 3 Sets'},{n:14,label:'Relative Frequency'},{n:15,label:'Venn Diagrams'},
    {n:16,label:'Tree Diagrams'},{n:17,label:'Sample Spaces'},{n:18,label:'Mutually Exclusive'},
    {n:19,label:'Conditional Prob.'},{n:20,label:'Dep. & Indep. Events'},
  ]},
]
const MARKS = {A:24,B:15,C:20,D:37}

/* ════════════════════════════════════════════════════════════
   SIDEBAR
════════════════════════════════════════════════════════════ */
function Sidebar({ showAll, onToggleAll, revealedSet, mobileOpen, onCloseMobile, progress, onResetProgress }) {
  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({behavior:'smooth', block:'start'})
    onCloseMobile?.()
  }
  return (
    <nav className={`sidebar${mobileOpen?' mobile-open':''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">M</div>
        <h1>Mathematics<br/>Practice Exam</h1>
        <p>100 marks · 2 h 30 min<br/>Sections A – D</p>
      </div>

      <div className="sidebar-progress no-print">
        <div className="progress-row"><span>Study progress</span><strong>{progress.completed}/{TOTAL_PARTS}</strong></div>
        <div className="progress-track"><div style={{width:`${progress.percent}%`}} /></div>
        <div className="progress-sub">{progress.answered} answers · {progress.correct} correct · {progress.incorrect} retry · {progress.revealed} revealed</div>
      </div>

      <div className="sidebar-controls">
        <button className={`btn-reveal-all${showAll?' active':''}`} onClick={onToggleAll}>
          <span className="btn-dot"/>
          {showAll ? 'Hide All Answers' : 'Reveal All Answers'}
        </button>
        <button className="btn-print" onClick={()=>window.print()}>
          <span>🖨</span> Print / Save PDF
        </button>
        <button className="btn-print" onClick={onResetProgress}>
          <span>↺</span> Reset saved work
        </button>
      </div>

      <div className="sidebar-nav">
        {SECTIONS.map(sec=>(
          <div className="nav-section" key={sec.letter}>
            <div className="nav-section-header">
              <div className="nav-sec-badge" style={{background:sec.color, color:'rgba(255,255,255,.8)'}}>
                {sec.letter}
              </div>
              <span className="nav-sec-title">{sec.title}</span>
              <span className="nav-sec-marks">{MARKS[sec.letter]}m</span>
            </div>
            <div className="nav-q-list">
              {sec.qs.map(q=>{
                const rev = showAll || revealedSet.has(q.n)
                return (
                  <button key={q.n} className={`nav-q-item${rev?' revealed':''}`}
                    onClick={()=>scrollTo(`q${q.n}`)}>
                    <span className="nav-q-num">{q.n}</span>
                    <span className="nav-q-label">{q.label}</span>
                    <span className="nav-q-dot"/>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        Press <strong style={{color:'rgba(255,255,255,.35)'}}>Show Answer</strong> on each question<br/>
        or <strong style={{color:'rgba(255,255,255,.35)'}}>Reveal All</strong> to show the full mark scheme.
      </div>
    </nav>
  )
}

/* ════════════════════════════════════════════════════════════
   MAIN APP
════════════════════════════════════════════════════════════ */
export default function App() {
  const [showAll, setShowAll] = useState(false)
  const [revealedSet, setRevealedSet] = useState(new Set())
  const [mobileOpen, setMobileOpen] = useState(false)
  const [answers, setAnswers] = useLocalStorageState('maths-practice-answers-v1', {})
  const [workings, setWorkings] = useLocalStorageState('maths-practice-workings-v1', {})
  const [completed, setCompleted] = useLocalStorageState('maths-practice-completed-v1', {})
  const [checked, setChecked] = useLocalStorageState('maths-practice-checked-v2', {})

  const isRev = useCallback(n => showAll || revealedSet.has(n), [showAll, revealedSet])

  const toggleQ = useCallback(n => {
    setRevealedSet(prev => {
      const next = new Set(prev)
      next.has(n) ? next.delete(n) : next.add(n)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setShowAll(s => { if (!s) setRevealedSet(new Set()); return !s })
  }, [])

  const checkPart = useCallback((key) => {
    const result = checkAnswerValue(key, answers?.[key] || '')
    const finalResult = result === 'blank' ? ((workings?.[key] || '').trim() ? 'review' : 'blank') : result
    if (finalResult === 'blank') {
      setChecked(prev => { const next = {...prev}; delete next[key]; return next })
      return
    }
    setChecked(prev => ({...prev, [key]: finalResult}))
    setCompleted(prev => ({...prev, [key]: finalResult === 'correct' || finalResult === 'review'}))
  }, [answers, workings, setChecked, setCompleted])

  const progress = useMemo(() => {
    const answered = Object.values(answers).filter(v => String(v).trim()).length
    const worked = Object.values(workings).filter(v => String(v).trim()).length
    const completedCount = Object.values(completed).filter(Boolean).length
    const correct = Object.values(checked).filter(v => v === 'correct').length
    const incorrect = Object.values(checked).filter(v => v === 'incorrect').length
    const revealed = showAll ? 20 : revealedSet.size
    return { answered, worked, completed:completedCount, correct, incorrect, revealed, percent:Math.min(100, Math.round((completedCount / TOTAL_PARTS) * 100)) }
  }, [answers, workings, completed, checked, showAll, revealedSet])

  const resetProgress = useCallback(() => {
    if (!window.confirm('Clear all typed answers, working, and done marks?')) return
    setAnswers({}); setWorkings({}); setCompleted({}); setChecked({}); setRevealedSet(new Set()); setShowAll(false)
  }, [setAnswers, setWorkings, setCompleted, setChecked])

  const qProps = n => ({ n, revealed:isRev(n), onToggle:toggleQ, answers, setAnswers, workings, setWorkings, completed, setCompleted, checked, setChecked, checkPart })

  return (
    <div className="app">
      <Sidebar
        showAll={showAll} onToggleAll={toggleAll}
        revealedSet={revealedSet}
        mobileOpen={mobileOpen} onCloseMobile={()=>setMobileOpen(false)}
        progress={progress} onResetProgress={resetProgress}
      />

      <button className="sidebar-toggle no-print" onClick={()=>setMobileOpen(o=>!o)}>☰</button>

      <main className="main-content">
        <div className="exam-wrap">

          {/* ── EXAM HEADER ───────────────────────────────── */}
          <div className="exam-header">
            <div className="exam-header-top">
              <div>
                <div className="exam-title">MATHEMATICS</div>
                <div className="exam-subtitle">Comprehensive Practice Examination · 100 Marks · 2 hours 30 minutes</div>
              </div>
              <div className="exam-badge">Practice Paper</div>
            </div>
            <div className="exam-meta-grid">
              {[['Candidate Name:'],['Date:'],['Centre Number:'],['Candidate No.:']].map(([lbl],i)=>(
                <div key={i} className="exam-meta-row">
                  <span className="exam-meta-label">{lbl}</span>
                  <div className="exam-meta-line"/>
                </div>
              ))}
            </div>
          </div>

          {/* ── INSTRUCTIONS ─────────────────────────────── */}
          <div className="instructions">
            <h3>Instructions to Candidates</h3>
            <ul>
              <li>Answer <strong>all</strong> questions in all four sections, or use this as targeted topic practice.</li>
              <li>Type final answers into the answer boxes and working into the autosaved working spaces. You can still print if preferred.</li>
              <li>Press <strong>Done / Check</strong> for instant feedback where a final-answer box is available. Written explanations and diagrams can still be self-reviewed with the mark scheme.</li>
              <li>Show all working clearly — method marks may be awarded for correct method even if the final answer is wrong.</li>
              <li>Give non-exact answers to <strong>3 significant figures</strong> unless instructed otherwise.</li>
              <li>Marks for each part are shown in square brackets. <strong>Total: 100 marks.</strong></li>
              <li><strong>No calculator</strong> permitted in Section A. Calculator permitted in Sections B – D.</li>
              <li>Give probabilities as fractions or decimals unless the question states otherwise.</li>
            </ul>
          </div>

          {/* ══════════════════════════════════════════════
              SECTION A — ALGEBRA & NUMBER (24 marks)
              ══════════════════════════════════════════════ */}
          <div className="sec-header" id="sec-A" data-letter="A" style={{background:SECTIONS[0].color}}>
            <div className="sec-header-left">
              <div className="sec-letter-badge">A</div>
              <div>
                <div className="sec-title">Algebra &amp; Number</div>
                <div className="sec-qs">Questions 1 – 4</div>
              </div>
            </div>
            <div className="sec-right">
              <div className="sec-marks">24 marks</div>
              <div className="sec-calc">No calculator</div>
            </div>
          </div>

          <Q {...qProps(1)} topic="Inequalities — linear, compound, quadratic &amp; double" tm={8}>
            <Part lbl="a" m={2}>
              Solve the inequality <strong>3x − 4 &gt; 11</strong>. Mark your solution on the number line.
              <NumberLine/>
              <AK>3x &gt; 15 → <strong>x &gt; 5</strong> (open circle at 5, shaded arrow pointing right)</AK>
              <AL pre="Answer: x"/>
            </Part>
            <Part lbl="b" m={2}>
              Solve the compound inequality: <strong>−3 ≤ 2x + 1 &lt; 9</strong>
              <WB h={65}/>
              <AK>Subtract 1 throughout: −4 ≤ 2x &lt; 8 → divide by 2: <strong>−2 ≤ x &lt; 4</strong></AK>
              <AL pre="Answer:"/>
            </Part>
            <Part lbl="c" m={3}>
              Solve the quadratic inequality: <strong>x² − x − 6 &lt; 0</strong>
              <WB h={110}/>
              <AK>Factorise: (x − 3)(x + 2) &lt; 0 → Critical values x = −2, x = 3.{'\n'}Parabola opens upward → expression negative between roots. ∴ <strong>−2 &lt; x &lt; 3</strong></AK>
              <AL pre="Answer:"/>
            </Part>
            <Part lbl="d" m={1}>
              List all integer values of n satisfying the double inequality: <strong>2 &lt; 3n − 1 ≤ 14</strong>
              <WB h={55}/>
              <AK>Add 1: 3 &lt; 3n ≤ 15 → divide by 3: 1 &lt; n ≤ 5 → Integers: <strong>2, 3, 4, 5</strong></AK>
              <AL pre="Answer:"/>
            </Part>
          </Q>

          <Q {...qProps(2)} topic="Simultaneous Equations — linear and quadratic" tm={7}>
            <Part lbl="a" m={3}>
              Solve the simultaneous equations:
              <Eq lines={['3x + 2y = 16','x − y = 2']}/>
              <WB h={120}/>
              <AK>From 2nd: x = y + 2. Sub: 3(y+2)+2y=16 → 5y=10 → y=2, x=4.{'\n'}<strong>x = 4, y = 2</strong></AK>
              <AL pre="x = ___ , y ="/>
            </Part>
            <Part lbl="b" m={4}>
              Solve the quadratic simultaneous equations:
              <Eq lines={['y = x + 1','y = x² − 1']}/>
              <WB h={130}/>
              <AK>x+1 = x²−1 → x²−x−2=0 → (x−2)(x+1)=0 → x=2 or x=−1.{'\n'}y=3 or y=0. Solutions: <strong>(2, 3) and (−1, 0)</strong></AK>
              <AL pre="Solutions:"/>
            </Part>
          </Q>

          <Q {...qProps(3)} topic="Changing the Subject of an Equation" tm={4}>
            <Part lbl="a" m={2}>
              Make <em><strong>r</strong></em> the subject of &nbsp; A = πr²
              <WB h={75}/>
              <AK>r² = A/π → <strong>r = √(A/π)</strong></AK>
              <AL pre="r ="/>
            </Part>
            <Part lbl="b" m={2}>
              Make <em><strong>x</strong></em> the subject of &nbsp; y = (2x + 3) / (x − 1)
              <WB h={105}/>
              <AK>y(x−1) = 2x+3 → yx−y = 2x+3 → x(y−2) = y+3 → <strong>x = (y+3)/(y−2)</strong></AK>
              <AL pre="x ="/>
            </Part>
          </Q>

          <Q {...qProps(4)} topic="Upper and Lower Bounds" tm={5}>
            <Info>A rectangle has length 12.4 cm and width 7.8 cm, both measured to 1 decimal place.</Info>
            <Part lbl="a" m={1}>
              Write the lower and upper bounds for the <em>length</em>.
              <AK>Lower bound = <strong>12.35 cm</strong>, Upper bound = <strong>12.45 cm</strong></AK>
              <AL pre="LB = ___ cm , UB ="/>
            </Part>
            <Part lbl="b" m={2}>
              Calculate the upper bound for the <em>area</em> of the rectangle.
              <WB h={65}/>
              <AK>UB(area) = 12.45 × 7.85 = <strong>97.7325 cm²</strong></AK>
              <AL pre="Answer:"/>
            </Part>
            <Part lbl="c" m={2}>
              A train travels 460 km (nearest 10 km) in 3.5 hours (nearest 0.1 h). Find the upper bound of the average speed to 3 s.f.
              <WB h={80}/>
              <AK>UB dist = 465 km, LB time = 3.45 h → UB speed = 465 ÷ 3.45 = 134.78… ≈ <strong>135 km/h</strong></AK>
              <AL pre="Answer:"/>
            </Part>
          </Q>

          {/* ══════════════════════════════════════════════
              SECTION B — SEQUENCES & PROPORTION (15 marks)
              ══════════════════════════════════════════════ */}
          <div className="sec-header" id="sec-B" data-letter="B" style={{background:SECTIONS[1].color}}>
            <div className="sec-header-left">
              <div className="sec-letter-badge">B</div>
              <div><div className="sec-title">Sequences &amp; Proportion</div><div className="sec-qs">Questions 5 – 8</div></div>
            </div>
            <div className="sec-right"><div className="sec-marks">15 marks</div><div className="sec-calc">Calculator permitted</div></div>
          </div>

          <Q {...qProps(5)} topic="Linear Sequences" tm={4}>
            <Part lbl="a" m={1}>
              The nth term of a sequence is <strong>5n − 3</strong>. Write the first four terms.
              <AK>n=1: 2, n=2: 7, n=3: 12, n=4: 17 → <strong>2, 7, 12, 17</strong></AK>
              <AL pre="Answer:"/>
            </Part>
            <Part lbl="b" m={1}>
              Is <strong>98</strong> a term in this sequence? Show your reasoning.
              <WB h={55}/>
              <AK>5n−3=98 → 5n=101 → n=20.2. Not an integer. <strong>98 is NOT a term in this sequence.</strong></AK>
            </Part>
            <Part lbl="c" m={2}>
              Find the nth term of the sequence: <strong>7, 11, 15, 19, …</strong>
              <WB h={65}/>
              <AK>Common difference = 4 → 4n + c. n=1: 4+c=7 → c=3. <strong>nth term = 4n + 3</strong></AK>
              <AL pre="nth term ="/>
            </Part>
          </Q>

          <Q {...qProps(6)} topic="Quadratic Sequences" tm={5}>
            <Info>Consider the sequence: <strong>3, &nbsp;8, &nbsp;15, &nbsp;24, &nbsp;35</strong></Info>
            <Part lbl="a" m={3}>
              Find the nth term using differences. Show your method fully.
              <WB h={130}/>
              <AK>1st diffs: 5, 7, 9, 11 | 2nd diffs: 2, 2, 2 → coefficient of n² = 1.{'\n'}Subtract n²: 2, 4, 6, 8, 10 → linear remainder: 2n.{'\n'}<strong>nth term = n² + 2n</strong></AK>
              <AL pre="nth term ="/>
            </Part>
            <Part lbl="b" m={1}>
              Find the <strong>10th term</strong>.
              <AK>10² + 2(10) = 100 + 20 = <strong>120</strong></AK>
              <AL pre="10th term ="/>
            </Part>
            <Part lbl="c" m={1}>
              Which term has value <strong>195</strong>?
              <WB h={75}/>
              <AK>n²+2n = 195 → n²+2n−195=0 → (n+15)(n−13)=0 → n=13. <strong>The 13th term.</strong></AK>
              <AL pre="The ___ th term"/>
            </Part>
          </Q>

          <Q {...qProps(7)} topic="Fibonacci-type Sequences" tm={3}>
            <Part lbl="a" m={1}>
              A Fibonacci-type sequence starts <strong>2, 7, …</strong> where each term is the sum of the two preceding terms. Write the next four terms.
              <AK>2+7=9, 7+9=16, 9+16=25, 16+25=41 → Next four terms: <strong>9, 16, 25, 41</strong></AK>
              <AL pre="2 , 7 ,"/>
            </Part>
            <Part lbl="b" m={2}>
              In a different Fibonacci-type sequence, the <strong>3rd term is 11</strong> and the <strong>5th term is 29</strong>. Find the 1st term. Show all working.
              <WB h={115}/>
              <AK>Let 1st=a, 2nd=b. Terms: a, b, a+b, a+2b, 2a+3b.{'\n'}a+b=11 and 2a+3b=29. From 1st: a=11−b.{'\n'}Sub: 2(11−b)+3b=29 → 22+b=29 → b=7, a=4.{'\n'}<strong>1st term = 4</strong></AK>
              <AL pre="1st term ="/>
            </Part>
          </Q>

          <Q {...qProps(8)} topic="Direct and Inverse Proportion" tm={3}>
            <Part lbl="a" m={2}>
              y is directly proportional to x². When x = 3, y = 45. Find y when x = 5.
              <WB h={75}/>
              <AK>y = kx² → 45 = 9k → k = 5. y = 5(25) = <strong>125</strong></AK>
              <AL pre="y ="/>
            </Part>
            <Part lbl="b" m={1}>
              p is inversely proportional to q. When p = 8, q = 3. Find p when q = 6.
              <WB h={55}/>
              <AK>pq = k = 24 → p = 24/6 = <strong>4</strong></AK>
              <AL pre="p ="/>
            </Part>
          </Q>

          {/* ══════════════════════════════════════════════
              SECTION C — GRAPHS & FUNCTIONS (20 marks)
              ══════════════════════════════════════════════ */}
          <div className="sec-header" id="sec-C" data-letter="C" style={{background:SECTIONS[2].color}}>
            <div className="sec-header-left">
              <div className="sec-letter-badge">C</div>
              <div><div className="sec-title">Graphs &amp; Functions</div><div className="sec-qs">Questions 9 – 12</div></div>
            </div>
            <div className="sec-right"><div className="sec-marks">20 marks</div><div className="sec-calc">Calculator permitted</div></div>
          </div>

          <Q {...qProps(9)} topic="Linear Graphs" tm={4}>
            <Part lbl="a" m={2}>
              Complete the table of values and draw <strong>y = 2x − 1</strong> for −1 ≤ x ≤ 3 on the axes.
              <InlineTbl xVals={[-1,0,1,2,3]} yFn={x=>2*x-1}/>
              <CoordGrid showLine={isRev(9)}/>
            </Part>
            <Part lbl="b" m={2}>
              Find the gradient and y-intercept of <strong>3y − 6x = 9</strong>.
              <WB h={65}/>
              <AK>3y = 6x+9 → y = 2x+3. <strong>Gradient = 2, y-intercept = 3</strong></AK>
              <AL pre="Gradient = ___ , y-intercept ="/>
            </Part>
          </Q>

          <Q {...qProps(10)} topic="Equations of Lines — equation, parallel &amp; perpendicular" tm={6}>
            <Part lbl="a" m={2}>
              Find the equation of the line passing through <strong>(1, 2)</strong> and <strong>(5, 10)</strong>. Give in the form y = mx + c.
              <WB h={90}/>
              <AK>m = (10−2)/(5−1) = 2. y−2 = 2(x−1) → <strong>y = 2x</strong></AK>
              <AL pre="y ="/>
            </Part>
            <Part lbl="b" m={1}>
              Line L: y = 2x. Write the equation of a line <strong>parallel</strong> to L passing through (0, −5).
              <AK>Same gradient (2), different intercept: <strong>y = 2x − 5</strong></AK>
              <AL pre="Answer:"/>
            </Part>
            <Part lbl="c" m={2}>
              Write the equation of the line <strong>perpendicular</strong> to L passing through (4, 3). Give in the form ax + by = c.
              <WB h={90}/>
              <AK>Perp. gradient = −½. y−3 = −½(x−4) → 2y−6 = −x+4 → <strong>x + 2y = 10</strong></AK>
              <AL pre="Answer:"/>
            </Part>
            <Part lbl="d" m={1}>
              Find the midpoint of the segment joining (1, 2) and (5, 10).
              <AK>((1+5)/2, (2+10)/2) = <strong>(3, 6)</strong></AK>
              <AL pre="Midpoint ="/>
            </Part>
          </Q>

          <Q {...qProps(11)} topic="Equation of a Tangent to a Circle" tm={3}>
            <Info>A circle has equation <strong>x² + y² = 25</strong>. The point P(3, 4) lies on the circle with centre O(0, 0).</Info>
            <CircleDiagram showTangent={isRev(11)}/>
            <Part lbl="a" m={3}>
              Find the equation of the <strong>tangent</strong> to the circle at P. Give in the form ax + by = c.
              <WB h={105}/>
              <AK>Gradient of OP = 4/3. Tangent gradient = −3/4 (perpendicular).{'\n'}y−4 = −¾(x−3) → 4y−16 = −3x+9 → <strong>3x + 4y = 25</strong></AK>
              <AL pre="Answer:"/>
            </Part>
          </Q>

          <Q {...qProps(12)} topic="Function Notation, Composite &amp; Inverse Functions" tm={7}>
            <Info><strong>f(x) = 2x + 1</strong> &nbsp;&nbsp;&nbsp;&nbsp; <strong>g(x) = x² − 3</strong></Info>
            <Part lbl="a" m={1}>Find <strong>f(5)</strong>.<AK>2(5)+1 = <strong>11</strong></AK><AL pre="f(5) ="/>
            </Part>
            <Part lbl="b" m={1}>Find <strong>g(−2)</strong>.<AK>(−2)²−3 = 4−3 = <strong>1</strong></AK><AL pre="g(−2) ="/>
            </Part>
            <Part lbl="c" m={2}>
              Find <strong>fg(x)</strong>. Simplify fully.
              <WB h={75}/>
              <AK>fg(x) = f(x²−3) = 2(x²−3)+1 = <strong>2x² − 5</strong></AK>
              <AL pre="fg(x) ="/>
            </Part>
            <Part lbl="d" m={2}>
              Find <strong>gf(x)</strong>. Expand and simplify fully.
              <WB h={90}/>
              <AK>gf(x) = g(2x+1) = (2x+1)²−3 = 4x²+4x+1−3 = <strong>4x² + 4x − 2</strong></AK>
              <AL pre="gf(x) ="/>
            </Part>
            <Part lbl="e" m={1}>
              Find <strong>f⁻¹(x)</strong>, the inverse function of f.
              <WB h={75}/>
              <AK>y = 2x+1 → x = (y−1)/2 → <strong>f⁻¹(x) = (x−1)/2</strong></AK>
              <AL pre="f⁻¹(x) ="/>
            </Part>
          </Q>

          {/* ══════════════════════════════════════════════
              SECTION D — PROBABILITY & SETS (37 marks)
              ══════════════════════════════════════════════ */}
          <div className="sec-header" id="sec-D" data-letter="D" style={{background:SECTIONS[3].color}}>
            <div className="sec-header-left">
              <div className="sec-letter-badge">D</div>
              <div><div className="sec-title">Probability &amp; Sets</div><div className="sec-qs">Questions 13 – 20</div></div>
            </div>
            <div className="sec-right"><div className="sec-marks">37 marks</div><div className="sec-calc">Calculator permitted</div></div>
          </div>

          <Q {...qProps(13)} topic="Sets — Notation and Operations (up to three sets)" tm={8}>
            <Info>
              <strong>ξ</strong> = &#123;1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15&#125;<br/>
              <strong>A</strong> = &#123;multiples of 2&#125; &nbsp;&nbsp; <strong>B</strong> = &#123;multiples of 3&#125; &nbsp;&nbsp; <strong>C</strong> = &#123;multiples of 5&#125;
            </Info>
            <Part lbl="a" m={1}>List <strong>A ∩ B</strong>.<AK>&#123;6, 12&#125;</AK><AL pre="A ∩ B ="/>
            </Part>
            <Part lbl="b" m={1}>List <strong>A ∪ C</strong>.<AK>&#123;2, 4, 5, 6, 8, 10, 12, 14, 15&#125;</AK><AL pre="A ∪ C ="/>
            </Part>
            <Part lbl="c" m={2}>List <strong>B′</strong> (complement of B in ξ).<AK>&#123;1, 2, 4, 5, 7, 8, 10, 11, 13, 14&#125;</AK><AL pre="B′ ="/>
            </Part>
            <Part lbl="d" m={1}>List <strong>(A ∩ B) ∪ C</strong>.<AK>A∩B = &#123;6,12&#125; → &#123;5, 6, 10, 12, 15&#125;</AK><AL pre="(A∩B)∪C ="/>
            </Part>
            <Part lbl="e" m={1}>Find <strong>n(A ∩ B ∩ C)</strong>.<AK>Multiples of 30 in ξ: none. <strong>n(A∩B∩C) = 0</strong></AK><AL pre="n(A∩B∩C) ="/>
            </Part>
            <Part lbl="f" m={2}>
              Place all elements of ξ correctly in the Venn diagram below.
              <VennThree showV={isRev(13)}/>
            </Part>
          </Q>

          <Q {...qProps(14)} topic="Relative Frequency and Theoretical Probability" tm={4}>
            <Info>A spinner with four equal sections (1–4) is spun 200 times. The results are below.</Info>
            <DataTbl hdrs={['Section','1','2','3','4','Total']} rows={[['Frequency',62,48,56,34,200]]}/>
            <Part lbl="a" m={1}>Find the relative frequency of landing on section 1.<AK>62 ÷ 200 = <strong>0.31</strong></AK><AL pre="Answer:"/>
            </Part>
            <Part lbl="b" m={1}>What is the theoretical probability of landing on section 3 if the spinner were fair?<AK><strong>1/4 = 0.25</strong></AK><AL pre="Answer:"/>
            </Part>
            <Part lbl="c" m={1}>Estimate how many times section 4 would appear in 500 more spins, using the relative frequency.<AK>34/200 = 0.17 → 0.17 × 500 = <strong>85</strong></AK><AL pre="Answer:"/>
            </Part>
            <Part lbl="d" m={1}>
              Do the results suggest the spinner is fair? Give a reason.
              <AK>No — a fair spinner gives each section frequency ≈ 50. Results range from 34–62, suggesting the spinner is biased.</AK>
              <WB h={42}/>
            </Part>
          </Q>

          <Q {...qProps(15)} topic="Probability with Venn Diagrams" tm={5}>
            <Info>50 students were asked if they like Football (F) or Tennis (T). 26 like Football, 19 like Tennis, 8 like both.</Info>
            <Part lbl="a" m={1}>Complete the Venn diagram by writing the correct number in each region.<VennTwo showV={isRev(15)}/>
            </Part>
            <Part lbl="b" m={1}>Find P(likes Football only).<AK>Only F = 26−8=18. P = 18/50 = <strong>9/25</strong></AK><AL pre="P ="/>
            </Part>
            <Part lbl="c" m={1}>Find P(likes at least one sport).<AK>18+8+11=37. P = <strong>37/50</strong></AK><AL pre="P ="/>
            </Part>
            <Part lbl="d" m={2}>
              Given a student likes Football, find P(they also like Tennis). Use the conditional probability formula.
              <WB h={65}/>
              <AK>P(T|F) = P(T∩F) ÷ P(F) = (8/50) ÷ (26/50) = 8/26 = <strong>4/13</strong></AK>
              <AL pre="P(T|F) ="/>
            </Part>
          </Q>

          <Q {...qProps(16)} topic="Probability with Tree Diagrams — Without Replacement" tm={6}>
            <Info>A bag contains <strong>4 red</strong> and <strong>6 blue</strong> balls. Two balls are drawn at random <strong>without replacement</strong>.</Info>
            <Part lbl="a" m={2}>Complete the probability tree diagram. Write the probability on each branch.
              <TreeDiagram showV={isRev(16)}/>
            </Part>
            <Part lbl="b" m={1}>Find P(both balls are red).<AK>P(RR) = 4/10 × 3/9 = 12/90 = <strong>2/15</strong></AK><AL pre="P(RR) ="/>
            </Part>
            <Part lbl="c" m={2}>
              Find P(the two balls are different colours).
              <WB h={80}/>
              <AK>P(RB) + P(BR) = (4/10)(6/9) + (6/10)(4/9) = 24/90 + 24/90 = 48/90 = <strong>8/15</strong></AK>
              <AL pre="P(different colours) ="/>
            </Part>
            <Part lbl="d" m={1}>Find P(at least one blue ball).<AK>1 − P(both red) = 1 − 2/15 = <strong>13/15</strong></AK><AL pre="P ="/>
            </Part>
          </Q>

          <Q {...qProps(17)} topic="Probability with Sample Spaces" tm={4}>
            <Info>Two fair 4-sided dice (numbered 1–4) are rolled. The table shows the <strong>sum</strong> of both scores.</Info>
            <Part lbl="a" m={1}>Complete the sample space table.<SampleGrid showV={isRev(17)}/>
            </Part>
            <Part lbl="b" m={1}>Find P(sum = 5).<AK>Pairs: (1,4),(2,3),(3,2),(4,1) → 4 outcomes out of 16. P = <strong>1/4</strong></AK><AL pre="P ="/>
            </Part>
            <Part lbl="c" m={1}>Find P(sum &gt; 6).<AK>Sum 7: (3,4),(4,3) = 2; Sum 8: (4,4) = 1. Total = 3 out of 16. P = <strong>3/16</strong></AK><AL pre="P ="/>
            </Part>
            <Part lbl="d" m={1}>Find P(sum is even).<AK>Even sums: 2(×1), 4(×3), 6(×3), 8(×1) = 8 outcomes. P = <strong>1/2</strong></AK><AL pre="P ="/>
            </Part>
          </Q>

          <Q {...qProps(18)} topic="Mutually Exclusive Events" tm={3}>
            <Info>A card is drawn from a standard 52-card deck. &nbsp;A = drawing a heart, &nbsp;B = drawing a club, &nbsp;C = drawing a face card (J, Q, K).</Info>
            <Part lbl="a" m={1}>
              Are A and B mutually exclusive? Explain.
              <AK>Yes — a card cannot simultaneously be a heart and a club. P(A∩B) = 0.</AK>
              <WB h={42}/>
            </Part>
            <Part lbl="b" m={1}>Using the addition rule, find P(A or B).<AK>P(A∪B) = P(A)+P(B) = 13/52+13/52 = 26/52 = <strong>1/2</strong></AK><AL pre="P(A or B) ="/>
            </Part>
            <Part lbl="c" m={1}>
              Are A and C mutually exclusive? Explain.
              <AK>No — face cards that are hearts exist (J♥, Q♥, K♥). P(A∩C) ≠ 0.</AK>
              <WB h={42}/>
            </Part>
          </Q>

          <Q {...qProps(19)} topic="Combined Events — Addition Rule, Multiplication Rule &amp; Conditional Probability" tm={7}>
            <Info>P(passes Maths) = 0.65 &nbsp;&nbsp;&nbsp; P(passes English) = 0.72 &nbsp;&nbsp;&nbsp; P(passes both) = 0.52</Info>
            <Part lbl="a" m={1}>
              Are passing Maths and passing English mutually exclusive? Explain.
              <AK>No — P(M∩E) = 0.52 ≠ 0. A student can pass both subjects.</AK>
              <WB h={40}/>
            </Part>
            <Part lbl="b" m={1}>Using the <strong>addition rule</strong>, find P(passes at least one subject).<AK>P(M∪E) = P(M)+P(E)−P(M∩E) = 0.65+0.72−0.52 = <strong>0.85</strong></AK><AL pre="P(M∪E) ="/>
            </Part>
            <Part lbl="c" m={1}>Find P(passes English but not Maths).<AK>P(E only) = P(E)−P(M∩E) = 0.72−0.52 = <strong>0.20</strong></AK><AL pre="P ="/>
            </Part>
            <Part lbl="d" m={2}>
              Given a student passes English, find P(they also pass Maths). Use the conditional probability formula.
              <WB h={80}/>
              <AK>P(M|E) = P(M∩E) ÷ P(E) = 0.52 ÷ 0.72 = <strong>13/18 ≈ 0.722</strong></AK>
              <AL pre="P(M|E) ="/>
            </Part>
            <Part lbl="e" m={2}>
              Using the <strong>multiplication rule</strong>, determine whether passing Maths and English are <strong>independent</strong> events.
              <WB h={85}/>
              <AK>If independent: P(M∩E) = P(M)×P(E) = 0.65×0.72 = 0.468.{'\n'}But P(M∩E) = 0.52 ≠ 0.468. ∴ Events are <strong>NOT independent</strong>.</AK>
            </Part>
          </Q>

          <Q {...qProps(20)} topic="Dependent and Independent Events" tm={4}>
            <Part lbl="a" m={2}>
              A fair die is rolled and a fair coin is flipped. Let A = "roll a 6" and B = "flip Heads".<br/>
              <em>(i)</em> Find P(A and B). &nbsp; <em>(ii)</em> Show that A and B are <strong>independent</strong> events.
              <WB h={95}/>
              <AK>P(A) = 1/6, P(B) = 1/2. P(A∩B) = 1/6 × 1/2 = <strong>1/12</strong>.{'\n'}Since P(A∩B) = P(A)×P(B) (1/12 = 1/12), A and B are <strong>independent</strong>.</AK>
            </Part>
            <Part lbl="b" m={2}>
              Two cards are drawn without replacement from a 52-card deck.<br/>
              <em>(i)</em> Find P(both are hearts). &nbsp; <em>(ii)</em> Explain why these events are <strong>dependent</strong>.
              <WB h={95}/>
              <AK>P(1st heart) = 13/52. P(2nd heart | 1st heart) = 12/51.{'\n'}P(both hearts) = 13/52 × 12/51 = <strong>1/17</strong>.{'\n'}Events are <strong>dependent</strong>: removing the 1st card changes the total cards and hearts remaining, so the 2nd probability is affected by the 1st outcome.</AK>
            </Part>
          </Q>

          {/* ── FOOTER ─────────────────────────────────── */}
          <div className="exam-footer">
            <h2>— END OF PAPER —</h2>
            <p>Total: 100 marks &nbsp;·&nbsp; Sections A–D &nbsp;·&nbsp; Answer key available via the sidebar</p>
          </div>

        </div>
      </main>
    </div>
  )
}
