import { useContext, useEffect, useState } from "react";
import "./Sidebar.css";
import { MyContext } from "./MyContext.jsx";
import { v1 as uuidv1 } from "uuid";
import api from "./services/api";

export default function Sidebar() {
    const [userPlan, setUserPlan] = useState("free");

    const {
        allThreads,
        setAllThreads,
        currThreadId,
        setNewChat,
        setPrompt,
        setReply,
        setCurrThreadId,
        setPrevChats,
        isCollapsed,
        user,
        setIsEligibilityOpen,
        setIsAdminOpen,
        theme,
        toggleTheme,
    } = useContext(MyContext);

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const { data } = await api.get("/user");
                if (data?.plan) {
                    setUserPlan(data.plan.toLowerCase());
                }
            } catch (err) {
                console.error("Sidebar user fetch error:", err);
            }
        };
        fetchUserData();
    }, []);

    const getAllThreads = async () => {

        try {

            const { data } = await api.get("/api/thread");

            if (Array.isArray(data)) {

                const filteredData = data.map(thread => ({

                    threadId: thread.threadId,

                    title: thread.title

                }));

                setAllThreads(filteredData);

            }

        }

        catch (err) {

            console.error(err);

        }

    };

    useEffect(() => {

        getAllThreads();

    }, [currThreadId]);
    

    const createNewChat = () => {

        setNewChat(true);

        setPrompt("");

        setReply(null);

        setCurrThreadId(uuidv1());

        setPrevChats([]);

    };

    const changeThread = async (newthreadId) => {

        setCurrThreadId(newthreadId);

        try {

            const { data } = await api.get(

                `/api/thread/${newthreadId}`

            );

            setPrevChats(data);

            setNewChat(false);

            setReply(null);

        }

        catch (err) {

            console.error(err);

        }

    };

    const deleteThread = async (threadId) => {

        try {

            await api.delete(

                `/api/thread/${threadId}`

            );

            setAllThreads(prev =>

                prev.filter(

                    thread =>

                    thread.threadId !== threadId

                )

            );

            if (threadId === currThreadId) {

                createNewChat();

            }

        }

        catch (err) {

            console.error(err);

            alert("Failed to delete thread.");

        }

    };

    return (

        <section className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>

            {!isCollapsed && (

                <div className="sidebar-content">

                    <div className="sidebar-brand">
                        <span className="brand-logo">
                            <i className="fa-solid fa-shield-halved"></i>
                        </span>
                        <div className="brand-text-wrapper">
                            <div className="brand-main-row">
                                <span className="brand-name">Bodhi AI</span>
                                <span className="jansahayak-badge">JanSahayak</span>
                            </div>
                            <span className="brand-subtitle">Govt Scheme Assistant</span>
                        </div>
                    </div>

                    <button
                        className="new-chat-btn"
                        onClick={createNewChat}
                    >
                        <div className="btn-left">
                            <span className="btn-text">New Consultation</span>
                        </div>
                        <i className="fa-solid fa-plus"></i>
                    </button>

                    <button
                        type="button"
                        className="sidebar-matcher-btn"
                        onClick={() => setIsEligibilityOpen(true)}
                        title="Open Citizen Scheme Eligibility Matcher"
                    >
                        <i className="fa-solid fa-compass"></i>
                        <span>Scheme Matcher</span>
                    </button>

                    <ul className="history">

                        {

                            allThreads?.map((thread, idx) => (

                                <li

                                    key={idx}

                                    onClick={() =>

                                        changeThread(

                                            thread.threadId

                                        )

                                    }

                                    className={

                                        thread.threadId === currThreadId

                                            ?

                                            "highlighted"

                                            :

                                            ""

                                    }

                                >

                                    <i className="fa-regular fa-message"></i>

                                    <span className="thread-title">

                                        {thread.title}

                                    </span>

                                    <i

                                        onClick={(e) => {

                                            e.stopPropagation();

                                            deleteThread(

                                                thread.threadId

                                            );

                                        }}

                                        className="fa-solid fa-trash"

                                    ></i>

                                </li>

                            ))

                        }

                    </ul>

                    <div className="sidebar-footer">
                        {user?.role === "admin" && (
                            <button
                                type="button"
                                className="sidebar-admin-btn"
                                onClick={() => setIsAdminOpen(true)}
                                title="Open Administrator Governance Console"
                            >
                                <i className="fa-solid fa-screwdriver-wrench"></i>
                                <span>Admin Console</span>
                            </button>
                        )}

                        <button 
                            className="sidebar-theme-toggle" 
                            onClick={toggleTheme}
                            title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
                        >
                            <i className={`fa-solid ${theme === "dark" ? "fa-sun" : "fa-moon"}`}></i>
                            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                        </button>

                        <div className="sign">
                            <p>By Shantanu Sapkal ♥</p>
                        </div>
                    </div>

                </div>

            )}

        </section>

    );

}