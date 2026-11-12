import { RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type LinkedReport = {
  id: string;
  title: string;
  schoolCaseId: string | null;
  schoolCaseNumber: string | null;
};

type PublicCase = {
  caseId: string;
  caseNumber: string;
  status: string;
  submittedAt: string;
  location: string;
  item: string;
  reason: string;
};

type Props = {
  reports: LinkedReport[];
  loading: boolean;
  reportsError: string;
  initialCaseId: string | null;
  onRetryReports: () => void;
};

export function CaseTracking({ reports, loading, reportsError, initialCaseId, onRetryReports }: Props) {
  const [query, setQuery] = useState("");
  const [caseInfo, setCaseInfo] = useState<PublicCase | null>(null);
  const [checkedAt, setCheckedAt] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const linkedReports = reports.filter((report) => report.schoolCaseId);

  const loadCase = useCallback(async (key: "caseId" | "caseNumber", value: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLookupLoading(true);
    setLookupError("");
    setCaseInfo(null);

    try {
      const params = new URLSearchParams({ [key]: value });
      const response = await fetch(`/api/repair/progress?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json() as { report?: PublicCase; checkedAt?: string; error?: string };
      if (!response.ok || !payload.report) {
        throw new Error(payload.error ?? "無法取得臺大案件進度。");
      }
      if (!controller.signal.aborted) {
        setCaseInfo(payload.report);
        setCheckedAt(payload.checkedAt ?? "");
        setQuery(payload.report.caseNumber);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setLookupError(error instanceof Error ? error.message : "無法取得臺大案件進度。");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLookupLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (initialCaseId) {
      void loadCase("caseId", initialCaseId);
    }
    return () => controllerRef.current?.abort();
  }, [initialCaseId, loadCase]);

  function searchCase() {
    const caseNumber = query.trim().toUpperCase();
    if (!/^[A-Z]{2}\d{6,}$/.test(caseNumber)) {
      controllerRef.current?.abort();
      setLookupLoading(false);
      setLookupError("請輸入完整的臺大案號，例如 MA11504033。");
      setCaseInfo(null);
      return;
    }
    void loadCase("caseNumber", caseNumber);
  }

  return (
    <section className="tracking-page" aria-label="臺大案件進度追蹤">
      <div className="tracking-intro">
        <h2>進度追蹤</h2>
        <p>即時讀取臺大公開案件頁的狀態。輸入臺大案號，也可以查詢不是從本站送出的案件。</p>
      </div>

      <div className="tracking-search app-card">
        <label className="field-label" htmlFor="tracking-case-number">臺大案號</label>
        <div className="tracking-search-row">
          <input
            autoCapitalize="characters"
            id="tracking-case-number"
            maxLength={20}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                searchCase();
              }
            }}
            placeholder="例如 MA11504033"
            value={query}
          />
          <button disabled={lookupLoading} onClick={searchCase} type="button">
            <Search aria-hidden="true" size={18} />
            查詢
          </button>
        </div>
      </div>

      <div className="tracking-result" aria-live="polite">
        {lookupLoading ? <div className="tracking-placeholder">正在向臺大查詢最新進度...</div> : null}
        {!lookupLoading && lookupError ? <div className="tracking-placeholder error-text" role="alert">{lookupError}</div> : null}
        {!lookupLoading && !lookupError && caseInfo ? (
          <article className="tracking-case app-card">
            <div className="tracking-case-heading">
              <div>
                <small>臺大案號</small>
                <h3>{caseInfo.caseNumber}</h3>
              </div>
              <span className="tracking-status">{caseInfo.status}</span>
            </div>
            <dl>
              <div><dt>申請時間</dt><dd>{caseInfo.submittedAt || "臺大未提供"}</dd></div>
              <div><dt>報修地點</dt><dd>{caseInfo.location || "臺大未提供"}</dd></div>
              <div><dt>申報項目</dt><dd>{caseInfo.item || "臺大未提供"}</dd></div>
              <div><dt>申報事由</dt><dd>{caseInfo.reason || "臺大未提供"}</dd></div>
            </dl>
            <div className="tracking-case-actions">
              <a href={`https://my.ntu.edu.tw/repairservice2/PublicRepair/Details?caseId=${encodeURIComponent(caseInfo.caseId)}`} rel="noopener noreferrer" target="_blank">
                開啟臺大原始頁面
              </a>
              <button className="tracking-text-button" onClick={() => void loadCase("caseId", caseInfo.caseId)} type="button">
                <RefreshCw aria-hidden="true" size={16} />
                更新進度
              </button>
            </div>
            {checkedAt ? <small className="tracking-checked-at">查詢時間：{new Date(checkedAt).toLocaleString("zh-TW")}</small> : null}
          </article>
        ) : null}
        {!lookupLoading && !lookupError && !caseInfo ? (
          <div className="tracking-placeholder">選擇本站案件或輸入臺大案號，即可查看最新進度。</div>
        ) : null}
      </div>

      <div className="tracking-linked app-card">
        <div className="tracking-section-heading">
          <h3>本站回報的臺大案件</h3>
          {reportsError ? <button className="tracking-text-button" onClick={onRetryReports} type="button">重試</button> : null}
        </div>
        {loading ? <p>載入本站回報中...</p> : null}
        {!loading && reportsError ? <p role="alert">{reportsError}，仍可用上方案號查詢。</p> : null}
        {!loading && !reportsError && linkedReports.length === 0 ? <p>目前沒有已連結的臺大案件。</p> : null}
        {!loading && !reportsError && linkedReports.length > 0 ? (
          <div className="tracking-linked-list">
            {linkedReports.map((report) => (
              <button
                className="tracking-linked-item"
                key={report.id}
                onClick={() => {
                  if (report.schoolCaseId) void loadCase("caseId", report.schoolCaseId);
                }}
                type="button"
              >
                <strong>{report.schoolCaseNumber ?? `案件 ID ${report.schoolCaseId}`}</strong>
                <span>{report.title}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
