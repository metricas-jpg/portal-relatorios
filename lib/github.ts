import type { ArquivoAcessos } from './acessos';

/**
 * Leitura e gravação de config/acessos.json no GitHub. Cada gravação vira um commit no branch
 * publicado (main), e a Vercel republica o site sozinha; a nova lista vale em 1 a 2 minutos.
 *
 * Variáveis: GITHUB_TOKEN (obrigatória para gravar: token "fine-grained" com permissão
 * "Contents: Read and write" só neste repositório), GITHUB_REPO e GITHUB_BRANCH (opcionais).
 */

const REPO = process.env.GITHUB_REPO || 'metricas-jpg/portal-relatorios';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const CAMINHO = 'config/acessos.json';
const API = `https://api.github.com/repos/${REPO}/contents/${CAMINHO}`;

export class ErroGitHub extends Error {
  constructor(msg: string, public status = 500) { super(msg); }
}

function cabecalhos() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new ErroGitHub('O site ainda não pode gravar a lista: falta a variável GITHUB_TOKEN na Vercel.', 503);
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'portal-relatorios',
  };
}

function explicar(status: number, acao: string) {
  if (status === 401) return `O GITHUB_TOKEN é inválido ou expirou (${acao}). Gere um novo e atualize a variável na Vercel.`;
  if (status === 403 || status === 404) return `O GITHUB_TOKEN não tem permissão para ${acao} em ${REPO}. Ele precisa de "Contents: Read and write" neste repositório.`;
  return `O GitHub respondeu ${status} ao ${acao}. Tente de novo em instantes.`;
}

/** lista atual no GitHub (pode estar à frente da versão publicada) e a versão do arquivo */
export async function lerDoGitHub(): Promise<{ arquivo: ArquivoAcessos; sha: string }> {
  const res = await fetch(`${API}?ref=${encodeURIComponent(BRANCH)}`, { headers: cabecalhos(), cache: 'no-store' });
  if (!res.ok) throw new ErroGitHub(explicar(res.status, 'ler a lista'), res.status === 401 ? 503 : 502);
  const dados = (await res.json()) as { content: string; sha: string };
  const arquivo = JSON.parse(Buffer.from(dados.content, 'base64').toString('utf8')) as ArquivoAcessos;
  return { arquivo: { ...arquivo, acessos: arquivo.acessos || [] }, sha: dados.sha };
}

/**
 * Aplica `alterar` sobre a versão mais recente e grava. Se outra pessoa gravar ao mesmo tempo,
 * relê e tenta de novo (uma vez).
 */
export async function gravarNoGitHub(alterar: (a: ArquivoAcessos) => ArquivoAcessos, mensagem: string): Promise<ArquivoAcessos> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const { arquivo, sha } = await lerDoGitHub();
    const novo = alterar(arquivo);
    const conteudo = Buffer.from(JSON.stringify(novo, null, 2) + '\n', 'utf8').toString('base64');
    const res = await fetch(API, {
      method: 'PUT',
      headers: { ...cabecalhos(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: mensagem, content: conteudo, sha, branch: BRANCH }),
    });
    if (res.ok) return novo;
    if (res.status !== 409 && res.status !== 422) throw new ErroGitHub(explicar(res.status, 'gravar a lista'), 502);
  }
  throw new ErroGitHub('Outra pessoa alterou a lista ao mesmo tempo. Recarregue a página e tente de novo.', 409);
}
