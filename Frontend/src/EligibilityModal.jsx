import React, { useState } from "react";
import "./EligibilityModal.css";
import api from "./services/api";

const INDIAN_STATES = [
  "All / Central",
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh"
];

const OCCUPATION_OPTIONS = [
  { value: "Farmer / Agricultural Worker", label: "Farmer / Agricultural Worker", hint: "PM-KISAN, crop insurance, solar pumps" },
  { value: "Street Vendor / Daily Wage Worker", label: "Street Vendor / Daily Wage Worker", hint: "PM SVANidhi, microcredit, e-Shram" },
  { value: "Student / Youth", label: "Student / Youth", hint: "Scholarships, skill development, education loans" },
  { value: "Women / Self-Help Group (SHG)", label: "Women / Self-Help Group (SHG)", hint: "Lakhpati Didi, maternity benefits, Ujjwala" },
  { value: "Senior Citizen", label: "Senior Citizen (60+)", hint: "Old age pensions, healthcare assistance" },
  { value: "Small Business / Artisan (Vishwakarma)", label: "Small Business / Artisan", hint: "PMEGP, PM Vishwakarma, MUDRA loans" },
  { value: "Unemployed Jobseeker", label: "Unemployed Jobseeker", hint: "Apprenticeship stipends, employment exchange" }
];

const INCOME_OPTIONS = [
  { value: "Below 1 Lakh", label: "Below ₹1,00,000 / year (BPL / Antyodaya)", hint: "Priority ration, free healthcare, housing subsidy" },
  { value: "1 to 3 Lakhs", label: "₹1,00,000 – ₹3,00,000 / year (EWS)", hint: "Subsidized interest, scholarships, food security" },
  { value: "3 to 8 Lakhs", label: "₹3,00,000 – ₹8,00,000 / year (Low-Middle Income)", hint: "Credit-linked housing subsidies, skill grants" },
  { value: "Above 8 Lakhs", label: "Above ₹8,00,000 / year", hint: "General development & green energy subsidies" }
];

