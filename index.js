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

// Sua chave PIX criada no Asaas
const ASAAS_PIX_KEY =
  process.env.ASAAS_PIX_KEY ||
  "79b96cef-1cce-4c36-a5a6-c0e2cbf4c826";

const ASAAS_API_URL = "https://api.asaas.com/v3";

// ======================================================
// VALIDAÇÕES
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
  console.warn("AVISO: TELEGRAM_GROUP_ID não configurado.");
}

if (!ASAAS_WEBHOOK_TOKEN) {
  console.warn("AVISO: ASAAS_WEBHOOK_TOKEN não configurado.");
}

// ======================================================
// MEMÓRIA TEMPORÁRIA
// ======================================================

// QR Code ID -> Telegram ID
//
// Exemplo:
// "9bea9bcd..." => "123456789"
//
// IMPORTANTE:
// Essa estrutura é suficiente para testar.
// Depois vamos trocar por banco de dados para sobreviver
// a reinícios do Render.
const qrCodeUsuarios = new Map();

// Telegram ID -> QR Code atual
const usuarioQrCodeAtual = new Map();

// QR Codes que já tiveram acesso liberado.
// Evita liberar duas vezes pelo mesmo evento.
const qrCodesLiberados = new Set();

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
// EXPRESS
// ======================================================

const app = express();

app.use(express.json());

// ======================================================
// STATUS
// ======================================================

app.get("/", (req, res) => {
  res.status(200).send("PROMATCH Bot online.");
});

// ======================================================
// CRIAR QR CODE PIX ESTÁTICO
// ======================================================

async function criarQrCodePix(telegramId) {

  const response = await asaas.post(
    "/pix/qrCodes/static",
    {
      addressKey: ASAAS_PIX_KEY,

      description:
        "PROMATCH STARTER",

      value:
        49.90,

      format:
        "ALL",

      // QR exclusivo para uma única assinatura
      allowsMultiplePayments:
        false,

      // 30 minutos
      expirationSeconds:
        1800,

      externalReference:
        `telegram_${telegramId}`
    }
  );

  return response.data;
}

// ======================================================
// CONSULTAR PAGAMENTOS DO QR CODE
// ======================================================

async function consultarPagamentosQrCode(
  pixQrCodeId
) {

  const response = await asaas.get(
    "/payments",
    {
      params: {
        pixQrCodeId:
          pixQrCodeId
      }
    }
  );

  return response.data;
}

// ======================================================
// GERAR CONVITE INDIVIDUAL
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
// LIBERAR ACESSO
// ======================================================

