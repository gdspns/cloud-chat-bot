import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Play, Pause, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface BotActivation {
  id: string;
  botToken: string;
  personalUserId: string;
  greetingMessage: string;
  expiryDate: string;
  isActive: boolean;
  createdAt: string;
}

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "qqai18301";
const STORAGE_KEY = "telegram_bot_activations";

export const Admin = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activations, setActivations] = useState<BotActivation[]>([]);
  const [newBotToken, setNewBotToken] = useState("");
  const [newPersonalUserId, setNewPersonalUserId] = useState("");
  const [newGreetingMessage, setNewGreetingMessage] = useState("Hello! 👋 I'm here to help you.");
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (isLoggedIn) {
      loadActivations();
      const interval = setInterval(checkExpiredActivations, 60000); // 每分钟检查一次过期
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  const loadActivations = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      setActivations(parsed);
    }
  };

  const saveActivations = (newActivations: BotActivation[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newActivations));
    setActivations(newActivations);
  };

  const checkExpiredActivations = () => {
    const now = new Date();
    const updated = activations.map(activation => {
      if (new Date(activation.expiryDate) < now && activation.isActive) {
        toast({
          title: "激活已过期",
          description: `机器人 ${activation.botToken.substring(0, 10)}... 的激活已过期`,
          variant: "destructive",
        });
        return { ...activation, isActive: false };
      }
      return activation;
    });
    saveActivations(updated);
  };

  const handleLogin = () => {
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
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

  const handleAddActivation = () => {
    if (!newBotToken || !newPersonalUserId || !newExpiryDate) {
      toast({
        title: "错误",
        description: "请填写所有必填字段",
        variant: "destructive",
      });
      return;
    }

    const newActivation: BotActivation = {
      id: Date.now().toString(),
      botToken: newBotToken,
      personalUserId: newPersonalUserId,
      greetingMessage: newGreetingMessage,
      expiryDate: newExpiryDate,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const updated = [...activations, newActivation];
    saveActivations(updated);
    setNewBotToken("");
    setNewPersonalUserId("");
    setNewGreetingMessage("Hello! 👋 I'm here to help you.");
    setNewExpiryDate("");
    
    const botLink = `${window.location.origin}/bot/${newActivation.id}`;
    
    toast({
      title: "添加成功",
      description: "新的机器人激活已添加，链接已复制到剪贴板",
    });
    
    navigator.clipboard.writeText(botLink);
  };

  const handleDeleteActivation = (id: string) => {
    const updated = activations.filter(a => a.id !== id);
    saveActivations(updated);
    
    // 同时删除该激活的本地配置
    localStorage.removeItem(`bot_config_${id}`);
    
    toast({
      title: "删除成功",
      description: "激活和相关链接已删除",
    });
  };

  const handleCopyLink = (id: string) => {
    const botLink = `${window.location.origin}/bot/${id}`;
    navigator.clipboard.writeText(botLink);
    toast({
      title: "复制成功",
      description: "机器人链接已复制到剪贴板",
    });
  };

  const handleToggleActive = (id: string) => {
    const updated = activations.map(a => 
      a.id === id ? { ...a, isActive: !a.isActive } : a
    );
    saveActivations(updated);
    toast({
      title: "状态已更新",
      description: "激活状态已切换",
    });
  };

  const handleExtendDate = (id: string, newDate: string) => {
    const updated = activations.map(a => 
      a.id === id ? { ...a, expiryDate: newDate } : a
    );
    saveActivations(updated);
    toast({
      title: "日期已更新",
      description: "过期日期已延长",
    });
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
          <Button variant="outline" onClick={() => setIsLoggedIn(false)}>
            退出登录
          </Button>
        </div>

        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">添加新的激活</h2>
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
          <Button onClick={handleAddActivation} className="mt-4">
            添加激活
          </Button>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">激活列表</h2>
          <div className="space-y-4">
            {activations.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">暂无激活记录</p>
            ) : (
              activations.map((activation) => {
                const isExpired = new Date(activation.expiryDate) < new Date();
                return (
                  <Card key={activation.id} className={`p-4 ${isExpired ? 'border-destructive' : ''}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            activation.isActive && !isExpired 
                              ? 'bg-green-500/20 text-green-700 dark:text-green-300' 
                              : 'bg-gray-500/20 text-gray-700 dark:text-gray-300'
                          }`}>
                            {activation.isActive && !isExpired ? '运行中' : '已停止'}
                          </span>
                          {isExpired && (
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-destructive/20 text-destructive">
                              已过期
                            </span>
                          )}
                        </div>
                        <div className="grid md:grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="font-medium">机器人令牌:</span> {activation.botToken.substring(0, 15)}...
                          </div>
                          <div>
                            <span className="font-medium">个人ID:</span> {activation.personalUserId}
                          </div>
                          <div>
                            <span className="font-medium">欢迎消息:</span> {activation.greetingMessage}
                          </div>
                          <div>
                            <span className="font-medium">过期日期:</span> {new Date(activation.expiryDate).toLocaleDateString('zh-CN')}
                          </div>
                        </div>
                      </div>
                       <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopyLink(activation.id)}
                          title="复制访问链接"
                        >
                          📋
                        </Button>
                        <Button
                          size="sm"
                          variant={activation.isActive ? "destructive" : "default"}
                          onClick={() => handleToggleActive(activation.id)}
                        >
                          {activation.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
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
                                defaultValue={activation.expiryDate.split('T')[0]}
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
