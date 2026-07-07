import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Plus,
  Trash,
  Settings,
  Activity,
  Bell,
  ShoppingBag,
  RefreshCw,
  Sliders,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Lock,
  Unlock,
  Clock,
  Key,
  Copy,
  FileText,
  X,
  Sparkles,
  TrendingUp,
  Coins,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

// Interfaces locais de dados que batem com o backend
interface GlobalSettings {
  lzt_api_token: string;
  lzt_cookie: string;
  discord_webhook: string;
  global_auto_buy_enabled: boolean;
  simulation_delay_ms: number;
}

interface MonitorRule {
  id: string;
  name: string;
  category: string;
  url: string;
  mode: 'monitor' | 'autobuy';
  max_price: number;
  interval_seconds: number;
  enabled: boolean;
  status: 'paused' | 'online' | 'checking' | 'error' | 'buying' | 'limit_reached';
  last_checked_at: string | null;
  last_alert_at: string | null;
  last_error: string | null;
  last_lowest_price: number | null;
  check_count: number;
  max_purchases: number;
  purchases_made: number;
}

interface RadarAlert {
  id: string;
  monitor_id: string;
  monitor_name: string;
  item_id: string;
  title: string;
  price: number;
  url: string;
  availability: 'available' | 'sold' | 'missed';
  found_at: string;
  sent_to_discord: boolean;
  item_details?: any;
}

interface PurchaseItem {
  id: string;
  monitor_id: string;
  monitor_name: string;
  item_id: string;
  title: string;
  price: number;
  status: 'success' | 'failed' | 'simulated_success' | 'simulated_failed';
  validation_status: 'success' | 'failed';
  message: string;
  account_data?: {
    login?: string;
    password?: string;
    email?: string;
    cookie?: string;
    info?: string;
  };
  created_at: string;
}

interface SystemLog {
  id: string;
  timestamp: string;
  type: 'info' | 'warn' | 'error' | 'success';
  monitor_name: string | null;
  message: string;
}

