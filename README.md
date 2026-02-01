# Nostr-CMS + Swarm Relay

A comprehensive meetup or small organization and event management system built with React, TypeScript, and Nostr. This project provides both an admin CMS for content management and a public-facing website for community engagement.

## Deploy Options

### Quick Deploy with Vercel (Frontend Only)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbitkarrot%2Fnostr-cms)

**Required Environment Variables for Vercel:**
```sh
# Remote nostr.json for admin authentication
VITE_REMOTE_NOSTR_JSON_URL=

# Default relay for reading content
VITE_DEFAULT_RELAY=

# Master pubkey (owner of the site)
VITE_MASTER_PUBKEY=
```

### Option 1: Combined Deployment (Single Domain) ⭐ **Recommended**
Run the Nostr-CMS frontend and Swarm relay as a single service on one domain. Simpler deployment, lower infrastructure costs.

**Advantages:**
- ✅ Single container/port (3334) for both relay and frontend
- ✅ No CORS issues - same-origin WebSocket connections
- ✅ Lower hosting costs - one service instead of two
- ✅ Simpler setup and maintenance

**Quick Start:**
```bash
# Terminal 1: Build frontend
npm run build:embedded

# Terminal 2: Run relay with embedded frontend
cd swarm
export SERVE_FRONTEND=true
export VITE_DEFAULT_RELAY=ws://localhost:3334
go run .
```

Access at: `http://localhost:3334`

**Docker:**
```bash
docker compose -f docker-compose.combined.yml up -d --build
```

### Option 2: Separated Deployment (Two Domains)
Run frontend and relay as separate services for independent scaling and development.

**Advantages:**
- ✅ Independent updates - frontend doesn't require rebuilding relay
- ✅ Separate scaling for high-traffic scenarios
- ✅ Hot reload in development
- ✅ Traditional microservices architecture

**Quick Start:**
```bash
# Terminal 1: Run relay
cd swarm
go run .

# Terminal 2: Run frontend
npm run dev
```

Frontend: `http://localhost:8080`
Relay: `ws://localhost:3334`

**Docker:**
```bash
docker compose -f docker-compose.separated.yml up -d --build
```

## What's New in This Version

### Combined Deployment Architecture
This repository now includes both the Nostr-CMS frontend (React/Vite) and the Swarm relay (Go) in a single codebase with optional combined deployment:

#### Changes to Root Directory (Nostr-CMS Frontend):
- **`build-embedded.sh`** - New build script for preparing frontend to be embedded in Go binary
- **`docker-compose.combined.yml`** - Docker config for single-domain deployment
- **`docker-compose.separated.yml`** - Docker config for two-domain deployment
- **`Dockerfile.frontend`** - Frontend-only Dockerfile for separated deployment
- **`nginx.conf`** - Nginx configuration for frontend-only container
- **`.env.combined.example`** - Environment variables for combined mode
- **`.env.separated.example`** - Environment variables for separated mode
- **`package.json`** - Added `build:embedded` script

#### Changes to `swarm/` Directory (Go Relay):
- **Removed Bouquet Client** - Completely removed `swarm/clients/bouquet/` directory (Nostr-CMS has built-in media upload)
- **`main.go`** - Added Nostr-CMS integration:
  - New config fields: `ServeFrontend`, `FrontendPath`, `FrontendBasePath`, `EnableFrontendAuth`, `NostrJsonMode`
  - New `setupFrontendHandler()` function for serving embedded frontend
  - Runtime config injection via `/config-runtime.js` endpoint
  - Support for local and remote nostr.json modes
- **`frontend.go`** - Updated landing page handler to avoid conflicts with Nostr-CMS
- **`Dockerfile`** - Added frontend-builder stage to build and embed Nostr-CMS
- **`.gitignore`** - Removed `bouquet-dist` entry

