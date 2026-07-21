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

// API Asaas Produção
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

// ======================================================
// CLIENTE ASAAS
// ======================================================

const asaas = axios.create({
  baseURL: ASAAS_API_URL,
  headers: {
    access_token: ASAAS_API_KEY,
    "Content-Type": "application/json"
  }
});

// ======================================================
// TELEGRAM
// ======================================================

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
  polling: true
});

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
// FUNÇÃO: CRIAR CLIENTE ASAAS
// ======================================================

async function criarClienteAsaas(usuario) {

  const telegramId = usuario.id;

  const nome =
    [usuario.first_name, usuario.last_name]
      .filter(Boolean)
      .join(" ") ||
    `Telegram ${telegramId}`;

  const response = await asaas.post(
    "/customers",
    {
      name: nome,

      // Serve para relacionar o cliente
      // com nosso usuário do Telegram.
      externalReference: `telegram_${telegramId}`,

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

  const hoje = new Date();

  // Cobrança vence hoje.
  const dueDate =
    hoje.toISOString().split("T")[0];

  const response = await asaas.post(
    "/payments",
    {
      customer: customerId,

      billingType: "PIX",

      value: 49.90,

      dueDate: dueDate,

      description:
        "PROMATCH STARTER - assinatura mensal",

      externalReference:
        `telegram_${telegramId}`
    }
  );

  return response.data;
}

// ======================================================
// FUNÇÃO: BUSCAR QR CODE PIX
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

async function consultarPagamento(paymentId) {

  const response = await asaas.get(
    `/payments/${paymentId}`
  );

  return response.data;
}

// ======================================================
// FUNÇÃO: GERAR CONVITE TELEGRAM
// ======================================================

async function gerarConviteGrupo() {

  if (!TELEGRAM_GROUP_ID) {
    throw new Error(
      "TELEGRAM_GROUP_ID não configurado."
    );
  }

  const invite =
    await bot.createChatInviteLink(
      TELEGRAM_GROUP_ID,
      {
        member_limit: 1
      }
    );

  return invite.invite_link;
}

// ======================================================
// FUNÇÃO: LIBERAR ACESSO
// ======================================================

async function liberarAcesso(telegramId) {

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
              url: inviteLink
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

});

// ======================================================
// /ID
// ======================================================

bot.onText(/\/id/, async (msg) => {

  const chatId = msg.chat.id;

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

});

// ======================================================
// CALLBACK DOS BOTÕES
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

        // ------------------------------
        // 1. CRIAR CLIENTE
        // ------------------------------

        const cliente =
          await criarClienteAsaas(
            query.from
          );

        console.log(
          "Cliente Asaas criado:",
          cliente.id
        );

        // ------------------------------
        // 2. CRIAR COBRANÇA
        // ------------------------------

        const cobranca =
          await criarCobrancaPix(
            cliente.id,
            telegramId
          );

        console.log(
          "Cobrança criada:",
          cobranca.id
        );

        // ------------------------------
        // 3. BUSCAR PIX
        // ------------------------------

        const pix =
          await buscarPix(
            cobranca.id
          );

        console.log(
          "PIX gerado para:",
          telegramId
        );

        // ------------------------------
        // 4. ENVIAR PIX
        // ------------------------------

        await bot.sendMessage(
          chatId,
          `💠 *Pagamento PIX*

⭐ Plano: *STARTER*

💰 Valor:
*R$ 49,90*

Copie o código PIX abaixo:

\`${pix.payload}\`

Depois de realizar o pagamento, clique em:

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

      // ==================================================
      // VERIFICAR PAGAMENTO
      // ==================================================

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
          "Status pagamento:",
          pagamento.status
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

      const event =
        req.body;

      console.log(
        "Webhook Asaas:",
        event?.event
      );

      // Respondemos rápido
      res.sendStatus(200);

      // Só interessa pagamento confirmado/recebido
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

      const reference =
        payment?.externalReference;

      if (
        !reference ||
        !reference.startsWith(
          "telegram_"
        )
      ) {

        console.log(
          "Pagamento sem Telegram ID."
        );

        return;
      }

      const telegramId =
        reference.replace(
          "telegram_",
          ""
        );

      console.log(
        "Pagamento confirmado para Telegram:",
        telegramId
      );

      await liberarAcesso(
        telegramId
      );

    } catch (error) {

      console.error(
        "Erro no Webhook:",
        error.response?.data ||
        error.message
      );

    }

  }
);

// ======================================================
// ERROS TELEGRAM
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
