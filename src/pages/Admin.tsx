import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Play, Pause, Calendar, Copy, CheckCircle, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface BotActivation {
  id: string;
  bot_token: string;
  personal_user_id: string;
  greeting_message: string;
  activation_code: string;
  is_active: boolean;
  is_authorized: boolean;
  trial_messages_used: number;
  trial_limit: number;
  expire_at: string | null;
  created_at: string;
}

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "qqai18301";

export const Admin = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('adminLoggedIn') === 'true';
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activations, setActivations] = useState<BotActivation[]>([]);
  const [newBotToken, setNewBotToken] = useState("");
  const [newPersonalUserId, setNewPersonalUserId] = useState("");
  const [newGreetingMessage, setNewGreetingMessage] = useState("你好！👋 有什么可以帮助你的吗？");
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isLoggedIn) {
      loadActivations();
      const interval = setInterval(loadActivations, 30000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  const loadActivations = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'list' }
      });
      
      if (error) throw error;
      if (data.ok) {
        setActivations(data.data || []);
      }
    } catch (error) {
      console.error('加载激活列表失败:', error);
      toast({
        title: "加载失败",
        description: "无法获取激活列表",
        variant: "destructive",
      });
    }
  };

  const handleLogin = () => {
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      localStorage.setItem('adminLoggedIn', 'true');
      toast({
        title: "登录成功",
        description: "欢迎访问管理后台",
      });
    } else {
      toast({
        title: "登录失败",
        description: "用户名或密码错误",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('adminLoggedIn');
    toast({
      title: "已退出",
      description: "您已成功退出管理后台",
    });
  };

  const handleAddActivation = async () => {
    if (!newBotToken || !newPersonalUserId || !newExpiryDate) {
      toast({
        title: "错误",
        description: "请填写所有必填字段",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: {
          action: 'create',
          botToken: newBotToken,
          personalUserId: newPersonalUserId,
          greetingMessage: newGreetingMessage,
          expireAt: new Date(newExpiryDate).toISOString(),
        }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      const botLink = `${window.location.origin}/activate/${data.data.activation_code}`;
      navigator.clipboard.writeText(botLink);
      
      toast({
        title: "添加成功",
        description: "激活链接已复制到剪贴板",
      });
      
      setNewBotToken("");
      setNewPersonalUserId("");
      setNewGreetingMessage("你好！👋 有什么可以帮助你的吗？");
      setNewExpiryDate("");
      loadActivations();
    } catch (error: any) {
      toast({
        title: "添加失败",
        description: error.message || "创建激活失败",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteActivation = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'delete', id }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "删除成功",
        description: "激活和Webhook已删除",
      });
      loadActivations();
    } catch (error: any) {
      toast({
        title: "删除失败",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCopyLink = (code: string) => {
    const botLink = `${window.location.origin}/activate/${code}`;
    navigator.clipboard.writeText(botLink);
    toast({
      title: "复制成功",
      description: "激活链接已复制到剪贴板",
    });
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'toggle', id, isActive: !currentActive }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "状态已更新",
        description: currentActive ? "机器人已停止" : "机器人已启动",
      });
      loadActivations();
    } catch (error: any) {
      toast({
        title: "操作失败",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleExtendDate = async (id: string, newDate: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'extend', id, expireAt: new Date(newDate).toISOString() }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "日期已更新",
        description: "过期日期已延长",
      });
      loadActivations();
    } catch (error: any) {
      toast({
        title: "更新失败",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Telegram机器人管理后台</h1>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">用户名</label>
              <Input
                type="text"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">密码</label>
              <Input
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="mt-2"
              />
            </div>
            <Button onClick={handleLogin} className="w-full">
              登录
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-6xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Telegram机器人授权管理</h1>
          <Button variant="outline" onClick={handleLogout}>
            退出登录
          </Button>
        </div>

        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">添加新的授权</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">机器人令牌 *</label>
              <Input
                placeholder="输入机器人令牌..."
                value={newBotToken}
                onChange={(e) => setNewBotToken(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">个人用户ID *</label>
              <Input
                placeholder="输入个人用户ID..."
                value={newPersonalUserId}
                onChange={(e) => setNewPersonalUserId(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">欢迎消息</label>
              <Input
                placeholder="输入欢迎消息..."
                value={newGreetingMessage}
                onChange={(e) => setNewGreetingMessage(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">过期日期 *</label>
              <Input
                type="date"
                value={newExpiryDate}
                onChange={(e) => setNewExpiryDate(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
          <Button onClick={handleAddActivation} className="mt-4" disabled={isLoading}>
            {isLoading ? "添加中..." : "添加授权"}
          </Button>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">授权列表</h2>
          <div className="space-y-4">
            {activations.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">暂无授权记录</p>
            ) : (
              activations.map((activation) => {
                const isExpired = activation.expire_at && new Date(activation.expire_at) < new Date();
                return (
                  <Card key={activation.id} className={`p-4 ${isExpired ? 'border-destructive' : ''}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            activation.is_active && !isExpired 
                              ? 'bg-green-500/20 text-green-700 dark:text-green-300' 
                              : 'bg-gray-500/20 text-gray-700 dark:text-gray-300'
                          }`}>
                            {activation.is_active && !isExpired ? '运行中' : '已停止'}
                          </span>
                          {activation.is_authorized ? (
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              已激活
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 flex items-center gap-1">
                              <XCircle className="h-3 w-3" />
                              待激活
                            </span>
                          )}
                          {isExpired && (
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-destructive/20 text-destructive">
                              已过期
                            </span>
                          )}
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-purple-500/20 text-purple-700 dark:text-purple-300">
                            试用: {activation.trial_messages_used}/{activation.trial_limit}
                          </span>
                        </div>
                        <div className="grid md:grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="font-medium">机器人令牌:</span> {activation.bot_token.substring(0, 15)}...
                          </div>
                          <div>
                            <span className="font-medium">个人ID:</span> {activation.personal_user_id}
                          </div>
                          <div>
                            <span className="font-medium">激活码:</span> {activation.activation_code}
                          </div>
                          <div>
                            <span className="font-medium">过期日期:</span> {activation.expire_at ? new Date(activation.expire_at).toLocaleDateString('zh-CN') : '无'}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopyLink(activation.activation_code)}
                          title="复制激活链接"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant={activation.is_active ? "destructive" : "default"}
                          onClick={() => handleToggleActive(activation.id, activation.is_active)}
                        >
                          {activation.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Calendar className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>延长使用日期</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <Input
                                type="date"
                                defaultValue={activation.expire_at ? activation.expire_at.split('T')[0] : ''}
                                onChange={(e) => {
                                  const newDate = e.target.value;
                                  if (newDate) {
                                    handleExtendDate(activation.id, newDate);
                                  }
                                }}
                              />
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteActivation(activation.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Admin;