#### URL Routing Strategy
The combined mode uses careful handler registration order to avoid conflicts:
1. `/upload` - Blossom upload endpoint
2. `/mirror` - Blossom mirror endpoint
3. `/list/` - Blossom list endpoint
4. `/public/` - Static files
5. `/dashboard` - Admin dashboard
6. `/` - **Nostr-CMS frontend** (catch-all for SPA routes)
7. `/{sha256}` - Blossom download (handled by khatru router)

This ensures Blossom's `/{sha256}` pattern works correctly while allowing Nostr-CMS to handle all other routes.

---

## Features

### Admin Dashboard
- **Authentication**: Remote `nostr.json` validation for admin access control.
- **Admin Roles**: Support for **Primary** and **Secondary** admin roles with different publishing permissions.
- **Content Management**: Full CMS with TipTap rich text editor for blogs and events.
- **Static Pages**: Create and manage static HTML/Markdown pages via **Kind 34128** (nsite) with Blossom storage.
- **Blog Management**: Create, edit, and manage long-form content (**NIP-23**) with username-based filtering.
- **Event Management**: Create and manage events with RSVP functionality (**NIP-52**) and username-based filtering.
- **Draft Support**: Save drafts to default relay before publishing.
- **Site Configuration**: Customize logos, titles, favicons, and navigation menus.
- **Relay Management**: Configure a **Primary Relay** (prioritized) and additional **Publishing Relays** for redundancy.
- **Media Library**: Manage uploaded images and files via Blossom servers.
- **Feed Management**: Curate and manage content feeds.
- **Zaplytics**: Comprehensive analytics dashboard for tracking zap earnings, top contributors, and content performance.
- **Reset to Defaults**: Quickly reset all site settings to environment variable defaults and clear local caches.

### Public Website
- **Zaps & Tips**: Integrated support for **Lightning Zaps (NIP-57)** for community appreciation.
- **NWC Integration**: Support for **Nostr Wallet Connect (NIP-47)** for seamless zapping.
- **Hero Section**: Customizable hero with background image and text.
- **Event Listings**: Browse upcoming and past events with filtering and author attribution.
- **Event Details**: Full event pages with RSVP functionality and attendee lists.
- **Blog Section**: Display published blog posts with rich formatting and author metadata.
- **Navigation**: Customizable navigation menu with submenus and mobile-responsive labels.
- **Responsive Design**: Mobile-friendly interface with light/dark mode support.

### AI Integration
- **Shakespeare API**: Built-in `useShakespeare` hook for integrating AI chat completions.
- **Streaming Support**: Support for streaming AI responses.
- **Model Selection**: Dynamic model discovery and selection.
- **Nostr Authentication**: Secure authentication with the AI provider using Nostr keys.

## Technical Stack

- **React 18.x**: Modern React with hooks and concurrent features.
- **TypeScript**: Type-safe development.
- **Vite**: Fast build tool and development server.
- **TailwindCSS & shadcn/ui**: Utility-first CSS and high-quality UI components.
- **Nostrify**: Nostr protocol integration.
- **TipTap**: Rich text editor for content creation.
- **TanStack Query**: Data fetching and state management.
- **Blossom**: Media and static content storage.
- **WebLN**: Lightning Network integration for zaps.
- **Shakespeare AI**: AI chat completion API integration.

## Configuration

### Relays
- **Primary Relay**: Configured via `VITE_DEFAULT_RELAY`. This is the main source for reading and the first destination for publishing.
- **Additional Publishing Relays**: 
  - `wss://relay.damus.io`
  - `wss://relay.primal.net` 
  - `wss://nos.lol`
- **Admin Control**: Admins can dynamically add or remove publishing relays via the system settings.

### Admin Access
Admin access is controlled by a remote `nostr.json` file (configured via `VITE_REMOTE_NOSTR_JSON_URL`). The site automatically detects users and maps roles based on the Master Pubkey.

## NIPs Used

