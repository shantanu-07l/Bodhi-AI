import React, { useEffect, useState, useContext } from "react";
import { IoPersonCircleSharp } from "react-icons/io5";
import "./ProfileCard.css";
import api from "./services/api";
import { MyContext } from "./MyContext";

const ProfileCard = ({ onClose, onOpenSettings }) => {

    const { theme, toggleTheme } = useContext(MyContext);

    const [user, setUser] = useState({
        username: "",
        email: "",
        plan: "free",
    });

    useEffect(() => {
        const fetchProfileData = async () => {
            try {
                const { data } = await api.get("/user");
                setUser({
                    username: data.username,
                    email: data.email,
                    plan: data.plan || "free",
                });
            } catch (err) {
                console.error("Fetch Error:", err);
            }
        };
        fetchProfileData();
    }, []);

    const username = user.username || "Guest User";
    const email = user.email || "user@bodhiai.com";
    
    // Map raw plan string to human-readable label
    const planDisplayMap = {
        free: "Free Plan",
        pro: "Pro Plan",
        ultra: "Ultra Plan",
    };
    const planDisplayName = planDisplayMap[user.plan?.toLowerCase()] || "Free Plan";

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget && onClose) {
            onClose();
        }
    };

    return (
        <div className="sigma-profile-card" onClick={handleBackdropClick}>
            <div className="card-body">
                <div className="user-section">
                    <div className="avatar-box">
                        <IoPersonCircleSharp className="avatar-icon" />
                    </div>
                    <div className="user-info-stack">
                        <span className="user-full-name">{username}</span>
                        <span className="user-email-address">{email}</span>
                    </div>
                </div>
            </div>

            <div className="card-divider"></div>

            <div className="card-footer-status">
                <div className={`plan-pill plan-${user.plan || "free"}`}>
                    <span className="status-indicator-dot"></span>
                    <span className="plan-label">{planDisplayName}</span>
                </div>

                <div className="profile-actions-group">
                    {onOpenSettings && (
                        <button 
                            className="profile-theme-toggle-btn"
                            onClick={() => {
                                if (onClose) onClose();
                                onOpenSettings("subscriptions");
                            }}
                            title="Subscriptions & Upgrade"
                        >
                            <i className="fa-solid fa-crown" style={{ color: '#f59e0b' }}></i>
                            <span>Upgrade</span>
                        </button>
                    )}

                    {onOpenSettings && (
                        <button 
                            className="profile-theme-toggle-btn"
                            onClick={() => {
                                if (onClose) onClose();
                                onOpenSettings("security");
                            }}
                            title="Account Settings"
                        >
                            <i className="fa-solid fa-gear"></i>
                            <span>Settings</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfileCard;