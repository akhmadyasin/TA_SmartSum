# Voice to Text Application

A modern voice-to-text application built with Next.js, TypeScript, and Supabase.

## Features

- 🎤 Real-time voice transcription
- 🤖 AI-powered text summarization
- 📱 Responsive design with modern UI
- 🔐 User authentication with Supabase
- 📊 Dashboard with usage statistics
- 📝 Transcription history management
- ⚙️ Customizable settings

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS, CSS Modules
- **Authentication**: Supabase Auth
- **Database**: Supabase (PostgreSQL)
- **Icons**: Custom SVG icons
- **Font**: Inter font family

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd voice-to-text
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure your Supabase credentials in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

5. Run the development server:
```bash
npm run dev
# or
yarn dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
voice-to-text/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/          # Dashboard page
│   │   │   ├── history/            # History page
│   │   │   ├── settings/           # Settings page
│   │   │   ├── detail/             # Detail view page
│   │   │   ├── login/              # Login page
│   │   │   ├── register/           # Register page
│   │   │   └── styles/             # CSS modules
│   │   └── lib/
│   │       └── supabaseClient.ts   # Supabase configuration
│   └── public/                     # Static assets
├── backend/                        # Backend services (if any)
└── package.json
```

## Features Overview

### Dashboard
- Overview statistics (sessions, words, summaries)
- Recent activity feed
- Quick access to voice recording

### History
- View all transcription history
- Export and share functionality
- Search and filter capabilities
- Detailed view for each transcription

### Settings
- Voice recognition language selection
- Microphone sensitivity adjustment
- AI model configuration
- Auto-detection settings
- Theme preferences

### Authentication
- User registration and login
- Email verification
- Google OAuth integration
- Profile management

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Contact

Your Name - [@yourusername](https://twitter.com/yourusername)

Project Link: [https://github.com/yourusername/voice-to-text](https://github.com/yourusername/voice-to-text)
