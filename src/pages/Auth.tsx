import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthForm } from "@/components/auth/AuthForm";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check if user is already authenticated
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/feed");
      }
    };
    
    checkAuth();
  }, [navigate]);

  // Handle invite code from URL
  useEffect(() => {
    const inviteCode = searchParams.get("invite");
    if (inviteCode) {
      setIsSignUp(true);
      localStorage.setItem("pendingInviteCode", inviteCode);
      toast({
        title: "Invitation received!",
        description: "Please create an account to join the group.",
      });
    }
  }, [searchParams, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">NewsBuzz</h1>
          <p className="text-muted-foreground">
            Collaborate on news with your team
          </p>
        </div>
        
        <AuthForm 
          isSignUp={isSignUp} 
          onToggle={() => setIsSignUp(!isSignUp)} 
        />
      </div>
    </div>
  );
};

export default Auth;