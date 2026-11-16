// Recebe o POST do formulário de contato (JSON) e envia um e-mail com os dados.
// O visitante vai no Reply-To: é só clicar em "Responder" no Gmail.
import { EmailMessage } from "cloudflare:email";

const LIMITES = { nome: 100, empresa: 120, email: 200, whatsapp: 40, mensagem: 5000 };
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return json({ ok: false, erro: "Método não permitido." }, 405);
    }

    // Só aceita envios vindos do próprio site (barra formulários falsos em outros domínios)
    const permitidas = (env.ALLOWED_ORIGINS || "").split(",");
    if (!permitidas.includes(request.headers.get("Origin") || "")) {
      return json({ ok: false, erro: "Origem não permitida." }, 403);
    }

    if (Number(request.headers.get("Content-Length") || 0) > 20000) {
      return json({ ok: false, erro: "Mensagem grande demais." }, 413);
    }

    let dados;
    try {
      dados = await request.json();
    } catch {
      return json({ ok: false, erro: "Dados inválidos." }, 400);
    }

    // Honeypot: campo invisível que só robô preenche. Finge sucesso e descarta.
    if (dados.site) return json({ ok: true });

    const campo = (k) => String(dados[k] ?? "").trim().slice(0, LIMITES[k]);
    const linha = (k) => limpa(campo(k)).trim(); // campos de uma linha só
    const c = {
      nome: linha("nome"),
      empresa: linha("empresa"),
      email: linha("email"),
      whatsapp: linha("whatsapp"),
      mensagem: campo("mensagem"),
    };

    if (!c.nome) return json({ ok: false, erro: "Informe seu nome." }, 400);
    if (!EMAIL_RE.test(c.email)) return json({ ok: false, erro: "Informe um e-mail válido." }, 400);

    const texto = [
      "Novo contato pelo site agenciaaxial.com.br",
      "",
      `Nome:     ${c.nome}`,
      `Empresa:  ${c.empresa || "-"}`,
      `E-mail:   ${c.email}`,
      `WhatsApp: ${c.whatsapp || "-"}`,
      "",
      "Sobre o projeto:",
      c.mensagem || "-",
      "",
      "--",
      `Enviado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })} (horário de Cuiabá)`,
      `IP: ${request.headers.get("CF-Connecting-IP") || "?"} · País: ${request.cf?.country || "?"}`,
      "Responda este e-mail para falar direto com o cliente.",
    ].join("\r\n");

    const raw = montarMime({
      from: env.FROM,
      fromNome: "Site AXIAL",
      to: env.TO,
      replyTo: c.email,
      assunto: `Novo contato: ${c.nome}${c.empresa ? ` (${c.empresa})` : ""}`,
      texto,
    });

    try {
      await env.EMAIL.send(new EmailMessage(env.FROM, env.TO, raw));
    } catch (err) {
      console.error("Falha ao enviar e-mail:", err?.message || err);
      return json({ ok: false, erro: "Não foi possível enviar agora. Fale com a gente pelo WhatsApp." }, 502);
    }

    return json({ ok: true });
  },
};

function json(corpo, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Remove quebras de linha: impede que alguém injete cabeçalhos extras (ex.: Bcc) pelo formulário
const limpa = (s) => String(s).replace(/[\r\n]+/g, " ");

const b64 = (s) => {
  let bin = "";
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};

// Cabeçalho com acentos precisa da codificação RFC 2047: =?UTF-8?B?...?=
const cabecalhoUtf8 = (s) => `=?UTF-8?B?${b64(limpa(s))}?=`;

function montarMime({ from, fromNome, to, replyTo, assunto, texto }) {
  const corpo = b64(texto).replace(/.{1,76}/g, "$&\r\n");
  return [
    `From: ${cabecalhoUtf8(fromNome)} <${from}>`,
    `To: <${to}>`,
    `Reply-To: <${limpa(replyTo)}>`,
    `Subject: ${cabecalhoUtf8(assunto)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@agenciaaxial.com.br>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    corpo,
  ].join("\r\n");
}
