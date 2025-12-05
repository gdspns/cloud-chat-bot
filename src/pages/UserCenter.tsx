import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Bot, Trash2, Key, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AddBotDialog } from "@/components/AddBotDialog";

interface BotActivation {
  id: string;
  bot_token: string;
  personal_user_id: string;
  is_active: boolean;
  is_authorized: boolean;
  trial_messages_used: number;
  trial_limit: number;
  expire_at: string | null;
  created_at: string;
}

export const UserCenter = () => {
  const [bots, setBots] = useState<BotActivation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddBot, setShowAddBot] = useState(false);
  const [bindingBotId, setBindingBotId] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState("");
  const [isBinding, setIsBinding] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadBots();
  }, []);

  const loadBots = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('bot_activations')
        .select('*')
        .neq('bot_token', 'PENDING')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBots(data || []);
    } catch (error) {
      console.error('加载机器人列表失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBot = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'delete', id }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "删除成功",
        description: "机器人已从列表中移除",
      });
      loadBots();
    } catch (error: any) {
      toast({
        title: "删除失败",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleBindCode = async (botId: string) => {
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
      const bot = bots.find(b => b.id === botId);
      if (!bot) throw new Error('机器人不存在');

      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { 
          action: 'bind-existing',
          activationCode: activationCode.trim(),
          botId: botId
        }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "绑定成功",
        description: "激活码已成功绑定，机器人已激活",
      });
      setActivationCode("");
      setBindingBotId(null);
      loadBots();
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

        {/* 机器人列表 */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">我的机器人</h2>
          
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">加载中...</p>
          ) : bots.length === 0 ? (
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
                      
                      {/* 过期提示 */}
                      {(isExpired || trialExceeded) && (
                        <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded text-sm">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          <span className="text-destructive">
                            {isExpired ? '服务已过期，请联系管理员续期' : '试用额度已用完，请绑定激活码'}
                          </span>
                        </div>
                      )}
                      
                      {/* 绑定激活码 */}
                      {!bot.is_authorized && (
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
                              绑定激活码
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
        onBotAdded={loadBots} 
      />
    </div>
  );
};

export default UserCenter;
