require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID;
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

// ======================================================
// VALIDAÇÕES DE AMBIENTE
// ======================================================

if (!TELEGRAM_BOT_TOKEN) {
  console.error("ERRO: TELEGRAM_BOT_TOKEN não configurado.");
  process.exit(1);
}

// Por enquanto não vamos obrigar ASAAS_API_KEY e TELEGRAM_GROUP_ID,
// porque ainda estamos testando o bot e os botões.

// ======================================================
// TELEGRAM BOT
// ======================================================

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
  polling: true
});

console.log("PROMATCH Bot iniciado.");

// ======================================================
// SERVIDOR EXPRESS
// ======================================================

const app = express();

app.use(express.json());

// ======================================================
// ROTA DE STATUS
// ======================================================

app.get("/", (req, res) => {
  res.status(200).send("PROMATCH Bot online.");
});

// ======================================================
// COMANDO /START
// ======================================================

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(
      chatId,
      `🚀 *Bem-vindo à PROMATCH!*

Tenha acesso às nossas projeções exclusivas de E-Soccer.

⭐ *STARTER*
💰 *R$ 49,90/mês*

Clique abaixo para iniciar sua assinatura.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⭐ STARTER — R$ 49,90",
                callback_data: "assinar_starter"
              }
            ]
          ]
        }
      }
    );
  } catch (error) {
    console.error("Erro no /start:", error.message);
  }
});

// ======================================================
// COMANDO /ID
// Serve para descobrir o ID de um chat/grupo
// ======================================================

bot.onText(/\/id/, async (msg) => {
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;

  try {
    await bot.sendMessage(
      chatId,
      `🔎 *Informações deste chat*

ID:
\`${chatId}\`

Tipo:
\`${chatType}\``,
      {
        parse_mode: "Markdown"
      }
    );
  } catch (error) {
    console.error("Erro no /id:", error.message);
  }
});

// ======================================================
// CLIQUES NOS BOTÕES
// ======================================================

bot.on("callback_query", async (query) => {
  const chatId = query.message?.chat?.id;
  const telegramId = query.from.id;

  if (!chatId) {
    return;
  }

  try {
    // Remove o ícone de carregamento do botão
    await bot.answerCallbackQuery(query.id);

    // ==================================================
    // BOTÃO STARTER
    // ==================================================

    if (query.data === "assinar_starter") {
      await bot.sendMessage(
        chatId,
        `💠 *PROMATCH STARTER*

💰 Valor: *R$ 49,90*
📅 Acesso mensal

Clique abaixo para gerar seu pagamento via PIX.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "💠 GERAR PIX — R$ 49,90",
                  callback_data: "gerar_pix"
                }
              ],
              [
                {
                  text: "⬅️ VOLTAR",
                  callback_data: "voltar_inicio"
                }
              ]
            ]
          }
        }
      );

      return;
    }

    // ==================================================
    // BOTÃO GERAR PIX
    // ==================================================

    if (query.data === "gerar_pix") {
      await bot.sendMessage(
        chatId,
        `⏳ *Gerando seu pagamento PIX...*

Aguarde alguns segundos.`,
        {
          parse_mode: "Markdown"
        }
      );

      console.log(
        `Solicitação de PIX recebida. Telegram ID: ${telegramId}`
      );

      // Nesta etapa ainda não estamos criando
      // a cobrança real no Asaas.
      //
      // No próximo passo, este botão fará:
      //
      // 1. Criar/identificar cliente no Asaas
      // 2. Criar cobrança PIX de R$ 49,90
      // 3. Salvar Telegram ID no externalReference
      // 4. Buscar o PIX copia e cola
      // 5. Enviar para o usuário

      await bot.sendMessage(
        chatId,
        `✅ *Usuário identificado corretamente.*

Seu Telegram ID:

\`${telegramId}\`

A estrutura do bot está funcionando.

No próximo passo, este botão será conectado à API do Asaas para gerar o PIX automaticamente.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "⬅️ VOLTAR AO PLANO",
                  callback_data: "assinar_starter"
                }
              ]
            ]
          }
        }
      );

      return;
    }

    // ==================================================
    // BOTÃO VOLTAR
    // ==================================================

    if (query.data === "voltar_inicio") {
      await bot.sendMessage(
        chatId,
        `🚀 *PROMATCH*

Escolha seu plano:

⭐ *STARTER*
💰 *R$ 49,90/mês*`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "⭐ STARTER — R$ 49,90",
                  callback_data: "assinar_starter"
                }
              ]
            ]
          }
        }
      );

      return;
    }

    // ==================================================
    // CALLBACK NÃO RECONHECIDO
    // ==================================================

    console.log(
      `Callback não reconhecido: ${query.data}`
    );

  } catch (error) {
    console.error(
      "Erro ao processar botão:",
      error.response?.data || error.message
    );

    try {
      await bot.sendMessage(
        chatId,
        `❌ Ocorreu um problema ao processar sua solicitação.

Tente novamente em alguns instantes.`
      );
    } catch (telegramError) {
      console.error(
        "Erro ao enviar mensagem de erro:",
        telegramError.message
      );
    }
  }
});

// ======================================================
// WEBHOOK ASAAS
// ======================================================

app.post("/webhook/asaas", async (req, res) => {
  try {
    const event = req.body;

    console.log(
      "Webhook recebido do Asaas:",
      event?.event || "evento não identificado"
    );

    // Respondemos imediatamente para o Asaas
    res.sendStatus(200);

    // No próximo passo adicionaremos aqui:
    //
    // PAYMENT_RECEIVED
    // ↓
    // externalReference
    // ↓
    // Telegram ID
    // ↓
    // criar convite do grupo
    // ↓
    // enviar convite ao usuário

  } catch (error) {
    console.error(
      "Erro no webhook Asaas:",
      error.message
    );

    if (!res.headersSent) {
      res.sendStatus(500);
    }
  }
});

// ======================================================
// ERROS DO TELEGRAM
// ======================================================

bot.on("polling_error", (error) => {
  console.error(
    "Telegram polling error:",
    error.message
  );
});

// ======================================================
// ERROS GERAIS DO PROCESSO
// ======================================================

process.on("unhandledRejection", (reason) => {
  console.error(
    "Unhandled Rejection:",
    reason
  );
});

process.on("uncaughtException", (error) => {
  console.error(
    "Uncaught Exception:",
    error
  );
});

// ======================================================
// INICIAR SERVIDOR
// ======================================================

app.listen(PORT, () => {
  console.log(
    `Servidor PROMATCH rodando na porta ${PORT}`
  );
});
