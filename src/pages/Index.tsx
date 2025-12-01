import { useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChatWindow } from "@/components/ChatWindow";
import { AddBotDialog } from "@/components/AddBotDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  bot_activation_id: string;
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

interface ChatItem {
  chatId: number;
  userName: string;
  lastMessage: string;
  lastTime: string;
  unread: boolean;
  botId: string;
}

const Index = () => {
  const { toast } = useToast();
  const [bots, setBots] = useState<BotActivation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [showAddBot, setShowAddBot] = useState(false);
  const [unreadChats, setUnreadChats] = useState<Set<number>>(new Set());
  const [enableSound, setEnableSound] = useState(true);
  const [soundType, setSoundType] = useState("qq");

  // 播放提示音
  const playNotificationSound = useCallback(() => {
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
  }, [enableSound, soundType]);

  // 加载本地存储的机器人ID
  useEffect(() => {
    const storedBotIds = localStorage.getItem('myBotIds');
    if (storedBotIds) {
      loadBots(JSON.parse(storedBotIds));
    }
  }, []);

  // 加载机器人列表
  const loadBots = async (botIds?: string[]) => {
    try {
      let query = supabase.from('bot_activations').select('*');
      
      if (botIds && botIds.length > 0) {
        query = query.in('id', botIds);
      } else {
        // 如果没有存储的ID，则不显示任何机器人
        setBots([]);
        return;
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setBots(data as BotActivation[]);
      
      // 自动选中第一个机器人
      if (data && data.length > 0 && !selectedBotId) {
        setSelectedBotId(data[0].id);
      }
    } catch (error) {
      console.error('加载机器人失败:', error);
    }
  };

  // 加载消息
  useEffect(() => {
    if (bots.length === 0) return;

    const botIds = bots.map(b => b.id);
    
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('bot_activation_id', botIds)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data as Message[]);
      }
    };

    loadMessages();

    // 订阅实时消息
    const channels = botIds.map(botId => {
      return supabase
        .channel(`messages-${botId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `bot_activation_id=eq.${botId}`,
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
    });

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [bots, playNotificationSound]);

  // 处理机器人添加
  const handleBotAdded = async () => {
    // 重新获取最新添加的机器人
    const { data } = await supabase
      .from('bot_activations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (data && data.length > 0) {
      const newBot = data[0];
      const storedBotIds = JSON.parse(localStorage.getItem('myBotIds') || '[]');
      if (!storedBotIds.includes(newBot.id)) {
        storedBotIds.push(newBot.id);
        localStorage.setItem('myBotIds', JSON.stringify(storedBotIds));
      }
      loadBots(storedBotIds);
      setSelectedBotId(newBot.id);
    }
  };

  // 发送消息
  const handleSendMessage = async (message: string): Promise<{ trialExceeded?: boolean; error?: string }> => {
    if (!selectedBotId || !selectedChatId) {
      return { error: "请选择聊天对象" };
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-message', {
        body: {
          activationId: selectedBotId,
          chatId: selectedChatId,
          message,
        }
      });

      if (error) throw error;
      
      if (data.trialExceeded) {
        return { trialExceeded: true };
      }
      
      if (!data.ok) {
        return { error: data.error };
      }

      // 更新本地机器人状态（试用次数）
      setBots(prev => prev.map(bot => {
        if (bot.id === selectedBotId && !bot.is_authorized) {
          return { ...bot, trial_messages_used: bot.trial_messages_used + 1 };
        }
        return bot;
      }));

      return {};
    } catch (error: any) {
      return { error: error.message };
    }
  };

  // 选择聊天
  const handleSelectChat = (chatId: number) => {
    setSelectedChatId(chatId);
    setUnreadChats(prev => {
      const updated = new Set(prev);
      updated.delete(chatId);
      return updated;
    });
  };

  // 构建聊天列表
  const chatItems: ChatItem[] = (() => {
    const chatMap = new Map<string, ChatItem>();
    
    messages
      .filter(m => m.direction === 'incoming')
      .forEach(m => {
        const key = `${m.bot_activation_id}-${m.telegram_chat_id}`;
        const existing = chatMap.get(key);
        if (!existing || new Date(m.created_at) > new Date(existing.lastTime)) {
          chatMap.set(key, {
            chatId: m.telegram_chat_id,
            userName: m.telegram_user_name,
            lastMessage: m.content.substring(0, 30) + (m.content.length > 30 ? '...' : ''),
            lastTime: new Date(m.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            unread: unreadChats.has(m.telegram_chat_id),
            botId: m.bot_activation_id,
          });
        }
      });
    
    return Array.from(chatMap.values()).sort((a, b) => 
      new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime()
    );
  })();

  const selectedBot = bots.find(b => b.id === selectedBotId) || null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <div className="flex-1 flex overflow-hidden">
        <ChatSidebar
          bots={bots}
          chats={chatItems}
          selectedBotId={selectedBotId}
          selectedChatId={selectedChatId}
          onSelectBot={setSelectedBotId}
          onSelectChat={handleSelectChat}
          onAddBot={() => setShowAddBot(true)}
          unreadChats={unreadChats}
        />
        
        <ChatWindow
          selectedBot={selectedBot}
          selectedChatId={selectedChatId}
          messages={messages.filter(m => m.bot_activation_id === selectedBotId)}
          onSendMessage={handleSendMessage}
          enableSound={enableSound}
          onToggleSound={() => setEnableSound(!enableSound)}
          soundType={soundType}
          onSoundTypeChange={setSoundType}
          onTestSound={playNotificationSound}
        />
      </div>

      <AddBotDialog
        open={showAddBot}
        onOpenChange={setShowAddBot}
        onBotAdded={handleBotAdded}
      />
    </div>
  );
};

export default Index;
