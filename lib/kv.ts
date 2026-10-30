/**
 * Armazenamento compartilhado pequeno (Redis da Upstash, pela Vercel Marketplace), acessado pela
 * API REST, sem biblioteca. Variáveis criadas pela integração: KV_REST_API_URL e KV_REST_API_TOKEN
 * (ou UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN). Sem elas, kvConfigurado() é false e
 * quem chama decide o que fazer (o gerador guarda a escolha só no navegador).
 */

function credenciais() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export const kvConfigurado = () => credenciais() !== null;

/** executa um comando Redis, ex.: ['HGETALL', 'chave'] */
export async function kv<T = unknown>(comando: (string | number)[]): Promise<T> {
  const c = credenciais();
  if (!c) throw new Error('Armazenamento compartilhado não configurado');
  const res = await fetch(c.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comando.map(String)),
    cache: 'no-store',
  });
  const dados = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || dados.error) throw new Error(dados.error || `Upstash respondeu ${res.status}`);
  return dados.result as T;
}