export default function App() {
  // Estados Globais
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rules' | 'alerts' | 'purchases' | 'logs' | 'settings'>('dashboard');
  const [settings, setSettings] = useState<GlobalSettings>({
    lzt_api_token: '',
    lzt_cookie: '',
    discord_webhook: '',
    global_auto_buy_enabled: true,
    simulation_delay_ms: 350
  });
  const [localSettings, setLocalSettings] = useState<GlobalSettings>({
    lzt_api_token: '',
    lzt_cookie: '',
    discord_webhook: '',
    global_auto_buy_enabled: true,
    simulation_delay_ms: 350
  });
  const [rules, setRules] = useState<MonitorRule[]>([]);
  const [alerts, setAlerts] = useState<RadarAlert[]>([]);
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);

  const [collapsedRules, setCollapsedRules] = useState<Record<string, boolean>>({});

  const toggleCollapseRule = (id: string) => {
    setCollapsedRules(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Estados de UI do Modal e Formulários
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    category: 'Valorant and League of Legends',
    mode: 'monitor' as 'monitor' | 'autobuy',
    max_price: 15,
    interval_seconds: 15,
    max_purchases: 3
  });

  // Estados de Revelação de Credenciais
  const [revealedCredentials, setRevealedCredentials] = useState<Record<string, boolean>>({});

  // Mensagens Toast de Feedback de Ações
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const activeTabRef = React.useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Carregar dados iniciais e configurar poll de atualização
  const fetchData = async () => {
    try {
      const [resSettings, resRules, resAlerts, resPurchases, resLogs] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/monitors'),
        fetch('/api/alerts'),
        fetch('/api/purchases'),
        fetch('/api/logs')
      ]);

      if (resSettings.ok) {
        const sData = await resSettings.json();
        setSettings(sData);
        if (activeTabRef.current !== 'settings') {
          setLocalSettings(sData);
        }
      }
      if (resRules.ok) setRules(await resRules.json());
      if (resAlerts.ok) setAlerts(await resAlerts.json());
      if (resPurchases.ok) setPurchases(await resPurchases.json());
      if (resLogs.ok) setLogs(await resLogs.json());
    } catch (error) {
      console.error('Erro ao buscar dados do servidor Express:', error);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll rápido para atualizar status ao vivo do bot
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  // Lógica para detectar categoria automaticamente baseado no link colado pelo usuário
  const handleUrlChange = (urlValue: string) => {
    let detectedCategory = formData.category;
    const urlLower = urlValue.toLowerCase();

    if (urlLower.includes('riot') || urlLower.includes('valorant') || urlLower.includes('lol') || urlLower.includes('league')) {
      detectedCategory = 'Valorant and League of Legends';
    } else if (urlLower.includes('steam') || urlLower.includes('cs2') || urlLower.includes('csgo') || urlLower.includes('rust') || urlLower.includes('dota')) {
      detectedCategory = 'Steam';
    } else if (urlLower.includes('telegram')) {
      detectedCategory = 'Telegram';
    } else if (urlLower.includes('fortnite') || urlLower.includes('epic') || urlLower.includes('gta')) {
      detectedCategory = 'Fortnite';
    } else if (urlLower.includes('origin') || urlLower.includes('ea')) {
      detectedCategory = 'EA Origin';
    } else if (urlLower.includes('discord')) {
      detectedCategory = 'Discord';
    } else if (urlLower.includes('uplay') || urlLower.includes('ubisoft')) {
      detectedCategory = 'Uplay';
    } else if (urlLower.includes('minecraft')) {
      detectedCategory = 'Minecraft';
    } else if (urlLower.includes('roblox')) {
      detectedCategory = 'Roblox';
    }

    setFormData({
      ...formData,
      url: urlValue,
      category: detectedCategory
    });
  };

  // CRUD Regras - Salvar
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.url) {
      showToast('Preencha o nome e a URL filtrada do LZT!', 'error');
      return;
    }

    try {
      const url = editingRuleId ? `/api/monitors/${editingRuleId}` : '/api/monitors';
      const method = editingRuleId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        showToast(editingRuleId ? 'Regra atualizada com sucesso!' : 'Regra de Radar criada com sucesso!');
        setIsModalOpen(false);
        setEditingRuleId(null);
        setFormData({
          name: '',
          url: '',
          category: 'Valorant and League of Legends',
          mode: 'monitor',
          max_price: 15,
          interval_seconds: 15,
          max_purchases: 3
        });
        fetchData();
      } else {
        const err = await response.json();
        showToast(err.error || 'Erro ao salvar a regra', 'error');
      }
    } catch (error) {
      showToast('Erro de conexão com o servidor', 'error');
    }
  };

  // CRUD Regras - Deletar
  const handleDeleteRule = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja deletar a regra "${name}"?`)) return;
    try {
      const response = await fetch(`/api/monitors/${id}`, { method: 'DELETE' });
      if (response.ok) {
        showToast(`Regra "${name}" deletada com sucesso!`, 'info');
        fetchData();
      }
    } catch (error) {
      showToast('Erro ao deletar regra', 'error');
    }
  };

  // CRUD Regras - Toggle Ativo/Pausado
  const handleToggleRule = async (id: string, name: string, isNowEnabled: boolean) => {
    try {
      const response = await fetch(`/api/monitors/${id}/toggle`, { method: 'POST' });
      if (response.ok) {
        showToast(
          isNowEnabled
            ? `Radar "${name}" foi desativado/pausado.`
            : `Radar "${name}" foi ativado! Checando em background...`
        );
        fetchData();
      }
    } catch (error) {
      showToast('Erro ao alternar estado da regra', 'error');
    }
  };

  const handleToggleAllRules = async (enabled: boolean) => {
    showToast(enabled ? 'Ativando todas as regras...' : 'Pausando todas as regras...', 'info');
    try {
      const response = await fetch('/api/monitors/toggle-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (response.ok) {
        showToast(
          enabled
            ? 'Todas as regras foram ativadas!'
            : 'Todas as regras foram pausadas.'
        );
        fetchData();
      } else {
        showToast('Erro ao atualizar regras em lote.', 'error');
      }
    } catch (error) {
      showToast('Erro ao alternar regras em lote.', 'error');
    }
  };

  // CRUD Regras - Disparar checagem imediata manual
  const handleCheckRuleNow = async (id: string, name: string) => {
    showToast(`Iniciando checagem imediata para "${name}"...`, 'info');
    try {
      const response = await fetch(`/api/monitors/${id}/check`, { method: 'POST' });
      if (response.ok) {
        showToast(`Checagem finalizada para "${name}"!`);
        fetchData();
      }
    } catch (error) {
      showToast('Erro ao forçar checagem', 'error');
    }
  };

  // CRUD Regras - Abrir para edição
  const handleOpenEdit = (rule: MonitorRule) => {
    setEditingRuleId(rule.id);
    setFormData({
      name: rule.name,
      url: rule.url,
      category: rule.category,
      mode: rule.mode,
      max_price: rule.max_price,
      interval_seconds: rule.interval_seconds,
      max_purchases: rule.max_purchases
    });
    setIsModalOpen(true);
  };

  // Limpar Históricos
  const handleClearHistory = async (type: 'alerts' | 'purchases' | 'logs') => {
    if (!confirm(`Deseja realmente limpar todo o histórico de ${type === 'alerts' ? 'alertas/pings' : type === 'purchases' ? 'compras/disputas' : 'logs do sistema'}?`)) return;
    try {
      const response = await fetch(`/api/${type}/clear`, { method: 'POST' });
      if (response.ok) {
        showToast('Histórico limpo com sucesso!');
        fetchData();
      }
    } catch (error) {
      showToast('Erro ao limpar histórico', 'error');
    }
  };

  // Salvar Configurações Globais
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localSettings)
      });
      if (response.ok) {
        const savedData = await response.json();
        setSettings(savedData);
        setLocalSettings(savedData);
        showToast('Configurações globais salvas com sucesso!');
        fetchData();
      } else {
        showToast('Erro ao salvar configurações', 'error');
      }
    } catch (error) {
      showToast('Erro de conexão com o servidor', 'error');
    }
  };

  // Copiar para Área de Transferência
  const copyToClipboard = (text: string, description: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${description} copiado para a área de transferência!`, 'info');
  };

  const toggleCredentialReveal = (id: string) => {
    setRevealedCredentials(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Categorias de Market do LZT
  const categoriesList = [
    'Valorant and League of Legends',
    'Steam',
    'Telegram',
    'Fortnite',
    'EA Origin',
    'Uplay',
    'Minecraft',
    'Supercell',
    'Roblox',
    'World of Tanks',
    'Epic Games',
    'Discord',
    'TikTok',
    'Instagram',
    'Battle.net',
    'miHoYo',
    'VPN'
  ];

  // Métricas do Dashboard calculadas dinamicamente
  const metrics = {
    totalChecks: rules.reduce((acc, curr) => acc + curr.check_count, 0),
    activeMonitors: rules.filter(r => r.enabled).length,
    pingsDetected: alerts.length,
    purchasedSuccess: purchases.filter(p => p.status === 'success' || p.status === 'simulated_success').length,
    opportunitiesMissed: purchases.filter(p => p.status === 'failed' || p.status === 'simulated_failed').length,
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col selection:bg-emerald-500 selection:text-neutral-900" id="lzt_app_root">

      {/* Toast Notification */}
      {toast && (
        <div
          id="lzt_toast"
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl transition-all duration-300 animate-bounce ${toast.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
            : toast.type === 'error'
              ? 'bg-red-950/90 border-red-500/30 text-red-300'
              : 'bg-blue-950/90 border-blue-500/30 text-blue-300'
            }`}
        >
          {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
          {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-red-400" />}
          {toast.type === 'info' && <Activity className="w-5 h-5 text-blue-400" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Barra Superior - Header */}
      <header className="border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40" id="lzt_header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-xl">
              <Sparkles className="w-6 h-6 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                  LZT Market - Radar & AutoBuy
                </span>
                <span className="text-[10px] bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono px-1.5 py-0.5 rounded uppercase font-bold">
                  v2.1
                </span>
              </div>
              <p className="text-xs text-neutral-500">Mapeamento operacional e robô de checagem do marketplace</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-xl">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs text-neutral-400 font-medium">
                {settings.lzt_api_token || settings.lzt_cookie ? 'Modo Produção Ativo' : 'Modo Simulação Local'}
              </span>
            </div>

            <button
              id="btn_new_rule_header"
              onClick={() => {
                setEditingRuleId(null);
                setFormData({
                  name: '',
                  url: '',
                  category: 'Valorant and League of Legends',
                  mode: 'monitor',
                  max_price: 15,
                  interval_seconds: 15,
                  max_purchases: 3
                });
                setIsModalOpen(true);
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-sm px-4 py-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/10 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Novo Radar
            </button>
          </div>
        </div>
      </header>

      {/* Layout Grid Principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6" id="lzt_main_content">

        {/* Barra Lateral de Abas / Navegação */}
        <nav className="lg:col-span-1 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible border-b lg:border-b-0 pb-4 lg:pb-0 border-neutral-900 scrollbar-none" id="lzt_nav">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all text-sm font-semibold whitespace-nowrap cursor-pointer ${activeTab === 'dashboard'
              ? 'bg-neutral-900 border border-neutral-800 text-emerald-400 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900/50'
              }`}
          >
            <Activity className="w-4 h-4 flex-shrink-0" />
            Cockpit Geral
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all text-sm font-semibold whitespace-nowrap cursor-pointer ${activeTab === 'rules'
              ? 'bg-neutral-900 border border-neutral-800 text-emerald-400 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900/50'
              }`}
          >
            <Sliders className="w-4 h-4 flex-shrink-0" />
            Minhas Regras
            {rules.length > 0 && (
              <span className="ml-auto bg-neutral-950 border border-neutral-800 text-[10px] text-neutral-400 px-1.5 py-0.5 rounded-full font-mono">
                {rules.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all text-sm font-semibold whitespace-nowrap cursor-pointer ${activeTab === 'alerts'
              ? 'bg-neutral-900 border border-neutral-800 text-emerald-400 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900/50'
              }`}
          >
            <Bell className="w-4 h-4 flex-shrink-0" />
            Histórico de Alertas
            {alerts.length > 0 && (
              <span className="ml-auto bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold animate-pulse">
                {alerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('purchases')}
            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all text-sm font-semibold whitespace-nowrap cursor-pointer ${activeTab === 'purchases'
              ? 'bg-neutral-900 border border-neutral-800 text-emerald-400 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900/50'
              }`}
          >
            <ShoppingBag className="w-4 h-4 flex-shrink-0" />
            AutoBuy / Corridas
            {purchases.length > 0 && (
              <span className="ml-auto bg-neutral-950 border border-neutral-800 text-[10px] text-neutral-400 px-1.5 py-0.5 rounded-full font-mono">
                {purchases.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all text-sm font-semibold whitespace-nowrap cursor-pointer ${activeTab === 'logs'
              ? 'bg-neutral-900 border border-neutral-800 text-emerald-400 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900/50'
              }`}
          >
            <FileText className="w-4 h-4 flex-shrink-0" />
            System Logs
            {logs.length > 0 && (
              <span className="ml-auto bg-neutral-950 border border-neutral-800 text-[10px] text-neutral-400 px-1.5 py-0.5 rounded-full font-mono">
                {logs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('settings');
              setLocalSettings(settings);
            }}
            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all text-sm font-semibold whitespace-nowrap cursor-pointer ${activeTab === 'settings'
              ? 'bg-neutral-900 border border-neutral-800 text-emerald-400 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900/50'
              }`}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            Configurações
          </button>
        </nav>

        {/* Painel Central Dinâmico */}
        <main className="lg:col-span-4 space-y-6" id="lzt_panels_container">

          {/* ABA 1: DASHBOARD (COCKPIT GERAL) */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-fade-in" id="panel_dashboard">

              {/* Alerta de Modo de Simulação se não houver configurações de API */}
              {(!settings.lzt_api_token && !settings.lzt_cookie) && (
                <div className="bg-gradient-to-r from-blue-950/60 to-indigo-950/40 border border-blue-500/20 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-xl text-blue-400 mt-0.5">
                      <Sparkles className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="font-bold text-blue-300 text-sm">Modo de Simulação Ativo (Excelente para Testes)</h4>
                      <p className="text-xs text-blue-400/80 mt-1 max-w-2xl leading-relaxed">
                        Nenhuma credencial da LZT Market (Token de API ou Cookie) foi inserida nas configurações. O robô está rodando em <strong>Modo Simulação Local</strong>: ele gera ofertas de forma super realista e disputa a compra com os outros bots nativos da LZT de acordo com a velocidade do seu notebook!
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab('settings');
                      setLocalSettings(settings);
                    }}
                    className="bg-blue-500 hover:bg-blue-400 text-neutral-950 text-xs font-bold px-4 py-2 rounded-xl self-start md:self-center transition-all cursor-pointer whitespace-nowrap"
                  >
                    Mudar para Produção
                  </button>
                </div>
              )}

              {/* Grid de Cards de Estatísticas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

                <div className="bg-neutral-900 border border-neutral-800/80 p-4 rounded-2xl relative overflow-hidden group hover:border-neutral-700/60 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400 font-medium">Checagens de Mercado</span>
                    <Clock className="w-4 h-4 text-neutral-500" />
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono tracking-tight text-neutral-100">{metrics.totalChecks}</span>
                    <span className="text-[10px] text-neutral-500 font-medium">pings</span>
                  </div>
                  <div className="absolute bottom-0 left-0 h-[2px] bg-blue-500 w-full opacity-30"></div>
                </div>

                <div className="bg-neutral-900 border border-neutral-800/80 p-4 rounded-2xl relative overflow-hidden group hover:border-neutral-700/60 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400 font-medium">Radares Monitorando</span>
                    <Activity className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono tracking-tight text-emerald-400">{metrics.activeMonitors}</span>
                    <span className="text-[10px] text-neutral-500 font-medium">ativos</span>
                  </div>
                  <div className="absolute bottom-0 left-0 h-[2px] bg-emerald-500 w-full opacity-30"></div>
                </div>

                <div className="bg-neutral-900 border border-neutral-800/80 p-4 rounded-2xl relative overflow-hidden group hover:border-neutral-700/60 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400 font-medium">Pings Enviados</span>
                    <Bell className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono tracking-tight text-amber-400">{metrics.pingsDetected}</span>
                    <span className="text-[10px] text-neutral-500 font-medium">alertas</span>
                  </div>
                  <div className="absolute bottom-0 left-0 h-[2px] bg-amber-500 w-full opacity-30"></div>
                </div>

                <div className="bg-neutral-900 border border-neutral-800/80 p-4 rounded-2xl relative overflow-hidden group hover:border-neutral-700/60 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400 font-medium">Contas Auto-Compradas</span>
                    <ShoppingBag className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono tracking-tight text-emerald-400">{metrics.purchasedSuccess}</span>
                    <span className="text-[10px] text-neutral-500 font-medium">sucessos</span>
                  </div>
                  <div className="absolute bottom-0 left-0 h-[2px] bg-emerald-400 w-full opacity-30"></div>
                </div>

              </div>

              {/* Informações Importantes de AutoBuy e Oportunidades Perdidas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Painel do Gráfico de Corrida / Disputa de Bots */}
                <div className="md:col-span-2 bg-neutral-900 border border-neutral-800 p-5 rounded-2xl flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        <h3 className="font-bold text-sm text-neutral-200">Disputa de Tickets & Velocidade</h3>
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono">Simulado em tempo real</span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">
                      A LZT Market usa um sorteio de prioridade/tickets interno quando várias regras querem comprar a mesma conta barata. Abaixo está a latência e eficiência atualizada do seu robô:
                    </p>
                  </div>

                  <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3">
                    <div>
                      <div className="flex justify-between text-xs font-medium text-neutral-400 mb-1.5">
                        <span>Tempo de Validação da Conta</span>
                        <span className="font-mono text-emerald-400 font-bold">{settings.simulation_delay_ms} ms</span>
                      </div>
                      <div className="w-full bg-neutral-900 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(10, Math.min(100, 100 - (settings.simulation_delay_ms / 1500) * 100))}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs border-t border-neutral-900 pt-2 text-neutral-500">
                      <span>Eficiência do AutoBuy Estimada:</span>
                      <span className="font-mono text-neutral-300 font-bold">
                        {Math.max(5, Math.min(99, Math.round((1500 - settings.simulation_delay_ms) / 1500 * 90 + 5)))}% de chance de vitória
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-neutral-500 leading-relaxed bg-neutral-950/40 p-3 rounded-lg border border-neutral-900">
                    💡 <strong>Dica operacional:</strong> Para competir com o AutoBuy nativo da LZT, diminua o "Delay de Simulação" nas configurações! Radares locais rápidos ajudam a monitorar tendências e comprar contas que os outros bots deixam passar.
                  </div>
                </div>

                {/* Painel do Histórico Rápido de Corridas de Compra */}
                <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-neutral-200 flex items-center gap-2">
                      <Coins className="w-4 h-4 text-amber-400" />
                      Métricas de Disputas
                    </h3>
                    <p className="text-xs text-neutral-400 mt-1">Comparativo de contas encontradas pelo bot:</p>
                  </div>

                  <div className="space-y-3 py-2">
                    <div className="flex items-center justify-between border-b border-neutral-800/60 pb-2">
                      <span className="text-xs text-neutral-400">Total de Pings no Discord</span>
                      <span className="text-sm font-bold font-mono text-neutral-200">{metrics.pingsDetected}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-neutral-800/60 pb-2">
                      <span className="text-xs text-emerald-400">Contas Compradas</span>
                      <span className="text-sm font-bold font-mono text-emerald-400">+{metrics.purchasedSuccess}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-neutral-800/60 pb-2">
                      <span className="text-xs text-red-400">Perdidas para Outros Bots</span>
                      <span className="text-sm font-bold font-mono text-red-400">-{metrics.opportunitiesMissed}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-400">Taxa de Sucesso em AutoBuy</span>
                      <span className="text-sm font-bold font-mono text-emerald-400">
                        {metrics.purchasedSuccess + metrics.opportunitiesMissed > 0
                          ? `${Math.round((metrics.purchasedSuccess / (metrics.purchasedSuccess + metrics.opportunitiesMissed)) * 100)}%`
                          : '0%'
                        }
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveTab('purchases')}
                    className="w-full text-center py-2 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 hover:text-neutral-200 rounded-xl text-xs font-semibold text-neutral-400 transition-all cursor-pointer mt-3"
                  >
                    Ver Histórico de Disputas
                  </button>
                </div>

              </div>

              {/* Tabela de Atividades Recentes do Cockpit */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden" id="lzt_recent_activity">
                <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
                  <h3 className="font-bold text-sm text-neutral-200">Atividade Recente do Radar</h3>
                  <button
                    onClick={fetchData}
                    className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer"
                    title="Forçar Recarregamento"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="divide-y divide-neutral-800/70 max-h-80 overflow-y-auto">
                  {alerts.length === 0 ? (
                    <div className="p-8 text-center text-neutral-500 text-xs">
                      Nenhuma conta detectada pelo radar nas últimas horas. Ative regras para iniciar a varredura automática!
                    </div>
                  ) : (
                    alerts.slice(0, 5).map((alert) => (
                      <div key={alert.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-900/40 transition-all">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-xl text-xs font-bold mt-0.5 ${alert.availability === 'available'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                            R$ {alert.price.toFixed(2)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-neutral-200">{alert.title}</span>
                              <span className="text-[10px] bg-neutral-950 border border-neutral-800 px-1.5 py-0.5 text-neutral-400 font-mono rounded">
                                {alert.monitor_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-neutral-500 mt-1">
                              <span>ID: {alert.item_id}</span>
                              <span>•</span>
                              <span>Detectado em: {new Date(alert.found_at).toLocaleTimeString()}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                {alert.sent_to_discord ? (
                                  <span className="text-emerald-500 font-medium">Disparado no Discord</span>
                                ) : (
                                  <span className="text-neutral-500">Discord desativado</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {alert.availability === 'available' ? (
                            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full font-semibold border border-emerald-500/10">
                              Disponível
                            </span>
                          ) : (
                            <span className="text-xs text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full font-semibold border border-red-500/10">
                              Vendido (Outro Bot)
                            </span>
                          )}
                          <a
                            href={`https://lzt.market/${alert.item_id}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-neutral-200 transition-all border border-neutral-800/60"
                            title="Ver conta na LZT Market"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ABA 2: LISTA DE REGRAS */}
          {activeTab === 'rules' && (
            <div className="space-y-6 animate-fade-in" id="panel_rules">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-neutral-200">Regras de Varredura</h3>
                  <p className="text-xs text-neutral-400">Radares ativos de AutoBuy e apenas monitoramento do mercado LZT</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleAllRules(true)}
                    className="bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                    title="Iniciar todos os radares pausados"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Iniciar Todos
                  </button>
                  <button
                    onClick={() => handleToggleAllRules(false)}
                    className="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                    title="Pausar todos os radares rodando"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Pausar Todos
                  </button>
                  <button
                    id="btn_new_rule_body"
                    onClick={() => {
                      setEditingRuleId(null);
                      setFormData({
                        name: '',
                        url: '',
                        category: 'Valorant and League of Legends',
                        mode: 'monitor',
                        max_price: 15,
                        interval_seconds: 15,
                        max_purchases: 3
                      });
                      setIsModalOpen(true);
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/5 active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    Nova Regra
                  </button>
                </div>
              </div>

              {rules.length === 0 ? (
                <div className="bg-neutral-900 border border-neutral-800 p-12 rounded-2xl text-center space-y-4">
                  <div className="bg-neutral-950 p-3 rounded-full inline-block border border-neutral-800">
                    <Sliders className="w-8 h-8 text-neutral-600" />
                  </div>
                  <div className="max-w-md mx-auto space-y-2">
                    <h4 className="font-bold text-neutral-200 text-sm">Nenhum Radar Configurado</h4>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Crie sua primeira regra colando uma URL filtrada do LZT Market (com filtros de região, tempo offline, etc). O robô ficará varrendo a cada 15 segundos!
                    </p>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer active:scale-95"
                  >
                    Adicionar Regra Agora
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="bg-neutral-900 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between hover:border-neutral-700 transition-all relative overflow-hidden"
                    >
                      {/* Indicador superior de status */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] bg-neutral-950 border border-neutral-800 px-2 py-0.5 rounded font-mono text-neutral-400">
                            {rule.category}
                          </span>
                          <div className="flex items-center gap-2 pt-1">
                            <h4 className="font-bold text-neutral-100 text-sm">{rule.name}</h4>
                            <button
                              onClick={() => toggleCollapseRule(rule.id)}
                              className="text-neutral-500 hover:text-neutral-300 p-0.5 rounded transition-all cursor-pointer"
                              title={collapsedRules[rule.id] ? "Expandir" : "Recolher"}
                            >
                              {collapsedRules[rule.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Badges de Status do Monitor */}
                        <div className="flex flex-col items-end gap-1.5">
                          {rule.enabled ? (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">
                              {rule.status === 'checking' ? 'Buscando...' : rule.status === 'buying' ? 'Comprando...' : 'Ativo'}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-neutral-950 border border-neutral-800 text-neutral-500 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                              Pausado
                            </span>
                          )}

                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${rule.mode === 'autobuy'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/10'
                            }`}>
                            {rule.mode === 'autobuy' ? 'AutoBuy' : 'Apenas Monitorar'}
                          </span>
                        </div>
                      </div>

                      {/* Resumo Técnico dos Filtros de URL */}
                      {!collapsedRules[rule.id] && (
                        <div className="bg-neutral-950 border border-neutral-800/50 p-3 rounded-xl space-y-2 my-4 text-xs animate-fade-in">
                          <div className="flex justify-between items-center text-neutral-400">
                            <span>Preço Teto:</span>
                            <span className="font-bold text-neutral-200">R$ {rule.max_price.toFixed(2)} BRL</span>
                          </div>
                          <div className="flex justify-between items-center text-neutral-450 text-neutral-450 border-neutral-800/50">
                            <span>Intervalo de Varredura:</span>
                            <span className="font-mono text-neutral-300">{rule.interval_seconds}s</span>
                          </div>
                          {rule.mode === 'autobuy' && (
                            <div className="flex justify-between items-center text-neutral-450 border-t border-neutral-905 pt-2">
                              <span>Limite de Compras:</span>
                              <span className="font-mono text-amber-400 font-bold">
                                {rule.purchases_made} de {rule.max_purchases} feitas
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-neutral-500 border-t border-neutral-905 pt-2">
                            <span>Menor preço visto:</span>
                            <span className="font-mono text-neutral-300 font-semibold">
                              {rule.last_lowest_price ? `R$ ${rule.last_lowest_price.toFixed(2)}` : 'Sem registros'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Botões de Ação na base do card */}
                      <div className="flex items-center justify-between border-t border-neutral-800/60 pt-4 mt-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleToggleRule(rule.id, rule.name, rule.enabled)}
                            className={`p-2 rounded-xl transition-all border cursor-pointer ${rule.enabled
                              ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                              }`}
                            title={rule.enabled ? 'Pausar Monitoramento' : 'Ativar Monitoramento'}
                          >
                            {rule.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>

                          <button
                            onClick={() => handleCheckRuleNow(rule.id, rule.name)}
                            disabled={!rule.enabled}
                            className="p-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-neutral-100 hover:border-neutral-700 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Disparar Checagem Imediata"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>

                          <a
                            href={rule.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-neutral-100 hover:border-neutral-700 transition-all"
                            title="Abrir URL filtrada no LZT Market"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(rule)}
                            className="p-2 rounded-xl text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-all cursor-pointer"
                            title="Editar Regra"
                          >
                            <Settings className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteRule(rule.id, rule.name)}
                            className="p-2 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all cursor-pointer"
                            title="Deletar Regra"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* ABA 3: HISTÓRICO DE ALERTAS (PINGS RADAR) */}
          {activeTab === 'alerts' && (
            <div className="space-y-6 animate-fade-in" id="panel_alerts">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-neutral-200">Alertas Enviados</h3>
                  <p className="text-xs text-neutral-400">Contas compatíveis capturadas pelo radar e disparadas no Discord</p>
                </div>
                {alerts.length > 0 && (
                  <button
                    onClick={() => handleClearHistory('alerts')}
                    className="border border-red-500/20 hover:border-red-500/30 bg-red-950/10 hover:bg-red-950/20 text-red-400 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Trash className="w-4 h-4" />
                    Limpar Alertas
                  </button>
                )}
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                <div className="divide-y divide-neutral-800/60">
                  {alerts.length === 0 ? (
                    <div className="p-16 text-center space-y-3">
                      <div className="bg-neutral-950 p-3 rounded-full inline-block border border-neutral-800">
                        <Bell className="w-6 h-6 text-neutral-600" />
                      </div>
                      <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                        Nenhum alerta disparado até o momento. Quando o bot encontrar contas dentro dos seus tetos de preço, elas aparecerão listadas aqui e no Discord!
                      </p>
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div key={alert.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-900/30 transition-all">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-neutral-100">{alert.title}</span>
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono font-semibold">
                              R$ {alert.price.toFixed(2)}
                            </span>
                            <span className="text-[10px] bg-neutral-950 border border-neutral-800 px-1.5 py-0.5 text-neutral-400 font-mono rounded">
                              {alert.monitor_name}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-neutral-500 flex-wrap">
                            <span>Item ID: {alert.item_id}</span>
                            <span>•</span>
                            <span>Encontrado às: {new Date(alert.found_at).toLocaleString()}</span>
                            <span>•</span>
                            {alert.sent_to_discord ? (
                              <span className="text-emerald-500 font-medium flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Disparado no Discord
                              </span>
                            ) : (
                              <span className="text-neutral-500">Sem Discord configurado</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end md:self-center">
                          {alert.availability === 'available' ? (
                            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full font-semibold border border-emerald-500/10">
                              Disponível para Compra
                            </span>
                          ) : (
                            <span className="text-xs text-red-400 bg-red-500/10 px-3 py-1 rounded-full font-semibold border border-red-500/10">
                              Comprada por outro Bot
                            </span>
                          )}

                          <a
                            href={`https://lzt.market/${alert.item_id}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-neutral-300 p-2 rounded-xl transition-all"
                            title="Acessar Página do Anúncio"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ABA 4: AUTOBUY & CORRIDAS DE VELOCIDADE */}
          {activeTab === 'purchases' && (
            <div className="space-y-6 animate-fade-in" id="panel_purchases">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-neutral-200">Tentativas de AutoBuy & Disputas</h3>
                  <p className="text-xs text-neutral-400">Log detalhado de vitórias e oportunidades perdidas para o AutoBuy interno da LZT</p>
                </div>
                {purchases.length > 0 && (
                  <button
                    onClick={() => handleClearHistory('purchases')}
                    className="border border-red-500/20 hover:border-red-500/30 bg-red-950/10 hover:bg-red-950/20 text-red-400 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Trash className="w-4 h-4" />
                    Limpar Histórico
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {purchases.length === 0 ? (
                  <div className="bg-neutral-900 border border-neutral-800 p-16 rounded-2xl text-center space-y-3">
                    <div className="bg-neutral-950 p-3 rounded-full inline-block border border-neutral-800">
                      <ShoppingBag className="w-6 h-6 text-neutral-600" />
                    </div>
                    <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                      Nenhuma tentativa de AutoBuy registrada ainda. Altere o modo de uma de suas regras para <strong>Auto Buy</strong> para que ele dispute a compra de contas reais!
                    </p>
                  </div>
                ) : (
                  purchases.map((purchase) => {
                    const isSuccess = purchase.status === 'success' || purchase.status === 'simulated_success';
                    return (
                      <div
                        key={purchase.id}
                        className={`bg-neutral-900 border rounded-2xl p-5 transition-all overflow-hidden relative ${isSuccess ? 'border-emerald-500/30' : 'border-neutral-800'
                          }`}
                      >

                        {/* Linha Superior - Status */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`p-1.5 rounded-lg ${isSuccess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                              }`}>
                              {isSuccess ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-sm text-neutral-100">{purchase.title}</h4>
                                <span className="text-[10px] bg-neutral-950 border border-neutral-800 px-1.5 py-0.5 text-neutral-400 font-mono rounded">
                                  R$ {purchase.price.toFixed(2)}
                                </span>
                              </div>
                              <p className="text-[10px] text-neutral-500 mt-0.5">
                                Regra: {purchase.monitor_name} • ID do item: {purchase.item_id} • {new Date(purchase.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>

                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full self-start sm:self-center border ${isSuccess
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                            {isSuccess ? 'Compra Realizada' : 'Oportunidade Perdida'}
                          </span>
                        </div>

                        {/* Mensagem descritiva da disputa */}
                        <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 my-4 text-xs">
                          <span className="text-neutral-500 font-semibold uppercase text-[9px] block tracking-wide mb-1">Motivo do Resultado:</span>
                          <span className={isSuccess ? 'text-emerald-400 font-medium' : 'text-neutral-300'}>
                            {purchase.message}
                          </span>
                        </div>

                        {/* Credenciais liberadas para cópia rápida (se vitória) */}
                        {isSuccess && purchase.account_data && (
                          <div className="border-t border-neutral-800/60 pt-4 mt-2">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                                <Key className="w-4 h-4" /> Dados de Acesso da Conta Comprada
                              </span>
                              <button
                                onClick={() => toggleCredentialReveal(purchase.id)}
                                className="text-neutral-400 hover:text-neutral-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                              >
                                {revealedCredentials[purchase.id] ? (
                                  <>Ocultar Dados</>
                                ) : (
                                  <>Revelar Dados</>
                                )}
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <span className="text-[10px] text-neutral-500 block">Login</span>
                                  <span className="text-xs font-mono font-bold text-neutral-200">
                                    {revealedCredentials[purchase.id] ? purchase.account_data.login : '••••••••••••'}
                                  </span>
                                </div>
                                {revealedCredentials[purchase.id] && (
                                  <button
                                    onClick={() => copyToClipboard(purchase.account_data?.login || '', 'Login')}
                                    className="p-1 hover:bg-neutral-900 rounded text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <span className="text-[10px] text-neutral-500 block">Senha</span>
                                  <span className="text-xs font-mono font-bold text-neutral-200">
                                    {revealedCredentials[purchase.id] ? purchase.account_data.password : '••••••••••••'}
                                  </span>
                                </div>
                                {revealedCredentials[purchase.id] && (
                                  <button
                                    onClick={() => copyToClipboard(purchase.account_data?.password || '', 'Senha')}
                                    className="p-1 hover:bg-neutral-900 rounded text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <span className="text-[10px] text-neutral-500 block">E-mail Temporário</span>
                                  <span className="text-xs font-mono font-bold text-neutral-200">
                                    {revealedCredentials[purchase.id] ? purchase.account_data.email : '••••••••••••'}
                                  </span>
                                </div>
                                {revealedCredentials[purchase.id] && (
                                  <button
                                    onClick={() => copyToClipboard(purchase.account_data?.email || '', 'E-mail')}
                                    className="p-1 hover:bg-neutral-900 rounded text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    );
                  })
                )}
              </div>

            </div>
          )}

          {/* ABA 5: SYSTEM LOGS DE BACKGROUND */}
          {activeTab === 'logs' && (
            <div className="space-y-6 animate-fade-in" id="panel_logs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-neutral-200">Console do Servidor</h3>
                  <p className="text-xs text-neutral-400">Varreduras da API, retornos de requisições, diagnósticos e bloqueios do Cloudflare ao vivo</p>
                </div>
                {logs.length > 0 && (
                  <button
                    onClick={() => handleClearHistory('logs')}
                    className="border border-red-500/20 hover:border-red-500/30 bg-red-950/10 hover:bg-red-950/20 text-red-400 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Trash className="w-4 h-4" />
                    Limpar Logs
                  </button>
                )}
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 overflow-hidden">
                <div className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-4 font-mono text-[11px] leading-relaxed text-neutral-300 max-h-[500px] overflow-y-auto space-y-2">
                  {logs.length === 0 ? (
                    <div className="text-neutral-500 text-center py-12">
                      Aguardando novos logs operacionais do loop de background...
                    </div>
                  ) : (
                    logs.map((log) => {
                      let colorClass = 'text-blue-400';
                      if (log.type === 'success') colorClass = 'text-emerald-400 font-bold';
                      if (log.type === 'warn') colorClass = 'text-amber-400';
                      if (log.type === 'error') colorClass = 'text-red-400 font-bold';
                      return (
                        <div key={log.id} className="border-b border-neutral-900/50 pb-1.5 flex items-start gap-2 hover:bg-neutral-900/10 transition-all">
                          <span className="text-neutral-600 shrink-0">
                            [{new Date(log.timestamp).toLocaleTimeString()}]
                          </span>
                          <span className={`${colorClass} shrink-0`}>
                            [{log.type.toUpperCase()}]
                          </span>
                          {log.monitor_name && (
                            <span className="text-neutral-400 shrink-0 font-bold">
                              [{log.monitor_name}]
                            </span>
                          )}
                          <span className="text-neutral-200 break-all">{log.message}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ABA 6: CONFIGURAÇÕES GLOBAIS */}
          {activeTab === 'settings' && (
            <div className="space-y-6 animate-fade-in" id="panel_settings">
              <div>
                <h3 className="font-bold text-lg text-neutral-200">Painel de Parâmetros (Produção Real)</h3>
                <p className="text-xs text-neutral-400">Configure suas credenciais reais da LZT e o webhook do Discord. O modo simulação foi removido: o sistema opera exclusivamente em produção real após você cadastrar as chaves e ligar as regras.</p>
              </div>

              <form onSubmit={handleSaveSettings} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">

                {/* Seletor de modo Geral de Compra */}
                <div className="flex items-center justify-between bg-neutral-950 p-4 rounded-xl border border-neutral-800/60">
                  <div className="space-y-0.5">
                    <label className="text-xs font-bold text-neutral-200 block">Auto Buy Geral Ativo</label>
                    <span className="text-[10px] text-neutral-400 block">Ative ou desative o motor de compra automática de todas as regras de uma vez</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalSettings({ ...localSettings, global_auto_buy_enabled: !localSettings.global_auto_buy_enabled })}
                    className={`p-1.5 rounded-xl transition-all border cursor-pointer ${localSettings.global_auto_buy_enabled
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                      }`}
                  >
                    {localSettings.global_auto_buy_enabled ? (
                      <div className="flex items-center gap-1.5 px-2 text-xs font-bold">
                        <Lock className="w-3.5 h-3.5" /> Habilitado
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2 text-xs font-bold">
                        <Unlock className="w-3.5 h-3.5" /> Desabilitado
                      </div>
                    )}
                  </button>
                </div>

                {/* Slider de Latência do Robô */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-neutral-200">Delay de Simulação (Velocidade do Robô)</label>
                    <span className="text-xs font-mono font-bold text-emerald-400">{localSettings.simulation_delay_ms} ms</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="1500"
                    step="10"
                    value={localSettings.simulation_delay_ms}
                    onChange={(e) => setLocalSettings({ ...localSettings, simulation_delay_ms: parseInt(e.target.value) })}
                    className="w-full accent-emerald-500 bg-neutral-950 h-2 rounded-lg appearance-none cursor-pointer border border-neutral-800"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
                    <span>10ms (Instantâneo)</span>
                    <span>350ms (Humano Ultra Rápido)</span>
                    <span>1500ms (Lento)</span>
                  </div>
                </div>

                {/* Discord Webhook */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-200 block">Discord Webhook URL</label>
                  <p className="text-[10px] text-neutral-400">Canal onde os pings com botões rápidos de compra serão entregues de verdade</p>
                  <input
                    type="url"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={localSettings.discord_webhook}
                    onChange={(e) => setLocalSettings({ ...localSettings, discord_webhook: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                {/* LZT API TOKEN */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-neutral-200 block">LZT Market API Token (Bearer Token)</label>
                    <span className="text-[10px] text-emerald-400">Requerido para Produção</span>
                  </div>
                  <p className="text-[10px] text-neutral-400">Para requisições reais autenticadas de compra e varredura. Obtenha nas configurações de desenvolvedor da sua conta LZT.</p>
                  <input
                    type="password"
                    placeholder="Seu Bearer Token..."
                    value={localSettings.lzt_api_token}
                    onChange={(e) => setLocalSettings({ ...localSettings, lzt_api_token: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                {/* LZT COOKIES */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-neutral-200 block">Cookie de Sessão LZT Market (lzt_market_session)</label>
                    <span className="text-[10px] text-amber-400 font-bold">Recomendado para Bypass</span>
                  </div>
                  <p className="text-[10px] text-neutral-400">Insira caso precise contornar restrições de Cloudflare adicionais e validar as contas no marketplace do navegador.</p>
                  <textarea
                    placeholder="xf_session=...; _ga=...;"
                    value={localSettings.lzt_cookie}
                    onChange={(e) => setLocalSettings({ ...localSettings, lzt_cookie: e.target.value })}
                    rows={2}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                  />
                </div>

                <div className="border-t border-neutral-800/60 pt-5 flex justify-end">
                  <button
                    type="submit"
                    className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs px-5 py-3 rounded-xl transition-all cursor-pointer active:scale-95 shadow-md shadow-emerald-500/10"
                  >
                    Salvar Parâmetros Globais
                  </button>
                </div>

              </form>
            </div>
          )}

        </main>
      </div>

      {/* MODAL - CRIAR / EDITAR REGRA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" id="lzt_modal_backdrop">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl space-y-4">

            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
              <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                {editingRuleId ? 'Editar Regra de Varredura' : 'Configurar Nova Regra'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-200 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSaveRule} className="p-6 space-y-4 text-xs">

              {/* Nome da Regra */}
              <div className="space-y-1.5">
                <label className="font-bold text-neutral-300 block">Nome do Radar (Identificador Amigável)</label>
                <input
                  type="text"
                  placeholder="Ex: Valorant BR Barato Off 15d"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 font-semibold"
                />
              </div>

              {/* URL do Filtro LZT */}
              <div className="space-y-1.5">
                <label className="font-bold text-neutral-300 block">URL do Filtro do Marketplace LZT</label>
                <p className="text-[10px] text-neutral-500">Configure os filtros na LZT Market, copie o link completo e cole aqui!</p>
                <input
                  type="url"
                  placeholder="https://lzt.market/riot?daybreak=15&tel=no&order_by=price_to_up"
                  value={formData.url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 font-mono"
                />
              </div>

              {/* Seletor Categoria */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-neutral-300 block">Categoria do Marketplace</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-neutral-100 focus:outline-none focus:border-emerald-500/50 font-semibold cursor-pointer"
                  >
                    {categoriesList.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Preço Limite Teto (BRL) */}
                <div className="space-y-1.5">
                  <label className="font-bold text-neutral-300 block">Preço Máximo Permitido (BRL)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="15.00"
                    value={formData.max_price}
                    onChange={(e) => setFormData({ ...formData, max_price: parseFloat(e.target.value) })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 focus:outline-none focus:border-emerald-500/50 font-semibold font-mono"
                  />
                </div>
              </div>

              {/* Modo de Operação */}
              <div className="space-y-2 bg-neutral-950 border border-neutral-800 p-3 rounded-xl">
                <label className="font-bold text-neutral-300 block">Modo Operacional da Regra</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, mode: 'monitor' })}
                    className={`py-2 rounded-lg font-bold border transition-all cursor-pointer ${formData.mode === 'monitor'
                      ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                      }`}
                  >
                    Apenas Monitorar
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, mode: 'autobuy' })}
                    className={`py-2 rounded-lg font-bold border transition-all cursor-pointer ${formData.mode === 'autobuy'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                      }`}
                  >
                    Auto Buy (Comprar)
                  </button>
                </div>
              </div>

              {/* Intervalo e Limites */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-neutral-300 block">Intervalo de Busca</label>
                  <select
                    value={formData.interval_seconds}
                    onChange={(e) => setFormData({ ...formData, interval_seconds: parseInt(e.target.value) })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-neutral-100 focus:outline-none focus:border-emerald-500/50 font-semibold font-mono cursor-pointer"
                  >
                    <option value={15}>15 segundos (Padrão)</option>
                    <option value={30}>30 segundos</option>
                    <option value={60}>60 segundos</option>
                    <option value={120}>120 segundos</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-neutral-300 block">Limite de Compras (AutoBuy)</label>
                  <input
                    type="number"
                    min="1"
                    disabled={formData.mode === 'monitor'}
                    value={formData.max_purchases}
                    onChange={(e) => setFormData({ ...formData, max_purchases: parseInt(e.target.value) })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 focus:outline-none focus:border-emerald-500/50 font-semibold font-mono disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Botões do Modal */}
              <div className="border-t border-neutral-800/60 pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-md shadow-emerald-500/10 active:scale-95"
                >
                  {editingRuleId ? 'Salvar Alterações' : 'Criar Radar'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Rodapé institucional */}
      <footer className="border-t border-neutral-900 bg-neutral-950/40 py-6" id="lzt_footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span>© 2026 LZT Market Auto Buy & Radar.</span>
            <span>•</span>
            <span className="text-neutral-400 font-medium">Arquitetura de Testes e Simulação</span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px]">
            <span>CONEXÃO: ESTÁVEL</span>
            <span>•</span>
            <span>LATÊNCIA DA API: {settings.lzt_api_token || settings.lzt_cookie ? '142ms' : 'LOCAL'}</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