- **NIP-01**: Basic protocol flow
- **NIP-05**: Mapping Nostr keys to DNS-based identifiers
- **NIP-23**: Long-form content for blog posts
- **NIP-47**: Nostr Wallet Connect (NWC)
- **NIP-52**: Calendar events for meetups
- **NIP-25**: Event RSVP functionality
- **NIP-57**: Lightning Zaps
- **NIP-nsite (Type 34128)**: Static page mapping
- **NIP-04/17**: Direct messaging support

## Project Structure

```
src/
├── components/
│   ├── admin/          # Admin dashboard components (Blogs, Events, Pages, Settings)
│   ├── ui/              # shadcn/ui components
│   └── ...            # Other shared components
├── contexts/             # React contexts (App, DM, NWC, Wallet)
├── hooks/               # Custom hooks (useNostr, useZaps, useAuthor, etc.)
├── pages/              # Page components
│   ├── admin/          # Admin pages
│   └── ...            # Public pages
└── lib/                # Utility functions and shared logic
```

## Development

### Prerequisites
- **Node.js 18+** - For frontend development
- **Go 1.23+** - For relay development
- **npm or pnpm** - Frontend package manager

### Local Development (Separated Mode - Recommended)

For active frontend development with hot reload:

**Terminal 1: Start Relay**
```bash
cd swarm
go run .
```

**Terminal 2: Start Frontend**
```bash
npm run dev
```

Frontend runs at `http://localhost:8080`
Relay runs at `ws://localhost:3334`

### Local Development (Combined Mode)

To test the combined deployment locally:

**Step 1: Build Frontend**
```bash
npm run build:embedded
```

**Step 2: Run Relay with Embedded Frontend**
```bash
cd swarm
export SERVE_FRONTEND=true
export VITE_DEFAULT_RELAY=ws://localhost:3334
export FRONTEND_PATH=../dist  # Use local files for testing
go run .
```

Access at `http://localhost:3334`

**Hot Reload in Combined Mode:**
```bash
# Terminal 1: Watch and rebuild frontend
npm run build -- --watch

# Terminal 2: Run relay with local filesystem
cd swarm
export SERVE_FRONTEND=true
export FRONTEND_PATH=../dist
go run .
```

Changes to `dist/` will be reflected on refresh (no need to rebuild Go binary).

### Environment Variables

**Frontend Configuration:**
```bash
# Copy example env file
cp .env.example .env

# Edit with your values
nano .env
```

Required variables:
- `VITE_DEFAULT_RELAY` - WebSocket URL to your Nostr relay
- `VITE_REMOTE_NOSTR_JSON_URL` - URL to remote nostr.json for admin auth
- `VITE_MASTER_PUBKEY` - Your Nostr public key (site owner)

**Relay Configuration (swarm/.env):**
```bash
cd swarm
cp .env.example .env
nano .env
```

See `swarm/.env.example` for all available relay options.

### Building for Production

**Frontend Only (for Vercel, Netlify, etc.):**
```bash
npm run build
```

**Combined Docker Image:**
```bash
docker build -f swarm/Dockerfile -t nostr-cms-combined .
```

**Frontend Docker Image:**
```bash
docker build -f Dockerfile.frontend -t nostr-cms-frontend .
```

## Deployment Options

### Option 1: Combined Deployment (Single Domain)

**Without Docker:**

1. Build the frontend:
```bash
npm run build:embedded
```

2. Configure environment:
```bash
cd swarm
export SERVE_FRONTEND=true
export VITE_DEFAULT_RELAY=ws://yourdomain.com
export VITE_REMOTE_NOSTR_JSON_URL=https://yourdomain.com/public/.well-known/nostr.json
export VITE_MASTER_PUBKEY=your_pubkey_here
```

3. Run the relay:
```bash
go run .
```

Access at: `http://localhost:3334` (or your configured domain)

**With Docker:**
```bash
cp .env.combined.example .env
# Edit .env with your configuration
docker compose -f docker-compose.combined.yml up -d --build
```

