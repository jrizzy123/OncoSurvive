import { useEffect, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import Explainer from "./Explainer.jsx";
import Notch from "./Notch.jsx";

const API = "http://127.0.0.1:8000";
const PALETTE = ["#3b82f6", "#f97316", "#10b981", "#a855f7", "#ef4444", "#eab308"];
const MAX_GROUPS = 6;
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// Ask the API for one group's survival curve
function fetchGroup(g, signal) {
  const params = new URLSearchParams({ age_min: g.age_min, age_max: g.age_max });
  if (g.stage) params.set("stage", g.stage);
  if (g.sex) params.set("sex", g.sex);
  return fetch(`${API}/survival?${params}`, { signal }).then(async (r) => {
    const body = await r.json();
    if (!r.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Invalid filters");
    return body;
  });
}

// Combine all curves into one table with a row per month, carrying the last value forward
function mergeCurves(series) {
  const maps = series.map((s) => new Map(s.curve.map((p) => [p.month, p.survival])));
  const months = [...new Set(maps.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const last = series.map(() => null);
  return months.map((month) => {
    const row = { month };
    series.forEach((s, i) => {
      if (maps[i].has(month)) last[i] = maps[i].get(month);
      row[s.id] = last[i];
    });
    return row;
  });
}

// Save the chart as a PNG image (adds a title, legend, and source line)
function downloadChart(container, groups) {
  const svgs = [...container.querySelectorAll("svg")];
  if (svgs.length === 0) return;
  const area = (el) => {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };
  const svg = svgs.sort((a, b) => area(b) - area(a))[0];
  const { width, height } = svg.getBoundingClientRect();

  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", width);
  clone.setAttribute("height", height);
  clone.style.fontFamily = "sans-serif";
  const svgText = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));

  const img = new Image();
  img.onload = () => {
    const scale = 2; // 2x resolution so the image stays sharp
    const pad = 16;
    const legendFont = "14px sans-serif";

    // Work out where each legend entry goes so the header is tall enough
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = legendFont;
    let x = pad, y = 54;
    const entries = groups.map((g) => {
      const w = 30 + measure.measureText(g.name).width + 24;
      if (x + w > width - pad && x > pad) { x = pad; y += 24; }
      const entry = { g, x, y };
      x += w;
      return entry;
    });
    const headerH = y + 16;
    const footerH = 30;
    const totalH = headerH + height + footerH;

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = totalH * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, totalH);

    ctx.fillStyle = "#111111";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("Colorectal cancer: cancer-specific survival", pad, 30);

    ctx.font = legendFont;
    ctx.textBaseline = "middle";
    entries.forEach(({ g, x, y }) => {
      ctx.strokeStyle = g.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 22, y);
      ctx.stroke();
      ctx.fillStyle = "#111111";
      ctx.fillText(g.name, x + 30, y);
    });
    ctx.textBaseline = "alphabetic";

    ctx.drawImage(img, 0, headerH, width, height);

    ctx.fillStyle = "#555555";
    ctx.font = "11px sans-serif";
    ctx.fillText("Source: SEER, 2004-2020. Educational use only, not medical advice.", pad, headerH + height + 18);

    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "oncosurvive-survival-curves.png";
      link.click();
      URL.revokeObjectURL(link.href);
    }, "image/png");
  };
  img.src = url;
}

