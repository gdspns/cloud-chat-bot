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

// 转发消息到个人账户 - 改进格式，包含chatId信息方便回复
export const forwardMessageToPersonal = async (
  fromChatId: number,
  fromName: string,
  messageText: string
) => {
  const forwardText = `📩 来自聊天ID: ${fromChatId}\n👤 发送者: ${fromName}\n📝 消息内容:\n${messageText}\n\n💬 回复指令:\n/reply ${fromChatId} 你的回复内容\n或直接回复(回复最后一条消息)`;
  return sendMessage(telegramConfig.personalUserId, forwardText);
};

// 处理来自个人账户的消息（包括命令和普通回复）
export const processPersonalMessage = (
  message: string,
  lastChatId: number | null
): {
  isCommand: boolean;
  targetChatId?: number;
  messageText?: string;
  commandType?: 'reply' | 'quickReply' | 'directReply';
} => {
  // 命令格式1: /reply <chatId> <message>
  const replyMatch = message.match(/^\/reply\s+(\d+)\s+(.+)$/s);
  if (replyMatch) {
    return {
      isCommand: true,
      commandType: 'reply',
      targetChatId: parseInt(replyMatch[1]),
      messageText: replyMatch[2]
    };
  }

  // 命令格式2: /r <message> (回复最近聊天)
  const quickReplyMatch = message.match(/^\/r\s+(.+)$/s);
  if (quickReplyMatch && lastChatId) {
    return {
      isCommand: true,
      commandType: 'quickReply',
      targetChatId: lastChatId,
      messageText: quickReplyMatch[1]
    };
  }

  // 直接回复（不是命令，但有最近聊天ID）
  if (lastChatId && !message.startsWith('/')) {
    return {
      isCommand: true,
      commandType: 'directReply',
      targetChatId: lastChatId,
      messageText: message
    };
  }

  return { isCommand: false };
};
