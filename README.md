# Bodhi AI 🤖

A full-stack AI chat application where users can interact with an AI assistant, manage conversations, switch between dark and light themes, use voice input, and securely manage their accounts.

🔗 **Live Demo:** https://bodhi-ai-eight.vercel.app

---

## Tech Stack

| **Layer**          | **Technology**                  |
| ------------------ | ------------------------------- |
| Frontend           | React.js                        |
| Build Tool         | Vite                            |
| Backend            | Node.js                         |
| Framework          | Express.js                      |
| Database           | MongoDB + Mongoose              |
| Authentication     | JWT + Refresh Token             |
| Password Security  | Bcrypt                          |
| AI Integration     | OpenRouter API                  |
| AI Model           | GPT-OSS-20B                     |
| Speech-to-Text     | Sarvam AI                       |
| HTTP Client        | Axios                           |
| Styling            | CSS3                            |
| Markdown Rendering | React Markdown + Highlight.js   |
| Routing            | React Router                    |
| File Upload        | Multer                          |
| Security           | Helmet + Express Mongo Sanitize |
| Rate Limiting      | Express Rate Limit              |
| Deployment         | Vercel                          |

---

## Features

* **AI Chat** — Interact with an AI assistant and receive intelligent responses
* **Chat Threads** — Create and manage multiple conversations
* **Conversation History** — Store and retrieve previous chat messages from MongoDB
* **Thread Management** — View, switch between, and delete previous conversations
* **AI Response Streaming Experience** — Clean chat interface for interacting with AI responses
* **Markdown Support** — Render AI responses using React Markdown
* **Code Highlighting** — Syntax highlighting for code blocks in AI responses
* **Voice Input** — Record audio and convert speech to text using Sarvam AI
* **User Authentication** — Secure signup and login system
* **JWT Authentication** — Short-lived access tokens with refresh-token based session management
* **Secure Passwords** — Passwords are hashed using Bcrypt
* **Automatic Token Refresh** — Axios interceptor automatically refreshes expired access tokens
* **HTTP-Only Refresh Cookie** — Refresh tokens are securely stored using HTTP-only cookies
* **Profile Management** — View account information and subscription plan
* **Change Password** — Authenticated users can securely change their password
* **Dark & Light Mode** — Switch between dark and light themes
* **Persistent Theme** — Selected theme is stored in browser local storage
* **Responsive UI** — Responsive chat interface for different screen sizes
* **Subscription Plans UI** — Free, Pro and Ultra plan interface
* **API Rate Limiting** — Protection against excessive signup, login, API and AI requests
* **NoSQL Injection Protection** — MongoDB query sanitization using Express Mongo Sanitize
* **Security Headers** — Helmet-based application security
* **CORS Protection** — Controlled frontend-to-backend cross-origin access
* **Input Validation** — Server-side validation for signup and login requests

---

## Project Structure

