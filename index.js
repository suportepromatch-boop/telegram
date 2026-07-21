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

if (!TELEGRAM_BOT_TOKEN) {
  console.error("ERRO: TELEGRAM_BOT_TOKEN não configurado.");
  process.exit(1);
}

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

// Rota simples para verificar se o servidor está funcionando
app.get("/", (req, res) => {
  res.status(200).send("PROMATCH Bot online.");
});

// ======================================================
// /START
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
// CLIQUES NOS BOTÕES
// ======================================================

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id;

  try {
    // Remove o "carregando" do botão
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

Vamos gerar seu pagamento PIX.

Clique abaixo para continuar.`,
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
    // GERAR PIX
    // ==================================================

    if (query.data === "gerar_pix") {
      await bot.sendMessage(
        chatId,
        `⏳ Gerando seu pagamento PIX...

Aguarde alguns segundos.`
      );

      // Nesta primeira versão deixamos preparado.
      // No próximo passo entra a integração com a API do Asaas.

      console.log(
        `Solicitação de PIX - Telegram ID: ${telegramId}`
      );

      await bot.sendMessage(
        chatId,
        `⚙️ *Integração PIX em configuração.*

Seu Telegram ID foi identificado corretamente:

\`${telegramId}\`

No próximo passo, esta ação criará automaticamente sua cobrança de R$ 49,90 no Asaas.`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    // ==================================================
    // VOLTAR
    // ==================================================

    if (query.data === "voltar_inicio") {
      await bot.sendMessage(
        chatId,
        `⭐ *PROMATCH STARTER*

💰 R$ 49,90/mês

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

      return;
    }

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
      event.event
    );

    // Importante:
    // responder rapidamente ao Asaas
    res.sendStatus(200);

    // A lógica de confirmação será adicionada
    // quando conectarmos a API do Asaas.

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
// INICIAR SERVIDOR
// ======================================================

app.listen(PORT, () => {
  console.log(
    `Servidor PROMATCH rodando na porta ${PORT}`
  );
});