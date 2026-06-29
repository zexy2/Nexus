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
  Languages,
  GitBranch,
  KeyRound,
  Copy,
  Trash2,
  Plug,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { useT, useLocale } from "@/lib/i18n/provider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/messages";

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
  agentHandoff: {
    workspaceId: string;
    tokenCreationEnabled: boolean;
    mcpEndpoint: string;
    repository: { url: string; owner: string; name: string; defaultBranch: string } | null;
  };
  integrations: IntegrationSettings;
}

type AgentTokenSummary = {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type IntegrationSummary = {
  id: string;
  provider: string;
  status: string;
  accountName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  seeded: boolean;
  metadata: Record<string, unknown>;
  config: {
    selectedRepository?: string | null;
    selectedTeamId?: string | null;
    selectedProjectId?: string | null;
    selectedTeamName?: string | null;
    selectedProjectName?: string | null;
  };
};

type IntegrationResources = {
  repositories?: Array<{ fullName: string; owner: string; name: string; defaultBranch: string }>;
  teams?: Array<{ id: string; key: string; name: string }>;
  projects?: Array<{ id: string; name: string; teamIds: string[] }>;
};

type ProviderConfig = {
  configured: boolean;
  missing: string[];
};

interface IntegrationSettings {
  connectionEnabled: boolean;
  providers: {
    github: ProviderConfig;
    linear: ProviderConfig;
  };
  items: IntegrationSummary[];
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
  const t = useT();
  const { locale, setLocale } = useLocale();
  
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
  const [workspaceId, setWorkspaceId] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [defaultBranchName, setDefaultBranchName] = useState("main");
  const [tokenCreationEnabled, setTokenCreationEnabled] = useState(false);
  const [agentTokens, setAgentTokens] = useState<AgentTokenSummary[]>([]);
  const [newAgentToken, setNewAgentToken] = useState<string | null>(null);
  const [agentSaving, setAgentSaving] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [integrationConnectionEnabled, setIntegrationConnectionEnabled] = useState(false);
  const [integrationProviders, setIntegrationProviders] = useState<IntegrationSettings["providers"]>({
    github: { configured: false, missing: [] },
    linear: { configured: false, missing: [] },
  });
  const [integrationSaving, setIntegrationSaving] = useState<string | null>(null);
  const [integrationResources, setIntegrationResources] = useState<Record<string, IntegrationResources>>({});
  
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
      setWorkspaceId(data.agentHandoff.workspaceId);
      setRepositoryUrl(data.agentHandoff.repository?.url || "");
      setDefaultBranchName(data.agentHandoff.repository?.defaultBranch || "main");
      setTokenCreationEnabled(data.agentHandoff.tokenCreationEnabled);
      setIntegrations(data.integrations?.items || []);
      setIntegrationConnectionEnabled(data.integrations?.connectionEnabled || false);
      setIntegrationProviders(data.integrations?.providers || {
        github: { configured: false, missing: [] },
        linear: { configured: false, missing: [] },
      });
      const tokenResponse = await fetch(`/api/agent-tokens?workspaceId=${data.agentHandoff.workspaceId}`);
      if (tokenResponse.ok) setAgentTokens(await tokenResponse.json());
      
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

  const saveAgentRepository = async () => {
    setAgentSaving(true);
    try {
      const response = await fetch("/api/agent-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, repositoryUrl, defaultBranch: defaultBranchName }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || body?.error || "Repository could not be saved");
      setSaveSuccess(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Repository could not be saved");
    } finally {
      setAgentSaving(false);
    }
  };

  const createAgentToken = async () => {
    setAgentSaving(true);
    try {
      const response = await fetch("/api/agent-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, name: "Local coding agent" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || body?.error || "Token could not be created");
      setNewAgentToken(body.token);
      await fetchSettings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Token could not be created");
    } finally {
      setAgentSaving(false);
    }
  };

  const revokeAgentToken = async (id: string) => {
    const response = await fetch(`/api/agent-tokens/${id}`, { method: "DELETE" });
    if (response.ok) setAgentTokens((current) => current.map((token) => token.id === id ? { ...token, revokedAt: new Date().toISOString() } : token));
  };

  const connectIntegration = async (provider: "github" | "linear") => {
    setIntegrationSaving(provider);
    try {
      const response = await fetch(`/api/integrations/${provider}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || body?.error || "Integration could not be connected");
      }
      const url = body.installUrl || body.authUrl;
      if (url) window.location.href = url;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Integration could not be connected");
    } finally {
      setIntegrationSaving(null);
    }
  };

  const syncIntegration = async (integrationId: string) => {
    setIntegrationSaving(integrationId);
    try {
      const response = await fetch(`/api/integrations/${integrationId}/sync`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || body?.error || "Integration sync failed");
      }
      await fetchSettings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Integration sync failed");
    } finally {
      setIntegrationSaving(null);
    }
  };

  const loadIntegrationResources = async (integrationId: string) => {
    setIntegrationSaving(`${integrationId}:resources`);
    try {
      const response = await fetch(`/api/integrations/${integrationId}/resources`);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || body?.error || "Integration resources could not be loaded");
      }
      setIntegrationResources((current) => ({
        ...current,
        [integrationId]: body.resources || {},
      }));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Integration resources could not be loaded");
    } finally {
      setIntegrationSaving(null);
    }
  };

  const saveIntegrationConfig = async (
    integrationId: string,
    payload: { selectedRepository?: string; selectedTeamId?: string; selectedProjectId?: string | null }
  ) => {
    setIntegrationSaving(`${integrationId}:config`);
    try {
      const response = await fetch(`/api/integrations/${integrationId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || body?.error || "Integration config could not be saved");
      }
      await fetchSettings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Integration config could not be saved");
    } finally {
      setIntegrationSaving(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen">
        <header className="flex items-center gap-4 border-b px-6 py-3">
          <SidebarTrigger />
          <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
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
          <h1 className="text-lg md:text-xl font-semibold">{t("settings.title")}</h1>
        </div>
        <div className="ml-0 sm:ml-auto flex items-center gap-2 w-full sm:w-auto">
          {hasChanges() && !saveSuccess && (
            <span className="text-xs text-amber-600">{t("common.unsavedChanges")}</span>
          )}
          <Button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="flex-1 sm:flex-none"
            aria-label={t("common.saveChanges")}
          >
            {isSaving ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 className="size-4 mr-2 text-green-500" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            {saveSuccess ? t("common.saved") : t("common.saveChanges")}
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="w-full max-w-3xl mx-auto py-4 md:py-8 px-4 md:px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
            <TabsList className="grid grid-cols-3 sm:grid-cols-7 w-full h-auto gap-1">
              <TabsTrigger value="profile" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <User className="size-3 md:size-4" />
                <span className="hidden xs:inline">{t("settings.tabs.profile")}</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <Bot className="size-3 md:size-4" />
                <span className="hidden xs:inline">{t("settings.tabs.ai")}</span>
              </TabsTrigger>
              <TabsTrigger value="agents" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <GitBranch className="size-3 md:size-4" />
                <span className="hidden xs:inline">{locale === "tr" ? "Agentlar" : "Agents"}</span>
              </TabsTrigger>
              <TabsTrigger value="integrations" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <Plug className="size-3 md:size-4" />
                <span className="hidden xs:inline">{locale === "tr" ? "Bağlantılar" : "Integrations"}</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <Bell className="size-3 md:size-4" />
                <span className="hidden xs:inline">{t("settings.tabs.notifications")}</span>
              </TabsTrigger>
              <TabsTrigger value="appearance" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <Palette className="size-3 md:size-4" />
                <span className="hidden xs:inline">{t("settings.tabs.appearance")}</span>
              </TabsTrigger>
              <TabsTrigger value="sync" className="gap-1 md:gap-2 text-xs md:text-sm px-2 py-1.5">
                <Database className="size-3 md:size-4" />
                <span className="hidden xs:inline">{t("settings.tabs.sync")}</span>
              </TabsTrigger>
            </TabsList>

            {/* Profile Settings */}
            <TabsContent value="profile">
              <Card className="dark:bg-neutral-800/50 dark:border-neutral-700">
                <CardHeader className="p-4 md:p-6">
                  <CardTitle className="text-base md:text-lg">{t("settings.profile.title")}</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    {t("settings.profile.description")}
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
                        {t("settings.profile.changeAvatar")}
                      </Button>
                      <p className="text-xs text-muted-foreground hidden sm:block">
                        {t("settings.profile.avatarHint")}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name" className="text-sm">{t("settings.profile.displayName")}</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="email" className="text-sm">{t("settings.profile.email")}</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        disabled
                        className="bg-muted text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("settings.profile.emailHint")}
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
                  <CardTitle className="text-base md:text-lg">{t("settings.ai.title")}</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    {t("settings.ai.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 md:space-y-6 p-4 pt-0 md:p-6 md:pt-0">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label className="text-sm">{t("settings.ai.defaultModel")}</Label>
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
                                      {t("settings.ai.notConfigured")}
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
	                          {t("settings.ai.noProviders")}
	                        </p>
	                      )}
	                    </div>

                    <div className="rounded-lg border p-4 dark:border-neutral-700">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{t("settings.ai.serverManaged")}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("settings.ai.serverManagedHint")}
                          </p>
                        </div>
                        <Badge variant={serverGeminiAvailable ? "secondary" : "outline"}>
                          {serverGeminiAvailable ? t("settings.ai.available") : t("settings.ai.unavailable")}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-md bg-muted/60 p-3">
                          <p className="text-xs text-muted-foreground">{t("settings.ai.workflowQuota")}</p>
                          <p className="text-sm font-semibold">{usageLimits.workflowsPerDay}{t("settings.ai.perDay")}</p>
                        </div>
                        <div className="rounded-md bg-muted/60 p-3">
                          <p className="text-xs text-muted-foreground">{t("settings.ai.chatQuota")}</p>
                          <p className="text-sm font-semibold">{usageLimits.chatMessagesPerDay}{t("settings.ai.perDay")}</p>
                        </div>
                      </div>
                      {!serverGeminiAvailable && (
                        <p className="mt-3 text-xs text-amber-600">
                          {t("settings.ai.unavailableNotice")}
                        </p>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h4 className="text-sm font-medium">{t("settings.ai.agentBehavior")}</h4>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>{t("settings.ai.autoSave")}</Label>
                          <p className="text-xs text-muted-foreground">
                            {t("settings.ai.autoSaveHint")}
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

            <TabsContent value="agents">
              <Card className="dark:bg-neutral-800/50 dark:border-neutral-700">
                <CardHeader>
                  <CardTitle>{locale === "tr" ? "Coding agent bağlantısı" : "Coding agent connection"}</CardTitle>
                  <CardDescription>
                    {locale === "tr"
                      ? "Codex, Claude Code veya Cursor'a sürümlenmiş görev bağlamını MCP ile teslim edin. Nexus kod çalıştırmaz veya GitHub anahtarı saklamaz."
                      : "Hand versioned task context to Codex, Claude Code, or Cursor over MCP. Nexus does not execute code or store GitHub credentials."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                    <div className="space-y-2">
                      <Label>GitHub repository</Label>
                      <Input value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/owner/repository" />
                    </div>
                    <div className="space-y-2">
                      <Label>{locale === "tr" ? "Varsayılan branch" : "Default branch"}</Label>
                      <Input value={defaultBranchName} onChange={(event) => setDefaultBranchName(event.target.value)} placeholder="main" />
                    </div>
                  </div>
                  <Button onClick={saveAgentRepository} disabled={agentSaving || !tokenCreationEnabled || !repositoryUrl.trim()}>
                    {agentSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                    {locale === "tr" ? "Repo'yu kaydet" : "Save repository"}
                  </Button>

                  <Separator />

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-medium">MCP access token</h3>
                      <p className="text-sm text-muted-foreground">
                        {locale === "tr" ? "Token yalnızca bir kez gösterilir ve 30 gün sonra sona erer." : "The token is shown once and expires after 30 days."}
                      </p>
                    </div>
                    <Button variant="outline" onClick={createAgentToken} disabled={agentSaving || !tokenCreationEnabled || !repositoryUrl.trim()}>
                      <KeyRound className="mr-2 size-4" />
                      {locale === "tr" ? "Token oluştur" : "Create token"}
                    </Button>
                  </div>

                  {!tokenCreationEnabled && (
                    <p className="border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">
                      {locale === "tr" ? "Geçici demo oturumlarında token üretimi kapalıdır." : "Token creation is disabled for temporary demo sessions."}
                    </p>
                  )}

                  {newAgentToken && (
                    <div className="border border-emerald-400/20 bg-emerald-400/5 p-4">
                      <p className="mb-2 text-sm font-medium text-emerald-200">
                        {locale === "tr" ? "Bu tokenı şimdi kaydedin; tekrar gösterilmeyecek." : "Store this token now; it will not be shown again."}
                      </p>
                      <div className="flex gap-2">
                        <Input readOnly value={newAgentToken} className="font-mono text-xs" />
                        <Button size="icon" variant="outline" onClick={() => navigator.clipboard.writeText(newAgentToken)} title="Copy token">
                          <Copy className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {agentTokens.map((token) => (
                      <div key={token.id} className="flex items-center justify-between border border-border p-3 text-sm">
                        <div>
                          <p className="font-medium">{token.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {token.prefix}... · {token.revokedAt ? (locale === "tr" ? "iptal edildi" : "revoked") : new Date(token.expiresAt).toLocaleDateString(locale)}
                          </p>
                        </div>
                        {!token.revokedAt && (
                          <Button size="icon" variant="ghost" onClick={() => revokeAgentToken(token.id)} title="Revoke token">
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <Separator />
                  <div className="space-y-3">
                    <h3 className="font-medium">{locale === "tr" ? "İstemci kurulumu" : "Client setup"}</h3>
                    <p className="text-sm text-muted-foreground">
                      {locale === "tr" ? "Önce NEXUS_AGENT_TOKEN ortam değişkenini oluşturduğunuz token ile ayarlayın." : "First set NEXUS_AGENT_TOKEN to the token you created."}
                    </p>
                    {["Codex", "Claude Code", "Cursor"].map((client) => {
                      const endpoint = `${typeof window !== "undefined" ? window.location.origin : "https://your-nexus.example"}/api/mcp`;
                      const command = client === "Codex"
                        ? `codex mcp add nexus --url ${endpoint} --bearer-token-env-var NEXUS_AGENT_TOKEN`
                        : client === "Claude Code"
                          ? `claude mcp add --transport http nexus ${endpoint} --header "Authorization: Bearer $NEXUS_AGENT_TOKEN"`
                          : `URL: ${endpoint} · Authorization: Bearer NEXUS_AGENT_TOKEN`;
                      return (
                        <div key={client} className="border border-border p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-medium">{client}</span>
                            <Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(command)} title="Copy setup">
                              <Copy className="size-3.5" />
                            </Button>
                          </div>
                          <code className="block overflow-x-auto whitespace-nowrap text-xs text-muted-foreground">{command}</code>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="integrations">
              <Card className="dark:bg-neutral-800/50 dark:border-neutral-700">
                <CardHeader>
                  <CardTitle>{locale === "tr" ? "GitHub ve Linear bağlantıları" : "GitHub and Linear integrations"}</CardTitle>
                  <CardDescription>
                    {locale === "tr"
                      ? "Nexus plan değişikliğinin issue, PR, test ve agent işlerini nasıl etkilediğini bu bağlantılardan okur. Dış sistemlere yazma yalnızca onaylı önerilerle yapılmalıdır."
                      : "Nexus reads issues, PRs, checks, and agent work from these integrations. External writes must happen through approved proposals only."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {!integrationConnectionEnabled && (
                    <div className="border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">
                      {locale === "tr"
                        ? "Geçici demo oturumlarında gerçek GitHub/Linear bağlantısı kapalıdır. Demo seed verisi salt okunur olarak gösterilir."
                        : "Temporary demo sessions cannot connect real GitHub/Linear accounts. Seeded demo data is shown read-only."}
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    {(["github", "linear"] as const).map((provider) => {
                      const existing = integrations.find((integration) => integration.provider === provider);
                      const providerConfig = integrationProviders[provider];
                      const title = provider === "github" ? "GitHub App" : "Linear OAuth";
                      const connected = existing?.status === "connected";
                      const resources = existing ? integrationResources[existing.id] : undefined;
                      const repositories = resources?.repositories || [];
                      const teams = resources?.teams || [];
                      const projects = resources?.projects || [];
                      return (
                        <div key={provider} className="border border-border p-4 dark:border-neutral-700">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-medium">{title}</h3>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {existing?.accountName ||
                                  (locale === "tr" ? "Bağlı çalışma alanı yok" : "No connected workspace")}
                              </p>
                            </div>
                            <Badge variant={connected ? "secondary" : "outline"}>
                              {connected
                                ? existing.seeded
                                  ? "demo seed"
                                  : locale === "tr" ? "bağlı" : "connected"
                                : providerConfig.configured
                                  ? locale === "tr" ? "hazır" : "ready"
                                  : locale === "tr" ? "env eksik" : "env missing"}
                            </Badge>
                          </div>

                          {existing?.lastSyncAt && (
                            <p className="mt-3 text-xs text-muted-foreground">
                              {locale === "tr" ? "Son senkronizasyon" : "Last sync"}:{" "}
                              {new Date(existing.lastSyncAt).toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}
                            </p>
                          )}

                          {providerConfig.missing.length > 0 && !existing && (
                            <p className="mt-3 text-xs leading-5 text-muted-foreground">
                              {locale === "tr" ? "Eksik env" : "Missing env"}:{" "}
                              <span className="font-mono">{providerConfig.missing.join(", ")}</span>
                            </p>
                          )}

                          {existing?.lastError && (
                            <p className="mt-3 text-xs leading-5 text-red-300">{existing.lastError}</p>
                          )}

                          {existing && !existing.seeded && (
                            <div className="mt-4 space-y-3 border-t border-border pt-4 dark:border-neutral-700">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2"
                                onClick={() => loadIntegrationResources(existing.id)}
                                disabled={integrationSaving === `${existing.id}:resources`}
                              >
                                {integrationSaving === `${existing.id}:resources` ? (
                                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-2 size-3.5" />
                                )}
                                {locale === "tr" ? "Kaynakları getir" : "Load resources"}
                              </Button>

                              {provider === "github" && repositories.length > 0 && (
                                <div className="grid gap-2">
                                  <Label className="text-xs">
                                    {locale === "tr" ? "Senkronize edilecek repo" : "Repository to sync"}
                                  </Label>
                                  <Select
                                    value={existing.config.selectedRepository || ""}
                                    onValueChange={(value) =>
                                      saveIntegrationConfig(existing.id, { selectedRepository: value })
                                    }
                                  >
                                    <SelectTrigger className="h-9 text-xs">
                                      <SelectValue
                                        placeholder={locale === "tr" ? "Repo seç" : "Select repository"}
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {repositories.map((repository) => (
                                        <SelectItem key={repository.fullName} value={repository.fullName}>
                                          {repository.fullName}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {provider === "linear" && teams.length > 0 && (
                                <div className="grid gap-2">
                                  <Label className="text-xs">
                                    {locale === "tr" ? "Linear takım" : "Linear team"}
                                  </Label>
                                  <Select
                                    value={existing.config.selectedTeamId || ""}
                                    onValueChange={(value) =>
                                      saveIntegrationConfig(existing.id, {
                                        selectedTeamId: value,
                                        selectedProjectId: existing.config.selectedProjectId || null,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-9 text-xs">
                                      <SelectValue
                                        placeholder={locale === "tr" ? "Takım seç" : "Select team"}
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {teams.map((team) => (
                                        <SelectItem key={team.id} value={team.id}>
                                          {team.name} ({team.key})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {provider === "linear" && projects.length > 0 && (
                                <div className="grid gap-2">
                                  <Label className="text-xs">
                                    {locale === "tr" ? "Linear proje" : "Linear project"}
                                  </Label>
                                  <Select
                                    value={existing.config.selectedProjectId || "all"}
                                    onValueChange={(value) =>
                                      saveIntegrationConfig(existing.id, {
                                        selectedTeamId: existing.config.selectedTeamId || undefined,
                                        selectedProjectId: value === "all" ? null : value,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-9 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">
                                        {locale === "tr" ? "Tüm projeler" : "All projects"}
                                      </SelectItem>
                                      {projects.map((project) => (
                                        <SelectItem key={project.id} value={project.id}>
                                          {project.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {(existing.config.selectedRepository ||
                                existing.config.selectedTeamName ||
                                existing.config.selectedProjectName) && (
                                <p className="text-xs text-muted-foreground">
                                  {locale === "tr" ? "Seçili kaynak" : "Selected source"}:{" "}
                                  {existing.config.selectedRepository ||
                                    [existing.config.selectedTeamName, existing.config.selectedProjectName]
                                      .filter(Boolean)
                                      .join(" / ")}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="mt-4 flex gap-2">
                            {existing ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => syncIntegration(existing.id)}
                                disabled={integrationSaving === existing.id}
                              >
                                {integrationSaving === existing.id ? (
                                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-2 size-3.5" />
                                )}
                                {locale === "tr" ? "Senkronize et" : "Sync"}
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => connectIntegration(provider)}
                                disabled={
                                  !integrationConnectionEnabled ||
                                  !providerConfig.configured ||
                                  integrationSaving === provider
                                }
                              >
                                {integrationSaving === provider ? (
                                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                                ) : (
                                  <ExternalLink className="mr-2 size-3.5" />
                                )}
                                {locale === "tr" ? "Bağla" : "Connect"}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications */}
            <TabsContent value="notifications">
              <Card className="dark:bg-neutral-800/50 dark:border-neutral-700">
                <CardHeader className="p-4 md:p-6">
                  <CardTitle className="text-base md:text-lg">{t("settings.notifications.title")}</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    {t("settings.notifications.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-0 md:p-6 md:pt-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Label className="text-sm">{t("settings.notifications.email")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.notifications.emailHint")}
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
                      <Label className="text-sm">{t("settings.notifications.agent")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.notifications.agentHint")}
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
                      <Label className="text-sm">{t("settings.notifications.reminders")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.notifications.remindersHint")}
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
                  <CardTitle className="text-base md:text-lg">{t("settings.appearance.title")}</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    {t("settings.appearance.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 md:space-y-6 p-4 pt-0 md:p-6 md:pt-0">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label className="text-sm">{t("settings.appearance.theme")}</Label>
                      <Select value={theme} onValueChange={setTheme}>
                        <SelectTrigger className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">{t("settings.appearance.themeLight")}</SelectItem>
                          <SelectItem value="dark">{t("settings.appearance.themeDark")}</SelectItem>
                          <SelectItem value="system">{t("settings.appearance.themeSystem")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-sm flex items-center gap-2">
                        <Languages className="size-4" />
                        {t("settings.appearance.language")}
                      </Label>
                      <Select value={locale} onValueChange={(v) => setLocale(v as typeof locale)}>
                        <SelectTrigger className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOCALES.map((l) => (
                            <SelectItem key={l} value={l}>{LOCALE_LABELS[l]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <Label className="text-sm">{t("settings.appearance.compact")}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.appearance.compactHint")}
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
                  <CardTitle className="text-base md:text-lg">{t("settings.sync.title")}</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    {t("settings.sync.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 md:space-y-6 p-4 pt-0 md:p-6 md:pt-0">
                  <div className="p-3 md:p-4 rounded-lg border dark:border-neutral-700 bg-muted/30 dark:bg-neutral-700/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <Database className="size-4 md:size-5 text-primary" />
                      <span className="font-medium text-sm md:text-base">{t("settings.sync.localFirst")}</span>
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {t("settings.sync.localFirstHint")}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Label className="text-sm">{t("settings.sync.offlineMode")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.sync.offlineModeHint")}
                      </p>
                    </div>
                    <Switch
                      checked={offlineMode}
                      onCheckedChange={setOfflineMode}
                    />
                  </div>

                  <Separator />

                  <div className="grid gap-2">
                    <Label className="text-sm">{t("settings.sync.frequency")}</Label>
                    <Select value={syncFrequency} onValueChange={setSyncFrequency}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="realtime">{t("settings.sync.frequencyRealtime")}</SelectItem>
                        <SelectItem value="5min">{t("settings.sync.frequency5min")}</SelectItem>
                        <SelectItem value="15min">{t("settings.sync.frequency15min")}</SelectItem>
                        <SelectItem value="manual">{t("settings.sync.frequencyManual")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-sm">{t("settings.sync.storageUsage")}</Label>
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
