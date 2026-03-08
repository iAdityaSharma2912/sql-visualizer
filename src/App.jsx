import { useState, useEffect, useCallback } from "react";

const DB = {
  users: [
    { id: 1, name: "Aditya Sharma", email: "addy@example.com", age: 21, city: "Mumbai", salary: 85000 },
    { id: 2, name: "Priya Patel", email: "priya@example.com", age: 27, city: "Delhi", salary: 92000 },
    { id: 3, name: "Rohan Mehta", email: "rohan@example.com", age: 31, city: "Bangalore", salary: 110000 },
    { id: 4, name: "Ananya Singh", email: "ananya@example.com", age: 24, city: "Mumbai", salary: 78000 },
    { id: 5, name: "Vikram Joshi", email: "vikram@example.com", age: 35, city: "Pune", salary: 130000 },
    { id: 6, name: "Meera Nair", email: "meera@example.com", age: 29, city: "Chennai", salary: 95000 },
  ],
  orders: [
    { id: 101, user_id: 1, product: "Laptop", amount: 75000, status: "delivered", date: "2024-01-15" },
    { id: 102, user_id: 2, product: "Phone", amount: 45000, status: "delivered", date: "2024-02-10" },
    { id: 103, user_id: 1, product: "Headphones", amount: 8000, status: "shipped", date: "2024-03-01" },
    { id: 104, user_id: 3, product: "Monitor", amount: 25000, status: "delivered", date: "2024-03-12" },
    { id: 105, user_id: 4, product: "Keyboard", amount: 5000, status: "pending", date: "2024-04-05" },
    { id: 106, user_id: 2, product: "Tablet", amount: 35000, status: "cancelled", date: "2024-04-20" },
    { id: 107, user_id: 5, product: "Chair", amount: 15000, status: "delivered", date: "2024-05-01" },
    { id: 108, user_id: 6, product: "Desk", amount: 20000, status: "shipped", date: "2024-05-15" },
  ],
  products: [
    { id: 1, name: "Laptop", category: "Electronics", price: 75000, stock: 15 },
    { id: 2, name: "Phone", category: "Electronics", price: 45000, stock: 30 },
    { id: 3, name: "Headphones", category: "Electronics", price: 8000, stock: 50 },
    { id: 4, name: "Monitor", category: "Electronics", price: 25000, stock: 20 },
    { id: 5, name: "Keyboard", category: "Peripherals", price: 5000, stock: 100 },
    { id: 6, name: "Tablet", category: "Electronics", price: 35000, stock: 25 },
    { id: 7, name: "Chair", category: "Furniture", price: 15000, stock: 40 },
    { id: 8, name: "Desk", category: "Furniture", price: 20000, stock: 10 },
  ],
};

