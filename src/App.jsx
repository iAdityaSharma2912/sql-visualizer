import { useState, useEffect, useCallback } from "react";

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg:        "#0a0a0a",   // near-black background
  surface:   "#111111",   // panel surface
  border:    "#222222",   // subtle borders
  border2:   "#333333",   // stronger borders
  yellow:    "#FFD600",   // primary accent — pure yellow
  orange:    "#FF6B00",   // secondary accent — deep orange
  white:     "#FFFFFF",   // primary text
  dim:       "#888888",   // muted text
  dimmer:    "#444444",   // very muted
  rowA:      "#0f0f0f",
  rowB:      "#141414",
  err:       "#FF4444",
  green:     "#44FF88",
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const DB = {
  users: [
    { id: 1, name: "Aditya Sharma",  email: "addy@example.com",   age: 21, city: "Mumbai",    salary: 85000  },
    { id: 2, name: "Priya Patel",    email: "priya@example.com",  age: 27, city: "Delhi",     salary: 92000  },
    { id: 3, name: "Rohan Mehta",    email: "rohan@example.com",  age: 31, city: "Bangalore", salary: 110000 },
    { id: 4, name: "Ananya Singh",   email: "ananya@example.com", age: 24, city: "Mumbai",    salary: 78000  },
    { id: 5, name: "Vikram Joshi",   email: "vikram@example.com", age: 35, city: "Pune",      salary: 130000 },
    { id: 6, name: "Meera Nair",     email: "meera@example.com",  age: 29, city: "Chennai",   salary: 95000  },
  ],
  orders: [
    { id: 101, user_id: 1, product: "Laptop",     amount: 75000, status: "delivered", date: "2024-01-15" },
    { id: 102, user_id: 2, product: "Phone",      amount: 45000, status: "delivered", date: "2024-02-10" },
    { id: 103, user_id: 1, product: "Headphones", amount: 8000,  status: "shipped",   date: "2024-03-01" },
    { id: 104, user_id: 3, product: "Monitor",    amount: 25000, status: "delivered", date: "2024-03-12" },
    { id: 105, user_id: 4, product: "Keyboard",   amount: 5000,  status: "pending",   date: "2024-04-05" },
    { id: 106, user_id: 2, product: "Tablet",     amount: 35000, status: "cancelled", date: "2024-04-20" },
    { id: 107, user_id: 5, product: "Chair",      amount: 15000, status: "delivered", date: "2024-05-01" },
    { id: 108, user_id: 6, product: "Desk",       amount: 20000, status: "shipped",   date: "2024-05-15" },
  ],
  products: [
    { id: 1, name: "Laptop",     category: "Electronics", price: 75000, stock: 15  },
    { id: 2, name: "Phone",      category: "Electronics", price: 45000, stock: 30  },
    { id: 3, name: "Headphones", category: "Electronics", price: 8000,  stock: 50  },
    { id: 4, name: "Monitor",    category: "Electronics", price: 25000, stock: 20  },
    { id: 5, name: "Keyboard",   category: "Peripherals", price: 5000,  stock: 100 },
    { id: 6, name: "Tablet",     category: "Electronics", price: 35000, stock: 25  },
    { id: 7, name: "Chair",      category: "Furniture",   price: 15000, stock: 40  },
    { id: 8, name: "Desk",       category: "Furniture",   price: 20000, stock: 10  },
  ],
};

