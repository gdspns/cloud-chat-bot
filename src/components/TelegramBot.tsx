import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { sendMessage, getUpdates, sendGreeting, deleteWebhook, forwardMessageToPersonal, processPersonalMessage, TelegramMessage } from "@/services/telegramService";
import { telegramConfig } from "@/config/telegram";
import { Send, RefreshCw, Settings } from "lucide-react";

export const TelegramBot = () => {
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const lastUpdateIdRef = useRef<number>(0);
  const greetedChatsRef = useRef<Set<number>>(new Set());
  const [botToken, setBotToken] = useState(telegramConfig.botToken);
  const [personalUserId, setPersonalUserId] = useState(telegramConfig.personalUserId);
  const [greetingMessage, setGreetingMessage] = useState(telegramConfig.greetingMessage);
  const [enableSound, setEnableSound] = useState(true);
  const [soundType, setSoundType] = useState<"qq" | "ding" | "bell">("qq");
  const [unreadChats, setUnreadChats] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastActiveChatIdRef = useRef<number | null>(null);
  const { toast } = useToast();

  // 创建消息提示音 - 支持多种音效
  const playNotificationSound = () => {
    if (!enableSound) return;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    if (soundType === "qq") {
      // QQ双音效果
      const oscillator1 = audioContext.createOscillator();
      const gainNode1 = audioContext.createGain();
      oscillator1.connect(gainNode1);
      gainNode1.connect(audioContext.destination);
      oscillator1.frequency.value = 800;
      oscillator1.type = 'sine';
      gainNode1.gain.setValueAtTime(0.6, audioContext.currentTime);
      gainNode1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      oscillator1.start(audioContext.currentTime);
      oscillator1.stop(audioContext.currentTime + 0.1);
      
      const oscillator2 = audioContext.createOscillator();
      const gainNode2 = audioContext.createGain();
      oscillator2.connect(gainNode2);
      gainNode2.connect(audioContext.destination);
      oscillator2.frequency.value = 1000;
      oscillator2.type = 'sine';
      gainNode2.gain.setValueAtTime(0.6, audioContext.currentTime + 0.15);
      gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
      oscillator2.start(audioContext.currentTime + 0.15);
      oscillator2.stop(audioContext.currentTime + 0.25);
    } else if (soundType === "ding") {
      // 单音"叮"效果
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 1200;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.7, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
    } else if (soundType === "bell") {
      // 铃铛三音效果
      [600, 800, 1000].forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        const startTime = audioContext.currentTime + index * 0.1;
        gainNode.gain.setValueAtTime(0.5, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.15);
      });
    }
  };

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    if (isFetching) return; // 防止并发请求
    
    setIsFetching(true);
    setIsLoading(true);
    try {
      const updates = await getUpdates(lastUpdateIdRef.current + 1);
      
      const newMessages: TelegramMessage[] = [];
      
      for (const update of updates) {
        if (!update.message) continue;
        
        if (update.update_id > lastUpdateIdRef.current) {
          lastUpdateIdRef.current = update.update_id;
        }
        
        const message = update.message;
        const fromUserId = message.from.id;
        const chatId = message.chat.id;
        const messageText = message.text || "";
        const fromName = message.from.first_name || message.from.username || "未知用户";
        
        // 检查是否来自配置的个人用户ID (APP消息不显示在网页控制台)
        if (fromUserId.toString() === personalUserId) {
          const commandResult = processPersonalMessage(messageText, lastActiveChatIdRef.current);
          
          if (commandResult.isCommand) {
            // 执行命令或直接回复：发送消息到目标聊天
            try {
              await sendMessage(commandResult.targetChatId!, commandResult.messageText!);
              
              // 更新最后活跃的聊天ID为回复的目标
              lastActiveChatIdRef.current = commandResult.targetChatId!;
              
              toast({
                title: "APP回复成功",
                description: `已通过APP回复聊天 ${commandResult.targetChatId}`,
              });
            } catch (error) {
              console.error("执行回复失败:", error);
              toast({
                title: "回复失败",
                description: "发送消息失败，请重试",
                variant: "destructive",
              });
            }
          }
          continue; // APP自己的消息不显示在网页控制台
        } else {
          // 来自其他用户的消息
          // 自动转发到个人账户
          if (telegramConfig.enableMessageForwarding) {
            try {
              await forwardMessageToPersonal(chatId, fromName, messageText);
              console.log(`已转发消息到个人账户: 来自聊天 ${chatId}`);
            } catch (error) {
              console.error("转发消息失败:", error);
            }
          }
          
          // 更新最后活跃的聊天ID
          lastActiveChatIdRef.current = chatId;
        }
        
        // 添加普通消息到列表
        newMessages.push({
          id: message.message_id,
          from: fromName,
          text: messageText,
          timestamp: message.date * 1000,
          chatId: chatId,
        });
      }

      if (newMessages.length > 0) {
        // 过滤掉已存在的消息，防止重复
        setMessages((prev) => {
          const existingMessageIds = new Set(prev.map(m => m.id));
          const uniqueNewMessages = newMessages.filter(m => !existingMessageIds.has(m.id));
          
          if (uniqueNewMessages.length > 0) {
            // 播放提示音
            playNotificationSound();
            
            // 标记未读消息
            const newUnreadChatIds = [...new Set(uniqueNewMessages.map(m => m.chatId))];
            setUnreadChats(prev => {
              const updated = new Set(prev);
              newUnreadChatIds.forEach(id => updated.add(id));
              return updated;
            });
            
            // Auto-send greeting to new chats if enabled
            if (telegramConfig.enableAutoGreeting) {
              const uniqueChatIds = [...new Set(uniqueNewMessages.map(m => m.chatId))];
              uniqueChatIds.forEach(chatId => {
                if (!greetedChatsRef.current.has(chatId)) {
                  sendGreeting(chatId);
                  greetedChatsRef.current.add(chatId);
                }
              });
            }
            return [...prev, ...uniqueNewMessages];
          }
          return prev;
        });
      }
    } catch (error: any) {
      const errorMsg = error?.message || "";
      // 409冲突错误不显示toast，静默处理
      if (errorMsg.includes("Conflict") || errorMsg.includes("409")) {
        console.log("检测到并发请求冲突，已自动处理");
      } else if (errorMsg.includes("webhook")) {
        toast({
          title: "错误",
          description: "检测到Webhook冲突。请点击【删除Webhook】按钮后再试。",
          variant: "destructive",
        });
      } else if (errorMsg.includes("401") || errorMsg.includes("Unauthorized")) {
        toast({
          title: "错误",
          description: "机器人令牌无效，请检查配置。",
          variant: "destructive",
        });
      } else {
        console.error("获取消息失败:", errorMsg);
      }
    } finally {
      setIsLoading(false);
      setIsFetching(false);
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
      
      // 将自己发送的消息添加到消息列表
      const sentMessage: TelegramMessage = {
        id: Date.now() + Math.random(), // 使用随机数确保唯一性
        from: "我",
        text: replyText,
        timestamp: Date.now(),
        chatId: selectedChatId,
      };
      setMessages((prev) => [...prev, sentMessage]);
      
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
      greetedChatsRef.current.add(selectedChatId);
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

  const handleUpdateConfig = () => {
    telegramConfig.botToken = botToken;
    telegramConfig.personalUserId = personalUserId;
    telegramConfig.greetingMessage = greetingMessage;
    toast({
      title: "成功",
      description: "配置已更新！",
    });
  };

  useEffect(() => {
    fetchMessages(); // 初始加载
    const interval = setInterval(fetchMessages, 5000); // 每5秒轮询一次
    return () => clearInterval(interval);
  }, []); // 空依赖项，只在组件挂载时创建一次定时器

  const uniqueChats = Array.from(new Set(messages.map(m => m.chatId)));

  const handleChatSelect = (chatId: number) => {
    setSelectedChatId(chatId);
    setUnreadChats(prev => {
      const updated = new Set(prev);
      updated.delete(chatId);
      return updated;
    });
  };

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
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                配置
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>配置信息</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">消息提示音</label>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant={enableSound ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEnableSound(!enableSound)}
                    >
                      {enableSound ? "已开启" : "已关闭"}
                    </Button>
                    {enableSound && (
                      <Select value={soundType} onValueChange={(value: any) => setSoundType(value)}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="qq">QQ提示音</SelectItem>
                          <SelectItem value="ding">叮咚</SelectItem>
                          <SelectItem value="bell">铃铛</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={playNotificationSound}
                    >
                      测试
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">机器人令牌</label>
                  <Input
                    placeholder="输入机器人令牌..."
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">个人用户ID</label>
                  <Input
                    placeholder="输入个人用户ID..."
                    value={personalUserId}
                    onChange={(e) => setPersonalUserId(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">欢迎消息</label>
                  <Input
                    placeholder="输入欢迎消息..."
                    value={greetingMessage}
                    onChange={(e) => setGreetingMessage(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <Button onClick={handleUpdateConfig} className="w-full">
                  保存配置
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-2">聊天列表</h3>
            <ScrollArea className="h-40">
              {uniqueChats.map((chatId) => (
                <Button
                  key={chatId}
                  variant={selectedChatId === chatId ? "default" : "ghost"}
                  className={`w-full justify-start mb-2 ${unreadChats.has(chatId) ? "animate-pulse" : ""}`}
                  onClick={() => handleChatSelect(chatId)}
                >
                  聊天 {chatId}
                  {unreadChats.has(chatId) && (
                    <span className="ml-auto w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </Button>
              ))}
            </ScrollArea>
          </Card>

          <Card className="p-4 md:col-span-2">
            <h3 className="font-semibold mb-2">
              消息记录
              {lastActiveChatIdRef.current && (
                <span className="text-xs text-muted-foreground ml-2">
                  (最近活跃: {lastActiveChatIdRef.current})
                </span>
              )}
            </h3>
            <ScrollArea className="h-40">
              {messages
                .filter((msg) => !selectedChatId || msg.chatId === selectedChatId)
                .map((msg) => (
                  <div key={`${msg.chatId}-${msg.id}`} className="mb-3 p-2 bg-muted rounded">
                    <div className="text-sm font-medium">{msg.from}</div>
                    <div className="text-sm">{msg.text}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ))}
              <div ref={messagesEndRef} />
            </ScrollArea>
          </Card>
        </div>

        <div className="space-y-2">
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
          
          <Card className="p-3 bg-muted/30">
            <h4 className="text-xs font-semibold mb-2">💡 APP使用说明</h4>
            <div className="text-xs space-y-1 text-muted-foreground">
              <p className="font-semibold text-primary">📱 自动转发模式已启用</p>
              <p>• 别人给机器人发消息时，会自动转发到您的APP</p>
              <p>• 直接在APP中回复机器人即可回复对方</p>
              <p>• 也可使用命令格式：</p>
              <p className="font-mono bg-background px-2 py-0.5 rounded mt-1">
                /reply &lt;聊天ID&gt; &lt;消息&gt;
              </p>
              <p className="font-mono bg-background px-2 py-0.5 rounded">
                /r &lt;消息&gt;
              </p>
            </div>
          </Card>
        </div>
      </Card>
    </div>
  );
};
