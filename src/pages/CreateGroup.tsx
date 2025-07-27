import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const CreateGroup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [automatedNewsEnabled, setAutomatedNewsEnabled] = useState(false);
  const [newsPrompt, setNewsPrompt] = useState("");
  const [updateFrequency, setUpdateFrequency] = useState("1");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to create a group.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      console.log('user.id:', user.id);
      
      // Get current auth user to ensure we have the correct ID
      const { data: { user: authUser } } = await supabase.auth.getUser();
      console.log('auth.uid():', authUser?.id);
      
      // Check current session
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Session exists:', !!session);
      console.log('Session user:', session?.user?.id);
      
      if (!authUser?.id) {
        throw new Error('User not authenticated');
      }
      
      // Create the group
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          name,
          description,
          created_by: authUser.id,
          automated_news_enabled: automatedNewsEnabled,
          news_prompt: automatedNewsEnabled ? newsPrompt : null,
          update_frequency: automatedNewsEnabled ? parseInt(updateFrequency) : null,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add creator as admin member
      const { error: membershipError } = await supabase
        .from('group_memberships')
        .insert({
          group_id: group.id,
          user_id: user.id,
          role: 'admin'
        });

      if (membershipError) throw membershipError;

      toast({
        title: "Group created successfully!",
        description: `${group.name} has been created. You can now invite others.`,
      });

      navigate("/feed");
    } catch (error: any) {
      toast({
        title: "Error creating group",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <Button variant="ghost" onClick={() => navigate("/feed")} className="mr-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Feed
          </Button>
          <h1 className="text-xl font-semibold">Create New Group</h1>
        </div>
      </header>

      <main className="container py-8">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Create a New Group</CardTitle>
              <CardDescription>
                Create a group to collaborate on news with your team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Group Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter group name"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what this group is for..."
                    rows={3}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="automated-news"
                      checked={automatedNewsEnabled}
                      onCheckedChange={(checked) => setAutomatedNewsEnabled(checked as boolean)}
                    />
                    <Label htmlFor="automated-news">Enable Automated News</Label>
                  </div>

                  {automatedNewsEnabled && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="news-prompt">News Topic/Field of Interest</Label>
                        <Input
                          id="news-prompt"
                          type="text"
                          value={newsPrompt}
                          onChange={(e) => setNewsPrompt(e.target.value)}
                          placeholder="e.g., Technology, Healthcare, Finance..."
                          required={automatedNewsEnabled}
                        />
                      </div>

                      <div className="space-y-3">
                        <Label>Update Frequency</Label>
                        <RadioGroup 
                          value={updateFrequency} 
                          onValueChange={setUpdateFrequency}
                          className="flex flex-col space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="1" id="freq-1" />
                            <Label htmlFor="freq-1">Every day</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="2" id="freq-2" />
                            <Label htmlFor="freq-2">Every 2 days</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="3" id="freq-3" />
                            <Label htmlFor="freq-3">Every 3 days</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </>
                  )}
                </div>
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating..." : "Create Group"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default CreateGroup;