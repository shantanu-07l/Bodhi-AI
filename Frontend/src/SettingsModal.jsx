import React, { useState, useContext } from "react";
import "./SettingsModal.css";
import { MyContext } from "./MyContext";
import api from "./services/api";

const SettingsModal = ({ onClose, initialTab = "appearance" }) => {
    const { theme, toggleTheme } = useContext(MyContext);
    const [activeTab, setActiveTab] = useState(initialTab);

    // Password State
    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [passwordStatus, setPasswordStatus] = useState({ msg: "", type: "" });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Subscription Notice State
    const [notice, setNotice] = useState(null);

    const handlePasswordChange = (e) => {
        setPasswordData({
            ...passwordData,
            [e.target.name]: e.target.value,
        });
        setPasswordStatus({ msg: "", type: "" });
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        const { currentPassword, newPassword, confirmPassword } = passwordData;

        if (!currentPassword || !newPassword || !confirmPassword) {
            setPasswordStatus({ msg: "Please fill in all fields.", type: "error" });
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordStatus({ msg: "New password and confirm password do not match.", type: "error" });
            return;
        }

        if (newPassword.length < 8) {
            setPasswordStatus({ msg: "New password must be at least 8 characters long.", type: "error" });
            return;
        }

        setIsSubmitting(true);
        setPasswordStatus({ msg: "", type: "" });

        try {
            const { data } = await api.post("/change-password", {
                currentPassword,
                newPassword,
            });

            setPasswordStatus({
                msg: "✅ " + (data.message || "Password updated successfully!"),
                type: "success",
            });
            setPasswordData({
                currentPassword: "",
                newPassword: "",
                confirmPassword: "",
            });
        } catch (err) {
            console.error(err);
            const errorMsg = err.response?.data?.message || "Failed to update password.";
            setPasswordStatus({
                msg: "❌ " + errorMsg,
                type: "error",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpgradeClick = (planName) => {
        setNotice(`💳 ${planName} Payment Gateway is currently under construction. Pro & Ultra features will be available soon!`);
        setTimeout(() => setNotice(null), 4500);
    };

    return (
        <div className="settings-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="settings-modal">
                {/* Header */}
                <div className="settings-header">
                    <div className="header-title-group">
                        <i className="fa-solid fa-gear header-icon"></i>
                        <h2>Settings</h2>
                    </div>
                    <button className="settings-close-btn" onClick={onClose} title="Close settings">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="settings-body">
                    {/* Sidebar Tabs */}
                    <nav className="settings-nav">
                        <button
                            className={`settings-nav-item ${activeTab === "appearance" ? "active" : ""}`}
                            onClick={() => setActiveTab("appearance")}
                        >
                            <i className="fa-solid fa-palette"></i>
                            <span>Appearance</span>
                        </button>

                        <button
                            className={`settings-nav-item ${activeTab === "security" ? "active" : ""}`}
                            onClick={() => setActiveTab("security")}
                        >
                            <i className="fa-solid fa-shield-halved"></i>
                            <span>Security</span>
                        </button>

                        <button
                            className={`settings-nav-item ${activeTab === "subscriptions" ? "active" : ""}`}
                            onClick={() => setActiveTab("subscriptions")}
                        >
                            <i className="fa-solid fa-crown"></i>
                            <span>Subscriptions</span>
                        </button>
                    </nav>

                    {/* Content Panel */}
                    <div className="settings-content">
                        {/* ── TAB 1: APPEARANCE ── */}
                        {activeTab === "appearance" && (
                            <div className="settings-section tab-fade">
                                <h3>Theme Preference</h3>
                                <p className="section-desc">Customize how Bodhi AI looks on your device.</p>

                                <div className="theme-options-grid">
                                    <div
                                        className={`theme-card ${theme === "dark" ? "selected" : ""}`}
                                        onClick={() => theme !== "dark" && toggleTheme()}
                                    >
                                        <div className="theme-preview dark-preview">
                                            <div className="preview-bar"></div>
                                            <div className="preview-bubble"></div>
                                        </div>
                                        <div className="theme-card-info">
                                            <div className="theme-card-label">
                                                <i className="fa-solid fa-moon"></i>
                                                <span>Dark Mode</span>
                                            </div>
                                            {theme === "dark" && <span className="active-badge">Active</span>}
                                        </div>
                                    </div>

                                    <div
                                        className={`theme-card ${theme === "light" ? "selected" : ""}`}
                                        onClick={() => theme !== "light" && toggleTheme()}
                                    >
                                        <div className="theme-preview light-preview">
                                            <div className="preview-bar"></div>
                                            <div className="preview-bubble"></div>
                                        </div>
                                        <div className="theme-card-info">
                                            <div className="theme-card-label">
                                                <i className="fa-solid fa-sun"></i>
                                                <span>Light Mode</span>
                                            </div>
                                            {theme === "light" && <span className="active-badge">Active</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── TAB 2: SECURITY & CHANGE PASSWORD ── */}
                        {activeTab === "security" && (
                            <div className="settings-section tab-fade">
                                <h3>Change Password</h3>
                                <p className="section-desc">Update your password to keep your account secure.</p>

                                {passwordStatus.msg && (
                                    <div className={`settings-alert ${passwordStatus.type}`}>
                                        {passwordStatus.msg}
                                    </div>
                                )}

                                <form className="settings-form" onSubmit={handlePasswordSubmit}>
                                    <div className="form-group">
                                        <label htmlFor="currentPassword">Current Password</label>
                                        <div className="password-input-wrapper">
                                            <input
                                                type={showCurrent ? "text" : "password"}
                                                id="currentPassword"
                                                name="currentPassword"
                                                placeholder="Enter current password"
                                                value={passwordData.currentPassword}
                                                onChange={handlePasswordChange}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle-icon"
                                                onClick={() => setShowCurrent(!showCurrent)}
                                                tabIndex="-1"
                                            >
                                                <i className={`fa-solid ${showCurrent ? "fa-eye-slash" : "fa-eye"}`}></i>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label htmlFor="newPassword">New Password</label>
                                        <div className="password-input-wrapper">
                                            <input
                                                type={showNew ? "text" : "password"}
                                                id="newPassword"
                                                name="newPassword"
                                                placeholder="Enter new password (min. 8 chars)"
                                                value={passwordData.newPassword}
                                                onChange={handlePasswordChange}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle-icon"
                                                onClick={() => setShowNew(!showNew)}
                                                tabIndex="-1"
                                            >
                                                <i className={`fa-solid ${showNew ? "fa-eye-slash" : "fa-eye"}`}></i>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label htmlFor="confirmPassword">Confirm New Password</label>
                                        <div className="password-input-wrapper">
                                            <input
                                                type={showConfirm ? "text" : "password"}
                                                id="confirmPassword"
                                                name="confirmPassword"
                                                placeholder="Re-enter new password"
                                                value={passwordData.confirmPassword}
                                                onChange={handlePasswordChange}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle-icon"
                                                onClick={() => setShowConfirm(!showConfirm)}
                                                tabIndex="-1"
                                            >
                                                <i className={`fa-solid ${showConfirm ? "fa-eye-slash" : "fa-eye"}`}></i>
                                            </button>
                                        </div>
                                    </div>

                                    <button type="submit" className="save-btn" disabled={isSubmitting}>
                                        {isSubmitting ? (
                                            <>
                                                <span className="btn-spinner"></span> Updating...
                                            </>
                                        ) : (
                                            "Update Password"
                                        )}
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* ── TAB 3: SUBSCRIPTIONS ── */}
                        {activeTab === "subscriptions" && (
                            <div className="settings-section tab-fade">
                                <div className="sub-header">
                                    <div>
                                        <h3>Subscription Plans</h3>
                                        <p className="section-desc">Choose the plan that fits your AI workflow.</p>
                                    </div>
                                    <span className="construction-badge">
                                        <i className="fa-solid fa-person-digging"></i> Under Construction
                                    </span>
                                </div>

                                {notice && (
                                    <div className="settings-alert info notice-banner">
                                        {notice}
                                    </div>
                                )}

                                <div className="pricing-grid">
                                    {/* Plan 1: Free */}
                                    <div className="plan-card free-plan">
                                        <div className="plan-badge current">Current Plan</div>
                                        <h4 className="plan-name">Free Plan</h4>
                                        <div className="plan-price">
                                            <span className="currency">₹</span>
                                            <span className="amount">0</span>
                                            <span className="period">/ month</span>
                                        </div>
                                        <p className="plan-desc">For personal exploration and basic AI chat.</p>

                                        <ul className="plan-features">
                                            <li><i className="fa-solid fa-check"></i> Standard response speed</li>
                                            <li><i className="fa-solid fa-check"></i> 10 AI queries per day</li>
                                            <li><i className="fa-solid fa-check"></i> Standard context window</li>
                                            <li><i className="fa-solid fa-check"></i> Community support</li>
                                        </ul>

                                        <button className="plan-btn disabled" disabled>
                                            Active Plan
                                        </button>
                                    </div>

                                    {/* Plan 2: Pro */}
                                    <div className="plan-card pro-plan featured">
                                        <div className="plan-badge popular">Most Popular</div>
                                        <h4 className="plan-name">Pro Plan</h4>
                                        <div className="plan-price">
                                            <span className="currency">₹</span>
                                            <span className="amount">199</span>
                                            <span className="period">/ month</span>
                                        </div>
                                        <p className="plan-desc">For power users requiring unlimited speed & voice.</p>

                                        <ul className="plan-features">
                                            <li><i className="fa-solid fa-check"></i> <strong>Unlimited</strong> AI queries</li>
                                            <li><i className="fa-solid fa-check"></i> 5x Faster response speed</li>
                                            <li><i className="fa-solid fa-check"></i> Voice speech mode enabled</li>
                                            <li><i className="fa-solid fa-check"></i> High-resolution image gen</li>
                                            <li><i className="fa-solid fa-check"></i> Priority customer support</li>
                                        </ul>

                                        <button className="plan-btn pro-btn" onClick={() => handleUpgradeClick("Pro Plan (₹199/mo)")}>
                                            Upgrade to Pro
                                        </button>
                                    </div>

                                    {/* Plan 3: Ultra */}
                                    <div className="plan-card ultra-plan">
                                        <div className="plan-badge enterprise">Enterprise Tier</div>
                                        <h4 className="plan-name">Ultra Plan</h4>
                                        <div className="plan-price">
                                            <span className="currency">₹</span>
                                            <span className="amount">349</span>
                                            <span className="period">/ month</span>
                                        </div>
                                        <p className="plan-desc">For developers and teams needing maximum capacity.</p>

                                        <ul className="plan-features">
                                            <li><i className="fa-solid fa-check"></i> Everything in Pro plan</li>
                                            <li><i className="fa-solid fa-check"></i> Custom AI fine-tuned models</li>
                                            <li><i className="fa-solid fa-check"></i> Unlimited audio transcription</li>
                                            <li><i className="fa-solid fa-check"></i> 24/7 Dedicated account manager</li>
                                            <li><i className="fa-solid fa-check"></i> Direct API Access</li>
                                        </ul>

                                        <button className="plan-btn ultra-btn" onClick={() => handleUpgradeClick("Ultra Plan (₹349/mo)")}>
                                            Get Ultra
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
