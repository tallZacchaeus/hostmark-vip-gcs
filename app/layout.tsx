import '@fontsource-variable/plus-jakarta-sans'
import '@/styles/index.css'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { AppProviders } from '@/components/providers/AppProviders'

export const metadata: Metadata = {
  title: { default: 'Hostmark', template: '%s · Hostmark' },
  description: 'Coordinate VIP guests, arrivals, transport, rooms and the event programme in one place.',
  applicationName: 'Hostmark',
  // Staff tool: keep it out of search engines.
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = {
  themeColor: '#0e1a2c',
  width: 'device-width',
  initialScale: 1,
}

interface RootLayoutProps {
  readonly children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
