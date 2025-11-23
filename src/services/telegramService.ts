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
    
    const data = await response.json();
    
    if (!response.ok) {
      const errorMsg = data.description || response.statusText;
      console.error("Telegram API Error:", data);
      throw new Error(`发送失败: ${errorMsg}`);
    }
    
    return data;
  } catch (error: any) {
    console.error("发送消息错误:", error);
    throw new Error(error.message || "发送消息失败，请检查网络连接");
  }
};

export const getUpdates = async (offset?: number) => {
  try {
    const url = new URL(`${TELEGRAM_API}${telegramConfig.botToken}/getUpdates`);
    if (offset) url.searchParams.set("offset", offset.toString());
    
    const response = await fetch(url.toString());
    const data = await response.json();
    
    if (!response.ok) {
      const errorMsg = data.description || response.statusText;
      console.error("Telegram API Error:", data);
      throw new Error(errorMsg);
    }
    
    return data.result;
  } catch (error: any) {
    console.error("获取更新错误:", error);
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
