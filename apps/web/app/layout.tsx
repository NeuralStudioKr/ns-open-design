import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { I18nProvider } from '../src/i18n';
import { AnalyticsProvider } from '../src/analytics/provider';
import { TeamverBrandingProvider } from '../src/teamver/branding/TeamverBrandingProvider';
import {
  buildRootLayoutMetadata,
  isTeamverEmbedBuild,
} from '../src/teamver/branding/siteMetadata';
import { TEAMVER_EMBED_LOADING_BG } from '../src/teamver/branding/loadingShellLabel';
import '../src/index.css';
import '../src/styles/home/index.css';

export const metadata: Metadata = buildRootLayoutMetadata();

const embedBuild = isTeamverEmbedBuild();

export const viewport: Viewport = {
  // Warm cream for Teamver embed (Main FE frame); OD standalone stays near-white app chrome.
  themeColor: embedBuild ? TEAMVER_EMBED_LOADING_BG : '#faf9f7',
};

/**
 * Inline script that runs before React hydrates to apply the saved theme
 * preference without a flash of unstyled content. It reads the same
 * localStorage key used by `state/config.ts` and sets `data-theme` on
 * `<html>` immediately — before any CSS or React paint.
 * Keep the accent variable mix ratios in sync with `accentVars()` in
 * `src/state/appearance.ts`; this script cannot import application modules.
 */
const themeInitScript = `(function(){try{var c=JSON.parse(localStorage.getItem('open-design:config')||'{}');var t=c.theme;if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);var a=typeof c.accentColor==='string'&&/^#[0-9a-fA-F]{6}$/.test(c.accentColor.trim())?c.accentColor.trim().toLowerCase():'#c96442';var s=document.documentElement.style;s.setProperty('--accent',a);s.setProperty('--accent-strong','color-mix(in srgb, '+a+' 86%, var(--text-strong))');s.setProperty('--accent-soft','color-mix(in srgb, '+a+' 22%, var(--bg-panel))');s.setProperty('--accent-tint','color-mix(in srgb, '+a+' 12%, var(--bg-panel))');s.setProperty('--accent-hover','color-mix(in srgb, '+a+' 90%, var(--text-strong))');}catch(e){}})();`;

/** First-paint cream before CSS chunks — avoids a white flash in the Main iframe. */
const embedBootStyle = embedBuild
  ? `html,body{background-color:${TEAMVER_EMBED_LOADING_BG}!important}`
  : null;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang={embedBuild ? 'ko' : 'en'}
      className={embedBuild ? 'teamver-embed' : undefined}
      suppressHydrationWarning
    >
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: intentional theme-init inline script to prevent FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {embedBootStyle ? (
          <style dangerouslySetInnerHTML={{ __html: embedBootStyle }} />
        ) : null}
      </head>
      <body
        suppressHydrationWarning
        style={embedBuild ? { backgroundColor: TEAMVER_EMBED_LOADING_BG } : undefined}
      >
        <TeamverBrandingProvider>
          <I18nProvider>
            <AnalyticsProvider>{children}</AnalyticsProvider>
          </I18nProvider>
        </TeamverBrandingProvider>
      </body>
    </html>
  );
}
