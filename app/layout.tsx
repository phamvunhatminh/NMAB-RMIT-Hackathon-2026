import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AuthProvider } from '@/lib/auth-context'
import tcConfig from '../tidecloak.json'
import './globals.css'

export const metadata: Metadata = {
  title: 'SafeChat AI: company AI that nobody can read',
  description: 'An office AI assistant where no admin, vendor or AI holds the key to your documents. Built with TideCloak.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap"
        />
      </head>
      <body>
        <AuthProvider config={tcConfig}>{children}</AuthProvider>
      </body>
    </html>
  )
}
