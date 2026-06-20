'use client';

import { useState } from 'react';
import { APP_NAME } from '@autix/contracts';

export default function Home() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchHello() {
    setLoading(true);
    try {
      const res = await fetch('/api/hello');
      const data = await res.json();
      setMessage(data.message);
    } catch {
      setMessage('Error calling chat service');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>APP_NAME: {APP_NAME}</h1>
      <button onClick={fetchHello} disabled={loading} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
        {loading ? 'Loading...' : 'Call Chat Service'}
      </button>
      {message && (
        <p style={{ marginTop: '1rem' }}>{message}</p>
      )}
    </div>
  );
}
