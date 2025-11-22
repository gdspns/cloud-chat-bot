# Telegram Bot for Google Apps Script

可以在Google Apps Script中运行的Telegram机器人脚本。

## 功能特点

✅ 自动问候新用户  
✅ 接收并记录所有消息  
✅ 转发消息给管理员  
✅ 管理员可以直接回复  
✅ 消息存储在Google Sheets  
✅ 支持群聊和私聊  
✅ 配置简单，无需云服务  

## 部署步骤

### 1. 创建Telegram机器人

1. 在Telegram中搜索 `@BotFather`
2. 发送 `/newbot` 创建新机器人
3. 按提示设置机器人名称
4. 保存Bot Token（类似 `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`）

### 2. 获取您的User ID

1. 在Telegram中搜索 `@userinfobot`
2. 点击Start，机器人会返回您的User ID
3. 保存这个ID（纯数字）

### 3. 获取群组Chat ID（如果需要群聊功能）

1. 将机器人添加到群组
2. 在群组中发送一条消息
3. 访问：`https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. 在返回的JSON中查找 `"chat":{"id":-xxxxxxxxx}`
5. 保存这个负数ID

### 4. 部署到Google Apps Script

1. 访问 [script.google.com](https://script.google.com)
2. 点击"新项目"
3. 将 `TelegramBot.gs` 的内容复制粘贴到编辑器
4. 修改顶部的 `CONFIG` 配置：
   ```javascript
   const CONFIG = {
     BOT_TOKEN: "您的Bot Token",
     PERSONAL_USER_ID: "您的User ID",
     GROUP_CHAT_ID: "群组Chat ID",  // 可选
     GREETING_MESSAGE: "自定义问候语",
     ENABLE_AUTO_GREETING: true,
   };
   ```
5. 保存项目（Ctrl+S）

### 5. 部署Web应用

1. 点击右上角"部署" > "新建部署"
2. 点击"选择类型" > "Web应用"
3. 配置：
   - **说明**：Telegram Bot
   - **执行身份**：我
   - **访问权限**：任何人
4. 点击"部署"
5. 授权访问（首次需要）
6. **复制Web应用URL**

### 6. 设置Webhook

1. 在Google Apps Script编辑器中
2. 点击顶部函数选择器，选择 `setWebhook`
3. 点击"运行"按钮
4. 查看日志（Ctrl+Enter）确认成功

## 使用方法

### 基本使用

1. 在Telegram中给机器人发送消息
2. 机器人会自动发送问候语（如果启用）
3. 您会在您的私聊中收到消息通知
4. 直接回复通知消息即可回复用户

### 查看消息记录

1. 访问 [drive.google.com](https://drive.google.com)
2. 找到自动创建的"Telegram Bot Data"表格
3. 查看所有收到的消息历史

### 管理功能

在Google Apps Script编辑器中运行以下函数：

- **`sendGreetingToChat("CHAT_ID")`** - 发送问候语到指定聊天
- **`broadcastMessage("消息内容")`** - 群发消息到所有聊天
- **`getBotInfo()`** - 查看机器人信息
- **`deleteWebhook()`** - 删除webhook

## 修改配置

随时可以修改配置：

1. 打开Google Apps Script项目
2. 修改 `CONFIG` 对象中的值
3. 保存
4. 重新部署（部署 > 管理部署 > 编辑 > 部署新版本）

## 常见问题

**Q: 机器人不响应？**
- 检查Bot Token是否正确
- 运行 `getBotInfo()` 测试连接
- 运行 `setWebhook()` 重新设置webhook

**Q: 收不到消息通知？**
- 确认Personal User ID设置正确
- 先给机器人发送 `/start` 激活聊天

**Q: 群组中无法使用？**
- 确保机器人已添加到群组
- 给机器人管理员权限
- 关闭Privacy Mode（在@BotFather中设置）

**Q: 如何更新配置？**
- 直接修改代码中的CONFIG
- 保存后自动生效，无需重新部署

## 注意事项

⚠️ Bot Token是敏感信息，不要分享给他人  
⚠️ Google Apps Script有配额限制，大量消息可能受限  
⚠️ 每天最多执行20,000次（免费账户）  

## 技术支持

如有问题，检查：
1. 执行日志（查看 > 日志）
2. Google Sheets中的消息记录
3. Telegram API响应

## 许可证

MIT License - 自由使用和修改
