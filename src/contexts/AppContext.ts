import { createContext } from "react";

export type Theme = "dark" | "light" | "system";

export interface RelayMetadata {
  /** List of relays with read/write permissions */
  relays: { url: string; read: boolean; write: boolean }[];
  /** Unix timestamp of when the relay list was last updated */
  updatedAt: number;
}

export interface AppConfig {
  /** Current theme */
  theme: Theme;
  /** NIP-65 relay list metadata */
  relayMetadata: RelayMetadata;
  /** Site configuration */
  siteConfig?: {
    title?: string;
    logo?: string;
    favicon?: string;
    ogImage?: string;
    heroTitle?: string;
    heroSubtitle?: string;
    heroBackground?: string;
    showEvents?: boolean;
    showBlog?: boolean;
    maxEvents?: number;
    maxBlogPosts?: number;
    /** Default relay for reading content */
    defaultRelay?: string;
    /** Publishing relays for blasting content */
    publishRelays?: string[];
    /** Admin roles mapping: pubkey -> 'primary' | 'secondary' */
    adminRoles?: Record<string, 'primary' | 'secondary'>;
    /** TweakCN theme URL */
    tweakcnThemeUrl?: string;
    /** Last time the site config was updated from/to Nostr */
    updatedAt?: number;
  };
  /** Navigation configuration */
  navigation?: Array<{
    id: string;
    name: string;
    href: string;
    isSubmenu: boolean;
    isLabelOnly?: boolean;
    parentId?: string;
  }>;
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
