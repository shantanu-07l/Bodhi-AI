import axios from "axios";

/*
=========================================
Access Token Storage (In Memory)
=========================================
*/
let accessToken = null;

/*
=========================================
Set Access Token
=========================================
*/
export const setAccessToken = (token) => {
    accessToken = token;
};

/*
=========================================
Get Access Token
=========================================
*/
export const getAccessToken = () => {
    return accessToken;
};

/*
=========================================
Axios Instance
=========================================
*/
const BASE_URL =
    import.meta.env.VITE_API_URL ||
    "http://localhost:5000";

const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
});

/*
=========================================
Request Interceptor
=========================================
*/
api.interceptors.request.use(

    (config) => {

        if (accessToken) {

            config.headers.Authorization =
                `Bearer ${accessToken}`;

        }

        return config;

    },

    (error) => Promise.reject(error)

);

/*
=========================================
Response Interceptor
=========================================
*/
api.interceptors.response.use(

    (response) => response,

    async (error) => {

        const originalRequest = error.config || {};

        if (

            error.response?.status === 401 &&

            !originalRequest._retry &&

            !originalRequest.url?.includes("/refresh-token")

        ) {

            originalRequest._retry = true;

            try {

                const { data } = await axios.post(

                    `${BASE_URL}/refresh-token`,

                    {},

                    {

                        withCredentials: true

                    }

                );

                setAccessToken(data.accessToken);

                originalRequest.headers = originalRequest.headers || {};

                originalRequest.headers.Authorization =
                    `Bearer ${data.accessToken}`;

                return api(originalRequest);

            }

            catch (refreshError) {

                setAccessToken(null);

                return Promise.reject(refreshError);

            }

        }

        return Promise.reject(error);

    }

);

export default api;