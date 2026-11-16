# AXIAL — agenciaaxial.com.br

Site da AXIAL, agência de tecnologia. Página estática servida por nginx no servidor de casa,
publicada pela Cloudflare (Tunnel), com o formulário de contato atendido por um Cloudflare Worker.

```
Visitante ──HTTPS──> Cloudflare (DNS, WAF, Bot Fight Mode, redirect www → raiz)
                        │
                        ├── /api/contato ──> Worker "axial-contato" ──> e-mail (send_email)
                        │
                        └── resto ──> Tunnel ──> container agencia-axial-landingpage (nginx)
```

## Estrutura

| Pasta / arquivo | O que é |
|---|---|
| `site/` | A página (`index.html`), ícones, imagem de prévia e o runtime JS da página |
| `nginx.conf` | Config do nginx: cabeçalhos de segurança, cache, IP real do visitante |
| `docker-compose.prod.yml` | Container nginx **sem portas publicadas**, na rede do Nginx Proxy Manager |
| `worker/` | Cloudflare Worker do formulário de contato |
| `logo/` | Logo em SVG/PNG e as propostas alternativas (`propostas.html`) |

## Site

Rodar localmente:

```bash
cd site
python -m http.server 8000   # abrir http://localhost:8000
```

Deploy no servidor (o `site/` é montado como volume: HTML novo aparece na hora):

```bash
tar czf - docker-compose.prod.yml nginx.conf site | ssh <servidor> \
  'mkdir -p ~/apps/agencia-axial && cd ~/apps/agencia-axial && tar xzf - && docker compose -f docker-compose.prod.yml up -d'
```

Mudou o `nginx.conf`? `docker compose -f docker-compose.prod.yml restart`.

> Os links de e-mail ficam entre `<!--email_off-->…<!--/email_off-->`: sem isso, o Email Obfuscation
> da Cloudflare troca o endereço por `[email protected]` e a página (montada por JS) não desfaz.

## Formulário de contato (`worker/`)

O formulário faz `POST /api/contato` (JSON). O Worker valida a origem e os campos, descarta robôs pelo
campo invisível `site` (honeypot) e envia o e-mail pelo binding `send_email` do Email Routing, com o
e-mail do cliente no `Reply-To`. Uma regra de rate limiting no WAF limita a 3 envios por 10 s por IP.

```bash
cd worker
npm install
echo "TO=destino@exemplo.com" > .dev.vars   # só local, está no .gitignore
npx wrangler dev                            # o e-mail vira um .eml em .wrangler/tmp/email (não envia)
npx wrangler deploy                         # publica
npx wrangler secret put TO                  # destino em produção (precisa estar verificado no Email Routing)
npx wrangler tail                           # logs ao vivo
```
