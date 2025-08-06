import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save, BookOpen, Trash2, Edit } from "lucide-react";

interface SavedPrompt {
  id: string;
  title: string;
  prompt: string;
  created_at: string;
}

interface SavedPromptsProps {
  groupId: string;
  currentPrompt: string;
  onPromptSelect: (prompt: string) => void;
  isAdmin: boolean;
}

export const SavedPrompts: React.FC<SavedPromptsProps> = ({
  groupId,
  currentPrompt,
  onPromptSelect,
  isAdmin,
}) => {
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showSelectDialog, setShowSelectDialog] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<SavedPrompt | null>(null);
  const [promptTitle, setPromptTitle] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (isAdmin) {
      fetchSavedPrompts();
    }
  }, [groupId, isAdmin]);

  const fetchSavedPrompts = async () => {
    try {
      const { data, error } = await supabase
        .from('saved_prompts')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedPrompts(data || []);
    } catch (error) {
      console.error('Error fetching saved prompts:', error);
    }
  };

  const savePrompt = async () => {
    if (!promptTitle.trim() || !currentPrompt.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide both a title and prompt content.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('saved_prompts')
        .insert({
          group_id: groupId,
          title: promptTitle.trim(),
          prompt: currentPrompt.trim(),
          created_by: (await supabase.auth.getUser()).data.user?.id,
        });

      if (error) throw error;

      toast({
        title: "Prompt saved",
        description: "Your prompt has been saved successfully.",
      });

      setPromptTitle("");
      setShowSaveDialog(false);
      fetchSavedPrompts();
    } catch (error: any) {
      toast({
        title: "Error saving prompt",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePrompt = async () => {
    if (!editingPrompt || !promptTitle.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a title.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('saved_prompts')
        .update({
          title: promptTitle.trim(),
          prompt: editingPrompt.prompt,
        })
        .eq('id', editingPrompt.id);

      if (error) throw error;

      toast({
        title: "Prompt updated",
        description: "Your prompt has been updated successfully.",
      });

      setPromptTitle("");
      setEditingPrompt(null);
      fetchSavedPrompts();
    } catch (error: any) {
      toast({
        title: "Error updating prompt",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deletePrompt = async (promptId: string) => {
    try {
      const { error } = await supabase
        .from('saved_prompts')
        .delete()
        .eq('id', promptId);

      if (error) throw error;

      toast({
        title: "Prompt deleted",
        description: "The prompt has been deleted successfully.",
      });

      fetchSavedPrompts();
    } catch (error: any) {
      toast({
        title: "Error deleting prompt",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSelectPrompt = (prompt: string) => {
    onPromptSelect(prompt);
    setShowSelectDialog(false);
    toast({
      title: "Prompt selected",
      description: "The selected prompt has been applied.",
    });
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex gap-2">
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={!currentPrompt.trim()}>
            <Save className="h-4 w-4 mr-2" />
            Save Prompt
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save News Prompt</DialogTitle>
            <DialogDescription>
              Save this prompt with a title for future use in this group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-title">Title</Label>
              <Input
                id="prompt-title"
                value={promptTitle}
                onChange={(e) => setPromptTitle(e.target.value)}
                placeholder="e.g., Tech News Daily, Healthcare Updates..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Prompt Preview</Label>
              <Textarea
                value={currentPrompt}
                readOnly
                className="min-h-[100px] bg-muted"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={savePrompt} disabled={loading}>
              {loading ? "Saving..." : "Save Prompt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSelectDialog} onOpenChange={setShowSelectDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <BookOpen className="h-4 w-4 mr-2" />
            Saved Prompts
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Saved Prompts</DialogTitle>
            <DialogDescription>
              Select a previously saved prompt or manage your saved prompts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {savedPrompts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No saved prompts yet. Save your first prompt!
              </p>
            ) : (
              savedPrompts.map((prompt) => (
                <Card key={prompt.id} className="cursor-pointer hover:bg-muted/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{prompt.title}</CardTitle>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPrompt(prompt);
                            setPromptTitle(prompt.title);
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Prompt</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{prompt.title}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deletePrompt(prompt.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <CardDescription className="text-xs">
                      Created {new Date(prompt.created_at).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent 
                    className="pt-0"
                    onClick={() => handleSelectPrompt(prompt.prompt)}
                  >
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {prompt.prompt}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {editingPrompt && (
        <Dialog open={!!editingPrompt} onOpenChange={() => setEditingPrompt(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Prompt</DialogTitle>
              <DialogDescription>
                Update the title for this saved prompt.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-prompt-title">Title</Label>
                <Input
                  id="edit-prompt-title"
                  value={promptTitle}
                  onChange={(e) => setPromptTitle(e.target.value)}
                  placeholder="Enter prompt title..."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Prompt Content</Label>
                <Textarea
                  value={editingPrompt.prompt}
                  readOnly
                  className="min-h-[100px] bg-muted"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingPrompt(null)}>
                Cancel
              </Button>
              <Button onClick={updatePrompt} disabled={loading}>
                {loading ? "Updating..." : "Update"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};