function evalCond(cond, row) {
  try {
    const ands = cond.split(/\s+AND\s+/i);
    if (ands.length > 1) return ands.every(p => evalCond(p.trim(), row));
    const ors = cond.split(/\s+OR\s+/i);
    if (ors.length > 1) return ors.some(p => evalCond(p.trim(), row));
    const likeM = cond.match(/(\w+)\s+LIKE\s+['"](.+)['"]/i);
    if (likeM) { const pat = new RegExp(`^${likeM[2].replace(/%/g,".*").replace(/_/,".")}$`,"i"); return pat.test(String(row[likeM[1]]||"")); }
    const inM = cond.match(/(\w+)\s+IN\s*\((.+)\)/i);
    if (inM) { const vals = inM[2].split(",").map(v=>v.trim().replace(/['"]/g,"")); return vals.includes(String(row[inM[1]])); }
    for (const [op,fn] of [[">=", (a,b)=>a>=b],["<=", (a,b)=>a<=b],["!=", (a,b)=>a!=b],[">", (a,b)=>a>b],["<", (a,b)=>a<b],["=", (a,b)=>a==b]]) {
      if (cond.includes(op)) {
        const [l,r] = cond.split(op).map(s=>s.trim());
        const lv = row[l]!==undefined ? row[l] : (isNaN(l)?l.replace(/['"]/g,""):parseFloat(l));
        const rv = isNaN(r) ? r.replace(/['"]/g,"") : parseFloat(r);
        return fn(lv,rv);
      }
    }
    return true;
  } catch { return false; }
}

function runQuery(sql, data) {
  const steps = [], q = sql.trim().replace(/\s+/g," ");
  try {
    const fromM = q.match(/FROM\s+(\w+)/i);
    if (!fromM) throw new Error("Missing FROM clause");
    const tbl = fromM[1].toLowerCase();
    if (!data[tbl]) throw new Error(`Table '${tbl}' not found. Use: ${Object.keys(data).join(", ")}`);
    steps.push({ id:"FROM", label:"FROM", detail:`Scan '${tbl}' — ${data[tbl].length} rows`, icon:"⬡", color:"#d4a853" });
    let rows = [...data[tbl]];

    const joinM = q.match(/(?:INNER\s+)?JOIN\s+(\w+)\s+ON\s+(\w+\.\w+)\s*=\s*(\w+\.\w+)/i);
    if (joinM) {
      const jt = joinM[1].toLowerCase(), [,lc] = joinM[2].split("."), [,rc] = joinM[3].split(".");
      if (!data[jt]) throw new Error(`Join table '${jt}' not found`);
      rows = rows.flatMap(r => (data[jt].filter(j=>r[lc]===j[rc]||r[rc]===j[lc])).map(j=>({...r,...Object.fromEntries(Object.entries(j).map(([k,v])=>[`${jt}.${k}`,v]))})));
      steps.push({ id:"JOIN", label:"JOIN", detail:`Merge with '${jt}' → ${rows.length} rows`, icon:"⇌", color:"#7c9e6b" });
    }

    const whereM = q.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+HAVING|\s+LIMIT|$)/i);
    if (whereM) {
      const before = rows.length;
      rows = rows.filter(r=>evalCond(whereM[1].trim(),r));
      steps.push({ id:"WHERE", label:"WHERE", detail:`Filter → ${rows.length} rows (−${before-rows.length})`, icon:"▽", color:"#b87060", filtered: before-rows.length });
    }

    const groupM = q.match(/GROUP\s+BY\s+(.+?)(?:\s+HAVING|\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (groupM) {
      const gc = groupM[1].trim();
      const grps = {};
      rows.forEach(r => { const k = r[gc]??"null"; if(!grps[k]) grps[k]=[]; grps[k].push(r); });
      const selM = q.match(/SELECT\s+(.+?)\s+FROM/i);
      rows = Object.entries(grps).map(([key, gr]) => {
        const out = { [gc]: isNaN(key)?key:parseFloat(key) };
        (selM?.[1]||"*").split(",").forEach(col => {
          col=col.trim();
          const cm=col.match(/COUNT\(\*\)\s*(?:AS\s+(\w+))?/i); if(cm) out[cm[1]||"count"]=gr.length;
          const sm=col.match(/SUM\((\w+)\)\s*(?:AS\s+(\w+))?/i); if(sm) out[sm[2]||`sum_${sm[1]}`]=gr.reduce((s,r)=>s+(parseFloat(r[sm[1]])||0),0);
          const am=col.match(/AVG\((\w+)\)\s*(?:AS\s+(\w+))?/i); if(am) out[am[2]||`avg_${am[1]}`]=Math.round(gr.reduce((s,r)=>s+(parseFloat(r[am[1]])||0),0)/gr.length);
          const xm=col.match(/MAX\((\w+)\)\s*(?:AS\s+(\w+))?/i); if(xm) out[xm[2]||`max_${xm[1]}`]=Math.max(...gr.map(r=>parseFloat(r[xm[1]])||0));
          const nm=col.match(/MIN\((\w+)\)\s*(?:AS\s+(\w+))?/i); if(nm) out[nm[2]||`min_${nm[1]}`]=Math.min(...gr.map(r=>parseFloat(r[nm[1]])||0));
        });
        return out;
      });
      steps.push({ id:"GROUP", label:"GROUP BY", detail:`Group by '${gc}' → ${rows.length} groups`, icon:"◈", color:"#6b8fb5" });
    }

    const orderM = q.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderM) {
      const col=orderM[1], dir=(orderM[2]||"ASC").toUpperCase();
      rows.sort((a,b)=>{ const va=a[col],vb=b[col]; return typeof va==="string"?(dir==="ASC"?va.localeCompare(vb):vb.localeCompare(va)):(dir==="ASC"?va-vb:vb-va); });
      steps.push({ id:"ORDER", label:"ORDER BY", detail:`Sort by '${col}' ${dir}`, icon:"↕", color:"#9b7cb8" });
    }

    const limitM = q.match(/LIMIT\s+(\d+)/i);
    if (limitM) { rows=rows.slice(0,parseInt(limitM[1])); steps.push({ id:"LIMIT", label:"LIMIT", detail:`Cap at ${limitM[1]} rows`, icon:"⊡", color:"#7aaa8a" }); }

    const selM2 = q.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selM2 && selM2[1].trim()!=="*") {
      const cols = selM2[1].split(",").map(c => { const al=c.match(/AS\s+(\w+)/i); const bare=c.replace(/AS\s+\w+/i,"").trim(); return {bare, alias:al?al[1]:null}; });
      rows = rows.map(row => {
        const out={};
        cols.forEach(({bare,alias})=>{
          if(/COUNT|SUM|AVG|MAX|MIN/i.test(bare)){ const k=alias||bare.replace(/\(.*\)/,"").toLowerCase(); out[k]=row[k]??row[alias]??0; }
          else out[alias||bare]=row[bare];
        });
        return out;
      });
    }

    steps.push({ id:"RESULT", label:"RESULT", detail:`${rows.length} row${rows.length!==1?"s":""} returned`, icon:"✓", color:"#d4a853", final:true });
    return { steps, result:rows, error:null };
  } catch(e) { return { steps, result:[], error:e.message }; }
}

const PRESETS = [
  { label:"All Users", sql:"SELECT * FROM users" },
  { label:"Mumbai Filter", sql:"SELECT name, city, salary FROM users WHERE city = 'Mumbai' ORDER BY salary DESC" },
  { label:"High Earners", sql:"SELECT name, salary FROM users WHERE salary >= 90000 ORDER BY salary DESC LIMIT 4" },
  { label:"Sales by Status", sql:"SELECT status, COUNT(*) AS orders, SUM(amount) AS revenue FROM orders GROUP BY status ORDER BY revenue DESC" },
  { label:"Top Products", sql:"SELECT product, SUM(amount) AS total_sales FROM orders WHERE status = 'delivered' GROUP BY product ORDER BY total_sales DESC LIMIT 3" },
  { label:"Stock Check", sql:"SELECT name, category, price, stock FROM products WHERE stock < 30 ORDER BY stock ASC" },
];

function tokenize(sql) {
  const KW = ["SELECT","FROM","WHERE","GROUP BY","ORDER BY","HAVING","LIMIT","JOIN","INNER JOIN","ON","AND","OR","AS","COUNT","SUM","AVG","MAX","MIN","LIKE","IN","NOT","NULL","ASC","DESC","DISTINCT","*"];
  const parts = [];
  let rest = sql, i = 0;
  while (rest.length) {
    let matched = false;
    if (rest[0]==="'" || rest[0]==='"') {
      const end = rest.indexOf(rest[0],1);
      const str = end>0?rest.slice(0,end+1):rest;
      parts.push(<span key={i++} style={{color:"#7aaa8a"}}>{str}</span>);
      rest=rest.slice(str.length); matched=true;
    } else {
      const numM = rest.match(/^\d+/);
      if (numM) { parts.push(<span key={i++} style={{color:"#c9845a"}}>{numM[0]}</span>); rest=rest.slice(numM[0].length); matched=true; }
    }
    if (!matched) {
      let kwFound=false;
      for (const kw of KW.sort((a,b)=>b.length-a.length)) {
        if (rest.toUpperCase().startsWith(kw) && (rest.length===kw.length||!/\w/.test(rest[kw.length]))) {
          parts.push(<span key={i++} style={{color:"#d4a853",fontWeight:700}}>{rest.slice(0,kw.length)}</span>);
          rest=rest.slice(kw.length); kwFound=true; break;
        }
      }
      if (!kwFound) { parts.push(<span key={i++} style={{color:"#c8baa0"}}>{rest[0]}</span>); rest=rest.slice(1); }
    }
  }
  return parts;
}

function StepNode({ step, active }) {
  return (
    <div style={{display:"flex",alignItems:"stretch",gap:12,opacity:active?1:0.35,transition:"all 0.35s cubic-bezier(.4,0,.2,1)",transform:active?"translateX(0)":"translateX(-4px)"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{width:34,height:34,borderRadius:"50%",border:`2px solid ${active?step.color:"#3a3228"}`,background:active?step.color+"18":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:active?step.color:"#4a3f35",transition:"all 0.35s",flexShrink:0,boxShadow:active?`0 0 12px ${step.color}44`:"none"}}>{step.icon}</div>
        {!step.final && <div style={{width:1,flex:1,minHeight:18,background:active?"#3a3228":"#2a2218",marginTop:2}}/>}
      </div>
      <div style={{paddingBottom:step.final?0:18,paddingTop:4}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",color:active?step.color:"#4a3f35",fontFamily:"'Sora',sans-serif",textTransform:"uppercase"}}>{step.label}</div>
        <div style={{fontSize:11,color:active?"#a89880":"#3a3228",marginTop:2,lineHeight:1.4}}>{step.detail}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [sql, setSql] = useState("SELECT name, city, salary FROM users WHERE salary >= 90000 ORDER BY salary DESC");
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState(0);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("results");

  const execute = useCallback(() => {
    setRunning(true); setRevealed(0);
    setTimeout(() => {
      const res = runQuery(sql, DB);
      setResult(res); setRunning(false);
      res.steps.forEach((_,i) => setTimeout(() => setRevealed(i+1), i*220+80));
    }, 200);
  }, [sql]);

  useEffect(() => { execute(); }, []);

  const cols = result?.result?.[0] ? Object.keys(result.result[0]) : [];

  return (
    <div style={{minHeight:"100vh",background:"#16120d",fontFamily:"'IBM Plex Mono','Fira Code',monospace",color:"#c8baa0",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,300;0,400;0,600;0,700;1,400&family=Sora:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:#1c170f}
        ::-webkit-scrollbar-thumb{background:#3a3228;border-radius:3px}
        textarea{caret-color:#d4a853}
        .preset{background:transparent;border:1px solid #2a2218;color:#6a5d4e;padding:4px 10px;border-radius:3px;font-family:inherit;font-size:10px;cursor:pointer;letter-spacing:.5px;transition:all .2s;white-space:nowrap}
        .preset:hover{border-color:#d4a853;color:#d4a853;background:#d4a85309}
        .run{background:#d4a853;border:none;color:#16120d;padding:9px 22px;border-radius:4px;font-family:'Sora',sans-serif;font-size:12px;font-weight:800;cursor:pointer;letter-spacing:1px;text-transform:uppercase;transition:all .2s}
        .run:hover{background:#e8c06a;box-shadow:0 4px 24px #d4a85344}
        .run:active{transform:scale(.97)}
        .tab{background:transparent;border:none;border-bottom:2px solid transparent;color:#4a3f35;padding:10px 18px;font-family:inherit;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;transition:all .2s}
        .tab.on{border-bottom-color:#d4a853;color:#d4a853}
        .trow{transition:background .15s}
        .trow:hover{background:#d4a85309!important}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp .4s ease forwards}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{animation:spin 1s linear infinite;display:inline-block}
      `}</style>

      {/* Header */}
      <div style={{borderBottom:"1px solid #2a2218",padding:"12px 24px",display:"flex",alignItems:"center",gap:16,background:"#13100b",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#d4a853",boxShadow:"0 0 10px #d4a853"}}/>
          <span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:14,letterSpacing:"-0.3px",color:"#e8d5b0"}}>SQL<span style={{color:"#d4a853"}}>·</span>VIS</span>
        </div>
        <div style={{width:1,height:16,background:"#2a2218"}}/>
        <span style={{fontSize:10,color:"#3a3228",letterSpacing:"1px"}}>QUERY VISUALIZER</span>
        <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
          {PRESETS.map(p=><button key={p.label} className="preset" onClick={()=>setSql(p.sql)}>{p.label}</button>)}
        </div>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Left */}
        <div style={{width:320,minWidth:280,borderRight:"1px solid #2a2218",display:"flex",flexDirection:"column",background:"#13100b"}}>
          {/* Editor */}
          <div style={{padding:16,borderBottom:"1px solid #2a2218"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:9,letterSpacing:"2px",color:"#3a3228",textTransform:"uppercase",fontFamily:"'Sora',sans-serif"}}>Editor</span>
              <div style={{flex:1,height:1,background:"#2a2218"}}/>
              <span style={{fontSize:9,color:"#2a2218"}}>⌃↵ run</span>
            </div>
            <div style={{background:"#0e0b07",border:"1px solid #2a2218",borderRadius:6,overflow:"hidden"}}>
              <div style={{display:"flex"}}>
                <div style={{padding:"12px 8px",background:"#100d08",borderRight:"1px solid #2a2218",color:"#3a3228",fontSize:11,lineHeight:"1.7",textAlign:"right",minWidth:32,userSelect:"none"}}>
                  {sql.split("\n").map((_,i)=><div key={i}>{i+1}</div>)}
                </div>
                <div style={{flex:1,position:"relative"}}>
                  <div aria-hidden style={{position:"absolute",inset:0,padding:"12px 10px",fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word",pointerEvents:"none",color:"transparent"}}>
                    {tokenize(sql)}
                  </div>
                  <textarea value={sql} onChange={e=>setSql(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();execute();}}} spellCheck={false} style={{display:"block",width:"100%",background:"transparent",border:"none",outline:"none",resize:"none",fontFamily:"inherit",fontSize:12,color:"transparent",caretColor:"#d4a853",lineHeight:1.7,padding:"12px 10px",minHeight:100}}/>
                </div>
              </div>
            </div>
            <div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}>
              <button className="run" onClick={execute}>▶ Run Query</button>
            </div>
          </div>

          {/* Schema */}
          <div style={{padding:16,borderBottom:"1px solid #2a2218"}}>
            <div style={{fontSize:9,letterSpacing:"2px",color:"#3a3228",textTransform:"uppercase",fontFamily:"'Sora',sans-serif",marginBottom:10}}>Schema</div>
            {Object.entries(DB).map(([tbl,rows])=>(
              <div key={tbl} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:11,color:"#d4a853",fontWeight:700}}>⬡ {tbl}</span>
                  <span style={{fontSize:10,color:"#3a3228"}}>{rows.length} rows</span>
                </div>
                <div style={{paddingLeft:10,display:"flex",flexWrap:"wrap",gap:4}}>
                  {Object.keys(rows[0]).map(col=>(
                    <span key={col} style={{fontSize:10,color:"#5a5040",background:"#1e190f",border:"1px solid #2a2218",borderRadius:3,padding:"1px 6px"}}>{col}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Pipeline */}
          <div style={{flex:1,overflowY:"auto",padding:16}}>
            <div style={{fontSize:9,letterSpacing:"2px",color:"#3a3228",textTransform:"uppercase",fontFamily:"'Sora',sans-serif",marginBottom:16}}>Execution Plan</div>
            {running ? (
              <div style={{textAlign:"center",padding:24,color:"#3a3228"}}>
                <div className="spin" style={{fontSize:20,marginBottom:8}}>◌</div>
                <div style={{fontSize:11}}>Parsing query…</div>
              </div>
            ) : result?.error && result.steps.length===0 ? (
              <div style={{background:"#b8604018",border:"1px solid #b8604033",borderRadius:6,padding:12,fontSize:11,color:"#b87060"}}>
                <div style={{fontWeight:700,marginBottom:4}}>Parse Error</div>{result.error}
              </div>
            ) : result?.steps?.map((step,i)=>(
              <StepNode key={step.id} step={step} active={revealed > i} />
            ))}
          </div>
        </div>

        {/* Right */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:"#16120d"}}>
          <div style={{display:"flex",borderBottom:"1px solid #2a2218",padding:"0 20px",background:"#13100b"}}>
            <button className={`tab ${activeTab==="results"?"on":""}`} onClick={()=>setActiveTab("results")}>Results</button>
            <button className={`tab ${activeTab==="info"?"on":""}`} onClick={()=>setActiveTab("info")}>Query Info</button>
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12,fontSize:10}}>
              {result && !result.error && <><span style={{color:"#3a3228"}}>{result.result.length} row{result.result.length!==1?"s":""}</span><span style={{color:"#7aaa8a"}}>● OK</span></>}
              {result?.error && <span style={{color:"#b87060"}}>● Error</span>}
            </div>
          </div>

          <div style={{flex:1,overflow:"auto",padding:20}}>
            {running ? (
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",flexDirection:"column",gap:12,color:"#3a3228"}}>
                <div className="spin" style={{fontSize:28}}>◌</div>
                <span style={{fontSize:12}}>Executing…</span>
              </div>
            ) : result?.error ? (
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%"}}>
                <div style={{textAlign:"center",maxWidth:360}}>
                  <div style={{fontSize:32,marginBottom:12,color:"#b87060"}}>✗</div>
                  <div style={{background:"#b8604012",border:"1px solid #b8604030",borderRadius:8,padding:16,color:"#b87060",fontSize:12,lineHeight:1.6}}>{result.error}</div>
                </div>
              </div>
            ) : activeTab==="results" ? (
              result?.result?.length===0 ? (
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#3a3228",fontSize:12}}>No rows returned</div>
              ) : result?.result ? (
                <div className="fade-up">
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr style={{borderBottom:"2px solid #2a2218"}}>
                        <th style={{padding:"8px 12px",textAlign:"left",color:"#3a3228",fontWeight:400,fontSize:10,letterSpacing:"1px",width:36}}>#</th>
                        {cols.map(c=><th key={c} style={{padding:"8px 12px",textAlign:"left",color:"#d4a853",fontWeight:600,fontSize:10,letterSpacing:"1px",fontFamily:"'Sora',sans-serif",whiteSpace:"nowrap"}}>{c.toUpperCase()}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {result.result.map((row,i)=>(
                        <tr key={i} className="trow" style={{borderBottom:`1px solid ${i%2===0?"#1c170f":"#1a160c"}`}}>
                          <td style={{padding:"9px 12px",color:"#2a2218",fontSize:10}}>{i+1}</td>
                          {cols.map(c=>{ const v=row[c],isNum=typeof v==="number",isNull=v===null||v===undefined; return <td key={c} style={{padding:"9px 12px",color:isNull?"#2a2218":isNum?"#c9845a":"#c8baa0",fontStyle:isNull?"italic":"normal",whiteSpace:"nowrap"}}>{isNull?"null":String(v)}</td>; })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null
            ) : (
              <div className="fade-up" style={{maxWidth:560}}>
                <div style={{marginBottom:24}}>
                  <div style={{fontSize:9,letterSpacing:"2px",color:"#3a3228",textTransform:"uppercase",fontFamily:"'Sora',sans-serif",marginBottom:12}}>Execution Steps</div>
                  {result?.steps?.map((s,i)=>(
                    <div key={i} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid #2a2218"}}>
                      <span style={{color:s.color,fontSize:12,width:20,textAlign:"center"}}>{s.icon}</span>
                      <div><span style={{fontSize:10,fontWeight:700,color:s.color,letterSpacing:"1px",fontFamily:"'Sora',sans-serif"}}>{s.label} </span><span style={{fontSize:11,color:"#6a5d4e"}}>{s.detail}</span></div>
                    </div>
                  ))}
                </div>
                {result?.result?.length>0 && (
                  <div>
                    <div style={{fontSize:9,letterSpacing:"2px",color:"#3a3228",textTransform:"uppercase",fontFamily:"'Sora',sans-serif",marginBottom:12}}>Column Stats</div>
                    {cols.map(col=>{ const vals=result.result.map(r=>r[col]).filter(v=>typeof v==="number"); if(!vals.length) return null; const sum=vals.reduce((a,b)=>a+b,0),avg=Math.round(sum/vals.length),mn=Math.min(...vals),mx=Math.max(...vals); return <div key={col} style={{marginBottom:10,background:"#0e0b07",border:"1px solid #2a2218",borderRadius:6,padding:"10px 14px"}}><div style={{fontSize:10,color:"#d4a853",fontWeight:700,marginBottom:6,fontFamily:"'Sora',sans-serif"}}>{col}</div><div style={{display:"flex",gap:20,fontSize:11,color:"#6a5d4e"}}><span>MIN <span style={{color:"#c9845a"}}>{mn.toLocaleString()}</span></span><span>MAX <span style={{color:"#c9845a"}}>{mx.toLocaleString()}</span></span><span>AVG <span style={{color:"#c9845a"}}>{avg.toLocaleString()}</span></span><span>SUM <span style={{color:"#c9845a"}}>{sum.toLocaleString()}</span></span></div></div>; })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{borderTop:"1px solid #2a2218",padding:"6px 20px",display:"flex",gap:20,fontSize:10,color:"#2a2218",background:"#13100b"}}>
            <span>IBM Plex Mono · Sora</span>
            <span style={{marginLeft:"auto"}}>tables: users · orders · products</span>
          </div>
        </div>
      </div>
    </div>
  );
}