export default function App() {
  const nextId = useRef(3);
  const chartRef = useRef(null);
  const [groups, setGroups] = useState([
    { id: "g1", name: "Group 1", color: PALETTE[0], stage: "Regional", sex: "", age_min: 0, age_max: 49 },
    { id: "g2", name: "Group 2", color: PALETTE[1], stage: "Regional", sex: "", age_min: 70, age_max: 85 },
  ]);
  const [results, setResults] = useState({}); // id -> { data } or { error }
  const [activeId, setActiveId] = useState("g1");
  const [notchVisible, setNotchVisible] = useState(false);
  const dashboardRef = useRef(null);
  const active = groups.find((g) => g.id === activeId) || groups[0];

  // Only show the floating controls while the dashboard is on screen
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => setNotchVisible(e.isIntersecting), { threshold: 0.05 });
    obs.observe(dashboardRef.current);
    return () => obs.disconnect();
  }, []);

  const updateGroup = (id, changes) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...changes } : g)));

  const addGroup = () => {
    if (groups.length >= MAX_GROUPS) return;
    const n = nextId.current++;
    const unusedColor = PALETTE.find((c) => !groups.some((g) => g.color === c)) || PALETTE[n % PALETTE.length];
    setGroups((gs) => [
      ...gs,
      { id: `g${n}`, name: `Group ${n}`, color: unusedColor, stage: "", sex: "", age_min: 0, age_max: 85 },
    ]);
  setActiveId(`g${n}`);
  };

  const removeGroup = (id) => setGroups((gs) => gs.filter((g) => g.id !== id));

  // Only refetch when a filter changes (not when a color or name changes)
  const filterKey = JSON.stringify(groups.map((g) => [g.id, g.stage, g.sex, g.age_min, g.age_max]));
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      groups.map((g) =>
        fetchGroup(g, controller.signal)
          .then((data) => [g.id, { data }])
          .catch((e) => {
            if (e.name === "AbortError") throw e;
            return [g.id, { error: e.message }];
          })
      )
    )
      .then((entries) => setResults(Object.fromEntries(entries)))
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const withData = groups.filter((g) => results[g.id]?.data);
  const chartData = mergeCurves(withData.map((g) => ({ id: g.id, curve: results[g.id].data.curve })));
  const ticks = [0, 12, 24, 36, 48, 60, 84, 120, 180, 240];

  return (
    <>
    <div id="dashboard" ref={dashboardRef} style={{ maxWidth: 1000, width: "100%", boxSizing: "border-box", margin: "1.5rem auto 0", paddingBottom: 140, fontFamily: "sans-serif", paddingInline: "1rem" }}>
      <h1 style={{ marginBottom: 20 }}>OncoSurvive</h1>
      <p style={{ marginTop: 0, marginBottom: 20 }}>
        Cancer-specific survival after a colorectal cancer diagnosis (SEER, 2004-2020).
        For education only, not medical advice.
      </p>

      <p className="dashboard-hint">
        Use the bar at the bottom of the screen to pick a group and change its stage, sex, or age.
        The graph updates as you go.
      </p>

      {withData.length > 0 && (
        <>
          <div ref={chartRef}>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 30, left: 10 }}>
                <CartesianGrid stroke="#888" strokeOpacity={0.25} />
                <XAxis dataKey="month" type="number" domain={[0, 240]} ticks={ticks}
                  label={{ value: "Months since diagnosis", position: "insideBottom", offset: -15, marginTop: 20 }} />
                <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip formatter={(v) => pct(v)} labelFormatter={(m) => `Month ${m}`} />
                <Legend verticalAlign="top" />
                {withData.map((g) => (
                  <Line key={g.id} name={g.name} type="stepAfter" dataKey={g.id}
                    stroke={g.color} dot={false} strokeWidth={2} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", marginTop: 20 }}>
            <thead>
              <tr><th></th><th>Patients</th><th>1-year</th><th>3-year</th><th>5-year</th></tr>
            </thead>
            <tbody>
              {withData.map((g) => {
                const d = results[g.id].data;
                return (
                  <tr key={g.id}>
                    <td style={{ color: g.color, fontWeight: "bold" }}>{g.name}</td>
                    <td>{d.n.toLocaleString()}</td>
                    <td>{pct(d.survival_1yr)}</td>
                    <td>{pct(d.survival_3yr)}</td>
                    <td>{pct(d.survival_5yr)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: "0.85em", opacity: 0.8, marginBottom: 24, marginTop: 10 }}>
            Differences between groups are descriptive. They don't account for other health conditions,
            treatment choices, or other factors that differ between groups.
            
          </p>
          <button
            className="download-btn"
            onClick={() => downloadChart(chartRef.current, withData)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="M7 11l5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Download chart
          </button>
        </>
      )}
      <Explainer />
    </div>
    <Notch
      groups={groups}
      active={active}
      errors={Object.fromEntries(groups.map((g) => [g.id, results[g.id]?.error]).filter(([, e]) => e))}
      palette={PALETTE}
      visible={notchVisible}
      canAdd={groups.length < MAX_GROUPS}
      onSelectGroup={setActiveId}
      onChange={updateGroup}
      onAdd={addGroup}
      onRemove={removeGroup}
    />
    </>
  );
}