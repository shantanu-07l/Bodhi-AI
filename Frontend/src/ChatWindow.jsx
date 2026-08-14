import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import { MyContext } from "./MyContext.jsx";
import { useContext, useEffect, useState, useRef } from "react";
import { ScaleLoader } from "react-spinners";
import { useNavigate } from "react-router-dom";
import ProfileCard from "./ProfileCard.jsx";
import api, { setAccessToken } from "./services/api";


export default function ChatWindow() {
  const {
    prompt,
    setPrompt,
    reply,
    setReply,
    currThreadId,
    setPrevChats,
    setNewChat,
    setIsAuthenticated,
  } = useContext(MyContext);

  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showCard, setShowCard] = useState(false);
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


  const fetchAIReply = async (messageText) => {

    if (!messageText.trim()) return;

    setLoading(true);
    setNewChat(false);

    try {

        const { data } = await api.post(
            "/api/chat",
            {
                message: messageText,
                threadId: currThreadId,
            }
        );

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
  

  useEffect(() => {
    if (prompt && reply) {
      setPrevChats((prev) => [
        ...prev,
        { role: "user", content: prompt },
        { role: "assistant", content: reply },
      ]);
      setPrompt("");
    }
  }, [reply, prompt, setPrevChats, setPrompt]);

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
        {/* Placeholder for left-side brand/title if needed, 
            keeping it empty ensures the next div goes to the right */}
        <div className="nav-left"></div>

        <div className="nav-right">
          <div className="userIconDiv" onClick={() => setIsOpen(!isOpen)}>
            <span className="userIcon">
              <i className="fa-solid fa-user"></i>
            </span>
          </div>

          {isOpen && (
            <div className="dropDown">
              {!isMobile && showCard && <ProfileCard />}
              <div className="dropDownItem" onClick={() => setShowCard(!showCard)}>
                <i className="fa-solid fa-circle-user"></i> Profile
              </div>
              <div className="dropDownItem">
                <i className="fa-solid fa-gear"></i> Settings
              </div>
              <div className="dropDownItem logout" onClick={handleLogOut}>
                <i className="fa-solid fa-arrow-right-from-bracket"></i> Log out
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile ProfileCard - Rendered outside dropdown for centering */}
      {showCard && isMobile && <ProfileCard onClose={() => setShowCard(false)} />}

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
              placeholder={isRecording ? "Listening..." : "Enter a prompt here"}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => (e.key === "Enter" ? getReply() : "")}
            />

            <div className="action-icons">
              <button
                className={`icon-btn mic-btn ${isRecording ? "active" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
                title="Use microphone"
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
          <p className="disclaimer">SigmaGPT may display inaccurate info, so double-check its responses.</p>
        </div>
      </footer>
    </div>
  );
}
