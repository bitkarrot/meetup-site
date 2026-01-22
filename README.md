# Meetup Site - Nostr-Powered CMS

Deploy with Vercel 

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbitkarrot%2Fmeetup-site) 

You Must configure your .env in vercel before running the app

```sh
# Remote nostr.json for admin authentication
VITE_REMOTE_NOSTR_JSON_URL=

# Default relay for reading content
VITE_DEFAULT_RELAY=

# Master pubkey (owner of the site)
VITE_MASTER_PUBKEY=
```

A comprehensive meetup and event management system built with React, TypeScript, and Nostr. This project provides both an admin CMS for content management and a public-facing website for community engagement.

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
- Node.js 18+
- npm or pnpm

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```

### Building
```bash
npm run build
```

## Admin Features In-Depth

### System Settings & Reset
The **Admin Settings** page allows the Master User to:
- Assign roles to other admins.
- Configure site-wide branding and metadata.
- Manage the relay list.
- Use the **Reset to Defaults** feature to purge all custom configuration and return to the `VITE_` environment variable state.

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

## License
This project is open source and available under the MIT License.

## Note
This project was vibe coded by bitkarrot as an experiment with antigravity.
