'use client';

import { useState } from 'react';
import type { RequirementResult } from '@autix/contracts';

export default function Home() {
  const [input, setInput] = useState('用户注册时必须绑定手机号，密码至少8位');
  const [result, setResult] = useState<RequirementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4001'}/requirement/extract`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input }),
        }
      );
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>Requirement Extract Demo</h1>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={8}
        style={{ width: '100%', border: '1px solid #ccc', borderRadius: 4, padding: 8 }}
      />

      <button onClick={handleSubmit} disabled={loading} style={{ marginTop: 12, padding: '6px 16px', border: '1px solid #ccc', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer' }}>
        {loading ? '提取中…' : '提取'}
      </button>

      {error && <pre style={{ marginTop: 16, color: 'red' }}>{error}</pre>}

      {result && <pre style={{ marginTop: 16, border: '1px solid #ccc', borderRadius: 4, padding: 12, overflow: 'auto' }}>{JSON.stringify(result, null, 2)}</pre>}
    </main>
  );
}