```text
Bodhi-AI/
├── Backend/
│   ├── middleware/
│   │   ├── authMiddleware.js       # JWT authentication middleware
│   │   ├── authValidation.js       # Signup and login validation
│   │   ├── rateLimiter.js          # API and AI rate limiting
│   │   └── upload.js               # Audio upload configuration
│   │
│   ├── models/
│   │   └── Thread.js                # User and conversation schemas
│   │
│   ├── routes/
│   │   ├── chat.js                 # AI chat, threads and transcription routes
│   │   └── user.js                 # Authentication and user routes
│   │
│   ├── utils/
│   │   ├── openai.js               # OpenRouter AI integration
│   │   └── token.js                # Access and refresh token generation
│   │
│   ├── server.js                   # Backend entry point
│   └── package.json                # Backend dependencies
│
├── Frontend/
│   ├── public/
│   │   ├── gptlogo.png             # Application logo
│   │   └── icons.svg               # UI icons
│   │
│   ├── src/
│   │   ├── assets/
│   │   │   └── blacklogo.png       # Logo asset
│   │   │
│   │   ├── context/
│   │   │   └── AuthContext.jsx     # Authentication context
│   │   │
│   │   ├── services/
│   │   │   └── api.js              # Axios API configuration
│   │   │
│   │   ├── App.jsx                 # Main application and routing
│   │   ├── Chat.jsx                # Chat message rendering
│   │   ├── Chat.css                # Chat styling
│   │   ├── ChatWindow.jsx           # Main chat interface
│   │   ├── ChatWindow.css           # Chat window styling
│   │   ├── Login.jsx               # Login page
│   │   ├── Login.css               # Login styling
│   │   ├── Signin.jsx              # Signup page
│   │   ├── Signin.css              # Signup styling
│   │   ├── Sidebar.jsx             # Chat history sidebar
│   │   ├── Sidebar.css              # Sidebar styling
│   │   ├── ProfileCard.jsx          # User profile card
│   │   ├── ProfileCard.css          # Profile styling
│   │   ├── SettingsModal.jsx        # Settings and account management
│   │   ├── SettingsModal.css        # Settings styling
│   │   ├── MyContext.jsx            # Global application context
│   │   ├── App.css                 # Application styles
│   │   └── index.css               # Global styles
│   │
│   ├── index.html                  # Frontend HTML entry point
│   ├── vite.config.js              # Vite configuration
│   ├── vercel.json                 # Vercel deployment configuration
│   └── package.json                # Frontend dependencies
│
├── vercel.json                     # Root Vercel configuration
└── README.md                       # Project documentation
```

---

## Getting Started

### Prerequisites

* Node.js v18+
* MongoDB Atlas account
* OpenRouter API key
* Sarvam AI API key
* Vercel account for deployment

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/bodhi-ai.git
cd bodhi-ai
```

### Backend Installation

```bash
cd Backend

# Install dependencies
npm install
```

### Frontend Installation

```bash
cd ../Frontend

# Install dependencies
npm install
```

---

## Environment Variables

### Backend

Create a `.env` file inside the `Backend` directory:

```env
MONGODB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/bodhi-ai

JWT_SECRET=your_jwt_secret
JWT_EXPIRE=your_access_token_expiry

REFRESH_TOKEN_SECRET=your_refresh_token_secret
REFRESH_TOKEN_EXPIRE=your_refresh_token_expiry

OPENAI_API_KEY=your_openrouter_api_key

SARVAM_API_KEY=your_sarvam_api_key

CLIENT_URL=http://localhost:5173

NODE_ENV=development
```

### Frontend

Create a `.env` file inside the `Frontend` directory:

```env
VITE_API_URL=http://localhost:5000
```

> **Important:** Never commit `.env` files or expose API keys, JWT secrets, database credentials, or other sensitive information publicly.

---

## Run Locally

### Start Backend

```bash
cd Backend

node server.js

# or with nodemon
npx nodemon server.js
```

Backend runs at:

```text
http://localhost:5000
```

### Start Frontend

Open another terminal:

```bash
cd Frontend

npm run dev
```

Frontend runs at:

```text
http://localhost:5173
```

---

## Deployment (Vercel)

### Frontend Deployment

1. Push the project to GitHub
2. Create a new project on **Vercel**
3. Connect your GitHub repository
4. Set the frontend project directory to:

```text
Frontend
```

5. Set the build command:

```bash
npm run build
```

6. Set the output directory:

```text
dist
```

7. Add the frontend environment variable:

```env
VITE_API_URL=your_backend_api_url
```

8. Deploy the application

### Backend Deployment

The backend can be deployed as a Node.js server on a compatible hosting platform.

Set the required environment variables in the hosting provider's dashboard:

```env
MONGODB_URL
JWT_SECRET
JWT_EXPIRE
REFRESH_TOKEN_SECRET
REFRESH_TOKEN_EXPIRE
OPENAI_API_KEY
SARVAM_API_KEY
CLIENT_URL
NODE_ENV
```

> **Note:** Environment variables should be configured through the deployment platform dashboard rather than committing `.env` files to GitHub.

---

## API Routes

### Authentication

| **Method** | **Route**          | **Description**                     |
| ---------- | ------------------ | ----------------------------------- |
| POST       | `/signin`          | Create a new user account           |
| POST       | `/login`           | Authenticate user                   |
| GET        | `/user`            | Get authenticated user information  |
| POST       | `/change-password` | Change account password             |
| POST       | `/refresh-token`   | Generate a new access token         |
| POST       | `/logout`          | Logout and invalidate refresh token |

### Chat

| **Method** | **Route**         | **Description**                      |
| ---------- | ----------------- | ------------------------------------ |
| POST       | `/api/chat`       | Send message and receive AI response |
| POST       | `/api/transcribe` | Convert uploaded audio to text       |

### Threads

| **Method** | **Route**               | **Description**                   |
| ---------- | ----------------------- | --------------------------------- |
| GET        | `/api/thread`           | Get all user conversation threads |
| GET        | `/api/thread/:threadId` | Get conversation history          |
| DELETE     | `/api/thread/:threadId` | Delete a conversation thread      |

---

## Authentication Flow

```text
User Signup / Login
        ↓
