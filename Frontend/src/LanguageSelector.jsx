import React from "react";
import "./LanguageSelector.css";

const LANGUAGES = [
  { code: "en", label: "English", native: "EN" },
  { code: "hi", label: "हिन्दी", native: "हिन्दी" },
  { code: "mr", label: "मराठी", native: "मराठी" }
];

export default function LanguageSelector({ currentLanguage, onChange }) {
  return (
    <div className="language-selector" role="radiogroup" aria-label="Select response language">
      <span className="lang-icon" aria-hidden="true">
        <i className="fa-solid fa-language"></i>
      </span>
      <div className="lang-pill-group">
        {LANGUAGES.map((lang) => {
          const isSelected = currentLanguage === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`lang-pill ${isSelected ? "active" : ""}`}
              onClick={() => onChange(lang.code)}
              title={`Switch response language to ${lang.label}`}
            >
              {lang.native}
            </button>
          );
        })}
      </div>
    </div>
  );
}
