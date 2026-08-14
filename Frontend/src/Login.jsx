import React from "react";
import "./Login.css";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { setAccessToken } from "./services/api";

const Login = ({ setIsAuthenticated }) => {

    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        email: "",
        password: "",
    });

    const handleFormData = (e) => {

        setFormData({

            ...formData,

            [e.target.name]: e.target.value

        });

    };

    const handleSubmit = async (e) => {

        e.preventDefault();

        try {

            const { data } = await api.post(
                "/login",
                formData
            );

            if (data.accessToken) {

                setAccessToken(data.accessToken);

                setIsAuthenticated(true);

                navigate("/chat");

            } else {

                alert("Email or Password is incorrect");

                setFormData({

                    email: "",

                    password: ""

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
                    "Login Failed"
                );

            }

        }

    };

    return (

        <div className="auth-container">

            <div className="auth-box">

                <header className="auth-header">

                    <div className="auth-logo">Σ</div>

                    <h1 className="auth-title">

                        Welcome back

                    </h1>

                </header>

                <form

                    className="auth-form"

                    onSubmit={handleSubmit}

                >

                    <div className="input-field">

                        <label>Email</label>

                        <input

                            type="email"

                            name="email"

                            value={formData.email}

                            onChange={handleFormData}

                            required

                        />

                    </div>

                    <div className="input-field">

                        <label>Password</label>

                        <input

                            type="password"

                            name="password"

                            value={formData.password}

                            onChange={handleFormData}

                            required

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

                    Don't have an account?

                    <Link to="/signin">

                        Sign up

                    </Link>

                </footer>

            </div>

        </div>

    );

};

export default Login;