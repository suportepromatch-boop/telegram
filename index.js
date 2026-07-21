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
const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;

const ASAAS_API_URL = "https://api.asaas.com/v3";

// ======================================================
// VALIDAÇÃO DAS VARIÁVEIS
// ======================================================

if (!TELEGRAM_BOT_TOKEN) {
  console.error("ERRO: TELEGRAM_BOT_TOKEN não configurado.");
  process.exit(1);
}

if (!ASAAS_API_KEY) {
  console.error("ERRO: ASAAS_API_KEY não configurada.");
  process.exit(1);
}

if (!TELEGRAM_GROUP_ID) {
  console.warn(
    "AVISO: TELEGRAM_GROUP_ID ainda não configurado."
  );
}

if (!ASAAS_WEBHOOK_TOKEN) {
  console.warn(
    "AVISO: ASAAS_WEBHOOK_TOKEN ainda não configurado."
  );
}

// ======================================================
// CLIENTE ASAAS
// ======================================================

const asaas = axios.create({
  baseURL: ASAAS_API_URL,

  headers: {
    access_token: ASAAS_API_KEY,
    "Content-Type": "application/json"
  },

  timeout: 15000
});

// ======================================================
// TELEGRAM BOT
// ======================================================

const bot = new TelegramBot(
  TELEGRAM_BOT_TOKEN,
  {
    polling: true
  }
);

console.log("PROMATCH Bot iniciado.");

// ======================================================
// SERVIDOR EXPRESS
// ======================================================

const app = express();

app.use(express.json());

// ======================================================
// STATUS
// ======================================================

app.get("/", (req, res) => {
  res
    .status(200)
    .send("PROMATCH Bot online.");
});

// ======================================================
// FUNÇÃO AUXILIAR: DATA YYYY-MM-DD
// ======================================================

function dataHoje() {
  return new Date()
    .toISOString()
    .split("T")[0];
}

// ======================================================
// FUNÇÃO: CRIAR CLIENTE NO ASAAS
// ======================================================

async function criarClienteAsaas(usuario) {

  const telegramId = usuario.id;

  const nome =
    [
      usuario.first_name,
      usuario.last_name
    ]
      .filter(Boolean)
      .join(" ") ||
    `Telegram ${telegramId}`;

  const response = await asaas.post(
    "/customers",
    {
      name: nome,

      externalReference:
        `telegram_${telegramId}`,

      notificationDisabled: true
    }
  );

  return response.data;
}

// ======================================================
// FUNÇÃO: CRIAR COBRANÇA PIX
// ======================================================

async function criarCobrancaPix(
  customerId,
  telegramId
) {

  const response = await asaas.post(
    "/payments",
    {
      customer: customerId,

      billingType: "PIX",

      value: 49.90,

      dueDate: dataHoje(),

      description:
        "PROMATCH STARTER - assinatura mensal",

      externalReference:
        `telegram_${telegramId}`
    }
  );

  return response.data;
}

// ======================================================
// FUNÇÃO: BUSCAR PIX COPIA E COLA
// ======================================================

async function buscarPix(paymentId) {

  const response = await asaas.get(
    `/payments/${paymentId}/pixQrCode`
  );

  return response.data;
}

// ======================================================
// FUNÇÃO: CONSULTAR PAGAMENTO
// ======================================================

async function consultarPagamento(
  paymentId
) {

  const response = await asaas.get(
    `/payments/${paymentId}`
  );

  return response.data;
}

// ======================================================
// FUNÇÃO: GERAR CONVITE DO GRUPO
// ======================================================

async function gerarConviteGrupo() {

  if (!TELEGRAM_GROUP_ID) {
    throw new Error(
      "TELEGRAM_GROUP_ID não configurado."
    );
  }

  const convite =
    await bot.createChatInviteLink(
      TELEGRAM_GROUP_ID,
      {
        member_limit: 1
      }
    );

  return convite.invite_link;
}

// ======================================================
// FUNÇÃO: LIBERAR ACESSO
// ======================================================

async function liberarAcesso(
  telegramId
) {

  const inviteLink =
    await gerarConviteGrupo();

  await bot.sendMessage(
    telegramId,
    `✅ *Pagamento confirmado!*

Sua assinatura *PROMATCH STARTER* está ativa.

Você já pode acessar nossa área exclusiva.

Clique abaixo para entrar:`,
    {
      parse_mode: "Markdown",

      reply_markup: {
        inline_keyboard: [
          [
            {
              text:
                "🚀 ENTRAR NO GRUPO",

              url:
                inviteLink
            }
          ]
        ]
      }
    }
  );
}

// ======================================================
// /START
// ======================================================

