import React, { useState, useContext } from "react";
import "./Signin.css";
import { useNavigate, Link } from "react-router-dom";
import api, { setAccessToken } from "./services/api";
import { MyContext } from "./MyContext";

const Signin = ({ setIsAuthenticated }) => {

    const navigate = useNavigate();
    const { theme, toggleTheme } = useContext(MyContext);

    const [formData, setFormData] = useState({
        username: "",
        email: "",
        password: "",
    });

    const handleFormData = (e) => {

        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });

    };

    const handleSubmit = async (e) => {

        e.preventDefault();

        try {

            const { data } = await api.post(
                "/signin",
                formData
            );

            if (data.accessToken) {

                setAccessToken(data.accessToken);

                setIsAuthenticated(true);

                navigate("/chat");

            } else {

                alert("Email already exists");

                setFormData({
                    username: "",
                    email: "",
                    password: "",
                });

            }

        }

        catch (err) {

            console.log(err);

            if (err.response?.data?.errors) {

                alert(
                    err.response.data.errors
                        .map(error => error.msg)
                            .join("\n")
                );

            } else {

                alert(
                    err.response?.data?.message ||
                    "Signup Failed"
                );

            }

        }

    };

    return (

        <div className="auth-container">

            <div className="auth-box">

                <header className="auth-header">

                    <div className="auth-logo">B</div>

                    <h1 className="auth-title">

                        Create account

                    </h1>

                </header>

                <form
                    className="auth-form"
                    onSubmit={handleSubmit}
                >

                    <div className="input-field">

                        <label htmlFor="username">

                            Username

                        </label>

                        <input
                            type="text"
                            id="username"
                            name="username"
                            placeholder="Your username"
                            value={formData.username}
                            onChange={handleFormData}
                            required
                            autoComplete="username"
                        />

                    </div>

                    <div className="input-field">

                        <label htmlFor="email">

                            Email

                        </label>

                        <input
                            type="email"
                            id="email"
                            name="email"
                            placeholder="Email address"
                            value={formData.email}
                            onChange={handleFormData}
                            required
                            autoComplete="email"
                        />

                    </div>

                    <div className="input-field">

                        <label htmlFor="password">

                            Password

                        </label>

                        <input
                            type="password"
                            id="password"
                            name="password"
                            placeholder="Create password"
                            value={formData.password}
                            onChange={handleFormData}
                            required
                            autoComplete="new-password"
                        />

                    </div>

                    <button
                        type="submit"
                        className="auth-btn"
                    >
                        Continue
                    </button>

                </form>

                <footer className="auth-footer">

                    Already have an account?

                    <Link to="/login">

                        Log in

                    </Link>

                </footer>

            </div>

        </div>

    );

};

export default Signin;