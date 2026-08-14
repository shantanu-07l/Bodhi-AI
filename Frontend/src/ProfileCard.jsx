import React, { useEffect, useState } from "react";
import { IoPersonCircleSharp } from "react-icons/io5";
import "./ProfileCard.css";
import api from "./services/api";

const ProfileCard = ({ onClose }) => {

    const [user, setUser] = useState({

        username: "",

        email: "",

    });

    useEffect(() => {

        const fetchProfileData = async () => {

            try {

                const { data } = await api.get("/user");

                setUser({

                    username: data.username,

                    email: data.email,

                });

            }

            catch (err) {

                console.error("Fetch Error:", err);

            }

        };

        fetchProfileData();

    }, []);

    const username = user.username || "Guest User";

    const email = user.email || "user@sigmagpt.com";

    const handleBackdropClick = (e) => {

        if (e.target === e.currentTarget && onClose) {

            onClose();

        }

    };

    return (

        <div

            className="sigma-profile-card"

            onClick={handleBackdropClick}

        >

            <div className="card-body">

                <div className="user-section">

                    <div className="avatar-box">

                        <IoPersonCircleSharp className="avatar-icon" />

                    </div>

                    <div className="user-info-stack">

                        <span className="user-full-name">

                            {username}

                        </span>

                        <span className="user-email-address">

                            {email}

                        </span>

                    </div>

                </div>

            </div>

            <div className="card-divider"></div>

            <div className="card-footer-status">

                <div className="plan-pill">

                    <span className="status-indicator-dot"></span>

                    <span className="plan-label">

                        Free Plan

                    </span>

                </div>

            </div>

        </div>

    );

};

export default ProfileCard;