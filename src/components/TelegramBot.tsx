import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { sendMessage, getUpdates, sendGreeting, deleteWebhook, TelegramMessage } from "@/services/telegramService";
import { telegramConfig } from "@/config/telegram";
import { Send, RefreshCw } from "lucide-react";

export const TelegramBot = () => {
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdateId, setLastUpdateId] = useState<number>(0);
  const { toast } = useToast();

  const fetchMessages = async () => {
    setIsLoading(true);
    try {
      const updates = await getUpdates(lastUpdateId + 1);
      
      const newMessages: TelegramMessage[] = updates
        .filter((update: any) => update.message)
        .map((update: any) => {
          if (update.update_id > lastUpdateId) {
            setLastUpdateId(update.update_id);
          }
          
          return {
            id: update.message.message_id,
            from: update.message.from.first_name || update.message.from.username,
            text: update.message.text || "",
            timestamp: update.message.date * 1000,
            chatId: update.message.chat.id,
          };
        });

      if (newMessages.length > 0) {
        setMessages((prev) => [...prev, ...newMessages]);
        
        // Auto-send greeting to new chats if enabled
        if (telegramConfig.enableAutoGreeting) {
          const uniqueChatIds = [...new Set(newMessages.map(m => m.chatId))];
          uniqueChatIds.forEach(chatId => {
            const isNewChat = !messages.some(m => m.chatId === chatId);
            if (isNewChat) {
              sendGreeting(chatId);
            }
          });
        }
      }
    } catch (error: any) {
      const errorMsg = error?.message || "";
      if (errorMsg.includes("webhook")) {
        toast({
          title: "错误",
          description: "检测到Webhook冲突。请点击【删除Webhook】按钮后再试。",
          variant: "destructive",
        });
      } else {
        toast({
          title: "错误",
          description: "获取消息失败，请检查机器人令牌。",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteWebhook = async () => {
    try {
      await deleteWebhook();
      toast({
        title: "成功",
        description: "Webhook已删除，现在可以接收消息了。",
      });
      fetchMessages();
    } catch (error) {
      toast({
        title: "错误",
        description: "删除Webhook失败。",
        variant: "destructive",
      });
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedChatId) {
      toast({
        title: "错误",
        description: "请选择聊天并输入消息。",
        variant: "destructive",
      });
      return;
    }

    try {
      await sendMessage(selectedChatId, replyText);
      setReplyText("");
      toast({
        title: "成功",
        description: "消息发送成功！",
      });
    } catch (error) {
      toast({
        title: "错误",
        description: "消息发送失败。",
        variant: "destructive",
      });
    }
  };

  const handleSendGreeting = async () => {
    if (!selectedChatId) {
      toast({
        title: "错误",
        description: "请先选择一个聊天。",
        variant: "destructive",
      });
      return;
    }

    try {
      await sendGreeting(selectedChatId);
      toast({
        title: "成功",
        description: "问候消息发送成功！",
      });
    } catch (error) {
      toast({
        title: "错误",
        description: "问候消息发送失败。",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [lastUpdateId, messages]);

  const uniqueChats = Array.from(new Set(messages.map(m => m.chatId)));

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-4">Telegram 机器人控制台</h1>
        
        <div className="mb-4 flex gap-2 flex-wrap">
          <Button onClick={handleDeleteWebhook} variant="destructive">
            删除 Webhook
          </Button>
          <Button onClick={fetchMessages} disabled={isLoading} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            刷新消息
          </Button>
          <Button onClick={handleSendGreeting} variant="secondary">
            发送问候
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-2">聊天列表</h3>
            <ScrollArea className="h-40">
              {uniqueChats.map((chatId) => (
                <Button
                  key={chatId}
                  variant={selectedChatId === chatId ? "default" : "ghost"}
                  className="w-full justify-start mb-2"
                  onClick={() => setSelectedChatId(chatId)}
                >
                  聊天 {chatId}
                </Button>
              ))}
            </ScrollArea>
          </Card>

          <Card className="p-4 md:col-span-2">
            <h3 className="font-semibold mb-2">消息记录</h3>
            <ScrollArea className="h-40">
              {messages
                .filter((msg) => !selectedChatId || msg.chatId === selectedChatId)
                .map((msg) => (
                  <div key={msg.id} className="mb-3 p-2 bg-muted rounded">
                    <div className="text-sm font-medium">{msg.from}</div>
                    <div className="text-sm">{msg.text}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ))}
            </ScrollArea>
          </Card>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="输入回复消息..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSendReply()}
          />
          <Button onClick={handleSendReply}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
};
