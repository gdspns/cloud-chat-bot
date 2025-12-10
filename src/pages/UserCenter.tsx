import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Bot, Trash2, Key, CheckCircle, XCircle, AlertTriangle, WifiOff } from "lucide-react";
import { AddBotDialog } from "@/components/AddBotDialog";
import { useAuth } from "@/hooks/use-auth";
import type { BotActivation } from "@/types/bot";

export const UserCenter = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, isInitialized } = useAuth();
  const [bots, setBots] = useState<BotActivation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddBot, setShowAddBot] = useState(false);
  const [bindingBotId, setBindingBotId] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState("");
  const [isBinding, setIsBinding] = useState(false);
  const [isUserDisabled, setIsUserDisabled] = useState(false);
  const { toast } = useToast();

  // 检查用户登录状态 - 等待初始化完成
  useEffect(() => {
    if (!isInitialized) return;
    
    if (!user) {
      navigate('/auth', { replace: true });
    } else {
      setIsLoading(false);
    }
  }, [user, isInitialized, navigate]);

  // 加载用户的机器人和禁用状态
  useEffect(() => {
    if (user) {
      loadBots();
      checkUserDisabled(user.id);
    }
  }, [user]);

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

  // 实时订阅机器人状态更新
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('user-center-bots-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bot_activations'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newBot = payload.new as unknown as BotActivation;
            // 只处理属于当前用户的机器人
            if (newBot.user_id === user.id) {
              setBots(prev => {
                if (prev.find(b => b.id === newBot.id)) return prev;
                return [newBot, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedBot = payload.new as unknown as BotActivation;
            // 检查是否是游客机器人被绑定到当前用户
            if (updatedBot.user_id === user.id) {
              setBots(prev => {
                const existing = prev.find(b => b.id === updatedBot.id);
                if (existing) {
                  return prev.map(b => b.id === updatedBot.id ? updatedBot : b);
                }
                // 游客机器人同步后添加到列表
                return [updatedBot, ...prev];
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
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadBots = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await (supabase
        .from('bot_activations')
        .select('*') as any)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBots((data || []) as BotActivation[]);
    } catch (error) {
      console.error('加载机器人列表失败:', error);
    }
  };

  const handleDeleteBot = async (id: string) => {
    if (isUserDisabled) {
      return;
    }
    
    try {
      const { error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'delete', botId: id }
      });
      
      if (error) throw error;
      
      setBots(prev => prev.filter(b => b.id !== id));
      
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

  const handleBindCode = async (botId: string) => {
    if (isUserDisabled) {
      return;
    }
    
    if (!activationCode.trim()) {
      toast({
        title: "错误",
        description: "请输入激活码",
        variant: "destructive",
      });
      return;
    }

    setIsBinding(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { 
          action: 'bind-code',
          botId: botId,
          code: activationCode.trim(),
        }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      toast({
        title: "绑定成功",
        description: "激活码已成功绑定，机器人已激活",
      });
      setActivationCode("");
      setBindingBotId(null);
      
      if (data.bot) {
        setBots(prev => prev.map(b => b.id === botId ? data.bot : b));
      }
    } catch (error: any) {
      toast({
        title: "绑定失败",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsBinding(false);
    }
  };

  const handleBotAdded = (newBot: BotActivation) => {
    if (isUserDisabled) {
      setShowAddBot(false);
      return;
    }
    
    setBots(prev => [newBot, ...prev.filter(b => b.id !== newBot.id)]);
    setShowAddBot(false);
    toast({
      title: "添加成功",
      description: `机器人已添加，可免费试用 ${newBot.trial_limit} 条消息`,
    });
  };

  const getStatusDisplay = (bot: BotActivation) => {
    const isExpired = bot.expire_at && new Date(bot.expire_at) < new Date();
    const trialExceeded = !bot.is_authorized && bot.trial_messages_used >= bot.trial_limit;
    
    if (isExpired) {
      return { text: '已过期', color: 'bg-destructive/20 text-destructive' };
    }
    if (trialExceeded) {
      return { text: '试用已满', color: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' };
    }
    if (bot.is_authorized) {
      return { text: '已激活', color: 'bg-green-500/20 text-green-700 dark:text-green-300' };
    }
    return { text: '试用中', color: 'bg-blue-500/20 text-blue-700 dark:text-blue-300' };
  };

  const formatExpireDate = (expireAt: string | null) => {
    if (!expireAt) return '永久';
    const date = new Date(expireAt);
    const now = new Date();
    if (date < now) return '已过期';
    return date.toLocaleDateString('zh-CN');
  };

  // 显示骨架屏避免白屏 - 优化加载体验
  if (!isInitialized || authLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="container mx-auto max-w-4xl p-6 animate-pulse">
          <div className="flex justify-between items-center mb-6">
            <div className="h-8 w-32 bg-muted rounded" />
            <div className="h-10 w-28 bg-muted rounded" />
          </div>
          <div className="bg-card rounded-lg border p-6">
            <div className="h-6 w-24 bg-muted rounded mb-4" />
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="p-4 border rounded-lg space-y-3">
                  <div className="flex justify-between">
                    <div className="h-6 w-20 bg-muted rounded" />
                    <div className="h-8 w-8 bg-muted rounded" />
                  </div>
                  <div className="h-4 w-48 bg-muted rounded" />
                  <div className="h-4 w-32 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto max-w-4xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">用户中心</h1>
          <Button onClick={() => setShowAddBot(true)}>
            <Bot className="h-4 w-4 mr-2" />
            添加机器人
          </Button>
        </div>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">我的机器人</h2>
          
          {bots.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">暂无机器人</p>
              <p className="text-sm text-muted-foreground mt-1">点击上方按钮添加您的第一个机器人</p>
            </div>
          ) : (
            <div className="space-y-4">
              {bots.map((bot) => {
                const status = getStatusDisplay(bot);
                const isExpired = bot.expire_at && new Date(bot.expire_at) < new Date();
                const trialExceeded = !bot.is_authorized && bot.trial_messages_used >= bot.trial_limit;
                const webDisabled = !bot.web_enabled;
                
                return (
                  <Card key={bot.id} className={`p-4 ${isExpired || trialExceeded ? 'border-destructive/50' : ''}`}>
                    <div className="space-y-3">
                      {/* 状态行 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${status.color}`}>
                            {status.text}
                          </span>
                          {bot.is_authorized ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-yellow-500" />
                          )}
                          {webDisabled && (
                            <span className="flex items-center gap-1 text-xs text-destructive">
                              <WifiOff className="h-3 w-3" />
                              Web端口已关闭
                            </span>
                          )}
                          {!bot.is_authorized && (
                            <span className="text-xs text-muted-foreground">
                              试用: {bot.trial_messages_used}/{bot.trial_limit}
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteBot(bot.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* 令牌信息 */}
                      <div className="text-sm">
                        <span className="font-medium">令牌:</span>{' '}
                        <span className="text-muted-foreground">{bot.bot_token.substring(0, 20)}...</span>
                      </div>
                      
                      {/* 有效期信息 */}
                      <div className="text-sm">
                        <span className="font-medium">有效期:</span>{' '}
                        <span className={`${isExpired ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {bot.is_authorized ? formatExpireDate(bot.expire_at) : `试用: ${bot.trial_messages_used}/${bot.trial_limit}`}
                        </span>
                      </div>
                      
                      {/* 过期/试用满提示 */}
                      {(isExpired || trialExceeded) && (
                        <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded text-sm">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          <span className="text-destructive">
                            {isExpired ? '服务已过期，请联系管理员续期' : '试用额度已用完，请绑定激活码'}
                          </span>
                        </div>
                      )}
                      
                      {/* 绑定激活码 */}
                      {(!bot.is_authorized || isExpired) && (
                        <div className="pt-2 border-t">
                          {bindingBotId === bot.id ? (
                            <div className="flex gap-2">
                              <Input
                                placeholder="输入激活码..."
                                value={activationCode}
                                onChange={(e) => setActivationCode(e.target.value)}
                                className="flex-1"
                              />
                              <Button 
                                size="sm" 
                                onClick={() => handleBindCode(bot.id)}
                                disabled={isBinding}
                              >
                                {isBinding ? '绑定中...' : '绑定'}
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setBindingBotId(null);
                                  setActivationCode("");
                                }}
                              >
                                取消
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setBindingBotId(bot.id)}
                              className="w-full"
                            >
                              <Key className="h-4 w-4 mr-2" />
                              {isExpired ? '续期激活' : '绑定激活码'}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Card>
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

export default UserCenter;
