const TelegramBot = require('node-telegram-bot-api');
import { rayFee, solanaConnection } from './constants';
import { storeData } from './utils';
import fs from 'fs';
import chalk from 'chalk';
import path from 'path';
import { Connection } from '@solana/web3.js';
import { MAINNET_PROGRAM_ID } from '@raydium-io/raydium-sdk';

// Replace the value below with the Telegram token you receive from @BotFather
const token = '6718027163:AAHJPeMqs7Rr9YV8hGG-PzwbZ_XMKvpuk_0';

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// Path to store new token data
const dataPath = path.join(__dirname, 'data', 'new_solana_tokens.json');

// Variable to store chatId dynamically
let chatId;

// Function to monitor new Solana tokens
async function monitorNewTokens(connection: Connection) {
  console.log(chalk.green(`Monitoring new Solana tokens...`));

  try {
    connection.onLogs(
      rayFee,
      async ({ logs, err, signature }) => {
        try {
          if (err) {
            console.error(`Connection contains error: ${err}`);
            return;
          }

          console.log(chalk.bgGreen(`Found new token signature: ${signature}`));

          let signer = '';
          let baseAddress = '';
          let baseDecimals = 0;
          let baseLpAmount = 0;
          let quoteAddress = '';
          let quoteDecimals = 0;
          let quoteLpAmount = 0;

          const parsedTransaction = await connection.getParsedTransaction(
            signature,
            {
              maxSupportedTransactionVersion: 0,
              commitment: 'confirmed',
            }
          );

          if (parsedTransaction && parsedTransaction?.meta.err == null) {
            console.log(`Successfully parsed transaction`);

            signer =
              parsedTransaction?.transaction.message.accountKeys[0].pubkey.toString();

            console.log(`Creator: ${signer}`);

            const postTokenBalances = parsedTransaction?.meta.postTokenBalances;

            const baseInfo = postTokenBalances?.find(
              (balance) =>
                balance.owner ===
                  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1' &&
                balance.mint !== 'So11111111111111111111111111111111111111112'
            );

            if (baseInfo) {
              baseAddress = baseInfo.mint;
              baseDecimals = baseInfo.uiTokenAmount.decimals;
              baseLpAmount = baseInfo.uiTokenAmount.uiAmount;
            }

            const quoteInfo = postTokenBalances.find(
              (balance) =>
                balance.owner ==
                  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1' &&
                balance.mint == 'So11111111111111111111111111111111111111112'
            );

            if (quoteInfo) {
              quoteAddress = quoteInfo.mint;
              quoteDecimals = quoteInfo.uiTokenAmount.decimals;
              quoteLpAmount = quoteInfo.uiTokenAmount.uiAmount;
            }
          }

          const newTokenData = {
            lpSignature: signature,
            creator: signer,
            timestamp: new Date().toISOString(),
            baseInfo: {
              baseAddress,
              baseDecimals,
              baseLpAmount,
            },
            quoteInfo: {
              quoteAddress: quoteAddress,
              quoteDecimals: quoteDecimals,
              quoteLpAmount: quoteLpAmount,
            },
            logs: logs,
          };

          // Store new token data in the data folder
          await storeData(dataPath, newTokenData);

          // Send a message to the Telegram chat with new token details if chatId is available
          if (chatId) {
            bot.sendMessage(
              chatId,
              `New Solana token detected!\n\nCreator: ${signer}\nSignature: ${signature}\nBase Token: ${baseAddress} (Decimals: ${baseDecimals}, Amount: ${baseLpAmount})\nQuote Token: ${quoteAddress} (Decimals: ${quoteDecimals}, Amount: ${quoteLpAmount})\nTimestamp: ${newTokenData.timestamp}`
            );
          } else {
            console.log("chatId is not set. Unable to send Telegram message.");
          }
        } catch (error) {
          const errorMessage = `Error occurred in new Solana token log callback function: ${JSON.stringify(error, null, 2)}`;
          console.log(chalk.red(errorMessage));
          // Save error logs to a separate file
          fs.appendFile(
            'errorNewLpsLogs.txt',
            `${errorMessage}\n`,
            function (err) {
              if (err) console.log('Error writing errorNewLpsLogs.txt', err);
            }
          );
        }
      },
      'confirmed'
    );
  } catch (error) {
    const errorMessage = `Error occurred in new Solana token monitor: ${JSON.stringify(error, null, 2)}`;
    console.log(chalk.red(errorMessage));
    // Save error logs to a separate file
    fs.appendFile('errorNewLpsLogs.txt', `${errorMessage}\n`, function (err) {
      if (err) console.log('Error writing errorNewLpsLogs.txt', err);
    });
  }
}

monitorNewTokens(solanaConnection);

// Telegram bot functionality
bot.onText(/\/echo (.+)/, (msg, match) => {
  chatId = msg.chat.id; // Dynamically capture the chatId
  const resp = match[1]; // the captured "whatever"
  bot.sendMessage(chatId, resp);
});

bot.on('message', (msg) => {
  chatId = msg.chat.id; // Dynamically capture the chatId
  bot.sendMessage(chatId, 'Received your message');
});
