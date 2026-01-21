# MaaltijdPlus

Een responsieve webapplicatie voor het bijhouden van maaltijden met Next.js, Firebase en Google Gemini AI.

## Setup Instructions

### 1. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Create a new project.
3. **Authentication**: Enable **Google** provider.
4. **Firestore Database**: Create a database.
   - Create a collection named `users_whitelist`.
   - Add a document for each allowed user with a field `email` matching their Google email.
   - Rules: Ensure read/write is allowed for authenticated users (or refine as needed).
5. **Storage**: Enable Storage.
   - Rules: Allow read/write for authenticated users.

### 2. Google Gemini API
1. Get an API key from [Google AI Studio](https://aistudio.google.com/).
2. Ensure you have access to the model `gemini-2.0-flash-exp` (or update `app/actions.ts` to `gemini-1.5-flash`).

### 3. Environment Variables
1. Rename `.env.example` to `.env.local`.
2. Fill in your Firebase configuration keys and Gemini API key.

### 4. Run Locally
```bash
npm install
npm run dev
```

### 5. Deployment (Netlify)
1. Push to GitHub.
2. Import project in Netlify.
3. Set environment variables in Netlify dashboard.
4. Deploy.

## Features
- **Log Meal**: Upload photo (or capture), auto-analyze with AI, save to Firestore.
- **Feed**: View all meals or filter by "My Meals". Search functionality.
- **Security**: Whitelist-based access control.
