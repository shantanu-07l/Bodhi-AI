import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import { MyContext } from "./MyContext.jsx";
import { useContext, useEffect, useState, useRef } from "react";
import { ScaleLoader } from "react-spinners";
import { useNavigate } from "react-router-dom";
import ProfileCard from "./ProfileCard.jsx";
import SettingsModal from "./SettingsModal.jsx";
import LanguageSelector from "./LanguageSelector.jsx";
import EligibilityModal from "./EligibilityModal.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import api, { setAccessToken } from "./services/api";

export default function ChatWindow({ defaultOpenAdmin = false }) {
  const {
    prompt,
    setPrompt,
    reply,
    setReply,
    currThreadId,
    setPrevChats,
    setNewChat,
    setIsAuthenticated,
    user,
    language,
    setLanguage,
    isEligibilityOpen,
    setIsEligibilityOpen,
    isAdminOpen,
    setIsAdminOpen,
    theme,
    toggleTheme,
  } = useContext(MyContext);

  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("appearance");
  const [isRecording, setIsRecording] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const navigate = useNavigate();

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (defaultOpenAdmin) {
      setIsAdminOpen(true);
    }
  }, [defaultOpenAdmin]);

  const fetchAIReply = async (messageText) => {
    if (!messageText.trim() || loading) return;

    const userMsg = messageText.trim();
    setLoading(true);
    setNewChat(false);
    setPrompt("");

    // Add user message to conversation immediately
    setPrevChats((prev) => [
      ...prev,
      { role: "user", content: userMsg }
    ]);

    try {
        const { data } = await api.post(
            "/api/chat",
            {
                message: userMsg,
                threadId: currThreadId,
                language: language || "en"
            }
        );

        // Add assistant reply with citations and RAG provenance flag
        setPrevChats((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.reply,
            citations: data.citations || [],
            ragUsed: data.ragUsed || false
          }
        ]);
        setReply(data.reply);
    }
    catch (err) {
        console.error(err);
        alert("Failed to connect to AI.");
    }
    finally {
        setLoading(false);
    }
  };

  const getReply = () => fetchAIReply(prompt);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        handleAudioUpload(audioBlob);
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone Error:", err);
      alert("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };
  const handleAudioUpload = async (blob) => {
    setLoading(true);

    const formData = new FormData();
    formData.append(
        "audio",
        blob,
        "user_speech.wav"
    );

    try {
        const { data } = await api.post(
            "/api/transcribe",
            formData,
            {
                headers: {
                    "Content-Type":
                    "multipart/form-data"
                }
            }
        );

        if (data.transcript) {
            setPrompt(data.transcript);
            await fetchAIReply(
                data.transcript
            );
        }
    }
    catch (err) {
        console.error(err);
    }
    finally {
        setLoading(false);
    }
};



  const handleLogOut = async () => {

    try {

        await api.post("/logout");

    } catch (err) {

        console.log(err);

    }
    setPrompt("");
    setReply(null);
    setAccessToken(null);

    setIsAuthenticated(false);

    navigate("/login");

    };

  return (
    <div className="chatWindow">
      <nav className="navbar">
        <div className="nav-left">
          <button
            type="button"
            className="btn-header-matcher"
            onClick={() => setIsEligibilityOpen(true)}
            title="Open guided Scheme Eligibility Matcher"
          >
            <i className="fa-solid fa-compass"></i>
            <span className="btn-label-text">Scheme Matcher</span>
          </button>
        </div>

        <div className="nav-right">
          <LanguageSelector
            currentLanguage={language}
            onChange={(lang) => setLanguage(lang)}
          />

          {user?.role === "admin" && (
            <button
              type="button"
              className="btn-header-admin"
              onClick={() => setIsAdminOpen(true)}
              title="Open Admin Governance Console"
            >
              <i className="fa-solid fa-screwdriver-wrench"></i>
              <span className="btn-label-text">Admin Console</span>
            </button>
          )}

          <div className="userIconDiv" onClick={() => setIsOpen(!isOpen)}>
            <span className="userIcon">
              <i className="fa-solid fa-user"></i>
            </span>
          </div>

          {isOpen && (
            <div className="dropDown">
              {!isMobile && showCard && (
                <ProfileCard 
                  onClose={() => setShowCard(false)}
                  onOpenSettings={(tab) => {
                    setSettingsTab(tab || "appearance");
                    setIsSettingsOpen(true);
                    setIsOpen(false);
                  }}
                />
              )}
              <div className="dropDownItem" onClick={() => setShowCard(!showCard)}>
                <i className="fa-solid fa-circle-user"></i> Profile
              </div>
              <div 
                className="dropDownItem" 
                onClick={() => {
                  setSettingsTab("appearance");
                  setIsSettingsOpen(true);
                  setIsOpen(false);
                }}
              >
                <i className="fa-solid fa-gear"></i> Settings
              </div>
              {user?.role === "admin" && (
                <div 
                  className="dropDownItem"
                  onClick={() => {
                    setIsAdminOpen(true);
                    setIsOpen(false);
                  }}
                >
                  <i className="fa-solid fa-screwdriver-wrench"></i> Admin Console
                </div>
              )}
              <div className="dropDownItem logout" onClick={handleLogOut}>
                <i className="fa-solid fa-arrow-right-from-bracket"></i> Log out
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile ProfileCard - Rendered outside dropdown for centering */}
      {showCard && isMobile && (
        <ProfileCard 
          onClose={() => setShowCard(false)} 
          onOpenSettings={(tab) => {
            setSettingsTab(tab || "appearance");
            setIsSettingsOpen(true);
            setShowCard(false);
          }}
        />
      )}

      {/* Global Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal 
          onClose={() => setIsSettingsOpen(false)} 
          initialTab={settingsTab}
        />
      )}

      {/* Citizen Eligibility Matcher Modal */}
      <EligibilityModal
        isOpen={isEligibilityOpen}
        onClose={() => setIsEligibilityOpen(false)}
        onSelectSchemeForChat={(query) => fetchAIReply(query)}
      />

      {/* Admin Governance Dashboard */}
      {isAdminOpen && (
        <AdminDashboard
          user={user}
          onClose={() => setIsAdminOpen(false)}
        />
      )}

      <main className="chatArea">
        <Chat />
        {loading && (
          <div className="loaderContainer">
            <ScaleLoader color="#4b90ff" height={20} margin={2} />
          </div>
        )}
      </main>

      <footer className="chatInputSection">
        <div className="gemini-input-wrapper">
          <div className={`input-pill ${isRecording ? "recording-pulse" : ""}`}>
            <input
              placeholder={isRecording ? "Listening..." : "Ask JanSahayak about any scheme, subsidy, documents, or eligibility..."}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => (e.key === "Enter" ? getReply() : "")}
            />

            <div className="action-icons">
              <button
                className={`icon-btn mic-btn ${isRecording ? "active" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
                title="Use microphone (Sarvam AI Speech-to-Text)"
              >
                <i className={`fa-solid ${isRecording ? "fa-stop" : "fa-microphone"}`}></i>
              </button>

              <button
                className={`icon-btn send-btn ${prompt.trim() ? "visible" : ""}`}
                onClick={getReply}
                disabled={!prompt.trim() || loading}
              >
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            </div>
          </div>
          <p className="disclaimer">
            <i className="fa-solid fa-shield-halved"></i> JanSahayak provides guidance based on official government records. Verify final requirements on myscheme.gov.in or at the nearest CSC.
          </p>
        </div>
      </footer>
    </div>
  );
}
