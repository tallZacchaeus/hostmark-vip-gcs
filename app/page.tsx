// Placeholder until the Figma Make frontend is integrated. The API lives under /api.
export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '40rem' }}>
      <h1>VIP Guest Coordination System</h1>
      <p>The backend API is running. The staff interface is being designed separately.</p>
      <p>
        Health check: <a href="/api/health">/api/health</a>
      </p>
    </main>
  )
}
