import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const MONITORS_FILE = path.join(DATA_DIR, 'monitors.json');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');
const PURCHASES_FILE = path.join(DATA_DIR, 'purchases.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

// Garantir que a pasta data exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Interfaces de Dados
interface Settings {
  lzt_api_token: string;
  lzt_cookie: string;
  discord_webhook: string;
  global_auto_buy_enabled: boolean;
  simulation_delay_ms: number;
}

interface Monitor {
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

interface Alert {
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

interface Purchase {
  id: string;
  monitor_id: string;
  monitor_name: string;
  item_id: string;
  title: string;
  price: number;
  status: 'success' | 'failed' | 'simulated_success' | 'simulated_failed';
  validation_status: 'success' | 'failed' | 'soft_error';
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

// Inicializadores de Arquivo
const defaultSettings: Settings = {
  lzt_api_token: '',
  lzt_cookie: '',
  discord_webhook: '',
  global_auto_buy_enabled: true,
  simulation_delay_ms: 350,
};

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch (error) {
    console.error(`Erro ao ler arquivo ${filePath}:`, error);
  }
  return defaultValue;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Erro ao escrever no arquivo ${filePath}:`, error);
  }
}

// In-Memory state
let settings = readJsonFile<Settings>(SETTINGS_FILE, defaultSettings);
let monitors = readJsonFile<Monitor[]>(MONITORS_FILE, []);
let alerts = readJsonFile<Alert[]>(ALERTS_FILE, []);
let purchases = readJsonFile<Purchase[]>(PURCHASES_FILE, []);
let systemLogs = readJsonFile<SystemLog[]>(LOGS_FILE, []);

// Gerenciador de Timers Ativos
const activeTimers = new Map<string, NodeJS.Timeout>();
const locks = new Set<string>(); // Locks por item_id para evitar corridas locais de autobuy
let globalBuyingLock = false; // Flag global para pausar todas as buscas (polling/checks) se houver um AutoBuy (que pode demorar até 90s) rodando, não sobrecarregando a API.

// Função auxiliar de log
function addLog(type: 'info' | 'warn' | 'error' | 'success', monitorName: string | null, message: string) {
  const log: SystemLog = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    type,
    monitor_name: monitorName,
    message,
  };
  systemLogs.unshift(log);
  if (systemLogs.length > 500) systemLogs.pop(); // Limite de 500 logs
  writeJsonFile(LOGS_FILE, systemLogs);

  // Exibir no terminal apenas dados críticos de ação ou erros e sucessos
  const isImportantMessage = message.includes('ativado') || message.includes('pausado') || message.includes('criada');
  if (type === 'success' || type === 'warn' || type === 'error' || isImportantMessage) {
    console.log(`[${log.timestamp}] [${type.toUpperCase()}] ${monitorName ? `[${monitorName}] ` : ''}${message}`);
  }
}

function formatTimestamp(ts: any): string | null {
  if (!ts) return null;
  const val = parseInt(String(ts));
  if (!isNaN(val) && val > 0) {
    const date = new Date(val < 10000000000 ? val * 1000 : val);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return String(ts);
}

function extractItemMetadata(item: any, category: string): any {
  const level = item.level ?? item.riot_level ?? item.lol_level ?? item.steam_level ?? item.account_level ?? null;

  let last_act = item.last_activity ?? item.active ?? item.last_active ?? null;
  if (last_act) {
    const formatted = formatTimestamp(last_act);
    if (formatted) last_act = formatted;
  }

  const origin = item.origin ?? item.account_origin ?? item.item_origin ?? null;
  const email_linked = item.email_linked ?? item.item_email ?? null;
  const email_domain = item.email_domain ?? item.mail_domain ?? item.email_type ?? null;
  const phone_linked = item.phone_linked ?? item.phone_active ?? null;
  const country = item.country ?? item.account_country ?? null;

  const metadata: any = {
    level,
    last_activity: last_act,
    origin,
    email_linked,
    email_domain,
    phone_linked,
    country
  };

  const catLower = (category || '').toLowerCase();

  if (catLower.includes('valorant') || catLower.includes('riot')) {
    metadata.valorant_vp = item.riot_vp ?? item.valorant_vp ?? item.vp ?? null;
    metadata.valorant_rp = item.riot_rp ?? item.valorant_rp ?? item.rp ?? null;
    metadata.valorant_rank = item.riot_rank ?? item.valorant_rank ?? item.rank ?? null;
    metadata.prev_rank = item.riot_prev_rank ?? item.valorant_prev_rank ?? item.previous_season_rank ?? null;
    metadata.knife_count = item.riot_knives ?? item.valorant_knives ?? item.knives ?? null;
    metadata.skins_count = item.riot_skins ?? item.valorant_skins ?? item.skins ?? null;
    metadata.server = item.riot_server ?? item.valorant_server ?? item.server ?? null;
  } else if (catLower.includes('lol') || catLower.includes('league') || catLower.includes('riot')) {
    metadata.lol_level = item.lol_level ?? item.level ?? null;
    metadata.lol_rank = item.lol_rank ?? item.rank ?? null;
    metadata.lol_winrate = item.lol_winrate ?? item.winrate ?? item.win_rate ?? null;
    metadata.lol_be = item.lol_blue_essence ?? item.blue_essence ?? item.be ?? null;
    metadata.lol_oe = item.lol_orange_essence ?? item.orange_essence ?? item.oe ?? null;
    metadata.lol_rp = item.lol_rp ?? item.riot_points ?? null;
    metadata.lol_skins_count = item.lol_skins ?? item.skins ?? null;
    metadata.lol_server = item.lol_server ?? item.lol_region ?? item.region ?? null;
  } else if (catLower.includes('steam') || catLower.includes('cs') || catLower.includes('dota')) {
    metadata.steam_level = item.steam_level ?? item.level ?? null;
    metadata.steam_games_count = item.steam_games_count ?? item.games_count ?? null;
    metadata.cs2_rank = item.cs2_rank ?? item.csgo_rank ?? item.rank ?? null;
    metadata.cs2_skins_count = item.cs2_skins ?? item.skins ?? null;
    metadata.hours = item.hours ?? item.steam_hours ?? null;
  } else if (catLower.includes('fortnite')) {
    metadata.fortnite_skins = item.fortnite_skins ?? item.skins ?? null;
    metadata.fortnite_vbucks = item.fortnite_vbucks ?? item.vbucks ?? null;
    metadata.fortnite_level = item.fortnite_level ?? item.level ?? null;
  }

  return metadata;
}

function generateSimulatedMetadata(category: string): any {
  const catLower = (category || '').toLowerCase();

  const common = {
    level: Math.floor(Math.random() * 200) + 10,
    last_activity: 'Czechia • Feb 11, 2025',
    origin: 'Resale (Brute-force)',
    email_linked: true,
    email_domain: 'rambler.ru',
    phone_linked: false,
    country: 'Czechia'
  };

  if (catLower.includes('valorant') || catLower.includes('riot')) {
    return {
      ...common,
      valorant_vp: [1000, 2400, 7850, 75, 450][Math.floor(Math.random() * 5)],
      valorant_rp: [10, 45, 130, 0][Math.floor(Math.random() * 4)],
      valorant_rank: ['Silver 1', 'Gold 3', 'No rank', 'Diamond I'][Math.floor(Math.random() * 4)],
      prev_rank: ['Silver 1', 'Gold 2', 'Unranked'][Math.floor(Math.random() * 3)],
      knife_count: Math.floor(Math.random() * 5),
      skins_count: Math.floor(Math.random() * 80) + 5,
      server: ['Europe', 'North America', 'Brazil'][Math.floor(Math.random() * 3)]
    };
  } else if (catLower.includes('lol') || catLower.includes('league')) {
    return {
      ...common,
      lol_level: Math.floor(Math.random() * 300) + 30,
      lol_rank: ['Gold IV', 'Platinum II', 'Unranked', 'Bronze I'][Math.floor(Math.random() * 4)],
      lol_winrate: '54',
      lol_be: Math.floor(Math.random() * 30000) + 2000,
      lol_oe: Math.floor(Math.random() * 2000),
      lol_rp: [0, 70, 1350, 2800][Math.floor(Math.random() * 4)],
      lol_skins_count: Math.floor(Math.random() * 200),
      lol_server: ['Europe West', 'Europe Nordic & East', 'Brazil'][Math.floor(Math.random() * 3)]
    };
  } else if (catLower.includes('steam') || catLower.includes('cs')) {
    return {
      ...common,
      steam_level: Math.floor(Math.random() * 100),
      steam_games_count: Math.floor(Math.random() * 50) + 1,
      cs2_rank: ['Gold Nova III', 'Master Guardian I', 'Silver IV'][Math.floor(Math.random() * 3)],
      cs2_skins_count: Math.floor(Math.random() * 40),
      hours: Math.floor(Math.random() * 3000) + 120
    };
  } else if (catLower.includes('fortnite')) {
    return {
      ...common,
      fortnite_skins: Math.floor(Math.random() * 120) + 5,
      fortnite_vbucks: [0, 200, 1200, 2500][Math.floor(Math.random() * 4)],
      fortnite_level: Math.floor(Math.random() * 150) + 1
    };
  }

  return common;
}

// Função para enviar alertas ao webhook do Discord
async function sendDiscordWebhook(alert: Alert, actionResult?: { success: boolean; msg: string; mode: string; account_data?: any }) {
  if (!settings.discord_webhook) return;

  try {
    let color = 3066993; // Verde esmeralda (#2ECC71) por padrão para itens disponíveis/comprados
    let title = '🛒 Conta pronta para compra';
    let statusEmoji = '🟢';
    let statusText = 'Ainda disponível';

    if (alert.availability === 'sold' || alert.availability === 'missed') {
      color = 15158332; // Vermelho (#E74C3C)
      title = '❌ Oportunidade Perdida';
      statusEmoji = '🔴';
      statusText = 'Vendido / Outro Bot';
    }

    if (actionResult) {
      if (actionResult.success) {
        color = 3066993; // Verde
        title = '💰 Auto-Buy Realizado com Sucesso!';
        statusEmoji = '⚡';
        statusText = 'Comprado pelo AutoBuy';
      } else {
        color = 15158332; // Vermelho
        title = '⚠️ Auto-Buy - Falha de Compra';
        statusEmoji = '❌';
        statusText = `Falhou: ${actionResult.msg}`;
      }
    }

    // Tentar detectar a categoria de jogo de forma elegante para o cabeçalho (LOL, Valorant, CS2, etc.)
    let gameCategory = alert.monitor_name.toUpperCase();
    const urlLower = alert.url.toLowerCase();
    if (urlLower.includes('riot') || urlLower.includes('valorant') || urlLower.includes('lol') || urlLower.includes('league')) {
      gameCategory = 'LOL';
    } else if (urlLower.includes('steam') || urlLower.includes('cs2') || urlLower.includes('csgo') || urlLower.includes('rust') || urlLower.includes('dota')) {
      gameCategory = 'Steam';
    } else if (urlLower.includes('telegram')) {
      gameCategory = 'Telegram';
    } else if (urlLower.includes('fortnite') || urlLower.includes('epic')) {
      gameCategory = 'Fortnite';
    } else if (urlLower.includes('discord')) {
      gameCategory = 'Discord';
    }

    // Formatação da descrição exatamente idêntica à fornecida na imagem de exemplo
    const description = `**${gameCategory}**\nR$ ${alert.price.toFixed(2)} Zuza - ${alert.title}\n\n\`R$ ${alert.price.toFixed(2)} • ${statusText}\``;

    const timestampUnix = Math.floor(new Date(alert.found_at).getTime() / 1000);

    const fields: any[] = [
      { name: '💰 Preço', value: `**R$ ${alert.price.toFixed(2)}**`, inline: true },
      { name: '✅ Status', value: `${statusEmoji} ${statusText}`, inline: true },
      { name: '🕒 Encontrado', value: `<t:${timestampUnix}:R>`, inline: true }
    ];

    if (alert.item_details) {
      const details = alert.item_details;
      const catLower = (alert.monitor_name || '').toLowerCase();
      const isRiot = catLower.includes('valorant') || catLower.includes('riot');
      const isLoL = catLower.includes('lol') || catLower.includes('league');
      const isSteam = catLower.includes('steam') || catLower.includes('cs') || catLower.includes('dota');
      const isFortnite = catLower.includes('fortnite');

      if (isRiot) {
        if (details.valorant_vp !== undefined && details.valorant_vp !== null) fields.push({ name: '💎 VP (Valorant Points)', value: `\`${details.valorant_vp}\``, inline: true });
        if (details.valorant_rp !== undefined && details.valorant_rp !== null) fields.push({ name: '🔴 Radiant Points', value: `\`${details.valorant_rp}\``, inline: true });
        if (details.valorant_rank !== undefined && details.valorant_rank !== null) fields.push({ name: '🏆 Rank Atual', value: `\`${details.valorant_rank}\``, inline: true });
        if (details.prev_rank !== undefined && details.prev_rank !== null) fields.push({ name: '🎖️ Rank Anterior', value: `\`${details.prev_rank}\``, inline: true });
        if (details.knife_count !== undefined && details.knife_count !== null) fields.push({ name: '🔪 Facas', value: `\`${details.knife_count}\``, inline: true });
        if (details.skins_count !== undefined && details.skins_count !== null) fields.push({ name: '🎨 Skins', value: `\`${details.skins_count}\``, inline: true });
        if (details.server !== undefined && details.server !== null) fields.push({ name: '🌐 Região', value: `\`${details.server}\``, inline: true });
      } else if (isLoL) {
        if (details.lol_level !== undefined && details.lol_level !== null) fields.push({ name: '⭐ Level LoL', value: `\`${details.lol_level}\``, inline: true });
        if (details.lol_rank !== undefined && details.lol_rank !== null) fields.push({ name: '🏆 Rank LoL', value: `\`${details.lol_rank}\``, inline: true });
        if (details.lol_winrate !== undefined && details.lol_winrate !== null) fields.push({ name: '📈 WinRate', value: `\`${details.lol_winrate}%\``, inline: true });
        if (details.lol_be !== undefined && details.lol_be !== null) fields.push({ name: '🔵 Blue Essence', value: `\`${details.lol_be}\``, inline: true });
        if (details.lol_oe !== undefined && details.lol_oe !== null) fields.push({ name: '🟠 Orange Essence', value: `\`${details.lol_oe}\``, inline: true });
        if (details.lol_rp !== undefined && details.lol_rp !== null) fields.push({ name: '💎 RP', value: `\`${details.lol_rp}\``, inline: true });
        if (details.lol_skins_count !== undefined && details.lol_skins_count !== null) fields.push({ name: '🎨 Skins LoL', value: `\`${details.lol_skins_count}\``, inline: true });
        if (details.lol_server !== undefined && details.lol_server !== null) fields.push({ name: '🌐 Região', value: `\`${details.lol_server}\``, inline: true });
      } else if (isSteam) {
        if (details.steam_level !== undefined && details.steam_level !== null) fields.push({ name: '⭐ Steam Level', value: `\`${details.steam_level}\``, inline: true });
        if (details.steam_games_count !== undefined && details.steam_games_count !== null) fields.push({ name: '🎮 Qtd Jogos', value: `\`${details.steam_games_count}\``, inline: true });
        if (details.cs2_rank !== undefined && details.cs2_rank !== null) fields.push({ name: '🏆 Rank CS2', value: `\`${details.cs2_rank}\``, inline: true });
        if (details.cs2_skins_count !== undefined && details.cs2_skins_count !== null) fields.push({ name: '🎨 Skins CS2', value: `\`${details.cs2_skins_count}\``, inline: true });
        if (details.hours !== undefined && details.hours !== null) fields.push({ name: '⏰ Horas CS2/Steam', value: `\`${details.hours}\``, inline: true });
      } else if (isFortnite) {
        if (details.fortnite_skins !== undefined && details.fortnite_skins !== null) fields.push({ name: '🎨 Skins Fortnite', value: `\`${details.fortnite_skins}\``, inline: true });
        if (details.fortnite_vbucks !== undefined && details.fortnite_vbucks !== null) fields.push({ name: '🪙 V-Bucks', value: `\`${details.fortnite_vbucks}\``, inline: true });
        if (details.fortnite_level !== undefined && details.fortnite_level !== null) fields.push({ name: '⭐ Level Fortnite', value: `\`${details.fortnite_level}\``, inline: true });
      }

      // Dados comuns do detector
      if (details.level !== undefined && details.level !== null && !isLoL && !isRiot) fields.push({ name: '⭐ Level Conta', value: String(details.level), inline: true });
      if (details.email_linked !== undefined && details.email_linked !== null) fields.push({ name: '✉️ Email Vinculado', value: details.email_linked ? 'Sim' : 'Não', inline: true });
      if (details.phone_linked !== undefined && details.phone_linked !== null) fields.push({ name: '📱 Celular Vinculado', value: details.phone_linked ? 'Sim' : 'Não', inline: true });
      if (details.email_domain !== undefined && details.email_domain !== null) fields.push({ name: '📧 Domínio do Email', value: `\`${details.email_domain}\``, inline: true });
      if (details.origin !== undefined && details.origin !== null) fields.push({ name: '🔌 Origem da Conta', value: String(details.origin), inline: true });
      if (details.country !== undefined && details.country !== null) fields.push({ name: '🌍 País', value: String(details.country), inline: true });
      if (details.last_activity !== undefined && details.last_activity !== null) fields.push({ name: '🕒 Última Atividade', value: String(details.last_activity), inline: true });
    }

    if (actionResult?.success && actionResult.account_data) {
      const acc = actionResult.account_data;
      fields.push({
        name: '🔑 Dados de Acesso Liberados (AutoBuy)',
        value: `||**Login:** \`${acc.login || 'Disponível no painel'}\`\n**Senha:** \`${acc.password || 'Disponível no painel'}\`\n**Email:** \`${acc.email || 'Disponível no painel'}\`|| *(Oculte esta informação no canal público)*`,
        inline: false
      });
    }

    fields.push({
      name: '🚀 Ação rápida',
      value: `🔗 [Abrir conta no LZT](https://lzt.market/${alert.item_id}/)\n📡 [Abrir filtro monitorado](${alert.url})`,
      inline: false
    });

    const payload = {
      username: 'deathStuffs Radar',
      avatar_url: 'https://lzt.market/styles/lzt/logo.png',
      embeds: [
        {
          title,
          description,
          color,
          fields,
          footer: {
            text: 'deathStuffs MarketDesk • Radar LZT',
            icon_url: 'https://lzt.market/favicon.ico',
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const response = await fetch(settings.discord_webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      addLog('info', alert.monitor_name, `Alerta de webhook enviado com sucesso para o Discord para o item ${alert.item_id}.`);
    } else {
      addLog('warn', alert.monitor_name, `O webhook do Discord retornou código HTTP ${response.status}. Verifique se a URL está correta.`);
    }
  } catch (error: any) {
    addLog('error', alert.monitor_name, `Erro ao enviar webhook para o Discord: ${error.message}`);
  }
}

// Funções Auxiliares da API Real LZT Market
function getApiUrl(url: string): string {
  let apiVal = url.trim();
  if (apiVal.includes('lzt.market')) {
    apiVal = apiVal.replace('https://lzt.market', 'https://api.lzt.market');
    apiVal = apiVal.replace('http://lzt.market', 'https://api.lzt.market');
  } else if (apiVal.includes('lolz.guru/market')) {
    apiVal = apiVal.replace('https://lolz.guru/market', 'https://api.lzt.market');
    apiVal = apiVal.replace('http://lolz.guru/market', 'https://api.lzt.market');
  } else if (apiVal.includes('zelenka.guru/market')) {
    apiVal = apiVal.replace('https://zelenka.guru/market', 'https://api.lzt.market');
    apiVal = apiVal.replace('http://zelenka.guru/market', 'https://api.lzt.market');
  } else if (!apiVal.startsWith('http')) {
    if (apiVal.startsWith('/')) {
      apiVal = `https://api.lzt.market${apiVal}`;
    } else {
      apiVal = `https://api.lzt.market/${apiVal}`;
    }
  }
  return apiVal;
}

async function buyRealItem(itemId: string, price: number, monitorName: string): Promise<{ success: boolean; message: string; account_data?: any; invalidOrDeleted?: boolean }> {
  const headers: any = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };
  if (settings.lzt_api_token) {
    headers['Authorization'] = `Bearer ${settings.lzt_api_token}`;
  }
  if (settings.lzt_cookie) {
    headers['Cookie'] = settings.lzt_cookie;
  }

  try {
    addLog('info', monitorName, `[PRODUÇÃO] Reservando item ${itemId} por R$ ${price.toFixed(2)}...`);

    addLog('info', monitorName, `[PRODUÇÃO] Enviando comando de compra rápida de item ${itemId} por R$ ${price.toFixed(2)} (fast-buy)...`);

    // Passo 1: Executar Fast-Buy com o preço especificado
    let buySuccess = false;
    let finalBuyError = '';
    let confirmData: any = {};

    for (let i = 0; i < 45; i++) {
      const buyRes = await fetch(`https://api.lzt.market/${itemId}/fast-buy`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ buy_without_validation: 0, price: price })
      });

      const buyText = await buyRes.text();
      try { confirmData = JSON.parse(buyText); } catch (e) { }

      // Mapeia caso de 404 "not found"
      if (buyRes.status === 404 || (confirmData.error && confirmData.error.includes('not be found'))) {
        addLog('warn', monitorName, `[PRODUÇÃO] Conta ${itemId} não existe mais no mercado ou foi removida.`);
        return { success: false, message: 'Conta indisponível ou excluída do mercado (404).', invalidOrDeleted: true };
      }

      const errStr = confirmData.error || (confirmData.errors && confirmData.errors[0]);

      // Trata a validação assincrona do próprio LZT
      if (errStr === 'retry_request' || errStr === 'wait' || confirmData.system_info) {
        if (i % 3 === 0) {
          addLog('info', monitorName, `Aguardando servidor LZT validar a conta e concluir compra (Pode demorar)... [${i + 1}/45]`);
        }
        await new Promise(r => setTimeout(r, 2000)); // Espera 2 segs
        continue;
      }

      // Se conseguiu sem erros
      if (buyRes.ok && !confirmData.error && !confirmData.errors) {
        buySuccess = true;
        break;
      } else {
        finalBuyError = errStr || 'Erro desconhecido';
        break;
      }
    }

    // Fechamento das etapas
    if (!buySuccess) {
      addLog('warn', monitorName, `[PRODUÇÃO] Conta ${itemId} reprovada/falhou após tentativa de compra pelo LZT: ${finalBuyError}`);
      return { success: false, message: `Conta reprovada/compra falhou: ${finalBuyError}`, invalidOrDeleted: true };
    }

    addLog('success', monitorName, `[PRODUÇÃO] COMPRA REALIZADA COM SUCESSO DO ITEM ${itemId}! 🎉`);
    const accountData = confirmData.account || confirmData.item || {};
    return {
      success: true,
      message: 'Compra efetuada com sucesso no mercado real!',
      account_data: {
        login: accountData.login || accountData.username || 'Ver no site da LZT',
        password: accountData.password || 'Ver no site da LZT',
        email: accountData.email || 'Ver no site da LZT',
        cookie: accountData.cookie || '',
        info: accountData.extra || 'Dados fornecidos pela API LZT.'
      }
    };
  } catch (error: any) {
    return { success: false, message: `Erro fatal de conexão: ${error.message}`, invalidOrDeleted: true }; // Adotado invalidOrDeleted true no catch para evitar freeze global no block lock
  }
}
// Loop de checagem do Monitor/Regra em Produção Real
async function checkRuleNow(id: string): Promise<void> {
  // Lock global ativado: outra regra (ou esta mesma) está efetuando uma verificação assíncrona/compra no LZT (o que pode demorar). 
  // Ignoramos a chamada atual por completo para que todo o processamento e API bandwidth fiquem dedicados ao processo em andamento.
  if (globalBuyingLock) return;

  const monitor = monitors.find(m => m.id === id);
  if (!monitor || !monitor.enabled) return;

  if (monitor.status === 'checking' || monitor.status === 'buying') return;

  // Se nenhuma chave estiver configurada, suspender
  const isConfigured = settings.lzt_api_token.trim() !== '' || settings.lzt_cookie.trim() !== '';
  if (!isConfigured) {
    addLog('warn', monitor.name, 'Operação pausada: Chaves LZT ausentes nas Configurações.');
    monitor.status = 'error';
    monitor.last_error = 'Chaves LZT (Token ou Cookie) não cadastradas.';
    writeJsonFile(MONITORS_FILE, monitors);
    return;
  }

  monitor.status = 'checking';
  monitor.last_checked_at = new Date().toISOString();
  monitor.check_count += 1;
  writeJsonFile(MONITORS_FILE, monitors);

  const apiUrl = getApiUrl(monitor.url);
  addLog('info', monitor.name, `[PRODUÇÃO] Chamando API LZT: ${apiUrl.substring(0, 60)}...`);

  const headers: any = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };
  if (settings.lzt_api_token) {
    headers['Authorization'] = `Bearer ${settings.lzt_api_token}`;
  }
  if (settings.lzt_cookie) {
    headers['Cookie'] = settings.lzt_cookie;
  }

  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      throw new Error(`Código HTTP ${response.status} de resposta da API LZT`);
    }

    const text = await response.text();
    let apiData: any = {};
    try {
      apiData = JSON.parse(text);
    } catch (parseErr) {
      throw new Error('A resposta da API LZT não retornou um JSON válido.');
    }

    if (apiData.error || apiData.errors) {
      const errMsg = apiData.error || (apiData.errors && apiData.errors[0]) || 'Erro retornado pela API LZT';
      throw new Error(errMsg);
    }

    // Extrair itens de forma flexível
    let itemsArray: any[] = [];
    if (Array.isArray(apiData.items)) {
      itemsArray = apiData.items;
    } else if (Array.isArray(apiData.listings)) {
      itemsArray = apiData.listings;
    } else if (apiData && typeof apiData === 'object') {
      for (const key of Object.keys(apiData)) {
        if (Array.isArray(apiData[key]) && apiData[key].length > 0 && (apiData[key][0].item_id || apiData[key][0].id)) {
          itemsArray = apiData[key];
          break;
        }
      }
    }

    addLog('info', monitor.name, `[PRODUÇÃO] Varredura concluída. ${itemsArray.length} itens listados na resposta.`);

    let matchingItemFound = false;

    for (const item of itemsArray) {
      const itemId = String(item.item_id || item.id || '');
      const title = String(item.title || item.item_title || 'Conta LZT Market');
      const price = parseFloat(item.price || item.item_price || '0');

      if (!itemId || price <= 0) continue;

      // Se o preço for menor ou igual ao preço teto
      if (price <= monitor.max_price) {
        // Lógica contra duplicidade otimizada:
        // No modo monitor, só exibe 1 vez. No AutoBuy, ignora se já comprou com sucesso,
        // Mas se tiver falhado criticamente (ex: 404 API, Conta Banida), tenta até 3 vezes. Erros limpos (soft) retentam enquanto a conta estiver viva na busca.
        const alreadyAlerted = alerts.some(a => a.item_id === itemId);
        const alreadyBoughtSuccess = purchases.some(p => p.item_id === itemId && (p.status === 'success' || p.status === 'simulated_success'));
        const hardFailedAttempts = purchases.filter(p => p.item_id === itemId && p.validation_status === 'failed').length;

        if (monitor.mode === 'monitor' && alreadyAlerted) continue;
        if (monitor.mode === 'autobuy') {
          if (alreadyBoughtSuccess) continue; // Nunca recomprar conta que já deu success
          if (hardFailedAttempts >= 3) continue; // Desiste após 3 falhas de INVALIDEZ (404, reprovada check).
        }

        matchingItemFound = true;
        monitor.last_lowest_price = price;
        addLog('success', monitor.name, `[PRODUÇÃO] Conta compatível encontrada! "${title}" por R$ ${price.toFixed(2)}.`);

        // Coleta de dados da conta
        let apiItemDetails: any = null;
        try {
          if (settings.lzt_api_token || settings.lzt_cookie) {
            const detailRes = await fetch(`https://api.lzt.market/${itemId}`, { headers });
            if (detailRes.ok) {
              const detailJson: any = await detailRes.json();
              if (detailJson && detailJson.item) {
                apiItemDetails = detailJson.item;
              }
            }
          }
        } catch (err) {
          // Ignora silenciosamente
        }

        const sourceItem = apiItemDetails || item;
        let details = extractItemMetadata(sourceItem, monitor.category || monitor.name || '');

        // Fallback para simulação para fazer testes de alerta sem token real funcionar perfeitamente
        const hasKeys = settings.lzt_api_token.trim() !== '' || settings.lzt_cookie.trim() !== '';
        if (!hasKeys) {
          details = generateSimulatedMetadata(monitor.category || monitor.name || '');
        }

        // Criar Alerta do radar apenas se não existir ainda (para retentativas limpas)
        let alert = alerts.find(a => a.item_id === itemId);

        if (!alert) {
          const alertId = Math.random().toString(36).substring(2, 9);
          alert = {
            id: alertId,
            monitor_id: monitor.id,
            monitor_name: monitor.name,
            item_id: itemId,
            title,
            price,
            url: monitor.url,
            availability: 'available',
            found_at: new Date().toISOString(),
            sent_to_discord: false,
            item_details: details,
          };
          alerts.unshift(alert);
          if (alerts.length > 500) alerts.pop();
          writeJsonFile(ALERTS_FILE, alerts);
        }

        if (monitor.mode === 'monitor') {
          alert.sent_to_discord = true;
          writeJsonFile(ALERTS_FILE, alerts);
          await sendDiscordWebhook(alert);
          monitor.status = 'online';
          monitor.last_alert_at = new Date().toISOString();
        } else {
          // Modo AutoBuy
          if (!settings.global_auto_buy_enabled) {
            addLog('warn', monitor.name, `[PRODUÇÃO] AutoBuy global está desabilitado nas configurações. O item ${itemId} foi apenas alertado.`);
            alert.sent_to_discord = true;
            writeJsonFile(ALERTS_FILE, alerts);
            await sendDiscordWebhook(alert);
            monitor.status = 'online';
            break;
          }

          monitor.status = 'buying';
          writeJsonFile(MONITORS_FILE, monitors);

          // Tenta comprar de verdade na API (com a barreira Global ativada para proteger a banda da rede contra outras Scans/Regras)
          let buyResult: any;
          try {
            globalBuyingLock = true;
            buyResult = await buyRealItem(itemId, price, monitor.name);
          } finally {
            globalBuyingLock = false;
          }

          const purchase: Purchase = {
            id: Math.random().toString(36).substring(2, 9),
            monitor_id: monitor.id,
            monitor_name: monitor.name,
            item_id: itemId,
            title,
            price,
            status: buyResult.success ? 'success' : 'failed',
            validation_status: buyResult.success ? 'success' : (buyResult.invalidOrDeleted ? 'failed' : 'soft_error'),
            message: buyResult.message,
            created_at: new Date().toISOString(),
          };

          if (buyResult.success) {
            purchase.account_data = buyResult.account_data;
            monitor.purchases_made += 1;
            alert.availability = 'available';
          } else {
            alert.availability = 'missed';
          }

          purchases.unshift(purchase);
          writeJsonFile(PURCHASES_FILE, purchases);
          writeJsonFile(ALERTS_FILE, alerts);

          // Se a conta for apagada ou der falha na checagem (inválida), "segue o baile" sem enviar erro no Discord
          if (buyResult.invalidOrDeleted) {
            addLog('info', monitor.name, `Falha de validação/404 em ${itemId}. Tentativa ${hardFailedAttempts + 1}/3 ignorada do Discord.`);
            // Nós salvamos no log de histórico (purchases/alerts), mas não floodamos o Discord
          } else {
            // Enviar alerta do Discord de resultado para erros normais e success
            alert.sent_to_discord = true;
            await sendDiscordWebhook(alert, {
              success: buyResult.success,
              msg: buyResult.message,
              mode: 'autobuy',
              account_data: buyResult.account_data
            });
          }

          // Verificar limite de compras
          if (monitor.purchases_made >= monitor.max_purchases) {
            monitor.status = 'limit_reached';
            monitor.enabled = false;
            const timer = activeTimers.get(monitor.id);
            if (timer) {
              clearInterval(timer);
              activeTimers.delete(monitor.id);
            }
            addLog('warn', monitor.name, `Limite de compras atingido (${monitor.purchases_made}/${monitor.max_purchases}). Monitor pausado.`);
          } else {
            monitor.status = 'online';
          }
          monitor.last_alert_at = new Date().toISOString();
          writeJsonFile(MONITORS_FILE, monitors);
          break; // Processa uma compra por ciclo para evitar abusar das requisições
        }
      }
    }

    if (!matchingItemFound) {
      monitor.status = 'online';
      writeJsonFile(MONITORS_FILE, monitors);
    }

  } catch (err: any) {
    addLog('error', monitor.name, `Erro crítico de processamento: ${err.message}`);
    monitor.status = 'error';
    monitor.last_error = err.message;
    writeJsonFile(MONITORS_FILE, monitors);
  }
}

