"use client";

import React, { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  User,
  Bot,
  Bell,
  Palette,
  Database,
  CheckCircle2,
  Loader2,
  Save,
  Upload,
} from "lucide-react";

interface SettingsData {
  profile: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  ai: {
    defaultModel: string;
    autoSaveAiOutputs: boolean;
    keyManagement?: "server";
    byokEnabled?: boolean;
    serverGeminiAvailable: boolean;
    usageLimits?: {
      workflowsPerDay: number;
      chatMessagesPerDay: number;
    };
  };
  notifications: {
    emailNotifications: boolean;
    agentNotifications: boolean;
    taskReminders: boolean;
  };
  appearance: {
    theme: string;
    compactMode: boolean;
  };
  sync: {
    offlineMode: boolean;
    syncFrequency: string;
  };
}

// Model definitions with provider info
const AI_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini", badge: "Fast" },
] as const;

function SettingsContent() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const defaultTab = requestedTab === "api" ? "ai" : requestedTab || "profile";
  const { data: session } = useSession();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab); // Track active tab
  
  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState("gemini-2.5-flash");
  const [autoSaveAiOutputs, setAutoSaveAiOutputs] = useState(true);
  const [serverGeminiAvailable, setServerGeminiAvailable] = useState(true);
  const [usageLimits, setUsageLimits] = useState({ workflowsPerDay: 25, chatMessagesPerDay: 100 });
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [agentNotifications, setAgentNotifications] = useState(true);
  const [taskReminders, setTaskReminders] = useState(true);
  const [theme, setTheme] = useState("system");
  const [compactMode, setCompactMode] = useState(false);
  const [offlineMode, setOfflineMode] = useState(true);
  const [syncFrequency, setSyncFrequency] = useState("realtime");
  const [storageUsed, setStorageUsed] = useState(0);
  
  // Track original values for dirty checking
  const [originalSettings, setOriginalSettings] = useState<SettingsData | null>(null);
  
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  
  // Check if model is available through the server-managed provider.
  const isModelAvailable = useCallback((modelId: string) => {
    const model = AI_MODELS.find(m => m.id === modelId);
    if (!model) return false;
    return model.provider === "gemini" && serverGeminiAvailable;
  }, [serverGeminiAvailable]);
  
  // Get available models
  const availableModels = AI_MODELS.filter(m => isModelAvailable(m.id));
  
  // Check if there are unsaved changes
  const hasChanges = useCallback(() => {
    if (!originalSettings) return false;
    return (
      name !== originalSettings.profile.name ||
      defaultModel !== originalSettings.ai.defaultModel ||
      autoSaveAiOutputs !== originalSettings.ai.autoSaveAiOutputs ||
      emailNotifications !== originalSettings.notifications.emailNotifications ||
      agentNotifications !== originalSettings.notifications.agentNotifications ||
      taskReminders !== originalSettings.notifications.taskReminders ||
      theme !== originalSettings.appearance.theme ||
      compactMode !== originalSettings.appearance.compactMode ||
      offlineMode !== originalSettings.sync.offlineMode ||
      syncFrequency !== originalSettings.sync.syncFrequency
    );
  }, [originalSettings, name, defaultModel, autoSaveAiOutputs, emailNotifications, agentNotifications, taskReminders, theme, compactMode, offlineMode, syncFrequency]);
  
  // Fetch settings from API
  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/settings");
      if (!response.ok) throw new Error("Failed to fetch settings");
      
      const data: SettingsData = await response.json();
      
      // Populate form state
      setName(data.profile.name);
      setEmail(data.profile.email);
      setImage(data.profile.image);
      setDefaultModel(data.ai.defaultModel);
      setAutoSaveAiOutputs(data.ai.autoSaveAiOutputs);
      setServerGeminiAvailable(data.ai.serverGeminiAvailable);
      setUsageLimits(data.ai.usageLimits ?? { workflowsPerDay: 25, chatMessagesPerDay: 100 });
      setEmailNotifications(data.notifications.emailNotifications);
      setAgentNotifications(data.notifications.agentNotifications);
      setTaskReminders(data.notifications.taskReminders);
      setTheme(data.appearance.theme);
      setCompactMode(data.appearance.compactMode);
      setOfflineMode(data.sync.offlineMode);
      setSyncFrequency(data.sync.syncFrequency);
      
      // Store original settings for dirty checking
      setOriginalSettings(data);
      
      // Estimate storage (localStorage + IndexedDB approximation)
      if (typeof window !== 'undefined' && navigator.storage) {
        try {
          const estimate = await navigator.storage.estimate();
          setStorageUsed(Math.round((estimate.usage || 0) / (1024 * 1024)));
        } catch {
          setStorageUsed(0);
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    if (session?.user) {
      fetchSettings();
    }
  }, [session, fetchSettings]);
  
  const userInitials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";
  
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("File too large. Max 2MB allowed.");
        return;
      }
      // TODO: Implement avatar upload to storage
      alert(`Selected: ${file.name}. Avatar upload will be implemented with storage service.`);
    }
  };
  
  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    
    // If no changes, just show success briefly
    if (!hasChanges()) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      setIsSaving(false);
      return;
    }
    
    // Check if model selection is still valid after server availability changes.
    let modelToSave = defaultModel;
    const model = AI_MODELS.find(m => m.id === defaultModel);
    if (model && !isModelAvailable(defaultModel)) {
      modelToSave = availableModels[0]?.id || "gemini-2.5-flash";
      setDefaultModel(modelToSave);
    }
    
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          defaultModel: modelToSave,
          autoSaveAiOutputs,
          emailNotifications,
          agentNotifications,
          taskReminders,
          theme,
          compactMode,
          offlineMode,
          syncFrequency,
        }),
      });
      
      if (!response.ok) throw new Error("Failed to save settings");
      
      setSaveSuccess(true);
      
      // Refresh settings to get the latest server-managed AI availability and quota.
      await fetchSettings();
      
      // Reset success indicator after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen">
        <header className="flex items-center gap-4 border-b px-6 py-3">
          <SidebarTrigger />
          <h1 className="text-xl font-semibold">Settings</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 border-b border-border dark:border-neutral-800 px-4 md:px-6 py-3 shrink-0">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <h1 className="text-lg md:text-xl font-semibold">Settings</h1>
        </div>
        <div className="ml-0 sm:ml-auto flex items-center gap-2 w-full sm:w-auto">
          {hasChanges() && !saveSuccess && (
            <span className="text-xs text-amber-600">Unsaved changes</span>
          )}
          <Button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="flex-1 sm:flex-none"
            aria-label="Save Changes"
          >
            {isSaving ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 className="size-4 mr-2 text-green-500" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            {saveSuccess ? "Saved!" : "Save Changes"}
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="w-full max-w-3xl mx-auto py-4 md:py-8 px-4 md:px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
            <TabsList className="grid grid-cols-3 sm:grid-cols-5 w-full h-auto gap-1">
              <TabsTrigger value="profile" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <User className="size-3 md:size-4" />
                <span className="hidden xs:inline">Profile</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <Bot className="size-3 md:size-4" />
                <span className="hidden xs:inline">AI</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <Bell className="size-3 md:size-4" />
                <span className="hidden xs:inline">Alerts</span>
              </TabsTrigger>
              <TabsTrigger value="appearance" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <Palette className="size-3 md:size-4" />
                <span className="hidden xs:inline">Theme</span>
              </TabsTrigger>
              <TabsTrigger value="sync" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <Database className="size-3 md:size-4" />
                <span className="hidden xs:inline">Sync</span>
              </TabsTrigger>
            </TabsList>

            {/* Profile Settings */}
            <TabsContent value="profile">
              <Card className="dark:bg-neutral-800/50 dark:border-neutral-700">
                <CardHeader className="p-4 md:p-6">
                  <CardTitle className="text-base md:text-lg">Profile Settings</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    Manage your account information and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 md:space-y-6 p-4 pt-0 md:p-6 md:pt-0">
                  <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6">
                    <Avatar className="size-16 md:size-20">
                      <AvatarImage src={image || undefined} />
                      <AvatarFallback className="text-xl md:text-2xl">{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <input
                        type="file"
                        ref={avatarInputRef}
                        accept="image/jpeg,image/png,image/gif"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <Upload className="size-3 mr-2" />
                        <span className="hidden xs:inline">Change</span> Avatar
                      </Button>
                      <p className="text-xs text-muted-foreground hidden sm:block">
                        JPG, PNG or GIF. Max 2MB
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name" className="text-sm">Display Name</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="email" className="text-sm">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        disabled
                        className="bg-muted text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Email cannot be changed. Contact support for assistance.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Settings */}
            <TabsContent value="ai">
              <Card className="dark:bg-neutral-800/50 dark:border-neutral-700">
                <CardHeader className="p-4 md:p-6">
                  <CardTitle className="text-base md:text-lg">AI Configuration</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    Configure AI models and behavior
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 md:space-y-6 p-4 pt-0 md:p-6 md:pt-0">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label className="text-sm">Default AI Model</Label>
                      <Select
                        value={defaultModel}
                        onValueChange={(value) => {
                          // Check if model is available
	                          if (!isModelAvailable(value)) {
	                            alert("Server-managed Gemini is not configured for this demo.");
	                            return;
	                          }
                          setDefaultModel(value);
                        }}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_MODELS.map((model) => {
                            const available = isModelAvailable(model.id);
                            return (
                              <SelectItem 
                                key={model.id} 
                                value={model.id}
                                disabled={!available}
                                className={!available ? "opacity-50" : ""}
                              >
                                <div className="flex items-center gap-2">
                                  {model.name}
                                  {model.badge && (
                                    <Badge 
                                      variant={available ? "secondary" : "outline"} 
                                      className="text-xs"
                                    >
                                      {model.badge}
                                    </Badge>
                                  )}
                                  {!available && (
                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                      Not configured
                                    </Badge>
                                  )}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
	                      {availableModels.length === 0 && (
	                        <p className="text-xs text-amber-600">
	                          No server-managed AI providers are configured. Ask an administrator to set a provider secret.
	                        </p>
	                      )}
	                    </div>

                    <div className="rounded-lg border p-4 dark:border-neutral-700">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Server-managed Gemini</p>
                          <p className="text-xs text-muted-foreground">
                            AI access is controlled by the demo server. No personal API key is required.
                          </p>
                        </div>
                        <Badge variant={serverGeminiAvailable ? "secondary" : "outline"}>
                          {serverGeminiAvailable ? "Available" : "Unavailable"}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-md bg-muted/60 p-3">
                          <p className="text-xs text-muted-foreground">Workflow quota</p>
                          <p className="text-sm font-semibold">{usageLimits.workflowsPerDay}/day</p>
                        </div>
                        <div className="rounded-md bg-muted/60 p-3">
                          <p className="text-xs text-muted-foreground">Chat quota</p>
                          <p className="text-sm font-semibold">{usageLimits.chatMessagesPerDay}/day</p>
                        </div>
                      </div>
                      {!serverGeminiAvailable && (
                        <p className="mt-3 text-xs text-amber-600">
                          AI is temporarily unavailable until the server Gemini key is configured.
                        </p>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h4 className="text-sm font-medium">Agent Behavior</h4>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Auto-save AI outputs</Label>
                          <p className="text-xs text-muted-foreground">
                            Automatically save documents created by agents
                          </p>
                        </div>
                        <Switch
                          checked={autoSaveAiOutputs}
                          onCheckedChange={setAutoSaveAiOutputs}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications */}
            <TabsContent value="notifications">
              <Card className="dark:bg-neutral-800/50 dark:border-neutral-700">
                <CardHeader className="p-4 md:p-6">
                  <CardTitle className="text-base md:text-lg">Notifications</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    Configure how you receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-0 md:p-6 md:pt-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Label className="text-sm">Email Notifications</Label>
                      <p className="text-xs text-muted-foreground">
                        Receive updates via email
                      </p>
                    </div>
                    <Switch
                      checked={emailNotifications}
                      onCheckedChange={setEmailNotifications}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Label className="text-sm">Agent Notifications</Label>
                      <p className="text-xs text-muted-foreground">
                        Get notified when agents complete tasks
                      </p>
                    </div>
                    <Switch
                      checked={agentNotifications}
                      onCheckedChange={setAgentNotifications}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Label className="text-sm">Task Reminders</Label>
                      <p className="text-xs text-muted-foreground">
                        Remind me about upcoming deadlines
                      </p>
                    </div>
                    <Switch
                      checked={taskReminders}
                      onCheckedChange={setTaskReminders}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Appearance */}
            <TabsContent value="appearance">
              <Card className="dark:bg-neutral-800/50 dark:border-neutral-700">
                <CardHeader className="p-4 md:p-6">
                  <CardTitle className="text-base md:text-lg">Appearance</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    Customize the look and feel
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 md:space-y-6 p-4 pt-0 md:p-6 md:pt-0">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label className="text-sm">Theme</Label>
                      <Select value={theme} onValueChange={setTheme}>
                        <SelectTrigger className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <Label className="text-sm">Compact Mode</Label>
                        <p className="text-xs text-muted-foreground">
                          Reduce spacing and padding
                        </p>
                      </div>
                      <Switch
                        checked={compactMode}
                        onCheckedChange={setCompactMode}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Sync Settings */}
            <TabsContent value="sync">
              <Card className="dark:bg-neutral-800/50 dark:border-neutral-700">
                <CardHeader className="p-4 md:p-6">
                  <CardTitle className="text-base md:text-lg">Sync & Storage</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    Configure local-first sync settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 md:space-y-6 p-4 pt-0 md:p-6 md:pt-0">
                  <div className="p-3 md:p-4 rounded-lg border dark:border-neutral-700 bg-muted/30 dark:bg-neutral-700/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <Database className="size-4 md:size-5 text-primary" />
                      <span className="font-medium text-sm md:text-base">Local-First Architecture</span>
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      Your data is stored locally first, then synced to the cloud.
                      This ensures fast performance and offline capability.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Label className="text-sm">Offline Mode</Label>
                      <p className="text-xs text-muted-foreground">
                        Work without internet connection
                      </p>
                    </div>
                    <Switch
                      checked={offlineMode}
                      onCheckedChange={setOfflineMode}
                    />
                  </div>

                  <Separator />

                  <div className="grid gap-2">
                    <Label className="text-sm">Sync Frequency</Label>
                    <Select value={syncFrequency} onValueChange={setSyncFrequency}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="realtime">Real-time</SelectItem>
                        <SelectItem value="5min">Every 5 minutes</SelectItem>
                        <SelectItem value="15min">Every 15 minutes</SelectItem>
                        <SelectItem value="manual">Manual only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-sm">Storage Usage</Label>
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="flex-1 h-2 rounded-full bg-muted dark:bg-neutral-700 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.min((storageUsed / 100) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">
                        {storageUsed} MB / 100 MB
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col h-full w-full overflow-hidden">
        <header className="flex items-center gap-4 border-b border-border dark:border-neutral-800 px-4 md:px-6 py-3 shrink-0">
          <div className="size-6 bg-muted dark:bg-neutral-700 animate-pulse rounded" />
          <div className="h-6 w-24 bg-muted dark:bg-neutral-700 animate-pulse rounded" />
        </header>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-6 md:size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