bot.onText(
  /\/start/,
  async (msg) => {

    const chatId =
      msg.chat.id;

    try {

      await bot.sendMessage(
        chatId,
        `🚀 *Bem-vindo à PROMATCH!*

Tenha acesso às nossas projeções exclusivas de E-Soccer.

⭐ *STARTER*
💰 *R$ 49,90/mês*

Clique abaixo para iniciar sua assinatura.`,
        {
          parse_mode:
            "Markdown",

          reply_markup: {
            inline_keyboard: [
              [
                {
                  text:
                    "⭐ STARTER — R$ 49,90",

                  callback_data:
                    "assinar_starter"
                }
              ]
            ]
          }
        }
      );

    } catch (error) {

      console.error(
        "Erro no /start:",
        error.message
      );

    }

  }
);

// ======================================================
// /ID
// ======================================================

bot.onText(
  /\/id/,
  async (msg) => {

    const chatId =
      msg.chat.id;

    const chatType =
      msg.chat.type;

    try {

      await bot.sendMessage(
        chatId,
        `🔎 *Informações deste chat*

ID:
\`${chatId}\`

Tipo:
\`${chatType}\``,
        {
          parse_mode:
            "Markdown"
        }
      );

    } catch (error) {

      console.error(
        "Erro no /id:",
        error.message
      );

    }

  }
);

// ======================================================
// CALLBACKS
// ======================================================

bot.on(
  "callback_query",
  async (query) => {

    const chatId =
      query.message?.chat?.id;

    const telegramId =
      query.from.id;

    if (!chatId) {
      return;
    }

    try {

      await bot.answerCallbackQuery(
        query.id
      );

      // ================================================
      // STARTER
      // ================================================

      if (
        query.data ===
        "assinar_starter"
      ) {

        await bot.sendMessage(
          chatId,
          `💠 *PROMATCH STARTER*

💰 Valor: *R$ 49,90*
📅 Acesso mensal

Clique abaixo para gerar seu pagamento via PIX.`,
          {
            parse_mode:
              "Markdown",

            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "💠 GERAR PIX — R$ 49,90",

                    callback_data:
                      "gerar_pix"
                  }
                ],
                [
                  {
                    text:
                      "⬅️ VOLTAR",

                    callback_data:
                      "voltar_inicio"
                  }
                ]
              ]
            }
          }
        );

        return;
      }

      // ================================================
      // GERAR PIX
      // ================================================

      if (
        query.data ===
        "gerar_pix"
      ) {

        await bot.sendMessage(
          chatId,
          `⏳ *Gerando seu pagamento PIX...*

Aguarde alguns segundos.`,
          {
            parse_mode:
              "Markdown"
          }
        );

        // ==============================================
        // CRIAR CLIENTE ASAAS
        // ==============================================

        const cliente =
          await criarClienteAsaas(
            query.from
          );

        console.log(
          `Cliente Asaas criado: ${cliente.id}`
        );

        // ==============================================
        // CRIAR COBRANÇA
        // ==============================================

        const cobranca =
          await criarCobrancaPix(
            cliente.id,
            telegramId
          );

        console.log(
          `Cobrança criada: ${cobranca.id}`
        );

        // ==============================================
        // BUSCAR PIX
        // ==============================================

        const pix =
          await buscarPix(
            cobranca.id
          );

        console.log(
          `PIX criado para Telegram ${telegramId}`
        );

        // ==============================================
        // ENVIAR PIX
        // ==============================================

        await bot.sendMessage(
          chatId,
          `💠 *Pagamento PIX*

⭐ Plano:
*STARTER*

💰 Valor:
*R$ 49,90*

Copie o código PIX abaixo:

\`${pix.payload}\`

Após realizar o pagamento, clique em:

*JÁ PAGUEI*`,
          {
            parse_mode:
              "Markdown",

            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "✅ JÁ PAGUEI",

                    callback_data:
                      `verificar_${cobranca.id}`
                  }
                ],
                [
                  {
                    text:
                      "⬅️ VOLTAR",

                    callback_data:
                      "voltar_inicio"
                  }
                ]
              ]
            }
          }
        );

        return;
      }

      // ================================================
      // VERIFICAR PAGAMENTO
      // ================================================

      if (
        query.data.startsWith(
          "verificar_"
        )
      ) {

        const paymentId =
          query.data.replace(
            "verificar_",
            ""
          );

        const pagamento =
          await consultarPagamento(
            paymentId
          );

        console.log(
          `Status pagamento ${paymentId}: ${pagamento.status}`
        );

        if (
          pagamento.status ===
            "RECEIVED" ||
          pagamento.status ===
            "CONFIRMED"
        ) {

          await liberarAcesso(
            telegramId
          );

          return;
        }

        await bot.sendMessage(
          chatId,
          `⏳ *Pagamento ainda não identificado.*

Caso você tenha acabado de realizar o PIX, aguarde alguns segundos e tente novamente.`,
          {
            parse_mode:
              "Markdown",

            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "🔄 VERIFICAR NOVAMENTE",

                    callback_data:
                      `verificar_${paymentId}`
                  }
                ]
              ]
            }
          }
        );

        return;
      }

      // ================================================
      // VOLTAR
      // ================================================

      if (
        query.data ===
        "voltar_inicio"
      ) {

        await bot.sendMessage(
          chatId,
          `🚀 *PROMATCH*

Escolha seu plano:

⭐ *STARTER*
💰 *R$ 49,90/mês*`,
          {
            parse_mode:
              "Markdown",

            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "⭐ STARTER — R$ 49,90",

                    callback_data:
                      "assinar_starter"
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
        error.response?.data ||
        error.message
      );

      try {

        await bot.sendMessage(
          chatId,
          `❌ Não foi possível concluir esta operação.

Tente novamente em alguns instantes.`
        );

      } catch (telegramError) {

        console.error(
          "Erro ao enviar mensagem:",
          telegramError.message
        );

      }

    }

  }
);

