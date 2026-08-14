import jwt from "jsonwebtoken";
import "dotenv/config";

/*
=========================================
Generate Access Token
=========================================
*/

export const generateAccessToken = (user) => {

    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            username: user.username
        },

        process.env.JWT_SECRET,

        {
            expiresIn: process.env.JWT_EXPIRE
        }
    );

};


/*
=========================================
Generate Refresh Token
=========================================
*/

export const generateRefreshToken = (user) => {

    return jwt.sign(
        {
            id: user._id
            // jti: crypto.randomUUID()//at every time refresh token change not nedded this for large application use it
        },

        process.env.REFRESH_TOKEN_SECRET,

        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRE
        }
    );

};