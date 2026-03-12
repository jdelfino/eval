import type { Metadata } from 'next'
import { AuthProvider } from '@/contexts/AuthContext'
import { HeaderSlotProvider } from '@/contexts/HeaderSlotContext'
import { LayoutConfigProvider } from '@/contexts/LayoutConfigContext'
import { ErrorListener } from '@/components/ErrorListener'
import './globals.css'

export const metadata: Metadata = {
  title: 'Live Coding Classroom',
  description: 'Real-time coding tool for classroom instruction',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <LayoutConfigProvider>
            <HeaderSlotProvider>
              <ErrorListener />
              {children}
            </HeaderSlotProvider>
          </LayoutConfigProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