// ─── SQL Engine ───────────────────────────────────────────────────────────────
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
    if (!data[tbl]) throw new Error(`Table '${tbl}' not found. Available: ${Object.keys(data).join(", ")}`);
    steps.push({ id:"FROM", label:"FROM", detail:`Scan table '${tbl}' — ${data[tbl].length} rows`, icon:"▣", color: T.yellow });
    let rows = [...data[tbl]];

    const joinM = q.match(/(?:INNER\s+)?JOIN\s+(\w+)\s+ON\s+(\w+\.\w+)\s*=\s*(\w+\.\w+)/i);
    if (joinM) {
      const jt = joinM[1].toLowerCase(), [,lc] = joinM[2].split("."), [,rc] = joinM[3].split(".");
      if (!data[jt]) throw new Error(`Join table '${jt}' not found`);
      rows = rows.flatMap(r => (data[jt].filter(j=>r[lc]===j[rc]||r[rc]===j[lc])).map(j=>({...r,...Object.fromEntries(Object.entries(j).map(([k,v])=>[`${jt}.${k}`,v]))})));
      steps.push({ id:"JOIN", label:"JOIN", detail:`Merge with '${jt}' → ${rows.length} rows`, icon:"⇌", color:"#FF6B00" });
    }

    const whereM = q.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+HAVING|\s+LIMIT|$)/i);
    if (whereM) {
      const before = rows.length;
      rows = rows.filter(r=>evalCond(whereM[1].trim(),r));
      steps.push({ id:"WHERE", label:"WHERE", detail:`Filter → ${rows.length} kept, ${before-rows.length} removed`, icon:"▽", color:"#FF6B00" });
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
      steps.push({ id:"GROUP", label:"GROUP BY", detail:`Grouped by '${gc}' → ${rows.length} groups`, icon:"◈", color: T.yellow });
    }

    const orderM = q.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderM) {
      const col=orderM[1], dir=(orderM[2]||"ASC").toUpperCase();
      rows.sort((a,b)=>{ const va=a[col],vb=b[col]; return typeof va==="string"?(dir==="ASC"?va.localeCompare(vb):vb.localeCompare(va)):(dir==="ASC"?va-vb:vb-va); });
      steps.push({ id:"ORDER", label:"ORDER BY", detail:`Sorted by '${col}' ${dir}`, icon:"↕", color: T.yellow });
    }

    const limitM = q.match(/LIMIT\s+(\d+)/i);
    if (limitM) {
      rows = rows.slice(0,parseInt(limitM[1]));
      steps.push({ id:"LIMIT", label:"LIMIT", detail:`Capped at ${limitM[1]} rows`, icon:"⊡", color:"#FF6B00" });
    }

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

    steps.push({ id:"RESULT", label:"RESULT", detail:`${rows.length} row${rows.length!==1?"s":""} returned`, icon:"✓", color: T.green, final:true });
    return { steps, result:rows, error:null };
  } catch(e) { return { steps, result:[], error:e.message }; }
}

// ─── Presets ──────────────────────────────────────────────────────────────────
const PRESETS = [
  { label:"All Users",      sql:"SELECT * FROM users" },
  { label:"Mumbai Filter",  sql:"SELECT name, city, salary FROM users WHERE city = 'Mumbai' ORDER BY salary DESC" },
  { label:"High Earners",   sql:"SELECT name, salary FROM users WHERE salary >= 90000 ORDER BY salary DESC LIMIT 4" },
  { label:"Sales by Status",sql:"SELECT status, COUNT(*) AS orders, SUM(amount) AS revenue FROM orders GROUP BY status ORDER BY revenue DESC" },
  { label:"Top Products",   sql:"SELECT product, SUM(amount) AS total_sales FROM orders WHERE status = 'delivered' GROUP BY product ORDER BY total_sales DESC LIMIT 3" },
  { label:"Low Stock",      sql:"SELECT name, category, price, stock FROM products WHERE stock < 30 ORDER BY stock ASC" },
];

// ─── Syntax Highlighter ───────────────────────────────────────────────────────
function tokenize(sql) {
  const KW = ["SELECT","FROM","WHERE","GROUP BY","ORDER BY","HAVING","LIMIT","INNER JOIN","JOIN","ON","AND","OR","AS","COUNT","SUM","AVG","MAX","MIN","LIKE","IN","NOT","NULL","ASC","DESC","DISTINCT","*"];
  const parts = [];
  let rest = sql, i = 0;
  while (rest.length) {
    // strings
    if (rest[0]==="'" || rest[0]==='"') {
      const end = rest.indexOf(rest[0],1);
      const str = end>0 ? rest.slice(0,end+1) : rest;
      parts.push(<span key={i++} style={{color:"#44FF88"}}>{str}</span>);
      rest = rest.slice(str.length);
      continue;
    }
    // numbers
    const numM = rest.match(/^\d+/);
    if (numM) {
      parts.push(<span key={i++} style={{color:"#FF6B00"}}>{numM[0]}</span>);
      rest = rest.slice(numM[0].length);
      continue;
    }
    // keywords
    let kwFound = false;
    for (const kw of KW.sort((a,b)=>b.length-a.length)) {
      if (rest.toUpperCase().startsWith(kw) && (rest.length===kw.length || !/\w/.test(rest[kw.length]))) {
        parts.push(<span key={i++} style={{color: T.yellow, fontWeight:700}}>{rest.slice(0,kw.length)}</span>);
        rest = rest.slice(kw.length);
        kwFound = true;
        break;
      }
    }
    if (!kwFound) {
      parts.push(<span key={i++} style={{color: T.white}}>{rest[0]}</span>);
      rest = rest.slice(1);
    }
  }
  return parts;
}