Backend validates credentials
        ↓
Password verified using Bcrypt
        ↓
Access Token + Refresh Token generated
        ↓
Refresh Token stored in HTTP-only Cookie
        ↓
Access Token stored in Frontend memory
        ↓
Authenticated API Requests
        ↓
Access Token expires
        ↓
Axios Interceptor requests new Access Token
        ↓
User continues session
```

---

## AI Chat Flow

```text
User enters message
        ↓
Frontend sends request
        ↓
JWT Authentication
        ↓
Backend validates request
        ↓
AI Rate Limiter
        ↓
OpenRouter API
        ↓
GPT-OSS-20B Model
        ↓
AI Response
        ↓
Message saved to MongoDB
        ↓
Response returned to Frontend
        ↓
React renders AI response
```

---

## Voice Input Flow

```text
User records audio
        ↓
Frontend uploads audio file
        ↓
Multer receives audio
        ↓
Audio file validation
        ↓
Sarvam AI Speech-to-Text API
        ↓
English Transcript
        ↓
Transcript returned to Frontend
        ↓
User message generated
```

---

## Security

Bodhi AI implements several security mechanisms:

* JWT-based authentication
* Access and refresh token architecture
* HTTP-only refresh-token cookies
* Bcrypt password hashing
* Login rate limiting
* Signup rate limiting
* AI request rate limiting
* General API rate limiting
* Helmet security headers
* CORS restrictions
* MongoDB/NoSQL injection sanitization
* Server-side input validation
* Audio file type validation
* Audio file size limitation
* Protected chat and thread routes
* Automatic access-token refresh

---

## Database Models

The application uses MongoDB with Mongoose.

### User

Stores:

* Username
* Email
* Hashed password
* Refresh token
* Subscription plan
* User threads
* Account creation date

### Thread

Stores:

* Thread ID
* Conversation title
* Messages
* Message roles
* Message content
* Message timestamps
* Thread creation date
* Thread update date

### Message

Each message contains:

* `role` — user or assistant
* `content` — message text
* `timestamp` — message creation time

---

## AI Integration

Bodhi AI uses the **OpenRouter API** to communicate with the configured AI model.

The backend sends the user's message to the AI service and receives the assistant response:

```text
Frontend
   ↓
Express API
   ↓
OpenRouter
   ↓
GPT-OSS-20B
   ↓
AI Response
   ↓
MongoDB
   ↓
Frontend
```

---

## Subscription Plans

Bodhi AI currently provides a subscription-plan interface containing:

| **Plan** | **Price**       | **Status**  |
| -------- | --------------- | ----------- |
| Free     | ₹0 / month      | Available   |
| Pro      | ₹199 / month    | Coming Soon |
| Ultra    | Available in UI | Coming Soon |

> **Note:** The Pro and Ultra payment/upgrade functionality is currently under construction. The subscription interface is present, but paid-plan processing is not yet implemented.

---

## Theme Support

Bodhi AI supports:

* 🌙 Dark Mode
* ☀️ Light Mode

The selected theme is stored in browser `localStorage`, allowing the user's theme preference to persist between sessions.

---

## License

This project is developed for educational, learning, and portfolio purposes.
