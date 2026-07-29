import './globals.css'

export const metadata = {
  title: 'Calf Tracker',
  description: 'Track calf feeding and health',
  manifest: '/manifest.json',
  themeColor: '#1d4ed8',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Calf Tracker',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
