import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Handle pending invite code after signup
        if (event === 'SIGNED_IN') {
          const pendingInviteCode = localStorage.getItem("pendingInviteCode");
          if (pendingInviteCode && session?.user?.id) {
            setTimeout(() => {
              joinGroupByInviteCode(pendingInviteCode, session.user.id);
              localStorage.removeItem("pendingInviteCode");
            }, 1000);
          }
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const joinGroupByInviteCode = async (inviteCode: string, userId: string) => {
    try {
      console.log('Joining group with user ID:', userId, 'and invite code:', inviteCode);
      
      // Find the group by invite code
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('id')
        .eq('invite_code', inviteCode)
        .single();

      if (groupError) {
        console.error('Error finding group:', groupError);
        throw groupError;
      }

      console.log('Found group:', group);

      // Join the group
      const { error: membershipError } = await supabase
        .from('group_memberships')
        .insert({
          group_id: group.id,
          user_id: userId,
          role: 'member'
        });

      if (membershipError) {
        console.error('Error creating membership:', membershipError);
        throw membershipError;
      }
      
      console.log('Successfully joined group');
    } catch (error) {
      console.error('Error joining group:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
};