### Option 2: Separated Deployment (Two Domains)

**Without Docker:**

1. Start the relay:
```bash
cd swarm
go run .
```

2. In a new terminal, start the frontend:
```bash
npm run dev
```

Or build for production:
```bash
npm run build
# Serve dist/ with nginx, apache, or any static file server
```

**With Docker:**
```bash
cp .env.separated.example .env
# Edit .env with your configuration
docker compose -f docker-compose.separated.yml up -d --build
```

### Configuration Variables

**Combined Mode Environment Variables:**
- `SERVE_FRONTEND=true` - Enable embedded Nostr-CMS frontend
- `FRONTEND_BASE_PATH=/` - URL path prefix (default: root)
- `ENABLE_FRONTEND_AUTH=false` - Require auth for frontend (default: public view)
- `NOSTR_JSON_MODE=local` - Use "local" or "remote" nostr.json
- `VITE_DEFAULT_RELAY` - WebSocket URL for relay connection
- `VITE_REMOTE_NOSTR_JSON_URL` - Remote nostr.json URL (when NOSTR_JSON_MODE=remote)
- `VITE_MASTER_PUBKEY` - Admin pubkey
- `BLOSSOM_ENABLED=true` - Enable Blossom media storage for Nostr-CMS uploads

**Nostr.json Management:**
- **Local Mode** (default): Uses `public/.well-known/nostr.json` on the relay server
- **Remote Mode**: Uses remote nostr.json URL for admin authentication

---

### Settings Structure
The application uses a layered configuration approach:

1. **Environment Variables (`.env`)**: 
   - Immutable infrastructure keys (Relays, Master Pubkey, Remote Admin JSON).
   - Serves as the hardcoded default state.

2. **Site Settings (Admin UI)**: 
   - Customizable branding (Logo, Title, Description, Navigation).
   - Stored as Replaceable Events (Kind 30078) on Nostr.
   - Overrides defaults when present.

3. **System Settings (Admin UI)**:
   - Administrative configuration (Relay List, Admin Roles).
   - Controls strictly limited to the Master User.

The **Reset to Defaults** feature allows admins to purge the Nostr-based Site Settings and revert to the `.env` configuration.

### Static Pages (Kind 34128)
Admins can create custom URL paths (e.g., `/about`, `/contact`) and upload content (HTML/Markdown) to Blossom. These are mapped using Kind 34128 events, allowing the site to serve decentralized static content.

## Public Features In-Depth

### Community Zapping
Users can send Bitcoin via Lightning Network zaps to authors of blog posts and events. The site supports:
- **WebLN**: Browser extensions like Alby.
- **NWC**: Cross-device wallet connections.
- **QR Codes**: Manual scanning for mobile or desktop wallets.

## Security
- Admin access is cryptographically verified based on the remote `nostr.json`.
- Sensitve configurations are stored in environment variables.
- No private keys are stored on the server; all signing happens via local clients or NWC.

## Developer Documentation

### Deployment & Development Guides
- **[LOCAL_DEV.md](LOCAL_DEV.md)** - Quick guide for local development without Docker
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide with Docker, systemd, nginx, and production setup

### Feature Documentation
The project includes specialized documentation in the `docs/` directory:

- **[AI Chat](docs/AI_CHAT.md)**: Implementation guide for AI chat interfaces using the Shakespeare API.
- **[Nostr Direct Messages](docs/NOSTR_DIRECT_MESSAGES.md)**: Guide for implementing NIP-04 and NIP-17 direct messaging.
- **[Nostr Comments](docs/NOSTR_COMMENTS.md)**: Guide for comment systems.
- **[Infinite Scroll](docs/NOSTR_INFINITE_SCROLL.md)**: Guide for feed interfaces.

## License
This project is open source and available under the MIT License.

## Note
This project was vibe coded by bitkarrot as an experiment with antigravity.
