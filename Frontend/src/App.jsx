import "./App.css";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { MyContext } from "./MyContext";
import { useState } from "react";
import { v1 as uuidv1 } from "uuid";
import { useEffect } from "react";
import api, { setAccessToken } from "./services/api";

// Components
import ChatWindow from "./ChatWindow";
import Sidebar from "./Sidebar";
import Login from "./Login";
import Signin from "./Signin";
import Chat from "./Chat";

function App() {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState(null);
  const [currThreadId, setCurrThreadId] = useState(uuidv1());
  const [prevChats, setPrevChats] = useState([]); 
  const [newChat, setNewChat] = useState(true);
  const [allThreads, setAllThreads] = useState([]);
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const providerValues = {
    prompt,
    setPrompt,
    reply,
    setReply,
    currThreadId,
    setCurrThreadId,
    prevChats,
    setPrevChats,
    newChat,
    setNewChat,
    allThreads,
    setAllThreads,
    isAuthenticated,
    setIsAuthenticated,
    isCollapsed,
    setIsCollapsed,
  };
  useEffect(() => {

    const checkLogin = async () => {

        try {

            const { data } = await api.post(
                "/refresh-token"
            );

            setAccessToken(data.accessToken);

            setIsAuthenticated(true);

        } catch (err) {

            setIsAuthenticated(false);

        }

    };

    checkLogin();

}, []);

  return (
    <Router>
      <Routes>
        {/* Login Route */}
        <Route
          path="/login"
          element={!isAuthenticated ?
              <Login setIsAuthenticated={setIsAuthenticated} />: <Navigate to={"/chat"}/>
          }
        />

        {/* Signup Route */}
        <Route 
          path="/signin" 
          element={!isAuthenticated ? 
              <Signin setIsAuthenticated={setIsAuthenticated}/> : <Navigate to={"/chat"}/>
          } 
        />

        {/* Protected Chat Route */}
        <Route
          path="/chat"
          element={
            isAuthenticated ? (
              <MyContext.Provider value={providerValues}>
                <div className="app">
                  {/* Mobile Backdrop Overlay */}
                  {!isCollapsed && (
                    <div 
                      className="sidebar-backdrop" 
                      onClick={() => setIsCollapsed(true)}
                    ></div>
                  )}

                  <button 
                    className="sidebar-toggle-btn" 
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    title={isCollapsed ? "Open sidebar" : "Close sidebar"}
                  >
                    <i className={`fa-solid ${isCollapsed ? "fa-bars" : "fa-chevron-left"}`}></i>
                  </button>
                  <Sidebar />
                  <ChatWindow />
                </div>
              </MyContext.Provider>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Root Redirect */}
        <Route path="/" element={<Navigate to={"/login"} replace />} />
        
        {/* Catch-all for any other broken links */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