export default function EligibilityModal({ isOpen, onClose, onSelectSchemeForChat }) {
  const [state, setState] = useState("Maharashtra");
  const [occupation, setOccupation] = useState("Farmer / Agricultural Worker");
  const [ageGroup, setAgeGroup] = useState("18-35");
  const [incomeRange, setIncomeRange] = useState("Below 1 Lakh");

  const [loading, setLoading] = useState(false);
  const [matchedSchemes, setMatchedSchemes] = useState(null);
  const [error, setError] = useState(null);
  const [activeChecklist, setActiveChecklist] = useState({});

  if (!isOpen) return null;

  const handleMatch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMatchedSchemes(null);

    try {
      const { data } = await api.post("/api/schemes/match", {
        state: state === "All / Central" ? null : state,
        occupation,
        age: ageGroup,
        incomeRange
      });
      setMatchedSchemes(data.schemes || []);
    } catch (err) {
      console.error("Match error:", err);
      setError("Unable to retrieve matching schemes right now. Please try again or ask directly in the chat.");
    } finally {
      setLoading(false);
    }
  };

  const toggleDocChecked = (schemeId, docIdx) => {
    const key = `${schemeId}_${docIdx}`;
    setActiveChecklist(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const parseDocuments = (docText) => {
    if (!docText) return [];
    return docText
      .split(/\n|•|\*/)
      .map(d => d.trim())
      .filter(d => d.length > 2);
  };

  return (
    <div className="eligibility-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="eligibility-modal">
        <header className="modal-header">
          <div className="modal-header-left">
            <span className="modal-badge">
              <i className="fa-solid fa-compass"></i> Citizen Scheme Matcher
            </span>
            <h2 id="modal-title" className="modal-title">Find Government Schemes For You</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close dialog">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>

        {/* Informational & Privacy Guarantee Notice */}
        <div className="privacy-banner" role="note">
          <i className="fa-solid fa-shield-check"></i>
          <div>
            <strong>100% Privacy Protected:</strong> We do NOT ask for or record sensitive personal identifiers (no Aadhaar, PAN, or bank account numbers).
            Details entered below are used strictly in-session to match eligibility and are discarded immediately.
          </div>
        </div>

        <div className="modal-body">
          {!matchedSchemes ? (
            <form onSubmit={handleMatch} className="eligibility-form">
              {/* Field 1: State / UT */}
              <div className="form-group">
                <label htmlFor="state-select">
                  <span className="label-text">State / Union Territory</span>
                  <span className="field-explanation">
                    <i className="fa-solid fa-circle-info"></i> Needed because welfare schemes differ between your state of residence and central government programs.
                  </span>
                </label>
                <div className="select-wrapper">
                  <select
                    id="state-select"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="form-select"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Field 2: Occupation */}
              <div className="form-group">
                <label htmlFor="occupation-select">
                  <span className="label-text">Primary Occupation / Category</span>
                  <span className="field-explanation">
                    <i className="fa-solid fa-circle-info"></i> Needed to match targeted subsidies for farmers, students, artisans, street vendors, or small businesses.
                  </span>
                </label>
                <div className="select-wrapper">
                  <select
                    id="occupation-select"
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    className="form-select"
                  >
                    {OCCUPATION_OPTIONS.map((occ) => (
                      <option key={occ.value} value={occ.value}>
                        {occ.label}
                      </option>
                    ))}
                  </select>
                </div>
                {OCCUPATION_OPTIONS.find(o => o.value === occupation) && (
                  <div className="select-hint-badge">
                    <i className="fa-solid fa-sparkles"></i>
                    <span><strong>Coverage:</strong> {OCCUPATION_OPTIONS.find(o => o.value === occupation)?.hint}</span>
                  </div>
                )}
              </div>

              {/* Field 3 & 4 Grid: Age Group & Income */}
              <div className="form-row">
                <div className="form-group half">
                  <label htmlFor="age-select">
                    <span className="label-text">Age Bracket</span>
                    <span className="field-explanation">
                      <i className="fa-solid fa-circle-info"></i> Some schemes enforce specific age limits.
                    </span>
                  </label>
                  <div className="select-wrapper">
                    <select
                      id="age-select"
                      value={ageGroup}
                      onChange={(e) => setAgeGroup(e.target.value)}
                      className="form-select"
                    >
                      <option value="Under 18">Under 18 (Children & Schooling)</option>
                      <option value="18-35">18 – 35 (Youth & Higher Education)</option>
                      <option value="36-59">36 – 59 (Working Age)</option>
                      <option value="60+">60+ (Senior Citizen)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group half">
                  <label htmlFor="income-select">
                    <span className="label-text">Annual Household Income</span>
                    <span className="field-explanation">
                      <i className="fa-solid fa-circle-info"></i> Identifies financial criteria for EWS and BPL welfare.
                    </span>
                  </label>
                  <div className="select-wrapper">
                    <select
                      id="income-select"
                      value={incomeRange}
                      onChange={(e) => setIncomeRange(e.target.value)}
                      className="form-select"
                    >
                      {INCOME_OPTIONS.map((inc) => (
                        <option key={inc.value} value={inc.value}>
                          {inc.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {INCOME_OPTIONS.find(i => i.value === incomeRange) && (
                    <div className="select-hint-badge">
                      <i className="fa-solid fa-sparkles"></i>
                      <span><strong>Key benefits:</strong> {INCOME_OPTIONS.find(i => i.value === incomeRange)?.hint}</span>
                    </div>
                  )}
                </div>
              </div>

              {error && <div className="error-alert">{error}</div>}

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? (
                    <span><i className="fa-solid fa-spinner fa-spin"></i> Checking Schemes...</span>
                  ) : (
                    <span><i className="fa-solid fa-magnifying-glass"></i> Find Matching Schemes</span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="results-container">
              <div className="results-header">
                <div>
                  <h3 className="results-count">Found {matchedSchemes.length} Potential Schemes</h3>
                  <p className="results-sub">
                    Profile: {occupation} in {state} ({incomeRange})
                  </p>
                </div>
                <button className="btn-secondary-sm" onClick={() => setMatchedSchemes(null)}>
                  <i className="fa-solid fa-sliders"></i> Modify Criteria
                </button>
              </div>

              <div className="disclaimer-callout">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span><strong>Informational Notice:</strong> These results are guidance based on official scheme guidelines. Official eligibility is subject to physical verification and CSC approval.</span>
              </div>

              {matchedSchemes.length === 0 ? (
                <div className="empty-results">
                  <i className="fa-solid fa-magnifying-glass-chart"></i>
                  <p>No direct matches found for this specific combination. Try selecting <em>All / Central</em> to view nationwide welfare programs.</p>
                </div>
              ) : (
                <div className="schemes-results-grid">
                  {matchedSchemes.map((scheme) => {
                    const docs = parseDocuments(scheme.documentsRequired);
                    return (
                      <div key={scheme.schemeId} className="result-scheme-card">
                        <div className="result-card-header">
                          <div className="result-badges">
                            <span className="badge-level">{scheme.level || "Central"}</span>
                            <span className="badge-ministry">{scheme.stateOrMinistry || "Government of India"}</span>
                          </div>
                          {scheme.matchReason && (
                            <span className="badge-match-reason">
                              <i className="fa-solid fa-circle-check"></i> {scheme.matchReason}
                            </span>
                          )}
                        </div>

                        <h4 className="result-scheme-title">{scheme.title}</h4>
                        <p className="result-scheme-desc">{scheme.description}</p>

                        {/* Benefits highlight */}
                        {scheme.benefits && (
                          <div className="result-section">
                            <strong className="section-label">
                              <i className="fa-solid fa-gift"></i> Key Benefits:
                            </strong>
                            <p className="section-text">{scheme.benefits.substring(0, 180)}...</p>
                          </div>
                        )}

                        {/* Interactive Document Checklist */}
                        {docs.length > 0 && (
                          <div className="checklist-box">
                            <strong className="checklist-title">
                              <i className="fa-solid fa-list-check"></i> Document Readiness Checklist:
                            </strong>
                            <ul className="checklist-list">
                              {docs.slice(0, 4).map((doc, idx) => {
                                const isChecked = !!activeChecklist[`${scheme.schemeId}_${idx}`];
                                return (
                                  <li
                                    key={idx}
                                    className={`checklist-item ${isChecked ? "checked" : ""}`}
                                    onClick={() => toggleDocChecked(scheme.schemeId, idx)}
                                  >
                                    <i className={`fa-regular ${isChecked ? "fa-square-check" : "fa-square"}`}></i>
                                    <span>{doc}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        <div className="result-card-actions">
                          {scheme.sourceUrl && (
                            <a
                              href={scheme.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="action-link-btn"
                              title="Open verified official portal link"
                            >
                              <i className="fa-solid fa-arrow-up-right-from-square"></i> Official Portal
                            </a>
                          )}
                          <button
                            type="button"
                            className="action-chat-btn"
                            onClick={() => {
                              onSelectSchemeForChat(`Tell me about eligibility criteria, required documents, and step-by-step application process for ${scheme.title}`);
                              onClose();
                            }}
                          >
                            <i className="fa-solid fa-comment-dots"></i> Ask Assistant
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
