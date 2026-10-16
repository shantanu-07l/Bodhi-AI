import React, { useState, useEffect } from "react";
import "./AdminDashboard.css";
import api from "./services/api";
import { useNavigate } from "react-router-dom";

export default function AdminDashboard({ user, onClose }) {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "jobs" | "changes" | "inspector"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Real backend metrics
  const [stats, setStats] = useState(null);
  const [refreshStatus, setRefreshStatus] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [changes, setChanges] = useState([]);

  // Manual refresh modal & execution state
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSuccessMsg, setRefreshSuccessMsg] = useState(null);
  const [forceReindex, setForceReindex] = useState(false);
  const [dryRun, setDryRun] = useState(false);

  // Inspector state
  const [inspectSchemeId, setInspectSchemeId] = useState("");
  const [inspectData, setInspectData] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, statusRes, jobsRes, changesRes] = await Promise.all([
        api.get("/api/schemes/stats"),
        api.get("/api/schemes/refresh/status"),
        api.get("/api/schemes/refresh/jobs?limit=15"),
        api.get("/api/schemes/refresh/changes?limit=25")
      ]);

      setStats(statsRes.data);
      setRefreshStatus(statusRes.data);
      setJobs(jobsRes.data.jobs || []);
      setChanges(changesRes.data.changes || []);
    } catch (err) {
      console.error("Admin dashboard fetch error:", err);
      if (err.response?.status === 403 || err.response?.status === 401) {
        setError("Access Denied: You do not possess verified administrator privileges to view this console.");
      } else {
        setError("Failed to fetch administrative records. Verify the backend connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerRefresh = async () => {
    setRefreshing(true);
    setShowRefreshConfirm(false);
    setRefreshSuccessMsg(null);
    setError(null);

    try {
      const { data } = await api.post("/api/schemes/refresh", {
        dryRun,
        forceReindex,
        asyncRun: false
      });
      setRefreshSuccessMsg(
        `Refresh complete (Job: ${data.jobId}): ${data.stats?.newSchemes || 0} new, ${data.stats?.updatedSchemes || 0} updated, ${data.stats?.sectionsReindexed || 0} sections re-indexed.`
      );
      await fetchDashboardData();
    } catch (err) {
      console.error("Refresh trigger error:", err);
      setError(err.response?.data?.error || err.message || "Refresh cycle failed.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleInspectScheme = async (e) => {
    e.preventDefault();
    if (!inspectSchemeId.trim()) return;
    setInspectLoading(true);
    setInspectError(null);
    setInspectData(null);

    try {
      const { data } = await api.get(`/api/schemes/inspect/${inspectSchemeId.trim()}`);
      setInspectData(data);
    } catch (err) {
      console.error("Inspect error:", err);
      setInspectError(err.response?.data?.error || "Scheme not found or failed to load inspection details.");
    } finally {
      setInspectLoading(false);
    }
  };

  const latestJob = refreshStatus?.latestJob;

  return (
    <div className="admin-overlay" role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <div className="admin-container">
        {/* Top Navbar */}
        <header className="admin-header">
          <div className="admin-header-title">
            <span className="admin-badge">
              <i className="fa-solid fa-screwdriver-wrench"></i> Administrative Console
            </span>
            <h1 id="admin-title" className="admin-main-title">JanSahayak Pipeline & Scheme Governance</h1>
          </div>
          <div className="admin-header-actions">
            <button
              className="btn-refresh-trigger"
              onClick={() => setShowRefreshConfirm(true)}
              disabled={refreshing || loading}
            >
              {refreshing ? (
                <span><i className="fa-solid fa-spinner fa-spin"></i> Refreshing...</span>
              ) : (
                <span><i className="fa-solid fa-arrows-rotate"></i> Trigger Scheme Refresh</span>
              )}
            </button>
            <button className="admin-close-btn" onClick={onClose} aria-label="Close Admin Console">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </header>

        {/* Tab Navigation */}
        <nav className="admin-tabs" role="tablist">
          <button
            className={`admin-tab ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
            role="tab"
            aria-selected={activeTab === "overview"}
          >
            <i className="fa-solid fa-chart-pie"></i> Pipeline Overview
          </button>
          <button
            className={`admin-tab ${activeTab === "jobs" ? "active" : ""}`}
            onClick={() => setActiveTab("jobs")}
            role="tab"
            aria-selected={activeTab === "jobs"}
          >
            <i className="fa-solid fa-clock-rotate-left"></i> Refresh Jobs History
          </button>
          <button
            className={`admin-tab ${activeTab === "changes" ? "active" : ""}`}
            onClick={() => setActiveTab("changes")}
            role="tab"
            aria-selected={activeTab === "changes"}
          >
            <i className="fa-solid fa-code-compare"></i> Content Changes ({changes.length})
          </button>
          <button
            className={`admin-tab ${activeTab === "inspector" ? "active" : ""}`}
            onClick={() => setActiveTab("inspector")}
            role="tab"
            aria-selected={activeTab === "inspector"}
          >
            <i className="fa-solid fa-magnifying-glass"></i> Scheme & Vector Inspector
          </button>
        </nav>

        {/* Status / Alert Banners */}
        {error && (
          <div className="admin-alert error" role="alert">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <span>{error}</span>
          </div>
        )}

        {refreshSuccessMsg && (
          <div className="admin-alert success" role="status">
            <i className="fa-solid fa-circle-check"></i>
            <span>{refreshSuccessMsg}</span>
          </div>
        )}

        {/* Main Content Area */}
        <div className="admin-content-body">
          {loading ? (
            <div className="admin-loading-state">
              <i className="fa-solid fa-spinner fa-spin"></i>
              <p>Loading real-time pipeline status and scheme records...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <div className="overview-tab">
                  {/* Top Metric Cards */}
                  <div className="metric-cards-grid">
                    <div className="metric-card">
                      <div className="metric-icon blue">
                        <i className="fa-solid fa-landmark"></i>
                      </div>
                      <div className="metric-info">
                        <span className="metric-label">Total Indexed Schemes</span>
                        <strong className="metric-value">{stats?.totalSchemes ?? "—"}</strong>
                        <span className="metric-sub">
                          {stats?.centralCount ?? 0} Central • {stats?.stateCount ?? 0} State/UT
                        </span>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-icon purple">
                        <i className="fa-solid fa-cubes-stacked"></i>
                      </div>
                      <div className="metric-info">
                        <span className="metric-label">Vector Embeddings</span>
                        <strong className="metric-value">{stats?.totalChunks ?? "—"}</strong>
                        <span className="metric-sub">Granular semantic sections</span>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-icon green">
                        <i className="fa-solid fa-circle-check"></i>
                      </div>
                      <div className="metric-info">
                        <span className="metric-label">Latest Refresh Status</span>
                        <strong className={`metric-value status-${latestJob?.status || "unknown"}`}>
                          {latestJob?.status ? latestJob.status.toUpperCase() : "NO RUNS"}
                        </strong>
                        <span className="metric-sub">
                          {latestJob?.completedAt
                            ? new Date(latestJob.completedAt).toLocaleString()
                            : "Awaiting cycle"}
                        </span>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-icon orange">
                        <i className="fa-solid fa-business-time"></i>
                      </div>
                      <div className="metric-info">
                        <span className="metric-label">Scheduled Cron</span>
                        <strong className="metric-value">
                          {refreshStatus?.scheduler?.isCronActive ? "ACTIVE" : "STANDBY"}
                        </strong>
                        <span className="metric-sub">
                          {refreshStatus?.scheduler?.cronExpression || "Weekly"} ({refreshStatus?.scheduler?.timezone || "Asia/Kolkata"})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Active Job / Latest Run Deep Dive */}
                  <div className="overview-detail-section">
                    <h3 className="section-title">
                      <i className="fa-solid fa-satellite-dish"></i> Pipeline Refresh Status
                    </h3>
                    <div className="detail-box">
                      <div className="detail-row">
                        <span className="detail-key">Job ID:</span>
                        <span className="detail-val font-mono">{latestJob?.jobId || "N/A"}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-key">Trigger Source:</span>
                        <span className="detail-val">{latestJob?.triggerType || "scheduled"}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-key">Data Source Portal:</span>
                        <span className="detail-val">{latestJob?.source || "myscheme-scraper (myscheme.gov.in)"}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-key">Execution Duration:</span>
                        <span className="detail-val">
                          {latestJob?.durationMs ? `${(latestJob.durationMs / 1000).toFixed(2)}s` : "—"}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-key">Records Processed:</span>
                        <span className="detail-val">
                          {latestJob?.stats?.newSchemes || 0} Added • {latestJob?.stats?.updatedSchemes || 0} Modified • {latestJob?.stats?.unchangedSchemes || 0} Unchanged • {latestJob?.stats?.skippedRecords || 0} Skipped
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-key">Sections Re-Indexed:</span>
                        <span className="detail-val font-bold text-accent">
                          {latestJob?.stats?.sectionsReindexed || 0} vector chunks updated
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-key">Crawl Completeness:</span>
                        <span className="detail-val">
                          {latestJob?.crawlCompletenessFraction
                            ? `${(latestJob.crawlCompletenessFraction * 100).toFixed(1)}% (Threshold: 80%)`
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: REFRESH JOBS */}
              {activeTab === "jobs" && (
                <div className="jobs-tab">
                  <h3 className="section-title">Execution History & Audit Trail</h3>
                  <div className="table-responsive">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Job ID</th>
                          <th>Status</th>
                          <th>Trigger</th>
                          <th>Started</th>
                          <th>Duration</th>
                          <th>New / Mod / Unch</th>
                          <th>Indexed</th>
                          <th>Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((j) => (
                          <tr key={j.jobId}>
                            <td className="font-mono text-sm">{j.jobId}</td>
                            <td>
                              <span className={`status-pill ${j.status}`}>
                                {j.status}
                              </span>
                            </td>
                            <td>{j.triggerType}</td>
                            <td>{new Date(j.startedAt).toLocaleString()}</td>
                            <td>{j.durationMs ? `${(j.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                            <td>
                              <span className="stat-badge green">+{j.stats?.newSchemes || 0}</span>{" "}
                              <span className="stat-badge yellow">~{j.stats?.updatedSchemes || 0}</span>{" "}
                              <span className="stat-badge gray">={j.stats?.unchangedSchemes || 0}</span>
                            </td>
                            <td>{j.stats?.sectionsReindexed || 0}</td>
                            <td>
                              {j.stats?.errorCount > 0 ? (
                                <span className="stat-badge red">{j.stats.errorCount}</span>
                              ) : (
                                <span className="text-muted">0</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: CONTENT CHANGES */}
              {activeTab === "changes" && (
                <div className="changes-tab">
                  <h3 className="section-title">Detected Scheme Webpage Content Changes</h3>
                  <p className="section-sub">
                    Changes detected by comparing normalized section hashes. Webpage changes are unverified until confirmed against official gazette notifications.
                  </p>

                  <div className="table-responsive">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Detected At</th>
                          <th>Scheme</th>
                          <th>Change Type</th>
                          <th>Section Affected</th>
                          <th>Version Transition</th>
                          <th>Verification</th>
                          <th>Source URL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map((c, idx) => (
                          <tr key={idx}>
                            <td>{new Date(c.detectedAt).toLocaleDateString()}</td>
                            <td className="font-bold">{c.schemeTitle}</td>
                            <td>
                              <span className={`change-badge ${c.changeType}`}>
                                {c.changeType}
                              </span>
                            </td>
                            <td>
                              <span className="section-tag">{c.section || "Whole Scheme"}</span>
                            </td>
                            <td className="font-mono">
                              v{c.previousVersion ?? "—"} → v{c.currentVersion ?? "—"}
                            </td>
                            <td>
                              <span className={`verification-badge ${c.verificationStatus}`}>
                                {c.verificationStatus}
                              </span>
                            </td>
                            <td>
                              {c.sourceUrl && (
                                <a
                                  href={c.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="source-link"
                                >
                                  myscheme.gov.in <i className="fa-solid fa-arrow-up-right-from-square"></i>
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: SCHEME & VECTOR INSPECTOR */}
              {activeTab === "inspector" && (
                <div className="inspector-tab">
                  <h3 className="section-title">Deep Scheme & Vector Storage Inspector</h3>
                  <p className="section-sub">
                    Search and inspect full schema properties, chunk hashes, and embedding vectors for any scheme slug.
                  </p>

                  <form onSubmit={handleInspectScheme} className="inspector-search-form">
                    <input
                      type="text"
                      className="inspector-input"
                      placeholder="Enter schemeId / slug (e.g. pradhan-mantri-kisan-samman-nidhi)"
                      value={inspectSchemeId}
                      onChange={(e) => setInspectSchemeId(e.target.value)}
                    />
                    <button type="submit" className="btn-primary" disabled={inspectLoading}>
                      {inspectLoading ? "Loading..." : "Inspect Scheme"}
                    </button>
                  </form>

                  {inspectError && <div className="admin-alert error">{inspectError}</div>}

                  {inspectData && (
                    <div className="inspect-results">
                      <div className="inspect-header-card">
                        <div className="inspect-title-row">
                          <h4 className="inspect-scheme-name">{inspectData.scheme?.title}</h4>
                          <span className="badge-level">{inspectData.scheme?.level}</span>
                        </div>
                        <p className="inspect-meta">
                          Slug: <code>{inspectData.scheme?.schemeId}</code> • Version: v{inspectData.scheme?.version} • Content Hash: <code>{inspectData.scheme?.contentHash?.substring(0, 16)}...</code>
                        </p>
                        <p className="inspect-desc">{inspectData.scheme?.description}</p>
                      </div>

                      {/* Vector Chunks Overview */}
                      <div className="chunks-overview">
                        <h4 className="subsection-title">
                          <i className="fa-solid fa-cubes"></i> Active Vector Chunks ({inspectData.chunkCount})
                        </h4>
                        <div className="chunks-table-wrapper">
                          <table className="admin-table compact">
                            <thead>
                              <tr>
                                <th>Chunk ID</th>
                                <th>Section</th>
                                <th>Tokens</th>
                                <th>Hash</th>
                                <th>Version</th>
                                <th>Active</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inspectData.chunks?.map((chk) => (
                                <tr key={chk.chunkId}>
                                  <td className="font-mono text-xs">{chk.chunkId}</td>
                                  <td><span className="section-tag">{chk.section}</span></td>
                                  <td>{chk.tokenEstimate}</td>
                                  <td className="font-mono text-xs">{chk.chunkHash?.substring(0, 12)}...</td>
                                  <td>v{chk.schemeVersion}</td>
                                  <td>
                                    <span className={`status-dot ${chk.isActive ? "active" : "inactive"}`}>
                                      {chk.isActive ? "Active" : "Inactive"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Confirmation Modal for Manual Refresh */}
        {showRefreshConfirm && (
          <div className="confirm-modal-overlay">
            <div className="confirm-modal">
              <h3 className="confirm-title">
                <i className="fa-solid fa-arrows-rotate"></i> Confirm Scheme Refresh
              </h3>
              <p className="confirm-text">
                This will trigger a full refresh cycle: parsing raw scraper output, detecting section-level content changes, and selectively re-indexing vector embeddings.
              </p>

              <div className="confirm-options">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                  />
                  <span>Dry Run (simulate change detection without database writes)</span>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={forceReindex}
                    onChange={(e) => setForceReindex(e.target.checked)}
                  />
                  <span>Force Re-index (re-embed all chunks even if hash unchanged)</span>
                </label>
              </div>

              <div className="confirm-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowRefreshConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleTriggerRefresh}
                >
                  Start Refresh Cycle
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
