import { useState, useEffect, useCallback, useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChatWindow } from "@/components/ChatWindow";
import { AddBotDialog } from "@/components/AddBotDialog";
import { ChatSidebarSkeleton, ChatWindowSkeleton } from "@/components/ChatSkeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { BotActivation, Message, ChatItem } from "@/types/bot";

const Index = () => {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isInitialized } = useAuth();
  const [bots, setBots] = useState<BotActivation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [showAddBot, setShowAddBot] = useState(false);
  const [unreadChats, setUnreadChats] = useState<Set<number>>(new Set());
  const [enableSound, setEnableSound] = useState(true);
  const [soundType, setSoundType] = useState("qq");
  const [isUserDisabled, setIsUserDisabled] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const hasSyncedRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);

  // 检查用户是否被禁用
  const checkUserDisabled = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('disabled_users')
        .select('id')
        .eq('user_id', userId)
        .single();
      
      setIsUserDisabled(!!data && !error);
    } catch (error) {
      setIsUserDisabled(false);
    }
  };

  // 同步游客机器人到用户账户
  const syncGuestBotsToUser = async (userId: string): Promise<BotActivation[]> => {
    const guestBotIds = localStorage.getItem('guestBotIds');
    console.log('syncGuestBotsToUser - guestBotIds from localStorage:', guestBotIds);
    if (!guestBotIds) return [];
    
    const ids = JSON.parse(guestBotIds);
    console.log('syncGuestBotsToUser - parsed ids:', ids);
    if (ids.length === 0) return [];
    
    try {
      const syncedBots: BotActivation[] = [];
      
      for (const botId of ids) {
        console.log('syncGuestBotsToUser - updating bot:', botId, 'to user:', userId);
        const { data, error } = await supabase
          .from('bot_activations')
          .update({ user_id: userId })
          .eq('id', botId)
          .is('user_id', null)
          .select('*')
          .single();
        
        if (error) {
          console.error('同步机器人失败:', botId, error);
        } else if (data) {
          console.log('syncGuestBotsToUser - synced bot:', data);
          syncedBots.push(data as BotActivation);
        }
      }
      
      localStorage.removeItem('guestBotIds');
      console.log('syncGuestBotsToUser - total synced:', syncedBots.length);
      
      return syncedBots;
    } catch (error) {
      console.error('同步游客机器人失败:', error);
      return [];
    }
  };

  // 加载机器人列表
  const loadBots = useCallback(async (currentUserId: string | null) => {
    setIsDataLoading(true);
    try {
      if (currentUserId) {
        const { data, error } = await (supabase
          .from('bot_activations')
          .select('*') as any)
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setBots((data || []) as BotActivation[]);
      } else {
        const storedBotIds = localStorage.getItem('guestBotIds');
        if (storedBotIds) {
          const botIds = JSON.parse(storedBotIds);
          if (botIds.length > 0) {
            const { data, error } = await supabase
              .from('bot_activations')
              .select('*')
              .in('id', botIds)
              .order('created_at', { ascending: false });

            if (!error && data) {
              setBots(data as unknown as BotActivation[]);
            }
          } else {
            setBots([]);
          }
        } else {
          setBots([]);
        }
      }
    } catch (error) {
      console.error('加载机器人失败:', error);
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  // 处理用户状态变化
  useEffect(() => {
    if (authLoading) return;

    const currentUserId = user?.id ?? null;
    
    // 检测用户登录事件
    if (currentUserId && currentUserId !== prevUserIdRef.current && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      
      // 异步执行同步和加载
      (async () => {
        await checkUserDisabled(currentUserId);
        const syncedBots = await syncGuestBotsToUser(currentUserId);
        
        const { data, error } = await (supabase
          .from('bot_activations')
          .select('*') as any)
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false });
        
        if (!error && data) {
          setBots(data as BotActivation[]);
        } else if (syncedBots.length > 0) {
          setBots(syncedBots);
        }
      })();
    } else if (!currentUserId && prevUserIdRef.current) {
      // 用户登出
      hasSyncedRef.current = false;
      setBots([]);
      setMessages([]);
      setSelectedBotId(null);
      setSelectedChatId(null);
      loadBots(null);
    } else if (!currentUserId && !prevUserIdRef.current) {
      // 初始状态-未登录
      loadBots(null);
    } else if (currentUserId && currentUserId === prevUserIdRef.current) {
      // 用户已登录且是同一用户
      loadBots(currentUserId);
    }
    
    prevUserIdRef.current = currentUserId;
  }, [user, authLoading, loadBots]);

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

  // 恢复选中状态
  useEffect(() => {
    const storedSelectedBotId = localStorage.getItem('selectedBotId');
    const storedSelectedChatId = localStorage.getItem('selectedChatId');
    
    if (storedSelectedBotId && bots.find(b => b.id === storedSelectedBotId)) {
      setSelectedBotId(storedSelectedBotId);
    } else if (bots.length > 0 && !selectedBotId) {
      setSelectedBotId(bots[0].id);
    }
    
    if (storedSelectedChatId) {
      setSelectedChatId(Number(storedSelectedChatId));
    }
  }, [bots, selectedBotId]);

  // 加载消息
  useEffect(() => {
    if (bots.length === 0) {
      setMessages([]);
      return;
    }

    const botIds = bots.map(b => b.id);
    
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('bot_activation_id', botIds)
        .order('created_at', { ascending: true });

      if (!error && data) {
        // 过滤掉 is_read 为 null 的消息（端口关闭期间的消息，包括管理员代回复）
        const filteredMessages = (data as unknown as Message[]).filter(msg => msg.is_read !== null);
        setMessages(filteredMessages);
      }
    };

    loadMessages();

    // 订阅实时消息
    const messagesChannel = supabase
      .channel('user-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMessage = payload.new as unknown as Message;
          // 检查是否属于当前用户的机器人
          if (!botIds.includes(newMessage.bot_activation_id)) return;
          
          // 获取机器人的 web_enabled 状态
          const msgBot = bots.find(b => b.id === newMessage.bot_activation_id);
          
          // 如果 web 端口关闭，不显示消息也不播放提示音
          if (msgBot && !msgBot.web_enabled) return;
          
          // 过滤掉 is_read 为 null 的消息（端口关闭期间的消息）
          if (newMessage.is_read === null) return;
          
          // 过滤掉管理员回复（当两个端口都关闭时）
          if (msgBot && !msgBot.web_enabled && !msgBot.app_enabled && newMessage.is_admin_reply) return;
          
          setMessages(prev => [...prev, newMessage]);
          
          if (newMessage.direction === 'incoming' && !newMessage.is_admin_reply) {
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
      supabase.removeChannel(messagesChannel);
    };
  }, [bots, playNotificationSound]);

  // 单独订阅机器人状态更新，避免循环依赖
  useEffect(() => {
    const botsChannel = supabase
      .channel('user-bots-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bot_activations',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newBot = payload.new as unknown as BotActivation;
            // 检查是否属于当前用户（包括刚同步的游客机器人）
            if (user && newBot.user_id === user.id) {
              setBots(prev => {
                if (prev.find(b => b.id === newBot.id)) return prev;
                return [newBot, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedBot = payload.new as unknown as BotActivation;
            // 检查是否属于当前用户（包括游客机器人被绑定到用户的情况）
            if (user && updatedBot.user_id === user.id) {
              setBots(prev => {
                const existing = prev.find(b => b.id === updatedBot.id);
                if (existing) {
                  return prev.map(b => b.id === updatedBot.id ? updatedBot : b);
                }
                // 如果是新绑定到用户的机器人，添加到列表
                return [updatedBot, ...prev];
              });
            } else {
              // 检查是否是当前列表中的机器人被解绑
              setBots(prev => {
                const existing = prev.find(b => b.id === updatedBot.id);
                if (existing) {
                  if (updatedBot.user_id !== user?.id) {
                    return prev.filter(b => b.id !== updatedBot.id);
                  }
                  return prev.map(b => b.id === updatedBot.id ? updatedBot : b);
                }
                return prev;
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedBot = payload.old as unknown as BotActivation;
            setBots(prev => prev.filter(b => b.id !== deletedBot.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(botsChannel);
    };
  }, [user]);

  // 处理机器人添加
  const handleBotAdded = async (newBot: BotActivation) => {
    // 检查用户是否被禁用
    if (user && isUserDisabled) {
      setShowAddBot(false);
      return;
    }
    
    // 如果用户未登录，保存到 localStorage
    if (!user) {
      const storedBotIds = JSON.parse(localStorage.getItem('guestBotIds') || '[]');
      if (!storedBotIds.includes(newBot.id)) {
        storedBotIds.push(newBot.id);
        localStorage.setItem('guestBotIds', JSON.stringify(storedBotIds));
      }
    }
    
    // 直接添加到本地状态，避免刷新
    setBots(prev => [newBot, ...prev.filter(b => b.id !== newBot.id)]);
    setSelectedBotId(newBot.id);
    setShowAddBot(false);
    
    toast({
      title: "添加成功",
      description: `机器人已添加，可免费试用 ${newBot.trial_limit} 条消息`,
    });
  };

  // 删除机器人
  const handleDeleteBot = async (botId: string) => {
    // 检查用户是否被禁用
    if (user && isUserDisabled) {
      return;
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'delete', botId }
      });
      
      if (error) throw error;
      
      // 从本地状态移除
      setBots(prev => prev.filter(b => b.id !== botId));
      
      // 如果未登录，从 localStorage 移除
      if (!user) {
        const storedBotIds = JSON.parse(localStorage.getItem('guestBotIds') || '[]');
        const newBotIds = storedBotIds.filter((id: string) => id !== botId);
        localStorage.setItem('guestBotIds', JSON.stringify(newBotIds));
      }
      
      // 如果删除的是当前选中的机器人，清除选中状态
      if (selectedBotId === botId) {
        const remainingBots = bots.filter(b => b.id !== botId);
        setSelectedBotId(remainingBots[0]?.id || null);
        setSelectedChatId(null);
        localStorage.removeItem('selectedBotId');
        localStorage.removeItem('selectedChatId');
      }
      
      toast({
        title: "删除成功",
        description: "机器人已从列表中移除",
      });
    } catch (error: any) {
      toast({
        title: "删除失败",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // 刷新机器人列表
  const handleBotUpdated = (updatedBot: BotActivation) => {
    setBots(prev => prev.map(b => b.id === updatedBot.id ? updatedBot : b));
  };

  // 发送消息
  const handleSendMessage = async (message: string, photoBase64?: string): Promise<{ trialExceeded?: boolean; error?: string }> => {
    if (!selectedBotId || !selectedChatId) {
      return { error: "请选择聊天对象" };
    }

    const currentBot = bots.find(b => b.id === selectedBotId);
    
    // 检查 web 端口
    if (currentBot && !currentBot.web_enabled) {
      return { error: "Web端口已关闭，无法发送消息" };
    }
    
    // 检查试用限制
    if (currentBot && !currentBot.is_authorized && currentBot.trial_messages_used >= currentBot.trial_limit) {
      return { trialExceeded: true };
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-message', {
        body: {
          activationId: selectedBotId,
          chatId: selectedChatId,
          message,
          photoBase64,
        }
      });

      if (error) throw error;
      
      if (data.trialExceeded) {
        return { trialExceeded: true };
      }
      
      if (data.webDisabled) {
        return { error: "Web端口已关闭" };
      }
      
      if (data.error) {
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
    localStorage.setItem('selectedChatId', String(chatId));
    setUnreadChats(prev => {
      const updated = new Set(prev);
      updated.delete(chatId);
      return updated;
    });
    
    // 标记消息为已读
    if (selectedBotId) {
      supabase
        .from('messages')
        .update({ is_read: true })
        .eq('bot_activation_id', selectedBotId)
        .eq('telegram_chat_id', chatId)
        .eq('is_read', false);
    }
  };

  // 选择机器人
  const handleSelectBot = (botId: string) => {
    setSelectedBotId(botId);
    setSelectedChatId(null);
    localStorage.setItem('selectedBotId', botId);
    localStorage.removeItem('selectedChatId');
  };

  // 获取选中机器人
  const selectedBot = bots.find(b => b.id === selectedBotId) || null;
  
  // 过滤消息 - 根据端口状态和管理员回复标记
  const filteredMessages = messages.filter(m => {
    // 过滤掉 is_read 为 null 的消息（端口关闭期间的消息）
    if (m.is_read === null) return false;
    
    // 过滤掉管理员代回复的消息（不在用户消息框显示）
    if (m.is_admin_reply) return false;
    
    const msgBot = bots.find(b => b.id === m.bot_activation_id);
    
    // 如果 web 端口关闭，不显示该机器人的任何消息
    if (msgBot && !msgBot.web_enabled) return false;
    
    return true;
  });

  // 构建聊天列表
  const chatItems: ChatItem[] = (() => {
    const chatMap = new Map<string, ChatItem>();
    
    filteredMessages
      .filter(m => m.direction === 'incoming' && m.bot_activation_id === selectedBotId)
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

  // 认证加载时显示完整骨架屏，避免白屏
  if (!isInitialized || authLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col md:flex-row overflow-auto p-4 gap-4">
          <ChatSidebarSkeleton />
          <ChatWindowSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 flex flex-col md:flex-row overflow-auto p-4 gap-4">
        {isDataLoading ? (
          <>
            <ChatSidebarSkeleton />
            <ChatWindowSkeleton />
          </>
        ) : (
          <>
            <ChatSidebar
              bots={bots}
              chats={chatItems}
              selectedBotId={selectedBotId}
              selectedChatId={selectedChatId}
              onSelectBot={handleSelectBot}
              onSelectChat={handleSelectChat}
              onAddBot={() => setShowAddBot(true)}
              onDeleteBot={handleDeleteBot}
              onBotUpdated={handleBotUpdated}
              unreadChats={unreadChats}
            />
            
            <ChatWindow
              selectedBot={selectedBot}
              selectedChatId={selectedChatId}
              messages={filteredMessages.filter(m => m.bot_activation_id === selectedBotId)}
              onSendMessage={handleSendMessage}
              enableSound={enableSound}
              onToggleSound={() => setEnableSound(!enableSound)}
              soundType={soundType}
              onSoundTypeChange={setSoundType}
              onTestSound={playNotificationSound}
            />
          </>
        )}
      </main>

      {/* 网站介绍 */}
      <div className="border-t bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-2xl font-bold mb-4">关于机器人-激活授权联系QQ：3075554556</h2>
              <p className="text-muted-foreground leading-relaxed">
                我们的Telegram机器人管理平台让您能够轻松管理与用户的对话。
                支持自动问候、实时消息转发、多机器人同时管理等功能。
                无论您是个人用户还是企业，都能找到适合您的解决方案。
                账号就算被限制只要能创建机器人即可用机器人来实现双向聊天充当客服！
                网页端不用魔法上网也可以在线接收消息跟回复消息！
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-4">功能特点</h2>
              <ul className="space-y-2 text-muted-foreground">
                <li>✓ 20条免费试用消息</li>
                <li>✓ 实时消息通知提醒</li>
                <li>✓ 多机器人统一管理</li>
                <li>✓ 简洁易用的操作界面</li>
                <li>✓ 支持自定义问候语</li>
                <li>✓ 支持图片收发</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <AddBotDialog
        open={showAddBot}
        onOpenChange={setShowAddBot}
        onBotAdded={handleBotAdded}
        userId={user?.id}
      />
    </div>
  );
};

export default Index;
