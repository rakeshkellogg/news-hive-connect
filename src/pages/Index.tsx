import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/feed");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-2xl px-4">
        <h1 className="text-4xl font-bold mb-4">Welcome to NewsBuzz</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Collaborate on news with your team. Share, discuss, and stay informed together.
        </p>
        <Button size="lg" onClick={() => navigate("/auth")}>
          Get Started
        </Button>
      </div>
    </div>
  );
};

export default Index;
