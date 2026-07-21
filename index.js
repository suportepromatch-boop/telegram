require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID;

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;
const ASAAS_PIX_KEY = process.env.ASAAS_PIX_KEY;

const DATABASE_URL = process.env.DATABASE_URL;

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

if (!ASAAS_PIX_KEY) {
  console.error("ERRO: ASAAS_PIX_KEY não configurada.");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não configurada.");
  process.exit(1);
}

if (!TELEGRAM_GROUP_ID) {
  console.warn("AVISO: TELEGRAM_GROUP_ID não configurado.");
}

if (!ASAAS_WEBHOOK_TOKEN) {
  console.warn("AVISO: ASAAS_WEBHOOK_TOKEN não configurado.");
}

// ======================================================
// POSTGRESQL
// ======================================================

const db = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ======================================================
// INICIALIZAR BANCO
// ======================================================

async function inicializarBanco() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,

      telegram_id BIGINT UNIQUE NOT NULL,
      telegram_username TEXT,
      first_name TEXT,

      plan TEXT NOT NULL DEFAULT 'STARTER',
      status TEXT NOT NULL DEFAULT 'PENDING',

      pix_qr_code_id TEXT,
      payment_id TEXT,

      started_at TIMESTAMP,
      expires_at TIMESTAMP,
      last_payment_at TIMESTAMP,

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_pix_qr_code
    ON subscriptions (pix_qr_code_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status
    ON subscriptions (status);
  `);

  console.log("Banco de dados inicializado.");
}

// ======================================================
// MEMÓRIA TEMPORÁRIA
// ======================================================

// Mesmo com banco, mantemos cache em memória para respostas rápidas.

const qrCodeUsuarios = new Map();

const usuarioQrCodeAtual = new Map();

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
// TELEGRAM
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
// STATUS DO SERVIDOR
// ======================================================

app.get("/", (req, res) => {
  res
    .status(200)
    .send("PROMATCH Bot online.");
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
        pixQrCodeId
      }
    }
  );

  return response.data;
}

// ======================================================
// REGISTRAR QR CODE NO BANCO
// ======================================================

async function registrarQrCode(
  telegramUser,
  pixQrCodeId
) {
  const telegramId =
    telegramUser.id;

  await db.query(
    `
    INSERT INTO subscriptions (
      telegram_id,
      telegram_username,
      first_name,
      plan,
      status,
      pix_qr_code_id,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3,
      'STARTER',
      'PENDING',
      $4,
      NOW()
    )

    ON CONFLICT (telegram_id)

    DO UPDATE SET
      telegram_username =
        EXCLUDED.telegram_username,

      first_name =
        EXCLUDED.first_name,

      pix_qr_code_id =
        EXCLUDED.pix_qr_code_id,

      status =
        CASE
          WHEN subscriptions.status = 'ACTIVE'
          THEN subscriptions.status
          ELSE 'PENDING'
        END,

      updated_at =
        NOW()
    `,
    [
      telegramId,
      telegramUser.username || null,
      telegramUser.first_name || null,
      pixQrCodeId
    ]
  );

  console.log(
    `QR Code ${pixQrCodeId} registrado para Telegram ${telegramId}`
  );
}

// ======================================================
// BUSCAR TELEGRAM PELO QR CODE
// ======================================================

async function buscarTelegramPorQrCode(
  pixQrCodeId
) {
  const result = await db.query(
    `
    SELECT telegram_id
    FROM subscriptions
    WHERE pix_qr_code_id = $1
    LIMIT 1
    `,
    [
      pixQrCodeId
    ]
  );

  if (
    result.rows.length === 0
  ) {
    return null;
  }

  return String(
    result.rows[0].telegram_id
  );
}

// ======================================================
// BUSCAR ASSINATURA POR TELEGRAM
// ======================================================

async function buscarAssinatura(
  telegramId
) {
  const result = await db.query(
    `
    SELECT *
    FROM subscriptions
    WHERE telegram_id = $1
    LIMIT 1
    `,
    [
      telegramId
    ]
  );

  if (
    result.rows.length === 0
  ) {
    return null;
  }

  return result.rows[0];
}

// ======================================================
// MARCAR ASSINATURA ATIVA
// ======================================================

async function ativarAssinatura(
  telegramId,
  paymentId = null
) {
  await db.query(
    `
    UPDATE subscriptions

    SET
      status =
        'ACTIVE',

      started_at =
        COALESCE(
          started_at,
          NOW()
        ),

      last_payment_at =
        NOW(),

      expires_at =
        NOW() + INTERVAL '30 days',

      payment_id =
        COALESCE(
          $2,
          payment_id
        ),

      updated_at =
        NOW()

    WHERE telegram_id = $1
    `,
    [
      telegramId,
      paymentId
    ]
  );

  console.log(
    `Assinatura ativada para Telegram ${telegramId}`
  );
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
  pixQrCodeId,
  paymentId = null
) {
  // Evita processar duas vezes
  // na mesma execução do servidor.

  if (
    pixQrCodeId &&
    qrCodesLiberados.has(
      pixQrCodeId
    )
  ) {
    console.log(
      `QR Code ${pixQrCodeId} já processado nesta instância.`
    );

    return;
  }

  // Verifica banco antes de ativar novamente.

  const assinatura =
    await buscarAssinatura(
      telegramId
    );

  const jaAtivo =
    assinatura &&
    assinatura.status ===
      "ACTIVE" &&
    assinatura.expires_at &&
    new Date(
      assinatura.expires_at
    ) > new Date();

  // Ativa/renova por 30 dias.
  //
  // Por enquanto qualquer pagamento confirmado
  // redefine o vencimento para +30 dias a partir de agora.
  //
  // Depois podemos alterar para somar 30 dias
  // ao vencimento atual quando for renovação antecipada.

  await ativarAssinatura(
    telegramId,
    paymentId
  );

  if (
    pixQrCodeId
  ) {
    qrCodesLiberados.add(
      pixQrCodeId
    );
  }

  // Se já estava ativo, não precisamos
  // obrigatoriamente gerar outro convite.

  if (jaAtivo) {
    await bot.sendMessage(
      telegramId,
      `✅ *Pagamento confirmado!*

Sua assinatura *PROMATCH STARTER* foi renovada por mais 30 dias.`,
      {
        parse_mode:
          "Markdown"
      }
    );

    return;
  }

  const inviteLink =
    await gerarConviteGrupo();

  await bot.sendMessage(
    telegramId,
    `✅ *Pagamento confirmado!*

Sua assinatura *PROMATCH STARTER* está ativa.

Seu acesso foi liberado por *30 dias*.

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
// /MINHAASSINATURA
// ======================================================

bot.onText(
  /\/minhaassinatura/,
  async (msg) => {
    const telegramId =
      msg.from.id;

    try {
      const assinatura =
        await buscarAssinatura(
          telegramId
        );

      if (!assinatura) {
        await bot.sendMessage(
          telegramId,
          `Você ainda não possui uma assinatura cadastrada.

Use /start para conhecer o plano STARTER.`
        );

        return;
      }

      let vencimento =
        "Não definido";

      if (
        assinatura.expires_at
      ) {
        vencimento =
          new Date(
            assinatura.expires_at
          )
            .toLocaleDateString(
              "pt-BR",
              {
                timeZone:
                  "America/Sao_Paulo"
              }
            );
      }

      await bot.sendMessage(
        telegramId,
        `👤 *Minha assinatura*

⭐ Plano:
*${assinatura.plan}*

📌 Status:
*${assinatura.status}*

📅 Vencimento:
*${vencimento}*`,
        {
          parse_mode:
            "Markdown"
        }
      );

    } catch (error) {
      console.error(
        "Erro em /minhaassinatura:",
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
📅 Acesso por 30 dias

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

        // Cria QR Code individual.

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
            "Resposta inesperada do Asaas:",
            qrCode
          );

          throw new Error(
            "Asaas não retornou ID/payload do QR Code."
          );
        }

        console.log(
          `QR Code criado: ${qrCode.id}`
        );

        // Cache em memória.

        qrCodeUsuarios.set(
          qrCode.id,
          String(telegramId)
        );

        usuarioQrCodeAtual.set(
          String(telegramId),
          qrCode.id
        );

        // Banco permanente.

        await registrarQrCode(
          query.from,
          qrCode.id
        );

        await bot.sendMessage(
          chatId,
          `💠 *Pagamento PIX*

⭐ Plano:
*STARTER*

💰 Valor:
*R$ 49,90*

⏱ PIX válido por aproximadamente *30 minutos*.

Copie o código abaixo:

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
      // VERIFICAR PAGAMENTO
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

        // Descobre dono do QR.

        let donoDoQr =
          qrCodeUsuarios.get(
            pixQrCodeId
          );

        if (!donoDoQr) {
          donoDoQr =
            await buscarTelegramPorQrCode(
              pixQrCodeId
            );
        }

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
            pixQrCodeId,
            pagamentoRecebido.id
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

      } catch (telegramError) {
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
      // VALIDAR TOKEN
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
      // EVENTO
      // ==================================================

      const event =
        req.body;

      console.log(
        `Webhook autorizado: ${event?.event}`
      );

      // Responde rapidamente ao Asaas.

      res.sendStatus(200);

      // ==================================================
      // EVENTOS ACEITOS
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
      // QR CODE
      // ==================================================

      const pixQrCodeId =
        payment.pixQrCodeId;

      let telegramId =
        null;

      // 1. Tenta pelo QR Code em memória.

      if (
        pixQrCodeId
      ) {
        telegramId =
          qrCodeUsuarios.get(
            pixQrCodeId
          );
      }

      // 2. Tenta pelo banco.

      if (
        !telegramId &&
        pixQrCodeId
      ) {
        telegramId =
          await buscarTelegramPorQrCode(
            pixQrCodeId
          );
      }

      // 3. Tenta pelo externalReference.

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
          `Não foi possível identificar o Telegram do pagamento ${payment.id}`
        );

        return;
      }

      console.log(
        `Pagamento confirmado para Telegram ${telegramId}`
      );

      // ==================================================
      // LIBERAR / RENOVAR
      // ==================================================

      await liberarAcesso(
        telegramId,
        pixQrCodeId,
        payment.id
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
// INICIAR BANCO E SERVIDOR
// ======================================================

async function iniciarSistema() {
  try {
    await inicializarBanco();

    app.listen(
      PORT,
      () => {
        console.log(
          `Servidor PROMATCH rodando na porta ${PORT}`
        );
      }
    );

  } catch (error) {
    console.error(
      "Erro ao iniciar sistema:",
      error
    );

    process.exit(1);
  }
}

iniciarSistema();
