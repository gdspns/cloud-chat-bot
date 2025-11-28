import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Send, RefreshCw, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Message {
  id: string;
  telegram_chat_id: number;
  telegram_user_name: string;
  content: string;
  direction: string;
  is_read: boolean;
  created_at: string;
}

interface BotActivation {
  id: string;
  bot_token: string;
  personal_user_id: string;
  greeting_message: string;
  is_active: boolean;
  is_authorized: boolean;
  trial_messages_used: number;
  trial_limit: number;
  expire_at: string | null;
}

export const Console = () => {
  const { activationId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activation, setActivation] = useState<BotActivation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showTrialDialog, setShowTrialDialog] = useState(false);
  const [enableSound, setEnableSound] = useState(true);
  const [soundType, setSoundType] = useState<"qq" | "ding" | "bell">("qq");
  const [unreadChats, setUnreadChats] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 播放提示音
  const playNotificationSound = () => {
    if (!enableSound) return;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    if (soundType === "qq") {
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 加载激活信息
  useEffect(() => {
    const loadActivation = async () => {
      if (!activationId) {
        navigate("/");
        return;
      }

      try {
        const { data, error } = await supabase
          .from('bot_activations')
          .select('*')
          .eq('id', activationId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          toast({
            title: "未找到",
            description: "激活不存在",
            variant: "destructive",
          });
          navigate("/");
          return;
        }

        // 检查状态
        if (!data.is_active) {
          toast({
            title: "服务已停止",
            description: "此机器人服务已被停用",
            variant: "destructive",
          });
        }

        if (data.expire_at && new Date(data.expire_at) < new Date()) {
          toast({
            title: "服务已过期",
            description: "请联系管理员续期",
            variant: "destructive",
          });
        }

        setActivation(data as BotActivation);
      } catch (error) {
        console.error('加载激活信息失败:', error);
        toast({
          title: "加载失败",
          description: "无法获取激活信息",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadActivation();
  }, [activationId, navigate, toast]);

  // 加载消息
  useEffect(() => {
    if (!activationId) return;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('bot_activation_id', activationId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data as Message[]);
      }
    };

    loadMessages();

    // 订阅实时消息
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `bot_activation_id=eq.${activationId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages(prev => [...prev, newMessage]);
          
          if (newMessage.direction === 'incoming') {
            playNotificationSound();
            setUnreadChats(prev => {
              const updated = new Set(prev);
              updated.add(newMessage.telegram_chat_id);
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activationId]);

  // 发送消息
  const handleSendMessage = async () => {
    if (!replyText.trim() || !selectedChatId || !activationId) {
      toast({
        title: "错误",
        description: "请选择聊天并输入消息",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-message', {
        body: {
          activationId,
          chatId: selectedChatId,
          message: replyText,
        }
      });

      if (error) throw error;
      
      if (data.trialExceeded) {
        setShowTrialDialog(true);
        return;
      }
      
      if (!data.ok) throw new Error(data.error);

      setReplyText("");
      toast({
        title: "发送成功",
        description: "消息已发送",
      });
    } catch (error: any) {
      if (error.message?.includes('Trial limit')) {
        setShowTrialDialog(true);
      } else {
        toast({
          title: "发送失败",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleChatSelect = (chatId: number) => {
    setSelectedChatId(chatId);
    setUnreadChats(prev => {
      const updated = new Set(prev);
      updated.delete(chatId);
      return updated;
    });
  };

  // 获取唯一聊天列表
  const uniqueChats = Array.from(
    new Map(
      messages
        .filter(m => m.direction === 'incoming')
        .map(m => [m.telegram_chat_id, { chatId: m.telegram_chat_id, userName: m.telegram_user_name }])
    ).values()
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8">
          <p className="text-muted-foreground">正在加载...</p>
        </Card>
      </div>
    );
  }

  if (!activation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-xl font-bold mb-4">访问被拒绝</h2>
          <p className="text-muted-foreground mb-6">
            此机器人服务不可用
          </p>
          <Button onClick={() => navigate("/")}>
            返回首页
          </Button>
        </Card>
      </div>
    );
  }

  const isExpired = activation.expire_at && new Date(activation.expire_at) < new Date();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-4xl">
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Telegram 机器人控制台</h1>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                activation.is_active && !isExpired 
                  ? 'bg-green-500/20 text-green-700 dark:text-green-300' 
                  : 'bg-red-500/20 text-red-700 dark:text-red-300'
              }`}>
                {activation.is_active && !isExpired ? '在线运行中' : '已停止'}
              </span>
              {!activation.is_authorized && (
                <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                  试用: {activation.trial_messages_used}/{activation.trial_limit}
                </span>
              )}
            </div>
          </div>

          {/* 提示音设置 */}
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant={enableSound ? "default" : "outline"}
              size="sm"
              onClick={() => setEnableSound(!enableSound)}
            >
              提示音: {enableSound ? "开" : "关"}
            </Button>
            {enableSound && (
              <Select value={soundType} onValueChange={(value: any) => setSoundType(value)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qq">QQ音</SelectItem>
                  <SelectItem value="ding">叮咚</SelectItem>
                  <SelectItem value="bell">铃铛</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button variant="ghost" size="sm" onClick={playNotificationSound}>
              测试
            </Button>
          </div>

          {/* 聊天列表 */}
          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block">选择聊天对象</label>
            <div className="flex gap-2 flex-wrap">
              {uniqueChats.length === 0 ? (
                <p className="text-muted-foreground text-sm">暂无聊天记录，等待用户发送消息...</p>
              ) : (
                uniqueChats.map((chat) => (
                  <Button
                    key={chat.chatId}
                    variant={selectedChatId === chat.chatId ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleChatSelect(chat.chatId)}
                    className={`relative ${unreadChats.has(chat.chatId) ? 'animate-pulse ring-2 ring-primary' : ''}`}
                  >
                    {chat.userName}
                    {unreadChats.has(chat.chatId) && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
                    )}
                  </Button>
                ))
              )}
            </div>
          </div>

          {/* 消息列表 */}
          <ScrollArea className="h-96 border rounded-lg p-4 mb-4">
            {selectedChatId ? (
              messages
                .filter(m => m.telegram_chat_id === selectedChatId)
                .map((message) => (
                  <div
                    key={message.id}
                    className={`mb-3 p-3 rounded-lg max-w-[80%] ${
                      message.direction === 'outgoing'
                        ? 'ml-auto bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm">{message.telegram_user_name}</span>
                      <span className="text-xs opacity-70">
                        {new Date(message.created_at).toLocaleTimeString('zh-CN')}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                ))
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                请选择一个聊天对象
              </div>
            )}
            <div ref={messagesEndRef} />
          </ScrollArea>

          {/* 发送消息 */}
          <div className="flex gap-2">
            <Input
              placeholder="输入回复消息..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={!selectedChatId || !activation.is_active || !!isExpired}
            />
            <Button 
              onClick={handleSendMessage} 
              disabled={!selectedChatId || !activation.is_active || !!isExpired || isSending}
            >
              <Send className="h-4 w-4 mr-2" />
              {isSending ? "发送中..." : "发送"}
            </Button>
          </div>

          {/* 状态提示 */}
          {(!activation.is_active || isExpired) && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <p className="text-sm text-destructive">
                {isExpired ? "服务已过期，请联系管理员续期" : "服务已停止，无法发送消息"}
              </p>
            </div>
          )}

          {/* Telegram APP 使用说明 */}
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h3 className="font-medium text-sm mb-2">📱 在 Telegram APP 中回复</h3>
            <p className="text-xs text-muted-foreground">
              收到转发消息后，直接使用 Telegram 的"回复"功能（长按消息→回复）即可精准回复对应用户。
              机器人7x24小时在线，即使关闭此网页也能正常工作。
            </p>
          </div>
        </Card>
      </div>

      {/* 试用限制对话框 */}
      <Dialog open={showTrialDialog} onOpenChange={setShowTrialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>试用次数已用完</DialogTitle>
            <DialogDescription>
              您已使用完 {activation.trial_limit} 条免费试用消息。
              如需继续使用，请联系管理员开通完整服务。
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setShowTrialDialog(false)}>
            我知道了
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Console;
