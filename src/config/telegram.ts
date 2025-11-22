// Telegram Bot Configuration
// Update these values with your bot token and user/chat IDs

export const telegramConfig = {
  // Your Telegram Bot Token from @BotFather
  botToken: "YOUR_BOT_TOKEN_HERE",
  
  // Your personal Telegram User ID (to receive messages)
  personalUserId: "YOUR_USER_ID_HERE",
  
  // Group Chat ID where the bot operates (optional)
  groupChatId: "YOUR_GROUP_CHAT_ID_HERE",
  
  // Auto greeting message
  greetingMessage: "Hello! 👋 I'm here to help you.",
  
  // Enable auto greeting when someone joins
  enableAutoGreeting: true,
};

export const updateConfig = (updates: Partial<typeof telegramConfig>) => {
  Object.assign(telegramConfig, updates);
};