// Iniciar timers das regras que já estão ativadas ao abrir o servidor
function initBackgroundMonitors() {
  addLog('info', null, 'Inicializando monitoramento de background para regras ativas...');
  monitors.forEach(monitor => {
    if (monitor.enabled) {
      // Resetar status temporário para online ao redefinir timers
      if (monitor.status === 'checking' || monitor.status === 'buying') {
        monitor.status = 'online';
      }

      const intervalMs = monitor.interval_seconds * 1000;
      addLog('info', monitor.name, `Iniciando timer do monitor a cada ${monitor.interval_seconds} segundos.`);

      const timer = setInterval(() => {
        checkRuleNow(monitor.id);
      }, intervalMs);

      activeTimers.set(monitor.id, timer);

      // Rodar primeira checagem de baseline imediatamente com um pequeno delay para não sobrecarregar na subida
      setTimeout(() => {
        checkRuleNow(monitor.id);
      }, Math.random() * 3000);
    }
  });
  writeJsonFile(MONITORS_FILE, monitors);
}

// Inicializar Express e rotas de API
async function startServer() {
  const app = express();
  app.use(express.json());

  // Log de requests básicos (apenas mutações para evitar spam de polling GET)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') && req.method !== 'GET') {
      console.log(`[API REQUEST] ${req.method} ${req.path}`);
    }
    next();
  });

  // API - Settings
  app.get('/api/settings', (req, res) => {
    res.json(settings);
  });

  app.post('/api/settings', (req, res) => {
    const updated = req.body;
    settings = {
      lzt_api_token: updated.lzt_api_token ?? settings.lzt_api_token,
      lzt_cookie: updated.lzt_cookie ?? settings.lzt_cookie,
      discord_webhook: updated.discord_webhook ?? settings.discord_webhook,
      global_auto_buy_enabled: updated.global_auto_buy_enabled ?? settings.global_auto_buy_enabled,
      simulation_delay_ms: Math.max(10, updated.simulation_delay_ms ?? settings.simulation_delay_ms),
    };
    writeJsonFile(SETTINGS_FILE, settings);
    addLog('success', null, 'Configurações globais atualizadas com sucesso pelo usuário.');
    res.json(settings);
  });

  // API - Monitors (Rules)
  app.get('/api/monitors', (req, res) => {
    res.json(monitors);
  });

  app.post('/api/monitors', (req, res) => {
    const { name, category, url, mode, max_price, interval_seconds, max_purchases } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Nome e URL do filtro são obrigatórios.' });
    }

    const newMonitor: Monitor = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      category: category || 'Outro',
      url,
      mode: mode || 'monitor',
      max_price: max_price || 15,
      interval_seconds: interval_seconds || 15,
      enabled: false,
      status: 'paused',
      last_checked_at: null,
      last_alert_at: null,
      last_error: null,
      last_lowest_price: null,
      check_count: 0,
      max_purchases: max_purchases || 3,
      purchases_made: 0,
    };

    monitors.push(newMonitor);
    writeJsonFile(MONITORS_FILE, monitors);
    addLog('success', newMonitor.name, `Nova regra criada com sucesso. Modo: ${newMonitor.mode.toUpperCase()}, Teto: R$ ${newMonitor.max_price.toFixed(2)}.`);
    res.status(201).json(newMonitor);
  });

  app.put('/api/monitors/:id', (req, res) => {
    const { id } = req.params;
    const { name, category, url, mode, max_price, interval_seconds, max_purchases, purchases_made } = req.body;

    const index = monitors.findIndex(m => m.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Monitor não encontrado.' });
    }

    const wasEnabled = monitors[index].enabled;

    monitors[index] = {
      ...monitors[index],
      name: name ?? monitors[index].name,
      category: category ?? monitors[index].category,
      url: url ?? monitors[index].url,
      mode: mode ?? monitors[index].mode,
      max_price: max_price ?? monitors[index].max_price,
      interval_seconds: interval_seconds ?? monitors[index].interval_seconds,
      max_purchases: max_purchases ?? monitors[index].max_purchases,
      purchases_made: purchases_made ?? monitors[index].purchases_made,
    };

    writeJsonFile(MONITORS_FILE, monitors);
    addLog('info', monitors[index].name, 'Regra atualizada pelo usuário.');

    // Se o monitor estava habilitado, reinicia o timer com as novas configurações
    if (wasEnabled) {
      const timer = activeTimers.get(id);
      if (timer) clearInterval(timer);

      const intervalMs = monitors[index].interval_seconds * 1000;
      const newTimer = setInterval(() => {
        checkRuleNow(id);
      }, intervalMs);
      activeTimers.set(id, newTimer);
    }

    res.json(monitors[index]);
  });

  app.delete('/api/monitors/:id', (req, res) => {
    const { id } = req.params;
    const index = monitors.findIndex(m => m.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Monitor não encontrado.' });
    }

    const monitorName = monitors[index].name;
    const timer = activeTimers.get(id);
    if (timer) {
      clearInterval(timer);
      activeTimers.delete(id);
    }

    monitors.splice(index, 1);
    writeJsonFile(MONITORS_FILE, monitors);
    addLog('warn', monitorName, 'Regra deletada pelo usuário.');
    res.json({ success: true });
  });

  app.post('/api/monitors/:id/toggle', (req, res) => {
    const { id } = req.params;
    const monitor = monitors.find(m => m.id === id);

    if (!monitor) {
      return res.status(404).json({ error: 'Monitor não encontrado.' });
    }

    monitor.enabled = !monitor.enabled;

    if (monitor.enabled) {
      monitor.status = 'online';
      const intervalMs = monitor.interval_seconds * 1000;

      // Limpar se já existir
      const existingTimer = activeTimers.get(id);
      if (existingTimer) clearInterval(existingTimer);

      const timer = setInterval(() => {
        checkRuleNow(id);
      }, intervalMs);

      activeTimers.set(id, timer);
      addLog('success', monitor.name, `Monitor ativado. Intervalo de checagem: ${monitor.interval_seconds}s.`);

      // Executa checagem imediata inicial
      setTimeout(() => {
        checkRuleNow(id);
      }, 300);
    } else {
      monitor.status = 'paused';
      const timer = activeTimers.get(id);
      if (timer) {
        clearInterval(timer);
        activeTimers.delete(id);
      }
      addLog('info', monitor.name, 'Monitor pausado manualmente pelo usuário.');
    }

    writeJsonFile(MONITORS_FILE, monitors);
    res.json(monitor);
  });

  app.post('/api/monitors/toggle-all', (req, res) => {
    const { enabled } = req.body;

    monitors.forEach(monitor => {
      monitor.enabled = enabled;
      monitor.status = enabled ? 'online' : 'paused';

      const existingTimer = activeTimers.get(monitor.id);
      if (existingTimer) clearInterval(existingTimer);

      if (enabled) {
        const intervalMs = monitor.interval_seconds * 1000;
        const timer = setInterval(() => {
          checkRuleNow(monitor.id);
        }, intervalMs);
        activeTimers.set(monitor.id, timer);
      } else {
        activeTimers.delete(monitor.id);
      }
    });

    writeJsonFile(MONITORS_FILE, monitors);
    addLog('info', null, `${enabled ? 'Ativados' : 'Pausados'} todos os monitores em lote.`);
    res.json({ success: true, monitors });
  });

  app.post('/api/monitors/:id/check', async (req, res) => {
    const { id } = req.params;
    const monitor = monitors.find(m => m.id === id);

    if (!monitor) {
      return res.status(404).json({ error: 'Monitor não encontrado.' });
    }

    addLog('info', monitor.name, 'Disparando checagem imediata solicitada pelo usuário...');
    await checkRuleNow(id);
    res.json(monitor);
  });

  // API - Alerts (Pings)
  app.get('/api/alerts', (req, res) => {
    res.json(alerts);
  });

  app.post('/api/alerts/clear', (req, res) => {
    alerts = [];
    writeJsonFile(ALERTS_FILE, alerts);
    addLog('info', null, 'Histórico de alertas/pings limpo pelo usuário.');
    res.json({ success: true });
  });

  // API - Purchases History
  app.get('/api/purchases', (req, res) => {
    res.json(purchases);
  });

  app.post('/api/purchases/clear', (req, res) => {
    purchases = [];
    writeJsonFile(PURCHASES_FILE, purchases);
    addLog('info', null, 'Histórico de compras e oportunidades perdidas limpo pelo usuário.');
    res.json({ success: true });
  });

  // API - System Logs
  app.get('/api/logs', (req, res) => {
    res.json(systemLogs);
  });

  app.post('/api/logs/clear', (req, res) => {
    systemLogs = [];
    writeJsonFile(LOGS_FILE, systemLogs);
    addLog('info', null, 'Logs do sistema limpos pelo usuário.');
    res.json({ success: true });
  });

  // Integração com o Vite (Desenvolvimento vs Produção)
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // Configura o Vite no modo Middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // PORTA 3000 MANDATÓRIA POR INFRAESTRUTURA NA NUVEM, MAS PERMITE PORTA CUSTOMIZADA LOCALMENTE
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================================`);
    console.log(`🤖 SERVIDOR LZT MARKET AUTO BUY & RADAR ATIVO NA PORTA ${PORT}`);
    console.log(`🌐 URL de Acesso: http://localhost:${PORT}`);
    console.log(`🏡 Modo de Execução: ${process.env.NODE_ENV === 'production' ? 'PRODUÇÃO' : 'DESENVOLVIMENTO (VITE)'}`);
    console.log(`================================================================`);
    initBackgroundMonitors();
  });
}

startServer().catch(err => {
  console.error('Falha crítica ao iniciar o servidor Express:', err);
});
