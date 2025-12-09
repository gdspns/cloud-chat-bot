import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bot, Home, LogIn, UserPlus, LogOut, User, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };
  
  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <Bot className="h-6 w-6 text-primary" />
          <span>TG机器人管理</span>
        </Link>
        
        <div className="flex items-center gap-2">
          <Button 
            variant={location.pathname === "/" ? "default" : "ghost"} 
            size="sm" 
            asChild
          >
            <Link to="/">
              <Home className="h-4 w-4 mr-1" />
              首页
            </Link>
          </Button>
          
          {user ? (
            <>
              <Button 
                variant={location.pathname === "/user" ? "default" : "ghost"} 
                size="sm" 
                asChild
              >
                <Link to="/user">
                  <Settings className="h-4 w-4 mr-1" />
                  用户中心
                </Link>
              </Button>
              <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-muted">
                <User className="h-4 w-4" />
                <span className="text-sm font-medium max-w-[120px] truncate">{user.email}</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-1" />
                退出
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant={location.pathname === "/auth" ? "default" : "ghost"} 
                size="sm" 
                asChild
              >
                <Link to="/auth?mode=register">
                  <UserPlus className="h-4 w-4 mr-1" />
                  注册
                </Link>
              </Button>
              
              <Button 
                variant={location.pathname === "/auth" ? "default" : "ghost"} 
                size="sm" 
                asChild
              >
                <Link to="/auth?mode=login">
                  <LogIn className="h-4 w-4 mr-1" />
                  登录
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