async function liberarAcesso(
  telegramId,
  pixQrCodeId
) {

  // Evita duplicidade de liberação
  if (
    pixQrCodeId &&
    qrCodesLiberados.has(
      pixQrCodeId
    )
  ) {

    console.log(
      `Acesso já liberado para QR Code ${pixQrCodeId}`
    );

    return;
  }

  const inviteLink =
    await gerarConviteGrupo();

  await bot.sendMessage(
    telegramId,
    `✅ *Pagamento confirmado!*

Sua assinatura *PROMATCH STARTER* está ativa.

Você já pode acessar nossa área exclusiva.

Clique abaixo para entrar:`,
    {
      parse_mode:
        "Markdown",

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

  if (pixQrCodeId) {

    qrCodesLiberados.add(
      pixQrCodeId
    );

  }

  console.log(
    `Acesso liberado para Telegram ${telegramId}`
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

      // ==================================================
      // STARTER
      // ==================================================

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

      // ==================================================
      // GERAR PIX
      // ==================================================

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

        const qrCode =
          await criarQrCodePix(
            telegramId
          );

        if (
          !qrCode ||
          !qrCode.id ||
          !qrCode.payload
        ) {

          console.error(
            "Resposta inesperada do QR Code:",
            qrCode
          );

          throw new Error(
            "Asaas não retornou id/payload do QR Code."
          );
        }

        console.log(
          `QR Code criado: ${qrCode.id}`
        );

        // Salva vínculo:
        // QR Code -> Telegram
        qrCodeUsuarios.set(
          qrCode.id,
          String(telegramId)
        );

        usuarioQrCodeAtual.set(
          String(telegramId),
          qrCode.id
        );

        await bot.sendMessage(
          chatId,
          `💠 *Pagamento PIX*

⭐ Plano:
*STARTER*

💰 Valor:
*R$ 49,90*

⏱ Este PIX é válido por aproximadamente *30 minutos*.

Copie o código PIX abaixo:

\`${qrCode.payload}\`

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
                      `verificarqr_${qrCode.id}`
                  }
                ],
                [
                  {
                    text:
                      "🔄 GERAR NOVO PIX",

                    callback_data:
                      "gerar_pix"
                  }
                ]
              ]
            }
          }
        );

        return;
      }

      // ==================================================
      // VERIFICAR QR CODE
      // ==================================================

      if (
        query.data.startsWith(
          "verificarqr_"
        )
      ) {

        const pixQrCodeId =
          query.data.replace(
            "verificarqr_",
            ""
          );

        // Segurança:
        // o QR precisa ter sido gerado por esse usuário
        const donoDoQr =
          qrCodeUsuarios.get(
            pixQrCodeId
          );

        if (
          donoDoQr &&
          donoDoQr !==
            String(telegramId)
        ) {

          await bot.sendMessage(
            chatId,
            `❌ Este pagamento não pertence ao seu usuário.`
          );

          return;
        }

        const resultado =
          await consultarPagamentosQrCode(
            pixQrCodeId
          );

        const pagamentos =
          Array.isArray(
            resultado?.data
          )
            ? resultado.data
            : [];

        const pagamentoRecebido =
          pagamentos.find(
            (pagamento) =>
              pagamento.status ===
                "RECEIVED" ||
              pagamento.status ===
                "CONFIRMED"
          );

        if (
          pagamentoRecebido
        ) {

          await liberarAcesso(
            telegramId,
            pixQrCodeId
          );

          return;
        }

        await bot.sendMessage(
          chatId,
          `⏳ *Pagamento ainda não identificado.*

Caso tenha acabado de realizar o PIX, aguarde alguns segundos e tente novamente.`,
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
                      `verificarqr_${pixQrCodeId}`
                  }
                ]
              ]
            }
          }
        );

        return;
      }

      // ==================================================
      // VOLTAR
      // ==================================================

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

      } catch (
        telegramError
      ) {

        console.error(
          "Erro Telegram:",
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

      // ==================================================
      // VALIDAR TOKEN DO ASAAS
      // ==================================================

      const receivedToken =
        req.headers[
          "asaas-access-token"
        ];

      if (
        !ASAAS_WEBHOOK_TOKEN
      ) {

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
          "Webhook rejeitado: token inválido."
        );

        return res
          .status(401)
          .send(
            "Unauthorized."
          );
      }

      // ==================================================
      // EVENTO AUTORIZADO
      // ==================================================

      const event =
        req.body;

      console.log(
        `Webhook autorizado: ${event?.event}`
      );

      // Respondemos imediatamente ao Asaas
      res.sendStatus(200);

      // ==================================================
      // SÓ EVENTOS DE PAGAMENTO
      // ==================================================

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

      // ==================================================
      // PEGAR ID DO QR CODE
      // ==================================================

      const pixQrCodeId =
        payment.pixQrCodeId;

      if (!pixQrCodeId) {

        console.log(
          "Pagamento recebido sem pixQrCodeId."
        );

        return;
      }

      console.log(
        `Pagamento recebido para QR Code ${pixQrCodeId}`
      );

      // ==================================================
      // DESCOBRIR TELEGRAM DONO DO QR
      // ==================================================

      let telegramId =
        qrCodeUsuarios.get(
          pixQrCodeId
        );

      /*
       * Tentativa adicional:
       *
       * Como criamos o QR Code com externalReference
       * telegram_ID, verificamos também se o evento
       * trouxe essa referência.
       */
      if (
        !telegramId &&
        payment.externalReference &&
        payment.externalReference.startsWith(
          "telegram_"
        )
      ) {

        telegramId =
          payment.externalReference.replace(
            "telegram_",
            ""
          );

      }

      if (!telegramId) {

        console.warn(
          `QR Code ${pixQrCodeId} não encontrado na memória do bot.`
        );

        /*
         * Isso pode acontecer caso o Render reinicie
         * depois de gerar o QR Code e antes do pagamento.
         *
         * Quando adicionarmos banco de dados,
         * esse problema deixa de existir.
         */

        return;
      }

      // ==================================================
      // LIBERAR ACESSO
      // ==================================================

      await liberarAcesso(
        telegramId,
        pixQrCodeId
      );

    } catch (error) {

      console.error(
        "Erro no Webhook Asaas:",
        error.response?.data ||
        error.message
      );

      if (
        !res.headersSent
      ) {

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
// ERROS GERAIS
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