// ─── Step Node ────────────────────────────────────────────────────────────────
function StepNode({ step, active }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "stretch",
      gap: 12,
      opacity: active ? 1 : 0.25,
      transition: "all 0.3s ease",
    }}>
      {/* Icon + line */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
        <div style={{
          width: 32, height: 32,
          borderRadius: 4,
          border: `2px solid ${active ? step.color : T.border2}`,
          background: active ? step.color+"18" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, color: active ? step.color : T.dimmer,
          transition: "all 0.3s",
          boxShadow: active ? `0 0 16px ${step.color}33` : "none",
          fontFamily: "monospace",
        }}>
          {step.icon}
        </div>
        {!step.final && (
          <div style={{ width: 2, flex: 1, minHeight: 16, background: active ? step.color+"44" : T.border, marginTop: 3 }} />
        )}
      </div>
      {/* Text */}
      <div style={{ paddingBottom: step.final ? 0 : 20, paddingTop: 4 }}>
        <div style={{
          fontSize: 10, fontWeight: 800,
          letterSpacing: "2px",
          color: active ? step.color : T.dimmer,
          fontFamily: "'Space Grotesk', sans-serif",
          textTransform: "uppercase",
          lineHeight: 1,
        }}>
          {step.label}
        </div>
        <div style={{ fontSize: 11, color: active ? T.dim : T.dimmer, marginTop: 4, lineHeight: 1.5, fontFamily: "monospace" }}>
          {step.detail}
        </div>
      </div>
    </div>
  );
}

