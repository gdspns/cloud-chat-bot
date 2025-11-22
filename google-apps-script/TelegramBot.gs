// ============================================
// Telegram Bot for Google Apps Script
// ============================================

// 配置区域 - 请修改以下信息
const CONFIG = {
  BOT_TOKEN: "YOUR_BOT_TOKEN_HERE",           // 从 @BotFather 获取
  PERSONAL_USER_ID: "YOUR_USER_ID_HERE",      // 您的Telegram用户ID
  GROUP_CHAT_ID: "YOUR_GROUP_CHAT_ID_HERE",   // 群组ID（可选）
  GREETING_MESSAGE: "你好！👋 我是机器人助手。",
  ENABLE_AUTO_GREETING: true,                  // 是否自动问候
  WEBHOOK_URL: "",                             // 部署后自动填充
};

// ============================================
// 主要函数
// ============================================

// 设置Webhook - 部署后运行一次此函数
function setWebhook() {
  const webAppUrl = ScriptApp.getService().getUrl();
  CONFIG.WEBHOOK_URL = webAppUrl;
  
  const url = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/setWebhook`;
  const payload = {
    url: webAppUrl
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  };
  
  const response = UrlFetchApp.fetch(url, options);
  Logger.log(response.getContentText());
  return "Webhook设置成功！URL: " + webAppUrl;
}

// 删除Webhook
function deleteWebhook() {
  const url = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/deleteWebhook`;
  const response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
  return "Webhook已删除";
}

// 处理POST请求（接收Telegram消息）
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    
    if (update.message) {
      handleMessage(update.message);
    }
    
    return ContentService.createTextOutput(JSON.stringify({status: "ok"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log("错误: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 处理GET请求（用于测试）
function doGet(e) {
  return ContentService.createTextOutput(
    "Telegram Bot is running! Bot Token: " + (CONFIG.BOT_TOKEN ? "已配置" : "未配置")
  );
}

// ============================================
// 消息处理
// ============================================

function handleMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || "";
  const userName = message.from.first_name || message.from.username || "用户";
  
  // 记录消息到Google Sheet（可选）
  logMessage(chatId, userId, userName, text);
  
  // 如果是新用户且开启了自动问候
  if (CONFIG.ENABLE_AUTO_GREETING && isNewUser(userId)) {
    sendMessage(chatId, CONFIG.GREETING_MESSAGE);
    markUserAsGreeted(userId);
  }
  
  // 转发消息给管理员
  if (userId.toString() !== CONFIG.PERSONAL_USER_ID) {
    notifyAdmin(chatId, userId, userName, text);
  }
  
  // 处理管理员回复
  if (userId.toString() === CONFIG.PERSONAL_USER_ID && message.reply_to_message) {
    handleAdminReply(message);
  }
}

// ============================================
// Telegram API 调用
// ============================================

function sendMessage(chatId, text, replyToMessageId = null) {
  const url = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  };
  
  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
  }
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    return JSON.parse(response.getContentText());
  } catch (error) {
    Logger.log("发送消息错误: " + error.toString());
    return null;
  }
}

function sendGreeting(chatId) {
  return sendMessage(chatId, CONFIG.GREETING_MESSAGE);
}

// ============================================
// 管理员功能
// ============================================

function notifyAdmin(chatId, userId, userName, text) {
  const notificationText = `
📨 <b>新消息</b>
👤 来自: ${userName} (ID: ${userId})
💬 内容: ${text}
🆔 Chat ID: ${chatId}
  `;
  
  sendMessage(CONFIG.PERSONAL_USER_ID, notificationText);
}

function handleAdminReply(message) {
  const replyText = message.text;
  const originalMessage = message.reply_to_message;
  
  // 从原始消息中提取Chat ID
  const match = originalMessage.text.match(/Chat ID: (-?\d+)/);
  if (match) {
    const targetChatId = match[1];
    sendMessage(targetChatId, replyText);
  }
}

// ============================================
// 数据存储（使用Google Sheets）
// ============================================

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create("Telegram Bot Data");
  let sheet = ss.getSheetByName("Messages");
  
  if (!sheet) {
    sheet = ss.insertSheet("Messages");
    sheet.appendRow(["时间", "Chat ID", "User ID", "用户名", "消息内容"]);
  }
  
  return sheet;
}

function logMessage(chatId, userId, userName, text) {
  try {
    const sheet = getSheet();
    const timestamp = new Date().toLocaleString("zh-CN");
    sheet.appendRow([timestamp, chatId, userId, userName, text]);
  } catch (error) {
    Logger.log("记录消息错误: " + error.toString());
  }
}

function isNewUser(userId) {
  const properties = PropertiesService.getScriptProperties();
  const greeted = properties.getProperty("greeted_" + userId);
  return !greeted;
}

function markUserAsGreeted(userId) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty("greeted_" + userId, "true");
}

// ============================================
// 管理员命令
// ============================================

// 手动发送问候语到指定聊天
function sendGreetingToChat(chatId) {
  sendGreeting(chatId);
  Logger.log("问候语已发送到: " + chatId);
}

// 广播消息到所有记录的聊天
function broadcastMessage(messageText) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const chatIds = new Set();
  
  // 收集所有唯一的chat ID
  for (let i = 1; i < data.length; i++) {
    chatIds.add(data[i][1]); // Chat ID 在第2列
  }
  
  // 发送消息
  chatIds.forEach(chatId => {
    sendMessage(chatId, messageText);
    Utilities.sleep(100); // 避免速率限制
  });
  
  Logger.log("消息已广播到 " + chatIds.size + " 个聊天");
}

// 获取机器人信息
function getBotInfo() {
  const url = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getMe`;
  const response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
  return JSON.parse(response.getContentText());
}

// ============================================
// 使用说明
// ============================================

/*
部署步骤：
1. 修改上方 CONFIG 对象中的配置信息
2. 点击"部署" > "新建部署"
3. 选择类型：Web应用
4. 执行身份：我
5. 访问权限：任何人
6. 点击"部署"，复制Web应用URL
7. 运行 setWebhook() 函数设置webhook

测试步骤：
1. 运行 getBotInfo() 查看机器人信息
2. 在Telegram中给机器人发送消息
3. 查看Google Sheet中的消息记录

管理功能：
- sendGreetingToChat("CHAT_ID") - 发送问候语
- broadcastMessage("消息内容") - 群发消息
- deleteWebhook() - 删除webhook
- setWebhook() - 重新设置webhook
*/
