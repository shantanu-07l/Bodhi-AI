import { useContext, useEffect, useState } from "react";
import "./Chat.css";
import { MyContext } from "./MyContext";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import Citation from "./Citation";

export default function Chat() {
  const { newChat, prevChats, reply, setPrompt, setIsEligibilityOpen } = useContext(MyContext);
  const [latestReply, setLatestReply] = useState(null);

  const suggestions = [
    {
      icon: "fa-compass",
      title: "Scheme Matching",
      desc: "What government schemes might match my situation and occupation?",
      prompt: "What government schemes might match my situation? I am looking for welfare, subsidy, and financial assistance programs.",
      isEligibilityCta: true
    },
    {
      icon: "fa-clipboard-list",
      title: "Required Documents",
      desc: "What documents does this scheme require before applying?",
      prompt: "What documents are required to apply for Pradhan Mantri Awas Yojana (PMAY)?"
    },
    {
      icon: "fa-list-ol",
      title: "How to Apply",
      desc: "How do I apply step-by-step for Ayushman Bharat (AB-PMJAY)?",
      prompt: "How do I apply step-by-step for Ayushman Bharat (AB-PMJAY) health insurance?"
    },
    {
      icon: "fa-clock-rotate-left",
      title: "Check Scheme Updates",
      desc: "Has the official eligibility or benefits information changed recently?",
      prompt: "Has the official information or eligibility criteria changed for PM-KISAN recently?"
    }
  ];

  useEffect(() => {
    if (reply === null) {
      setLatestReply(null);
      return;
    }

    if (!prevChats?.length) return;

    const content = reply.split(" "); // individual words

    let idx = 0;
    const interval = setInterval(() => {
      setLatestReply(content.slice(0, idx + 1).join(" "));

      idx++;
      if (idx >= content.length) clearInterval(interval);
    }, 40);

    return () => clearInterval(interval);
  }, [prevChats, reply]);

  const lastMessage = prevChats?.length ? prevChats[prevChats.length - 1] : null;

  return (
    <div className="chats">
      {newChat ? (
        <div className="welcome-container">
          <div className="welcome-badge">
            <i className="fa-solid fa-flag-checkered"></i> JanSahayak — Citizen Scheme Assistant
          </div>
          <h1 className="welcome-title">Bodhi AI — JanSahayak</h1>
          <p className="welcome-subtitle">
            Your verified assistant for Indian Government Schemes, citizen eligibility, welfare benefits, required documents, and application guidance.
          </p>
          <div className="welcome-hero-action">
            <button
              type="button"
              className="btn-eligibility-hero"
              onClick={() => setIsEligibilityOpen(true)}
              title="Open the guided Scheme Matcher Form"
            >
              <i className="fa-solid fa-compass"></i> Check My Scheme Eligibility (Guided Form)
            </button>
          </div>

          <div className="suggestions-grid">
            {suggestions.map((item, idx) => (
              <div
                className="suggestion-card"
                key={idx}
                onClick={() => {
                  if (item.isEligibilityCta) {
                    setIsEligibilityOpen(true);
                  } else {
                    setPrompt(item.prompt);
                  }
                }}
              >
                <div className="suggestion-icon">
                  <i className={`fa-solid ${item.icon}`}></i>
                </div>
                <div className="suggestion-title">{item.title}</div>
                <div className="suggestion-desc">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {prevChats?.slice(0, -1).map((chat, idx) => (
            chat.role === "user" ? (
              <div className="userDiv" key={idx}>
                <p className="userMessage">{chat.content}</p>
              </div>
            ) : (
              <div className="gptDiv" key={idx}>
                <div className="ai-avatar">
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
                <div className="ai-content">
                  <ReactMarkdown rehypePlugins={rehypeHighlight}>
                    {chat.content}
                  </ReactMarkdown>
                  {(chat.ragUsed || (chat.citations && chat.citations.length > 0)) && (
                    <div className="ai-content-footer">
                      {chat.ragUsed && (
                        <span className="rag-sourced-badge">
                          <i className="fa-solid fa-database"></i>
                          Backed by official scheme data
                        </span>
                      )}
                      {chat.citations && chat.citations.length > 0 && (
                        <Citation citations={chat.citations} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          ))}

          {lastMessage && (
            lastMessage.role === "user" ? (
              <div className="userDiv" key="last-user">
                <p className="userMessage">{lastMessage.content}</p>
              </div>
            ) : (
              <div className="gptDiv" key="last-assistant">
                <div className="ai-avatar">
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
                <div className="ai-content">
                  <ReactMarkdown rehypePlugins={rehypeHighlight}>
                    {latestReply == null ? lastMessage.content : latestReply}
                  </ReactMarkdown>
                  {(lastMessage.ragUsed || (lastMessage.citations && lastMessage.citations.length > 0)) && (
                    <div className="ai-content-footer">
                      {lastMessage.ragUsed && (
                        <span className="rag-sourced-badge">
                          <i className="fa-solid fa-database"></i>
                          Backed by official scheme data
                        </span>
                      )}
                      {lastMessage.citations && lastMessage.citations.length > 0 && (
                        <Citation citations={lastMessage.citations} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
