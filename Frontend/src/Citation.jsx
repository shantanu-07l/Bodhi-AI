import React from "react";
import "./Citation.css";

export default function Citation({ citations }) {
  if (!citations || !Array.isArray(citations) || citations.length === 0) {
    return null;
  }

  // Deduplicate by schemeTitle
  const uniqueCitations = [];
  const seenTitles = new Set();
  for (const c of citations) {
    if (!seenTitles.has(c.schemeTitle)) {
      seenTitles.add(c.schemeTitle);
      uniqueCitations.push(c);
    }
  }

  const formatChunkType = (type) => {
    switch (type) {
      case "eligibility":
        return "Eligibility & Criteria";
      case "benefits":
        return "Benefits & Financial Aid";
      case "application_process":
        return "How to Apply";
      case "documents":
        return "Required Documents";
      case "summary":
        return "Scheme Overview";
      case "faq":
        return "Frequently Asked Questions";
      default:
        return "Official Scheme Data";
    }
  };

  return (
    <div className="citation-container" aria-label="Verified Scheme Citations">
      <div className="citation-header">
        <i className="fa-solid fa-shield-halved citation-shield-icon"></i>
        <span>Verified Government Sources ({uniqueCitations.length})</span>
      </div>
      <div className="citation-list">
        {uniqueCitations.map((item, index) => (
          <a
            key={index}
            href={item.sourceUrl || "https://www.myscheme.gov.in"}
            target="_blank"
            rel="noopener noreferrer"
            className="citation-card"
          >
            <div className="citation-card-top">
              <span className="citation-badge">
                <i className="fa-solid fa-certificate"></i> Verified Scheme
              </span>
              {item.chunkType && (
                <span className="citation-type-tag">
                  {formatChunkType(item.chunkType)}
                </span>
              )}
            </div>
            <div className="citation-title">{item.schemeTitle}</div>
            <div className="citation-footer">
              <span className="citation-portal">
                <i className="fa-solid fa-landmark"></i> myscheme.gov.in
              </span>
              <span className="citation-link-text">
                View Official Portal <i className="fa-solid fa-arrow-up-right-from-square"></i>
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
