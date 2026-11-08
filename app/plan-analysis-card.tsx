"use client";

import { useState } from "react";
import type { KpiPlan } from "./kpi-plan";
import type { PlanAnalysis } from "./plan-analysis";

export default function PlanAnalysisCard({ plan, analyze, unsaved }: {
  plan: KpiPlan; analyze: (plan: KpiPlan) => Promise<PlanAnalysis>; unsaved: boolean;
}) {
  const [analysis, setAnalysis] = useState<PlanAnalysis>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setAnalysis(await analyze(plan));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa phân tích được kế hoạch. Bạn thử lại sau.");
    } finally { setBusy(false); }
  }
  return <section className="panel policy planAi" aria-busy={busy}>
    <div className="sectionHead">
      <div><h2>Góc nhìn từ trợ lý AI</h2><p>Giải thích mức độ khả thi và gợi ý những việc cần ưu tiên.</p></div>
      <button type="button" disabled={busy} onClick={() => void run()}>{busy ? "Đang phân tích…" : "AI phân tích kế hoạch"}</button>
    </div>
    <p>Gửi số liệu KPI, nguồn dự kiến và giả định tiếp cận tới DeepSeek khi bạn bấm phân tích.{unsaved && " AI sẽ phân tích theo các thay đổi đang tính thử, chưa lưu."}</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    {analysis && <div className="aiResult" role="status">
      <p>{analysis.summary}</p>
      <ol>{analysis.actions.map((item, index) => <li key={index}><b>{item.action}</b><p>{item.reason}</p></li>)}</ol>
      <p><b>Trao đổi cùng Team Lead</b><br />{analysis.support}</p>
      <small>Gợi ý do AI tạo. Bạn cùng Team Lead rà lại với nguồn thực tế trước khi điều chỉnh kế hoạch.</small>
    </div>}
  </section>;
}
