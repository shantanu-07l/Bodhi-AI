import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import "dotenv/config";

import { User } from "../models/Thread.js";
import {
    generateAccessToken,
    generateRefreshToken,
} from "../utils/token.js";
import { loginLimiter,signupLimiter } from "../middleware/rateLimiter.js";

import {
    signupValidation,
    loginValidation,
} from "../middleware/authValidation.js";
import authMiddleware from "../middleware/authMiddleware.js";


const router = express.Router();

/*
==================================================
SIGNUP
POST /signin
==================================================
*/

router.post("/signin",signupLimiter,signupValidation, async (req, res) => {

    const { username, email, password } = req.body;

    try {

        /*
        Check Existing User
        */

        const existingUser = await User.findOne({ email });

        if (existingUser) {

            return res.status(400).json({
                message: "User already exists with this email."
            });

        }

        /*
        Hash Password
        */

        const salt = await bcrypt.genSalt(10);

        const hashedPassword = await bcrypt.hash(
            password,
            salt
        );

        /*
        Create User
        */

        const newUser = new User({

            username,

            email,

            password: hashedPassword

        });

        await newUser.save();

        /*
        Generate Tokens
        */

        const accessToken =
            generateAccessToken(newUser);

        const refreshToken =
            generateRefreshToken(newUser);

        /*
        Save Refresh Token
        */

        newUser.refreshToken = refreshToken;

        await newUser.save();

        /*
        Send Refresh Token
        As HTTP Only Cookie
        */

        res.cookie(

            "refreshToken",

            refreshToken,

            {

                httpOnly: true,

                secure:
                    process.env.NODE_ENV === "production",

                sameSite:
                    process.env.NODE_ENV === "production"
                        ? "None"
                        : "Lax",

                maxAge:
                    7 * 24 * 60 * 60 * 1000

            }

        );

        /*
        Response
        */

        return res.status(201).json({

            message: "Signup Successful",

            user: {

                id: newUser._id,

                username: newUser.username,

                email: newUser.email,

                plan: newUser.plan || "free"

            },

            accessToken

        });

    }

    catch (err) {

        console.log(err);

        return res.status(500).json({

            message: "Internal Server Error"

        });

    }

});


/*
==================================================
LOGIN
POST /login
==================================================
*/

router.post("/login",loginLimiter,loginValidation, async (req, res) => {

    const { email, password } = req.body;

    try {

        /*
        Find User
        */

        const user = await User.findOne({

            email

        });

        if (!user) {

            return res.status(400).json({

                message: "Invalid Email or Password"

            });

        }

        /*
        Compare Password
        */

        const isPasswordCorrect =
            await bcrypt.compare(

                password,

                user.password

            );

        if (!isPasswordCorrect) {

            return res.status(400).json({

                message: "Invalid Email or Password"

            });

        }

        /*
        Generate Tokens
        */

        const accessToken =
            generateAccessToken(user);

        const refreshToken =
            generateRefreshToken(user);

        /*
        Save Refresh Token
        */

        user.refreshToken = refreshToken;

        await user.save();

        /*
        Store Refresh Token
        In Cookie
        */

        res.cookie(

            "refreshToken",

            refreshToken,
             {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite:
                    process.env.NODE_ENV === "production"
                        ? "None"
                        : "Lax",
                maxAge: 7 * 24 * 60 * 60 * 1000,
            }

        );

        /*
        Response
        */

        return res.status(200).json({

            message: "Login Successful",

            user: {

                id: user._id,

                username: user.username,

                email: user.email,

                plan: user.plan || "free"

            },

            accessToken

        });

    }

    catch (err) {

        console.log(err);

        return res.status(500).json({

            message: "Internal Server Error"

        });

    }

});

/*
==================================================
GET USER
GET /user
==================================================
*/