// ─── Label ────────────────────────────────────────────────────────────────────
function Label({ children }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "2.5px",
      color: T.dimmer, textTransform: "uppercase",
      fontFamily: "'Space Grotesk', sans-serif",
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [sql, setSql]           = useState("SELECT name, city, salary FROM users WHERE salary >= 90000 ORDER BY salary DESC");
  const [result, setResult]     = useState(null);
  const [revealed, setRevealed] = useState(0);
  const [running, setRunning]   = useState(false);
  const [activeTab, setActiveTab] = useState("results");

  const execute = useCallback(() => {
    setRunning(true);
    setRevealed(0);
    setTimeout(() => {
      const res = runQuery(sql, DB);
      setResult(res);
      setRunning(false);
      res.steps.forEach((_,i) => setTimeout(() => setRevealed(i+1), i*200+100));
    }, 180);
  }, [sql]);

  useEffect(() => { execute(); }, []);

  const cols = result?.result?.[0] ? Object.keys(result.result[0]) : [];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.bg, fontFamily: "'Fira Code', 'JetBrains Mono', monospace", color: T.white, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;500;700&family=Space+Grotesk:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${T.bg}; }
        ::-webkit-scrollbar-thumb { background: ${T.border2}; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.dim}; }
        textarea { caret-color: ${T.yellow}; outline: none; }
        textarea::selection { background: ${T.yellow}22; }
        .preset-btn {
          background: transparent;
          border: 1px solid ${T.border2};
          color: ${T.dimmer};
          padding: 5px 12px;
          border-radius: 3px;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s;
        }
        .preset-btn:hover {
          border-color: ${T.yellow};
          color: ${T.yellow};
          background: ${T.yellow}0d;
        }
        .run-btn {
          background: ${T.yellow};
          border: none;
          color: ${T.bg};
          padding: 9px 24px;
          border-radius: 3px;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .run-btn:hover { background: #FFE033; box-shadow: 0 0 20px ${T.yellow}55; }
        .run-btn:active { transform: scale(0.97); }
        .tab-btn {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: ${T.dimmer};
          padding: 11px 20px;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tab-btn.active { border-bottom-color: ${T.yellow}; color: ${T.yellow}; }
        .tab-btn:hover:not(.active) { color: ${T.white}; }
        .trow { transition: background 0.1s; }
        .trow:hover { background: ${T.yellow}0a !important; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.35s ease forwards; }
        @keyframes rotate { to { transform: rotate(360deg); } }
        .spin { display: inline-block; animation: rotate 0.8s linear infinite; }
        .divider { height: 1px; background: ${T.border}; }
        .stat-card {
          background: ${T.surface};
          border: 1px solid ${T.border2};
          border-radius: 4px;
          padding: 12px 14px;
          margin-bottom: 8px;
        }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "0 20px", height: 48,
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 24, height: 24, background: T.yellow, borderRadius: 3, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize: 12, color: T.bg, fontWeight: 900, fontFamily: "monospace" }}>S</span>
          </div>
          <span style={{ fontFamily:"'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 14, color: T.white, letterSpacing: "-0.3px" }}>
            SQL<span style={{ color: T.yellow }}>VIS</span>
          </span>
        </div>

        <div style={{ width: 1, height: 18, background: T.border, flexShrink: 0 }} />

        {/* Presets */}
        <div style={{ display:"flex", gap: 6, flexWrap:"wrap", overflow:"hidden", flex: 1 }}>
          {PRESETS.map(p => (
            <button key={p.label} className="preset-btn" onClick={() => setSql(p.sql)}>{p.label}</button>
          ))}
        </div>

        <div style={{ flexShrink: 0, fontSize: 10, color: T.dimmer, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:"1px" }}>
          ⌃↵ RUN
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", flex: 1, overflow:"hidden" }}>

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
        <div style={{
          width: 300, flexShrink: 0,
          borderRight: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column",
          background: T.surface, overflow: "hidden",
        }}>

          {/* Editor */}
          <div style={{ padding: 16, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <Label>SQL Editor</Label>
            <div style={{
              background: T.bg,
              border: `1px solid ${T.border2}`,
              borderRadius: 4,
              overflow: "hidden",
            }}>
              {/* Line numbers + textarea row */}
              <div style={{ display:"flex" }}>
                {/* Line numbers */}
                <div style={{
                  padding: "12px 10px 12px 12px",
                  background: "#0d0d0d",
                  borderRight: `1px solid ${T.border}`,
                  color: T.dimmer,
                  fontSize: 11,
                  lineHeight: "1.65",
                  textAlign: "right",
                  minWidth: 36,
                  userSelect: "none",
                  flexShrink: 0,
                  fontFamily: "monospace",
                }}>
                  {sql.split("\n").map((_,i) => <div key={i}>{i+1}</div>)}
                </div>
                {/* Highlight + textarea overlay */}
                <div style={{ flex: 1, position:"relative", minHeight: 80 }}>
                  {/* Highlight layer */}
                  <div
                    aria-hidden
                    style={{
                      position:"absolute", inset: 0,
                      padding: "12px 12px",
                      fontSize: 12, lineHeight: 1.65,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      pointerEvents: "none",
                      color: "transparent",
                      fontFamily: "monospace",
                      zIndex: 1,
                    }}
                  >
                    {tokenize(sql)}
                  </div>
                  {/* Textarea */}
                  <textarea
                    value={sql}
                    onChange={e => setSql(e.target.value)}
                    onKeyDown={e => { if (e.key==="Enter" && (e.ctrlKey||e.metaKey)) { e.preventDefault(); execute(); } }}
                    spellCheck={false}
                    style={{
                      position: "relative",
                      display: "block",
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      resize: "none",
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: "transparent",
                      caretColor: T.yellow,
                      lineHeight: 1.65,
                      padding: "12px 12px",
                      minHeight: 80,
                      zIndex: 2,
                    }}
                  />
                </div>
              </div>
              {/* Bottom bar */}
              <div style={{
                borderTop: `1px solid ${T.border}`,
                padding: "6px 12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span style={{ fontSize: 10, color: T.dimmer, fontFamily:"'Space Grotesk',sans-serif" }}>
                  {sql.length} chars · {sql.split("\n").length} lines
                </span>
                <button className="run-btn" onClick={execute}>▶ Run</button>
              </div>
            </div>
          </div>

          {/* Schema */}
          <div style={{ padding: 16, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <Label>Schema</Label>
            {Object.entries(DB).map(([tbl, rows]) => (
              <div key={tbl} style={{ marginBottom: 10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: T.yellow, fontWeight: 700, fontFamily:"'Space Grotesk',sans-serif" }}>
                    ▣ {tbl}
                  </span>
                  <span style={{ fontSize: 10, color: T.dimmer, fontFamily:"monospace" }}>{rows.length} rows</span>
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap: 4, paddingLeft: 14 }}>
                  {Object.keys(rows[0]).map(col => (
                    <span key={col} style={{
                      fontSize: 10, color: T.dim,
                      background: T.bg,
                      border: `1px solid ${T.border2}`,
                      borderRadius: 2,
                      padding: "1px 6px",
                      fontFamily: "monospace",
                    }}>{col}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Execution Plan */}
          <div style={{ flex: 1, overflowY:"auto", padding: 16 }}>
            <Label>Execution Plan</Label>
            {running ? (
              <div style={{ textAlign:"center", padding: 32, color: T.dimmer }}>
                <div className="spin" style={{ fontSize: 18, marginBottom: 10, color: T.yellow }}>◌</div>
                <div style={{ fontSize: 11, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:"1px" }}>PARSING…</div>
              </div>
            ) : result?.error && result.steps.length===0 ? (
              <div style={{
                background: "#FF444410",
                border: `1px solid ${T.err}44`,
                borderLeft: `3px solid ${T.err}`,
                borderRadius: 4,
                padding: "10px 12px",
                fontSize: 11, color: T.err,
              }}>
                <div style={{ fontWeight:700, marginBottom:4, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:"1px", fontSize:10 }}>ERROR</div>
                {result.error}
              </div>
            ) : (
              result?.steps?.map((step, i) => (
                <StepNode key={step.id} step={step} active={revealed > i} />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display:"flex", flexDirection:"column", overflow:"hidden", background: T.bg }}>

          {/* Tab bar */}
          <div style={{
            display: "flex",
            alignItems: "stretch",
            borderBottom: `1px solid ${T.border}`,
            background: T.surface,
            flexShrink: 0,
          }}>
            <button className={`tab-btn ${activeTab==="results"?"active":""}`} onClick={() => setActiveTab("results")}>Results</button>
            <button className={`tab-btn ${activeTab==="info"?"active":""}`} onClick={() => setActiveTab("info")}>Query Info</button>

            {/* Status right side */}
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:12, paddingRight:20, fontSize:10, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:"1px" }}>
              {result && !result.error && (
                <>
                  <span style={{ color: T.dimmer }}>{result.result.length} ROW{result.result.length!==1?"S":""}</span>
                  <span style={{ color: T.green, fontWeight:700 }}>● OK</span>
                </>
              )}
              {result?.error && <span style={{ color: T.err, fontWeight:700 }}>● ERROR</span>}
            </div>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow:"auto", padding: 20 }}>
            {running ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", flexDirection:"column", gap:14, color: T.dimmer }}>
                <div className="spin" style={{ fontSize: 24, color: T.yellow }}>◌</div>
                <span style={{ fontSize: 11, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:"2px" }}>EXECUTING</span>
              </div>

            ) : result?.error ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%" }}>
                <div style={{ textAlign:"center", maxWidth: 380 }}>
                  <div style={{ fontSize: 36, marginBottom: 14, color: T.err }}>✗</div>
                  <div style={{
                    background: "#FF444408",
                    border: `1px solid ${T.err}33`,
                    borderLeft: `3px solid ${T.err}`,
                    borderRadius: 4,
                    padding: "14px 16px",
                    color: T.err,
                    fontSize: 12,
                    lineHeight: 1.6,
                    textAlign:"left",
                    fontFamily:"monospace",
                  }}>{result.error}</div>
                </div>
              </div>

            ) : activeTab === "results" ? (
              result?.result?.length === 0 ? (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color: T.dimmer, fontSize: 12, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:"1px" }}>
                  NO ROWS RETURNED
                </div>
              ) : result?.result ? (
                <div className="fade-up">
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{
                          padding: "9px 14px",
                          textAlign: "left",
                          color: T.dimmer,
                          fontWeight: 400,
                          fontSize: 10,
                          letterSpacing: "1px",
                          width: 40,
                          borderBottom: `2px solid ${T.border2}`,
                          fontFamily: "monospace",
                          background: T.bg,
                        }}>#</th>
                        {cols.map(c => (
                          <th key={c} style={{
                            padding: "9px 14px",
                            textAlign: "left",
                            color: T.yellow,
                            fontWeight: 700,
                            fontSize: 10,
                            letterSpacing: "1.5px",
                            whiteSpace: "nowrap",
                            borderBottom: `2px solid ${T.border2}`,
                            fontFamily: "'Space Grotesk', sans-serif",
                            background: T.bg,
                          }}>{c.toUpperCase()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.result.map((row, i) => (
                        <tr key={i} className="trow" style={{ background: i%2===0 ? T.rowA : T.rowB }}>
                          <td style={{ padding:"9px 14px", color: T.dimmer, fontSize: 10, borderBottom:`1px solid ${T.border}`, fontFamily:"monospace" }}>{i+1}</td>
                          {cols.map(c => {
                            const v = row[c];
                            const isNum  = typeof v === "number";
                            const isNull = v === null || v === undefined;
                            return (
                              <td key={c} style={{
                                padding: "9px 14px",
                                color: isNull ? T.dimmer : isNum ? T.orange : T.white,
                                fontStyle: isNull ? "italic" : "normal",
                                whiteSpace: "nowrap",
                                borderBottom: `1px solid ${T.border}`,
                                fontFamily: "monospace",
                                fontSize: 12,
                              }}>
                                {isNull ? "null" : String(v)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null

            ) : (
              /* Query Info Tab */
              <div className="fade-up" style={{ maxWidth: 580 }}>
                {/* Steps breakdown */}
                <div style={{ marginBottom: 28 }}>
                  <Label>Execution Steps</Label>
                  {result?.steps?.map((s, i) => (
                    <div key={i} style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "10px 0",
                      borderBottom: `1px solid ${T.border}`,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 3,
                        background: s.color+"18",
                        border: `1px solid ${s.color}44`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize: 12, color: s.color,
                        flexShrink: 0, fontFamily:"monospace",
                      }}>{s.icon}</div>
                      <div style={{ paddingTop: 2 }}>
                        <span style={{ fontSize: 10, fontWeight:800, color: s.color, letterSpacing:"2px", fontFamily:"'Space Grotesk',sans-serif" }}>{s.label} </span>
                        <span style={{ fontSize: 11, color: T.dim, fontFamily:"monospace" }}>{s.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Column stats */}
                {result?.result?.length > 0 && (
                  <div>
                    <Label>Column Statistics</Label>
                    {cols.map(col => {
                      const vals = result.result.map(r=>r[col]).filter(v=>typeof v==="number");
                      if (!vals.length) return null;
                      const sum = vals.reduce((a,b)=>a+b,0);
                      const avg = Math.round(sum/vals.length);
                      const mn  = Math.min(...vals);
                      const mx  = Math.max(...vals);
                      return (
                        <div key={col} className="stat-card">
                          <div style={{ fontSize: 10, color: T.yellow, fontWeight:700, marginBottom: 10, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:"1px" }}>
                            {col.toUpperCase()}
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap: 8 }}>
                            {[["MIN", mn], ["MAX", mx], ["AVG", avg], ["SUM", sum]].map(([lbl, val]) => (
                              <div key={lbl} style={{ textAlign:"center" }}>
                                <div style={{ fontSize: 9, color: T.dimmer, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:"1.5px", marginBottom: 3 }}>{lbl}</div>
                                <div style={{ fontSize: 13, color: T.orange, fontFamily:"monospace", fontWeight:600 }}>{val.toLocaleString()}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status bar */}
          <div style={{
            borderTop: `1px solid ${T.border}`,
            padding: "5px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: T.surface,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, color: T.dimmer, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:"1px" }}>
              FIRA CODE · SPACE GROTESK
            </span>
            <span style={{ fontSize: 10, color: T.dimmer, fontFamily:"monospace" }}>
              users · orders · products
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}