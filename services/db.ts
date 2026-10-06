
import { Medicine, MedicineCategory, FamilyMember, MedicationPlan, ChatMessage, ApiKeyEntry, MedicationHistory, MedicalApiConfig } from '../types';

const STORAGE_KEY = 'smart_med_cabinet_db';
const PROFILES_KEY = 'smart_med_family_profiles';
const PLANS_KEY = 'smart_med_medication_plans';
const HISTORY_KEY = 'smart_med_medication_history';
const CHAT_HISTORY_KEY = 'smart_med_chat_history';
const KEYS_KEY = 'smart_med_api_keys';
const MED_API_KEY = 'smart_med_medical_api_config';
const DB_METADATA_KEY = 'smart_med_db_metadata';
const IDB_NAME = 'SmartMedFileDB';
const IDB_STORE = 'handles';

interface DbMetadata {
  isConnected: boolean;
  currentFileName: string;
  lastSyncTime: string;
  isPermissionDenied?: boolean;
  syncMode?: 'local' | 'server';
}

const DEFAULT_METADATA: DbMetadata = {
  isConnected: false,
  currentFileName: '未连接文件',
  lastSyncTime: '从未同步',
  syncMode: 'local'
};

const DEFAULT_API_CONFIG: MedicalApiConfig = {
  endpoint: 'https://api.healthdata.com/v1',
  apiKey: '',
  isEnabled: false,
  provider: 'default'
};

let activeFileHandle: FileSystemFileHandle | null = null;

// IndexedDB 助手用于存储 FileSystemHandle
const idb = {
  async getHandle(): Promise<FileSystemFileHandle | null> {
    return new Promise((resolve) => {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get('active_db');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    });
  },
  async saveHandle(handle: FileSystemFileHandle) {
    return new Promise((resolve) => {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(handle, 'active_db');
        tx.oncomplete = () => resolve(true);
      };
    });
  },
  async clear() {
    return new Promise((resolve) => {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete('active_db');
        tx.oncomplete = () => resolve(true);
      };
    });
  }
};

