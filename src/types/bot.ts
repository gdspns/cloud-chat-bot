// 共享的机器人激活类型定义
// 注意：数据库类型文件可能未及时同步，这里定义完整的类型

export interface BotActivation {
  id: string;
  bot_token: string;
  personal_user_id: string;
  activation_code?: string;
  greeting_message?: string;
  is_active?: boolean;
  is_authorized?: boolean;
  trial_messages_used?: number;
  trial_limit?: number;
  expire_at?: string | null;
  created_at?: string;
  updated_at?: string;
  web_enabled?: boolean;
  app_enabled?: boolean;
  user_id?: string | null;
}

export interface Message {
  id: string;
  bot_activation_id: string;
  telegram_chat_id: number;
  telegram_user_name: string | null;
  content: string;
  direction: string;
  is_read: boolean | null;
  created_at: string;
  telegram_message_id?: number | null;
  is_admin_reply?: boolean;
}

export interface ChatItem {
  chatId: number;
  userName: string;
  lastMessage: string;
  lastTime: string;
  unread: boolean;
  botId: string;
}
