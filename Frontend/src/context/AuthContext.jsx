import { createContext, useContext, useState } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {

    const [accessToken, setAccessToken] = useState(null);

    const [user, setUser] = useState(null);

    const login = (token, userData) => {

        setAccessToken(token);

        setUser(userData);

    };

    const logout = () => {

        setAccessToken(null);

        setUser(null);

    };

    return (

        <AuthContext.Provider

            value={{

                accessToken,

                user,

                login,

                logout

            }}

        >

            {children}

        </AuthContext.Provider>

    );

};

export const useAuth = () => {

    return useContext(AuthContext);

};