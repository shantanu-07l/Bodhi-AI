import { useContext, useEffect, useState } from "react";
import "./Chat.css";
import { MyContext } from "./MyContext";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

export default function Chat() {
  const { newChat, prevChats, reply, setPrompt } = useContext(MyContext);
  const [latestReply, setLatestReply] = useState(null);

  const suggestions = [
    {
      icon: "fa-brain",
      title: "Explain concepts",
      desc: "Explain quantum computing in simple terms for a beginner",
      prompt: "Explain quantum computing in simple terms for a beginner"
    },
    {
      icon: "fa-code",
      title: "Analyze & Debug",
      desc: "Help me find a bug in my React component routing",
      prompt: "Help me find a bug in my React component routing"
    },
    {
      icon: "fa-pen-fancy",
      title: "Write & Edit",
      desc: "Draft a professional email proposing a project update",
      prompt: "Draft a professional email proposing a project update"
    },
    {
      icon: "fa-lightbulb",
      title: "Brainstorm ideas",
      desc: "List 5 creative startup names using artificial intelligence",
      prompt: "List 5 creative startup names using artificial intelligence"
    }
  ];

  useEffect(() => {
    if (reply === null) {
      setLatestReply(null);
      return;
    }

    if (!prevChats?.length) return;

    const content = reply.split(" "); //individual words

    let idx = 0;
    const interval = setInterval(() => {
      setLatestReply(content.slice(0, idx + 1).join(" "));

      idx++;
      if (idx >= content.length) clearInterval(interval);
    }, 40);

    return () => clearInterval(interval);
  }, [prevChats, reply]);

  return (
    <div className="chats">
      {newChat ? (
        <div className="welcome-container">
          <h1 className="welcome-title">Bodhi AI</h1>
          <p className="welcome-subtitle">
            Your premium cognitive workspace. Ask questions, analyze data, brainstorm, and create.
          </p>
          <div className="suggestions-grid">
            {suggestions.map((item, idx) => (
              <div
                className="suggestion-card"
                key={idx}
                onClick={() => setPrompt(item.prompt)}
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
                  <i className="fa-solid fa-compass-drafting"></i>
                </div>
                <div className="ai-content">
                  <ReactMarkdown rehypePlugins={rehypeHighlight}>
                    {chat.content}
                  </ReactMarkdown>
                </div>
              </div>
            )
          ))}

          {prevChats.length > 0 && (
            <div className="gptDiv" key="last-msg">
              <div className="ai-avatar">
                <i className="fa-solid fa-compass-drafting"></i>
              </div>
              <div className="ai-content">
                <ReactMarkdown rehypePlugins={rehypeHighlight}>
                  {latestReply == null ? prevChats[prevChats.length - 1].content : latestReply}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