export const db = {
  getMetadata: (): DbMetadata => {
    const data = localStorage.getItem(DB_METADATA_KEY);
    return data ? JSON.parse(data) : DEFAULT_METADATA;
  },

  saveMetadata: (meta: DbMetadata) => {
    localStorage.setItem(DB_METADATA_KEY, JSON.stringify(meta));
  },

  // 核心：将所有内存/本地存储数据同步到选中的文件
  syncToFile: async () => {
    const meta = db.getMetadata();

    if (meta.syncMode === 'server') {
      try {
        const data = db.exportAllData();
        const res = await fetch('/api/server-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data })
        });
        if (res.ok) {
          const result = await res.json();
          if (!result.success) {
            throw new Error(result.message || 'Server returned failure');
          }
          meta.isConnected = true;
          meta.isPermissionDenied = false;
          meta.lastSyncTime = new Date().toLocaleTimeString();
          db.saveMetadata(meta);
        } else {
          meta.isPermissionDenied = true;
          db.saveMetadata(meta);
          let errorMsg = `HTTP Error: ${res.status}`;
          try {
            const data = await res.json();
            if (data.message) errorMsg = data.message;
          } catch(e) {}
          throw new Error(errorMsg);
        }
      } catch (e: any) {
        console.error('服务器同步失败:', e);
        throw e;
      }
      return;
    }

    if (!activeFileHandle) return;
    
    try {
      // Fix: Cast activeFileHandle to any to access queryPermission which may not be in standard types
      const state = await (activeFileHandle as any).queryPermission({ mode: 'readwrite' });
      if (state !== 'granted') {
        const meta = db.getMetadata();
        meta.isPermissionDenied = true;
        db.saveMetadata(meta);
        return;
      }

      const data = db.exportAllData();
      const writable = await activeFileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      
      const meta = db.getMetadata();
      meta.isConnected = true;
      meta.isPermissionDenied = false;
      meta.currentFileName = activeFileHandle.name;
      meta.lastSyncTime = new Date().toLocaleTimeString();
      db.saveMetadata(meta);
    } catch (e) {
      console.error('文件同步失败:', e);
    }
  },

  updateSyncTime: () => {
    const meta = db.getMetadata();
    meta.lastSyncTime = new Date().toLocaleTimeString();
    db.saveMetadata(meta);
    db.syncToFile(); // 触发文件写入
  },

  // 自动重连逻辑
  autoConnect: async (): Promise<boolean> => {
    const meta = db.getMetadata();
    if (meta.syncMode === 'server' && meta.isConnected) {
      // 检查服务器端文件是否可访问
      try {
        const res = await fetch('/api/server-db');
        if (res.ok) {
           return true; 
        }
      } catch (e) {
        return false;
      }
      return false;
    }

    const handle = await idb.getHandle();
    if (handle) {
      activeFileHandle = handle;
      // Fix: Cast handle to any to access queryPermission
      const state = await (handle as any).queryPermission({ mode: 'readwrite' });
      const meta = db.getMetadata();
      if (state === 'granted') {
        meta.isConnected = true;
        meta.isPermissionDenied = false;
        meta.currentFileName = handle.name;
        db.saveMetadata(meta);
        return true;
      } else {
        meta.isConnected = true;
        meta.isPermissionDenied = true;
        db.saveMetadata(meta);
        return false;
      }
    }
    return false;
  },

  connectToServerFile: async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/server-db');
      
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('API返回了HTML网页。您可能使用了Vite的静态预览模式(vite preview)。请确保使用 npm run dev 或 node dist/server.cjs 启动服务。');
      }

      if (res.ok) {
        const { success, data, message } = await res.json();
        
        const meta = db.getMetadata();
        meta.isConnected = true;
        meta.currentFileName = '部署端服务器：药品.json';
        meta.syncMode = 'server';
        meta.isPermissionDenied = false;
        meta.lastSyncTime = new Date().toLocaleTimeString();
        db.saveMetadata(meta);

        if (!success && !data) {
           // File not found on server, try to create it by syncing
           await db.syncToFile();
           // if syncToFile throws, we catch it
        } else if (success && data && typeof data === 'string' && data.trim()) {
           db.importAllData(data, '部署端服务器：药品.json');
        }
        
        return true;
      } else {
        throw new Error(`HTTP error: ${res.status}`);
      }
    } catch (e: any) {
      console.error('连接服务器文件失败:', e);
      throw e;
    }
  },

  connectToLocalFile: async (createNew = false) => {
    try {
      const options = {
        types: [{ description: 'JSON Database', accept: { 'application/json': ['.json'] } }],
      };
      
      // Fix: Cast window to any to access File System Access API methods
      const handle = createNew 
        ? await (window as any).showSaveFilePicker({ ...options, suggestedName: '我的药库.json' })
        : (await (window as any).showOpenFilePicker(options))[0];
      
      activeFileHandle = handle;
      await idb.saveHandle(handle);
      
      // 如果是打开现有文件，尝试加载数据
      if (!createNew) {
        const file = await handle.getFile();
        const content = await file.text();
        if (content.trim()) {
           db.importAllData(content, handle.name);
        }
      } else {
        // 如果是新建，先同步一次当前内存数据
        await db.syncToFile();
      }
      
      const meta = db.getMetadata();
      meta.isConnected = true;
      meta.currentFileName = handle.name;
      meta.syncMode = 'local';
      meta.isPermissionDenied = false;
      meta.lastSyncTime = new Date().toLocaleTimeString();
      db.saveMetadata(meta);
      
      return true;
    } catch (e) {
      console.error('连接本地文件取消或失败:', e);
      return false;
    }
  },

  disconnectFile: async () => {
    const meta = db.getMetadata();
    if (meta.syncMode === 'local') {
      activeFileHandle = null;
      await idb.clear();
    }
    
    meta.isConnected = false;
    meta.currentFileName = '未连接文件';
    meta.syncMode = 'local';
    db.saveMetadata(meta);
  },

  getMedicines: (): Medicine[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveMedicine: (medicine: Medicine): void => {
    const meds = db.getMedicines();
    const index = meds.findIndex(m => m.id === medicine.id);
    if (index > -1) meds[index] = medicine;
    else meds.push(medicine);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
    db.updateSyncTime();
  },

  deleteMedicines: (ids: string[]): void => {
    const meds = db.getMedicines().filter(m => !ids.includes(m.id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
    db.updateSyncTime();
  },

  getProfiles: (): FamilyMember[] => {
    const data = localStorage.getItem(PROFILES_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveProfile: (profile: FamilyMember): void => {
    const profiles = db.getProfiles();
    const index = profiles.findIndex(p => p.id === profile.id);
    if (index > -1) profiles[index] = profile;
    else profiles.push(profile);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    db.updateSyncTime();
  },

  getPlans: (): MedicationPlan[] => {
    const data = localStorage.getItem(PLANS_KEY);
    return data ? JSON.parse(data) : [];
  },

  savePlan: (plan: MedicationPlan): void => {
    const plans = db.getPlans();
    const index = plans.findIndex(p => p.id === plan.id);
    if (index > -1) plans[index] = plan;
    else plans.push(plan);
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
    db.updateSyncTime();
  },

  deletePlan: (id: string): void => {
    const plans = db.getPlans().filter(p => p.id !== id);
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
    db.updateSyncTime();
  },

  recordIntake: (planId: string, memberName: string): void => {
    const plans = db.getPlans();
    const index = plans.findIndex(p => p.id === planId);
    if (index > -1) {
      const plan = plans[index];
      
      const meds = db.getMedicines();
      const mIdx = meds.findIndex(m => m.id === plan.medicineId);
      if (mIdx > -1) {
        meds[mIdx].stock = Math.max(0, meds[mIdx].stock - plan.dosageAmount);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
      }

      const historyEntry: MedicationHistory = {
        id: Date.now().toString(),
        planId: plan.id,
        memberId: plan.memberId,
        memberName: memberName,
        medicineId: plan.medicineId,
        medicineName: plan.medicineName,
        dosageAmount: plan.dosageAmount,
        dosageUnit: plan.dosageUnit,
        timestamp: Date.now()
      };
      const history = db.getHistory();
      history.unshift(historyEntry);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      
      plan.lastTakenTimestamp = Date.now();
      localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
      db.updateSyncTime();
    }
  },

  getHistory: (): MedicationHistory[] => {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  },

  getApiKeys: (): ApiKeyEntry[] => {
    const data = localStorage.getItem(KEYS_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveApiKeys: (keys: ApiKeyEntry[]): void => {
    localStorage.setItem(KEYS_KEY, JSON.stringify(keys));
    db.updateSyncTime();
  },

  getChatHistory: (): ChatMessage[] => {
    const data = localStorage.getItem(CHAT_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveChatHistory: (history: ChatMessage[]): void => {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
    db.updateSyncTime();
  },

  getMedicalApiConfig: (): MedicalApiConfig => {
    const data = localStorage.getItem(MED_API_KEY);
    return data ? JSON.parse(data) : DEFAULT_API_CONFIG;
  },

  saveMedicalApiConfig: (config: MedicalApiConfig): void => {
    localStorage.setItem(MED_API_KEY, JSON.stringify(config));
    db.updateSyncTime();
  },

  exportAllData: (): string => {
    const data = {
      medicines: db.getMedicines(),
      profiles: db.getProfiles(),
      plans: db.getPlans(),
      history: db.getHistory(),
      chatHistory: db.getChatHistory(),
      apiKeys: db.getApiKeys(),
      timestamp: Date.now()
    };
    return JSON.stringify(data, null, 2);
  },

  importAllData: (jsonStr: string, fileName: string): boolean => {
    try {
      const data = JSON.parse(jsonStr);
      if (data.medicines) localStorage.setItem(STORAGE_KEY, JSON.stringify(data.medicines));
      if (data.profiles) localStorage.setItem(PROFILES_KEY, JSON.stringify(data.profiles));
      if (data.plans) localStorage.setItem(PLANS_KEY, JSON.stringify(data.plans));
      if (data.history) localStorage.setItem(HISTORY_KEY, JSON.stringify(data.history));
      if (data.chatHistory) localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(data.chatHistory));
      if (data.apiKeys) localStorage.setItem(KEYS_KEY, JSON.stringify(data.apiKeys));
      
      const meta = db.getMetadata();
      meta.isConnected = true;
      meta.currentFileName = fileName;
      meta.lastSyncTime = new Date().toLocaleTimeString();
      db.saveMetadata(meta);
      return true;
    } catch (e) {
      return false;
    }
  }
};
