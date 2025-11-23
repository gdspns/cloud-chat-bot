import { telegramConfig } from "@/config/telegram";

const TELEGRAM_API = "https://api.telegram.org/bot";

export interface TelegramMessage {
  id: number;
  from: string;
  text: string;
  timestamp: number;
  chatId: number;
}

export const sendMessage = async (chatId: string | number, text: string) => {
  try {
    const response = await fetch(
      `${TELEGRAM_API}${telegramConfig.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
        }),
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

export const getUpdates = async (offset?: number) => {
  try {
    const url = new URL(`${TELEGRAM_API}${telegramConfig.botToken}/getUpdates`);
    if (offset) url.searchParams.set("offset", offset.toString());
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`Failed to get updates: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error("Error getting updates:", error);
    throw error;
  }
};

export const sendGreeting = async (chatId: string | number) => {
  return sendMessage(chatId, telegramConfig.greetingMessage);
};

export const deleteWebhook = async () => {
  try {
    const response = await fetch(
      `${TELEGRAM_API}${telegramConfig.botToken}/deleteWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to delete webhook: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error deleting webhook:", error);
    throw error;
  }
};
