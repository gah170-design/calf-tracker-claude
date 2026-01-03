import './globals.css'

export const metadata = {
  title: 'Calf Tracker',
  description: 'Track calf feeding and health',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}