// ======================================================
// WEBHOOK ASAAS
// ======================================================

app.post(
  "/webhook/asaas",
  async (req, res) => {

    try {

      // ================================================
      // VALIDAR TOKEN DO WEBHOOK
      // ================================================

      const receivedToken =
        req.headers[
          "asaas-access-token"
        ];

      if (!ASAAS_WEBHOOK_TOKEN) {

        console.error(
          "ASAAS_WEBHOOK_TOKEN não configurado."
        );

        return res
          .status(500)
          .send(
            "Webhook token not configured."
          );
      }

      if (
        !receivedToken ||
        receivedToken !==
          ASAAS_WEBHOOK_TOKEN
      ) {

        console.warn(
          "Webhook bloqueado: token inválido."
        );

        return res
          .status(401)
          .send(
            "Unauthorized."
          );
      }

      // ================================================
      // TOKEN VÁLIDO
      // ================================================

      const event =
        req.body;

      console.log(
        `Webhook autorizado: ${event?.event}`
      );

      /*
       * Respondemos rapidamente ao Asaas.
       *
       * Depois dessa resposta, continuamos
       * processando o evento.
       */

      res.sendStatus(200);

      // ================================================
      // EVENTOS QUE NOS INTERESSAM
      // ================================================

      if (
        event.event !==
          "PAYMENT_RECEIVED" &&
        event.event !==
          "PAYMENT_CONFIRMED"
      ) {

        return;
      }

      const payment =
        event.payment;

      if (!payment) {

        console.warn(
          "Webhook sem objeto payment."
        );

        return;
      }

      // ================================================
      // EXTERNAL REFERENCE
      // ================================================

      const reference =
        payment.externalReference;

      if (
        !reference ||
        !reference.startsWith(
          "telegram_"
        )
      ) {

        console.warn(
          "Pagamento sem externalReference de Telegram."
        );

        return;
      }

      // ================================================
      // IDENTIFICAR TELEGRAM ID
      // ================================================

      const telegramId =
        reference.replace(
          "telegram_",
          ""
        );

      console.log(
        `Pagamento confirmado para Telegram ${telegramId}`
      );

      // ================================================
      // LIBERAR GRUPO
      // ================================================

      await liberarAcesso(
        telegramId
      );

    } catch (error) {

      console.error(
        "Erro no Webhook Asaas:",
        error.response?.data ||
        error.message
      );

      /*
       * Se já respondemos 200 acima,
       * não podemos responder novamente.
       */

      if (!res.headersSent) {

        res
          .status(500)
          .send(
            "Internal Server Error"
          );

      }

    }

  }
);

// ======================================================
// ERROS DO TELEGRAM
// ======================================================

bot.on(
  "polling_error",
  (error) => {

    console.error(
      "Telegram polling error:",
      error.message
    );

  }
);

// ======================================================
// ERROS NÃO TRATADOS
// ======================================================

process.on(
  "unhandledRejection",
  (reason) => {

    console.error(
      "Unhandled Rejection:",
      reason
    );

  }
);

process.on(
  "uncaughtException",
  (error) => {

    console.error(
      "Uncaught Exception:",
      error
    );

  }
);

// ======================================================
// SERVIDOR
// ======================================================

app.listen(
  PORT,
  () => {

    console.log(
      `Servidor PROMATCH rodando na porta ${PORT}`
    );

  }
);