router.get("/user", async (req, res) => {

    try {

        const authHeader = req.headers.authorization;

        if (!authHeader) {

            return res.status(401).json({

                message: "Authorization Header Missing"

            });

        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(

            token,

            process.env.JWT_SECRET

        );

        const user = await User.findById(

            decoded.id

        );

        if (!user) {

            return res.status(404).json({

                message: "User Not Found"

            });

        }

        return res.status(200).json({

            id: user._id,

            username: user.username,

            email: user.email,

            plan: user.plan || "free"

        });

    }

    catch (err) {

        console.log(err);

        return res.status(401).json({

            message: "Invalid Access Token"

        });

    }

});

/*
==================================================
CHANGE PASSWORD
POST /change-password
==================================================
*/

router.post("/change-password", authMiddleware, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            message: "Current password and new password are required."
        });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            message: "New password must be at least 8 characters long."
        });
    }

    try {
        const user = req.user;

        /* Verify Current Password */
        const isMatch = await bcrypt.compare(currentPassword, user.password);

        if (!isMatch) {
            return res.status(400).json({
                message: "Current password is incorrect."
            });
        }

        /* Hash New Password */
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        /* Save Updated Password */
        user.password = hashedPassword;
        await user.save();

        return res.status(200).json({
            message: "Password updated successfully."
        });

    } catch (err) {
        console.error("Change Password Error:", err);
        return res.status(500).json({
            message: "Internal Server Error"
        });
    }
});


/*
==================================================
REFRESH TOKEN
POST /refresh-token
==================================================
*/

router.post("/refresh-token", async (req, res) => {

    try {

        /*
        Read Refresh Token
        From Cookie
        */

        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {

            return res.status(401).json({

                message: "Refresh Token Missing"

            });

        }

        /*
        Verify Refresh Token
        */

        const decoded = jwt.verify(

            refreshToken,

            process.env.REFRESH_TOKEN_SECRET

        );

        /*
        Find User
        */

        const user = await User.findById(

            decoded.id

        );

        if (!user) {

            return res.status(404).json({

                message: "User Not Found"

            });

        }

        /*
        Check Stored Refresh Token
        */

        if (!user.refreshToken) {

            return res.status(401).json({

                message: "User Logged Out"

            });

        }

        if (user.refreshToken !== refreshToken) {

            return res.status(403).json({

                message: "Invalid Refresh Token"

            });

        }

        /*
        Generate New Access Token
        */

        const accessToken =

            generateAccessToken(user);

        /*
        Return New Access Token
        */

        return res.status(200).json({

            accessToken

        });

    }

    catch (err) {

        console.log(err);

        return res.status(401).json({

            message: "Refresh Token Expired"

        });

    }

});


/*
==================================================
LOGOUT
POST /logout
==================================================
*/

router.post("/logout", async (req, res) => {

    try {

        const refreshToken = req.cookies.refreshToken;

        /*
        Even if cookie doesn't exist,
        clear it and logout successfully.
        */

        if (!refreshToken) {

            res.clearCookie(

                "refreshToken",

                {

                    httpOnly: true,

                    secure:
                        process.env.NODE_ENV === "production",

                    sameSite: "strict"

                }

            );

            return res.status(200).json({

                message: "Logout Successful"

            });

        }

        try {

            const decoded = jwt.verify(

                refreshToken,

                process.env.REFRESH_TOKEN_SECRET

            );

            const user = await User.findById(

                decoded.id

            );

            if (user) {

                user.refreshToken = null;

                await user.save();

            }

        }

        catch (err) {

            /*
            Ignore verification errors.
            User should still be logged out.
            */

        }

        /*
        Always Clear Cookie
        */

        res.clearCookie(

            "refreshToken",

            {

                httpOnly: true,

                secure:
                    process.env.NODE_ENV === "production",

                sameSite: "strict"

            }

        );

        return res.status(200).json({

            message: "Logout Successful"

        });

    }

    catch (err) {

        console.log(err);

        return res.status(500).json({

            message: "Logout Failed"

        });

    }

});


export default router;