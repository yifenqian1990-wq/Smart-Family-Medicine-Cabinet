
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Medicine, MedicineCategory, ChatMessage, FamilyMember, MedicationPlan, ApiKeyEntry, MedicationHistory, MedicalApiConfig, CustomField } from './types';
import { db } from './services/db';
import { geminiService } from './services/gemini';
import MedicineCard, { ViewMode } from './components/MedicineCard';
import CameraCapture from './components/CameraCapture';

type View = 'dashboard' | 'cabinet' | 'assistant' | 'add' | 'detail' | 'profile' | 'plans' | 'family-list' | 'edit-member' | 'keys' | 'sync' | 'med-api';
type SortType = 'name' | 'expiry' | 'added' | 'category';
type PlansSubView = 'active' | 'history';

const PRESET_UNITS = ['片', '粒', '袋', '支', '瓶', '盒', '板', 'ml', 'g', 'mg'];
const AI_MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (推荐)' },
  { id: 'gemini-2.5-flash-lite-latest', name: 'Gemini 2.5 Flash Lite' }
];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [sortType, setSortType] = useState<SortType>('expiry');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'ocr' | 'chat' | 'barcode'>('ocr');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiStatus, setAiStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(db.getProfiles());
  const [editingMember, setEditingMember] = useState<Partial<FamilyMember> | null>(null);
  const [medicationPlans, setMedicationPlans] = useState<MedicationPlan[]>(db.getPlans());
  const [medicationHistory, setMedicationHistory] = useState<MedicationHistory[]>(db.getHistory());
  const [plansSubView, setPlansSubView] = useState<PlansSubView>('active');
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>(db.getApiKeys());
  const [dbMetadata, setDbMetadata] = useState(db.getMetadata());
  const [medApiConfig, setMedApiConfig] = useState<MedicalApiConfig>(db.getMedicalApiConfig());
  
  // Selection Logic
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Toast Feedback
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
  
  // Image Zoom
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(db.getChatHistory());
  const [chatInput, setChatInput] = useState('');
  const [chatImage, setChatImage] = useState<string | null>(null);
  const [chatContextMeds, setChatContextMeds] = useState<string[]>([]);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(AI_MODELS[0].id);

  const [viewingManual, setViewingManual] = useState<Medicine | null>(null);
  const [isAddingPlan, setIsAddingPlan] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const syncFileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<Medicine>>({
    name: '', brand: '', usage: '', ingredients: '', character: '', indications: '', 
    specification: '', contraindications: '', adverseReactions: '', storage: '',
    content: '', manufactureDate: '', shelfLife: '', expiryDate: '', precautions: '', 
    stock: 1, unit: '盒', category: MedicineCategory.OTHER, customFields: []
  });
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [customUnitValue, setCustomUnitValue] = useState('');
  const [specialExpiry, setSpecialExpiry] = useState<'none' | 'permanent' | 'uncertain'>('none');

  const [planFormData, setPlanFormData] = useState<Partial<MedicationPlan>>({
    memberId: '',
    medicineId: '',
    medicineName: '',
    time: '08:00',
    dosageAmount: 1,
    dosageUnit: '片',
    frequency: 'daily',
    isActive: true
  });

  useEffect(() => {
    const init = async () => {
      await db.autoConnect();
      refreshData();
      if (db.getChatHistory().length === 0) {
        setChatMessages([{ id: 'init', role: 'model', text: '你好！我是智能医药助手。您可以拍照识别药品，或询问我用药建议。', timestamp: Date.now() }]);
      }
    };
    init();
  }, []);

  const refreshData = () => {
    setMedicines(db.getMedicines());
    setFamilyMembers(db.getProfiles());
    setMedicationPlans(db.getPlans());
    setMedicationHistory(db.getHistory());
    setDbMetadata(db.getMetadata());
    setMedApiConfig(db.getMedicalApiConfig());
    const keys = db.getApiKeys();
    setApiKeys(keys.map(k => ({ ...k, isVisible: k.isVisible ?? false })));
  };

  useEffect(() => {
    db.saveChatHistory(chatMessages);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const sortedMedicines = useMemo(() => {
    let filtered = medicines.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return [...filtered].sort((a, b) => {
      switch (sortType) {
        case 'name': return a.name.localeCompare(b.name, 'zh-CN');
        case 'expiry': 
          if (a.expiryDate === 'permanent' && b.expiryDate === 'permanent') return 0;
          if (a.expiryDate === 'permanent') return 1;
          if (b.expiryDate === 'permanent') return -1;
          if (a.expiryDate === 'uncertain' && b.expiryDate === 'uncertain') return 0;
          if (a.expiryDate === 'uncertain') return 1;
          if (b.expiryDate === 'uncertain') return -1;
          return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        case 'added': return b.addedAt - a.addedAt;
        case 'category': return a.category.localeCompare(b.category, 'zh-CN');
        default: return 0;
      }
    });
  }, [medicines, searchTerm, sortType]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  const handleSaveMedicine = () => {
    let finalExpiry = formData.expiryDate;
    if (specialExpiry === 'permanent') finalExpiry = 'permanent';
    if (specialExpiry === 'uncertain') finalExpiry = 'uncertain';

    if (!formData.name || !finalExpiry) {
      showToast('请填写必填项（名称和有效期）', 'error');
      return;
    }
    
    const finalUnit = isCustomUnit ? customUnitValue : (formData.unit || '盒');
    
    const newMed: Medicine = {
      ...(formData as Medicine),
      id: formData.id || Date.now().toString(),
      addedAt: formData.addedAt || Date.now(),
      stock: formData.stock || 1,
      unit: finalUnit,
      expiryDate: finalExpiry,
      category: formData.category || MedicineCategory.OTHER,
      customFields: formData.customFields || []
    };
    db.saveMedicine(newMed);
    refreshData();
    setCurrentView('cabinet');
    resetFormData();
    showToast('药品已保存', 'success');
  };

  const resetFormData = () => {
    setFormData({
      name: '', brand: '', usage: '', ingredients: '', character: '', indications: '', 
      specification: '', contraindications: '', adverseReactions: '', storage: '',
      content: '', manufactureDate: '', shelfLife: '', expiryDate: '', precautions: '', 
      stock: 1, unit: '盒', category: MedicineCategory.OTHER, customFields: []
    });
    setIsCustomUnit(false);
    setCustomUnitValue('');
    setSpecialExpiry('none');
  }

  const handleAddCustomField = () => {
    const label = prompt('请输入信息类别名称（如：产地、复购平台）');
    if (label) {
      setFormData(prev => ({
        ...prev,
        customFields: [...(prev.customFields || []), { label, value: '' }]
      }));
    }
  };

  const updateCustomField = (index: number, value: string) => {
    const fields = [...(formData.customFields || [])];
    fields[index].value = value;
    setFormData(prev => ({ ...prev, customFields: fields }));
  };

  const removeCustomField = (index: number) => {
    setFormData(prev => ({
      ...prev,
      customFields: prev.customFields?.filter((_, i) => i !== index)
    }));
  };

  const handleSavePlan = () => {
    if (!planFormData.medicineId || !planFormData.time || !planFormData.memberId) {
      showToast('请填写必填项（药品、时间、所属人员）', 'error');
      return;
    }
    const newPlan: MedicationPlan = {
      ...(planFormData as MedicationPlan),
      id: Date.now().toString()
    };
    db.savePlan(newPlan);
    refreshData();
    setIsAddingPlan(false);
    setPlanFormData({
      memberId: '',
      medicineId: '',
      medicineName: '',
      time: '08:00',
      dosageAmount: 1,
      dosageUnit: '片',
      frequency: 'daily',
      isActive: true
    });
    showToast('服药提醒已创建', 'success');
  };

  const handleSaveMember = () => {
    if (!editingMember?.name) {
      showToast('请填写姓名', 'error');
      return;
    }
    const newMember: FamilyMember = {
      id: editingMember.id || Date.now().toString(),
      name: editingMember.name || '',
      age: editingMember.age || '',
      gender: editingMember.gender || '',
      bloodType: editingMember.bloodType || '',
      allergies: editingMember.allergies || '',
      contraindications: editingMember.contraindications || '',
      medicalHistory: editingMember.medicalHistory || ''
    };
    db.saveProfile(newMember);
    refreshData();
    setCurrentView('family-list');
    showToast('档案已更新');
  };

  const handleIntakeConfirm = (plan: MedicationPlan) => {
    const med = medicines.find(m => m.id === plan.medicineId);
    if (!med) {
        showToast('找不到关联药品，请检查药箱', 'error');
        return;
    }
    
    if (med.stock < plan.dosageAmount) {
        showToast(`库存不足！剩余${med.stock}${med.unit}，建议补充。`, 'error');
        return;
    }

    db.recordIntake(plan.id, familyMembers.find(p => p.id === plan.memberId)?.name || '管理员');
    refreshData();
    showToast(`已确认服用：${plan.medicineName}`, 'success');
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`确定要删除选中的 ${selectedIds.length} 项药品吗？`)) {
        db.deleteMedicines(selectedIds);
        refreshData();
        setSelectedIds([]);
        setIsSelectionMode(false);
        showToast('已批量删除', 'success');
    }
  };

  const handleSendMessage = async (textOverride?: string, messageIdToRegenerate?: string) => {
    const text = textOverride !== undefined ? textOverride : chatInput.trim();
    if (!text && !chatImage && chatContextMeds.length === 0 && !messageIdToRegenerate) return;

    let updatedHistory = [...chatMessages];
    
    if (messageIdToRegenerate) {
        const idx = updatedHistory.findIndex(m => m.id === messageIdToRegenerate);
        if (idx !== -1) updatedHistory = updatedHistory.slice(0, idx);
    } else {
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: text || "[图片消息]", timestamp: Date.now() };
        updatedHistory.push(userMsg);
    }

    setChatMessages(updatedHistory);
    setChatInput('');
    const currentImg = chatImage;
    const currentContextIds = [...chatContextMeds];
    setChatImage(null);
    setChatContextMeds([]);
    setIsAiProcessing(true);

    try {
      const inventory = medicines.map(m => `${m.name}`).join(', ');
      const response = await geminiService.askAssistant(inventory, familyMembers, updatedHistory, medicines.filter(m => currentContextIds.includes(m.id)), currentImg || undefined, selectedModel);
      setChatMessages(prev => [...prev, { id: Date.now().toString() + 'ai', role: 'model', text: response, timestamp: Date.now() }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { id: 'err-' + Date.now(), role: 'model', text: `请求失败: ${err.message}`, timestamp: Date.now(), isError: true }]);
    } finally {
      setIsAiProcessing(false);
      setEditingMessageId(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('已复制到剪贴板');
  };

  const handleEditMessage = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setChatInput(msg.text);
  };

  const handlePhotoCapture = async (base64: string) => {
    if (cameraMode === 'ocr' || cameraMode === 'barcode') {
      setCurrentView('add');
      setFormData(prev => ({ ...prev, photoUrl: base64 }));
      setIsAiProcessing(true);
      setAiStatus(cameraMode === 'barcode' ? '正在连接数据库检索条码...' : '正在识别药品包装信息...');
      try {
        let info = await geminiService.extractMedicineInfo(base64, cameraMode === 'barcode');
        if (info && info.name) {
          const isPresetUnit = info.unit && PRESET_UNITS.includes(info.unit);
          setFormData(prev => ({
            ...prev,
            name: info.name || prev.name,
            brand: info.brand || prev.brand,
            ingredients: info.ingredients || prev.ingredients,
            character: info.character || prev.character,
            indications: info.indications || prev.indications,
            specification: info.specification || prev.specification,
            usage: info.usage || prev.usage,
            contraindications: info.contraindications || prev.contraindications,
            adverseReactions: info.adverseReactions || prev.adverseReactions,
            storage: info.storage || prev.storage,
            expiryDate: info.expiryDate || prev.expiryDate,
            category: info.category || prev.category,
            precautions: info.precautions || prev.precautions,
            unit: info.unit ? (isPresetUnit ? info.unit : '盒') : prev.unit
          }));
          if (info.unit && !isPresetUnit) {
            setIsCustomUnit(true);
            setCustomUnitValue(info.unit);
          }
        }
      } catch (err) {
        console.error("AI识别失败:", err);
        showToast("识别失败，请手动录入信息。", 'error');
      } finally {
        setIsAiProcessing(false);
        setAiStatus('');
      }
    } else {
      setChatImage(base64);
    }
  };

  const formatAiText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} className="h-2"></div>;
      
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        return (
          <div key={i} className="flex gap-2 items-start mb-1.5 group/item">
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-2 flex-shrink-0"></span>
            <span className="text-slate-700 leading-relaxed">{trimmed.replace(/^[-*]\s*/, '')}</span>
          </div>
        );
      }
      if (trimmed.match(/^\d+\.\s/)) {
        return (
          <div key={i} className="flex gap-2 items-start mb-1.5 group/item">
            <span className="font-black text-indigo-400 text-xs mt-0.5">{trimmed.match(/^\d+/)?.[0]}.</span>
            <span className="text-slate-700 leading-relaxed">{trimmed.replace(/^\d+\.\s*/, '')}</span>
          </div>
        );
      }
      if (trimmed.startsWith('###')) {
        return <h4 key={i} className="font-black text-indigo-700 text-sm mt-3 mb-1.5 flex items-center gap-2">
            <span className="w-1 h-3 bg-indigo-600 rounded-full"></span>
            {trimmed.replace(/^###\s*/, '')}
        </h4>;
      }
      if (trimmed.startsWith('##')) {
        return <h3 key={i} className="font-black text-indigo-800 text-base mt-5 mb-3 border-b border-indigo-50 pb-2">{trimmed.replace(/^##\s*/, '')}</h3>;
      }
      
      const parts = trimmed.split(/(\*\*.*?\*\*)/);
      return (
        <p key={i} className="mb-2 leading-relaxed text-slate-600">
          {parts.map((part, pi) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={pi} className="text-slate-900 font-bold">{part.slice(2, -2)}</strong>;
            }
            return part;
          })}
        </p>
      );
    });
  };

  const renderDashboard = () => {
    const expiredCount = medicines.filter(m => m.expiryDate !== 'permanent' && m.expiryDate !== 'uncertain' && new Date(m.expiryDate) < new Date()).length;
    const expiringSoonCount = medicines.filter(m => {
      if (m.expiryDate === 'permanent' || m.expiryDate === 'uncertain') return false;
      const diff = new Date(m.expiryDate).getTime() - new Date().getTime();
      return diff > 0 && diff < (30 * 24 * 60 * 60 * 1000);
    }).length;
    
    return (
      <div className="flex flex-col gap-6 animate-fadeIn pb-24">
        {dbMetadata.isConnected && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-5 flex items-center gap-4 relative">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm">
              <i className="fa-solid fa-database text-xl"></i>
            </div>
            <div className="flex flex-col">
              <h3 className="text-sm font-black text-emerald-800">本地动态数据库</h3>
              <p className="text-[10px] text-emerald-600/70 font-bold mt-0.5">文件：{dbMetadata.currentFileName}</p>
              <p className="text-[10px] text-emerald-600/50 mt-1 font-medium"><i className="fa-solid fa-clock mr-1"></i>{dbMetadata.lastSyncTime}</p>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-2">
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">智家药箱</h2>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-100 shadow-sm">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">在线同步</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col gap-2 cursor-pointer active:scale-95 transition-all" onClick={() => setCurrentView('cabinet')}>
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-sm"><i className="fa-solid fa-pills"></i></div>
            <span className="text-2xl font-black text-slate-800">{medicines.length}</span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">药品总计</span>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col gap-2 cursor-pointer active:scale-95 transition-all" onClick={() => setCurrentView('cabinet')}>
            <div className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center text-sm"><i className="fa-solid fa-calendar-xmark"></i></div>
            <span className="text-2xl font-black text-red-500">{expiredCount}</span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">已过期</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between cursor-pointer" onClick={() => { setSearchTerm(''); setCurrentView('cabinet'); setSortType('expiry'); }}>
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center text-xl">
                  <i className="fa-solid fa-hourglass-half"></i>
               </div>
               <div>
                  <h4 className="text-sm font-black text-slate-800">临期预警</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">30天内过期的药品：{expiringSoonCount}</p>
               </div>
            </div>
            <i className="fa-solid fa-chevron-right text-slate-200"></i>
        </div>

        <div className="bg-indigo-600 rounded-[40px] p-6 text-white relative overflow-hidden shadow-xl shadow-indigo-100">
          <div className="relative z-10 flex flex-col gap-4">
            <h3 className="text-xl font-black leading-tight">AI 智能入库</h3>
            <p className="text-white/70 text-xs font-medium">支持药品包装 OCR 识别与条形码扫描。</p>
            <div className="flex gap-2">
              <button 
                onClick={() => { setCameraMode('ocr'); setShowCamera(true); }}
                className="bg-white text-indigo-600 px-6 py-3 rounded-2xl font-black text-xs active:scale-95 transition-all shadow-md"
              >
                <i className="fa-solid fa-camera mr-2"></i> 拍照识别
              </button>
              <button 
                onClick={() => { setCameraMode('barcode'); setShowCamera(true); }}
                className="bg-indigo-500 text-white px-6 py-3 rounded-2xl font-black text-xs active:scale-95 transition-all shadow-md"
              >
                <i className="fa-solid fa-barcode mr-2"></i> 扫码入库
              </button>
            </div>
          </div>
          <i className="fa-solid fa-microchip absolute -right-6 -bottom-6 text-white/10 text-9xl"></i>
        </div>
      </div>
    );
  };

  const renderCabinet = () => (
    <div className="flex flex-col gap-6 animate-fadeIn pb-24">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">{isSelectionMode ? `已选 ${selectedIds.length} 项` : '我的药箱'}</h2>
        <div className="flex gap-2">
          {isSelectionMode ? (
            <>
              <button 
                onClick={handleBatchDelete}
                disabled={selectedIds.length === 0}
                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${selectedIds.length > 0 ? 'bg-red-500 text-white shadow-lg' : 'bg-slate-100 text-slate-300'}`}
              >
                <i className="fa-solid fa-trash"></i>
              </button>
              <button 
                onClick={() => { setIsSelectionMode(false); setSelectedIds([]); }}
                className="bg-slate-100 text-slate-500 w-10 h-10 rounded-2xl flex items-center justify-center active:scale-90 transition-all"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </>
          ) : (
            <>
              <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm">
                <button onClick={() => setViewMode('grid')} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}><i className="fa-solid fa-grip"></i></button>
                <button onClick={() => setViewMode('list')} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}><i className="fa-solid fa-list"></i></button>
                <button onClick={() => setViewMode('detailed')} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${viewMode === 'detailed' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}><i className="fa-solid fa-table-list"></i></button>
              </div>
              <button 
                onClick={() => {
                  resetFormData();
                  setCurrentView('add');
                }}
                className="bg-indigo-600 text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all"
              >
                <i className="fa-solid fa-plus"></i>
              </button>
            </>
          )}
        </div>
      </div>

      {!isSelectionMode && (
        <div className="relative">
          <input 
            type="text"
            placeholder="搜索药品名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-100 rounded-2xl px-12 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 shadow-sm"
          />
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {(['expiry', 'name', 'added', 'category'] as SortType[]).map(type => (
          <button
            key={type}
            onClick={() => setSortType(type)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
              sortType === type ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 border border-slate-100'
            }`}
          >
            {type === 'expiry' ? '按过期时间' : type === 'name' ? '按名称' : type === 'added' ? '按添加时间' : '按类别'}
          </button>
        ))}
      </div>

      {sortedMedicines.length > 0 ? (
        <div className={viewMode === 'grid' ? "grid grid-cols-2 gap-4" : "flex flex-col gap-3"}>
          {sortedMedicines.map(med => (
            <MedicineCard 
              key={med.id} 
              medicine={med} 
              viewMode={viewMode}
              isSelected={selectedIds.includes(med.id)}
              isSelectionMode={isSelectionMode}
              onClick={(id) => {
                if (isSelectionMode) {
                  setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
                } else {
                  setSelectedMedicine(medicines.find(m => m.id === id) || null);
                  setCurrentView('detail');
                }
              }}
              onSelect={(id) => {
                setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
              }}
              onLongPress={(id) => {
                setIsSelectionMode(true);
                setSelectedIds([id]);
              }}
              onImageClick={(url) => setZoomedImageUrl(url)}
              onViewManual={(med) => setViewingManual(med)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-4">
          <i className="fa-solid fa-box-open text-6xl"></i>
          <p className="text-sm font-bold">药箱空空如也</p>
        </div>
      )}
    </div>
  );

  const renderAssistant = () => (
    <div className="flex flex-col h-[calc(100vh-160px)] animate-fadeIn">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">AI 智能助手</h2>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsContextModalOpen(true)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${chatContextMeds.length > 0 ? 'bg-indigo-100 text-indigo-600 border border-indigo-200' : 'bg-white text-slate-300 border border-slate-100'}`}
          >
            <div className="relative">
              <i className="fa-solid fa-pills"></i>
              {chatContextMeds.length > 0 && <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-black">{chatContextMeds.length}</span>}
            </div>
          </button>
          <button 
            onClick={() => {
              if (window.confirm('确定要清除聊天记录吗？')) {
                const initMsg: ChatMessage = { id: 'init', role: 'model', text: '你好！我是智能医药助手。', timestamp: Date.now() };
                setChatMessages([initMsg]);
                db.saveChatHistory([]);
              }
            }}
            className="text-slate-300 hover:text-red-400 transition-colors"
          >
            <i className="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      <div className="mb-4">
        <select 
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-2 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-100 shadow-sm"
        >
          {AI_MODELS.map(model => (
            <option key={model.id} value={model.id}>{model.name}</option>
          ))}
        </select>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pb-4 px-1 scrollbar-hide">
        {chatMessages.map((msg, idx) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`group relative max-w-[90%] p-4 rounded-3xl text-sm ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-100' 
                : msg.isError 
                  ? 'bg-red-50 text-red-600 border border-red-100 rounded-tl-none' 
                  : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none shadow-sm'
            }`}>
              {msg.role === 'model' ? (
                <div className="space-y-1">
                  {formatAiText(msg.text)}
                </div>
              ) : (
                <div>{msg.text}</div>
              )}

              <div className={`absolute top-full mt-1 flex gap-2 transition-opacity duration-300 ${msg.role === 'user' ? 'right-0' : 'left-0 opacity-0 group-hover:opacity-100'}`}>
                {msg.role === 'user' ? (
                  <>
                    <button onClick={() => handleEditMessage(msg)} className="text-[10px] text-indigo-400 hover:text-indigo-600 font-black flex items-center gap-1 bg-white px-2 py-1 rounded-full shadow-sm"><i className="fa-solid fa-pen"></i> 编辑</button>
                    <button onClick={() => handleCopy(msg.text)} className="text-[10px] text-indigo-400 hover:text-indigo-600 font-black flex items-center gap-1 bg-white px-2 py-1 rounded-full shadow-sm"><i className="fa-solid fa-copy"></i> 复制</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => handleCopy(msg.text)} className="text-[10px] text-slate-400 hover:text-indigo-600 font-black flex items-center gap-1 bg-white px-2 py-1 rounded-full shadow-sm border border-slate-50"><i className="fa-solid fa-copy"></i> 复制</button>
                    {idx === chatMessages.length - 1 && !isAiProcessing && (
                      <button onClick={() => handleSendMessage(undefined, msg.id)} className="text-[10px] text-slate-400 hover:text-indigo-600 font-black flex items-center gap-1 bg-white px-2 py-1 rounded-full shadow-sm border border-slate-50"><i className="fa-solid fa-rotate-right"></i> 重生成</button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {isAiProcessing && (
          <div className="flex justify-start">
            <div className="bg-white p-4 rounded-3xl rounded-tl-none border border-slate-100 flex gap-1 items-center">
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
              <span className="text-[10px] text-indigo-400 ml-2 font-black uppercase">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {chatContextMeds.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1">
            {chatContextMeds.map(id => {
              const med = medicines.find(m => m.id === id);
              return med ? (
                <div key={id} className="bg-indigo-50 text-indigo-600 text-[10px] font-black px-3 py-1.5 rounded-full flex items-center gap-2 border border-indigo-100">
                  <i className="fa-solid fa-pills"></i> {med.name}
                  <button onClick={() => setChatContextMeds(prev => prev.filter(p => p !== id))} className="hover:text-red-500"><i className="fa-solid fa-xmark"></i></button>
                </div>
              ) : null;
            })}
          </div>
        )}

        {chatImage && (
          <div className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-md border-2 border-white">
            <img src={chatImage} alt="upload" className="w-full h-full object-cover" />
            <button 
              onClick={() => setChatImage(null)}
              className="absolute top-1 right-1 bg-black/50 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] backdrop-blur"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}
        
        <div className="flex gap-2 items-center bg-white p-2 rounded-[28px] border border-slate-100 shadow-sm relative">
          <button 
            onClick={() => { setCameraMode('chat'); setShowCamera(true); }}
            className="w-10 h-10 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center active:scale-90 transition-all hover:bg-indigo-50 hover:text-indigo-600"
          >
            <i className="fa-solid fa-camera"></i>
          </button>
          <input 
            type="text" 
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    if (editingMessageId) {
                        handleSendMessage(chatInput, editingMessageId);
                    } else {
                        handleSendMessage();
                    }
                }
            }}
            placeholder={editingMessageId ? "编辑消息..." : "问问禁忌、存储方法..."}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-2"
          />
          {editingMessageId && (
            <button onClick={() => { setEditingMessageId(null); setChatInput(''); }} className="text-slate-300 px-2"><i className="fa-solid fa-xmark"></i></button>
          )}
          <button 
            onClick={() => editingMessageId ? handleSendMessage(chatInput, editingMessageId) : handleSendMessage()}
            disabled={isAiProcessing || (!chatInput.trim() && !chatImage && chatContextMeds.length === 0)}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
              (chatInput.trim() || chatImage || chatContextMeds.length > 0) && !isAiProcessing ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 active:scale-90' : 'bg-slate-50 text-slate-300'
            }`}
          >
            <i className={editingMessageId ? "fa-solid fa-check" : "fa-solid fa-paper-plane"}></i>
          </button>
        </div>
      </div>

      {isContextModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-6" onClick={() => setIsContextModalOpen(false)}>
          <div className="bg-white rounded-[40px] w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
              <h3 className="text-lg font-black text-slate-800">选择对话关联药品</h3>
              <button onClick={() => setIsContextModalOpen(false)} className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {medicines.map(med => (
                <div 
                  key={med.id} 
                  onClick={() => {
                    setChatContextMeds(prev => prev.includes(med.id) ? prev.filter(p => p !== med.id) : [...prev, med.id]);
                  }}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${chatContextMeds.includes(med.id) ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}
                >
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${chatContextMeds.includes(med.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-transparent'}`}>
                    <i className="fa-solid fa-check text-[10px]"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{med.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{med.brand}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6">
              <button onClick={() => setIsContextModalOpen(false)} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderAdd = () => (
    <div className="flex flex-col gap-6 animate-fadeIn pb-24">
      <div className="flex items-center gap-4">
        <button onClick={() => { setCurrentView('cabinet'); resetFormData(); }} className="text-slate-400 active:scale-90 transition-all"><i className="fa-solid fa-arrow-left text-xl"></i></button>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">{formData.id ? '编辑药品' : '手动录入'}</h2>
      </div>

      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
        <div className="relative group flex flex-col items-center">
          <div className="w-full h-48 bg-slate-50 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-dashed border-slate-200 group-hover:border-indigo-200 transition-all cursor-pointer" onClick={() => { setCameraMode('ocr'); setShowCamera(true); }}>
            {formData.photoUrl ? (
              <img src={formData.photoUrl} alt="med" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-300 group-hover:text-indigo-300">
                <i className="fa-solid fa-camera text-4xl"></i>
                <span className="text-[10px] font-black uppercase tracking-widest">点击拍照识别</span>
              </div>
            )}
          </div>
          {formData.photoUrl && (
            <button onClick={(e) => { e.stopPropagation(); setFormData(prev => ({...prev, photoUrl: undefined})); }} className="absolute -top-2 -right-2 w-8 h-8 bg-white shadow-md border border-slate-100 rounded-full flex items-center justify-center text-red-500 active:scale-90 transition-all">
              <i className="fa-solid fa-trash-can text-xs"></i>
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">药品名称 *</label>
            <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100" placeholder="如：布洛芬缓释胶囊" />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">品牌/厂商</label>
                <input type="text" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100" placeholder="如：芬必得" />
             </div>
             <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分类</label>
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as MedicineCategory})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100" >
                  {Object.values(MedicineCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">有效期 *</label>
                <div className="flex gap-2">
                  <input type="date" value={specialExpiry === 'none' ? formData.expiryDate : ''} disabled={specialExpiry !== 'none'} onChange={e => setFormData({...formData, expiryDate: e.target.value})} className="flex-1 bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 disabled:opacity-40" />
                  <select value={specialExpiry} onChange={e => setSpecialExpiry(e.target.value as any)} className="w-24 bg-slate-50 border-none rounded-2xl px-2 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 focus:ring-2 focus:ring-indigo-100" >
                    <option value="none">日期</option>
                    <option value="permanent">永久</option>
                    <option value="uncertain">不详</option>
                  </select>
                </div>
             </div>
             <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">库存/单位</label>
                <div className="flex gap-2">
                   <input type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: parseInt(e.target.value) || 0})} className="w-16 bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100" />
                   {isCustomUnit ? (
                     <input type="text" value={customUnitValue} onChange={e => setCustomUnitValue(e.target.value)} onBlur={() => {if(!customUnitValue) setIsCustomUnit(false)}} className="flex-1 bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100" placeholder="单位" />
                   ) : (
                     <select value={formData.unit} onChange={e => {if(e.target.value === 'custom') setIsCustomUnit(true); else setFormData({...formData, unit: e.target.value});}} className="flex-1 bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100" >
                        {PRESET_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        <option value="custom">自定义...</option>
                     </select>
                   )}
                </div>
             </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">用法用量</label>
            <textarea value={formData.usage} onChange={e => setFormData({...formData, usage: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 min-h-[80px]" placeholder="如：一日三次，饭后服用" />
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-50">
             <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2"><i className="fa-solid fa-plus-circle"></i> 自定义额外信息</h4>
             {formData.customFields?.map((field, idx) => (
                <div key={idx} className="flex gap-2">
                   <div className="w-1/3 bg-slate-100 rounded-xl px-4 py-3 text-[10px] font-black text-slate-500 uppercase flex items-center">{field.label}</div>
                   <input type="text" value={field.value} onChange={e => updateCustomField(idx, e.target.value)} className="flex-1 bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100" placeholder="内容..." />
                   <button onClick={() => removeCustomField(idx)} className="text-red-300 hover:text-red-500 px-2 transition-colors"><i className="fa-solid fa-trash-can"></i></button>
                </div>
             ))}
             <button onClick={handleAddCustomField} className="w-full py-3 border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 text-xs font-black hover:border-indigo-100 hover:text-indigo-400 transition-all active:scale-95">+ 添加新类别 (如：复购建议、货架号)</button>
          </div>
        </div>

        <button onClick={handleSaveMedicine} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-indigo-100 active:scale-95 transition-all">保存药品档案</button>
      </div>
    </div>
  );

  const renderDetail = () => {
    if (!selectedMedicine) return null;
    return (
      <div className="flex flex-col gap-6 animate-fadeIn pb-24">
        <div className="flex justify-between items-center">
          <button onClick={() => setCurrentView('cabinet')} className="text-slate-400 active:scale-90 transition-all"><i className="fa-solid fa-arrow-left text-xl"></i></button>
          <div className="flex gap-2">
             <button onClick={() => { setFormData(selectedMedicine); setCurrentView('add'); }} className="w-10 h-10 bg-white border border-slate-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm active:scale-90 transition-all"><i className="fa-solid fa-pen-to-square"></i></button>
             <button onClick={() => { if(window.confirm('确定要删除该药品吗？')) { db.deleteMedicines([selectedMedicine.id]); refreshData(); setCurrentView('cabinet'); showToast('已删除'); } }} className="w-10 h-10 bg-white border border-slate-100 text-red-500 rounded-xl flex items-center justify-center shadow-sm active:scale-90 transition-all"><i className="fa-solid fa-trash"></i></button>
          </div>
        </div>

        <div className="bg-white rounded-[48px] p-8 border border-slate-100 shadow-sm space-y-8">
           <div className="flex flex-col items-center gap-6">
              <div onClick={() => selectedMedicine.photoUrl && setZoomedImageUrl(selectedMedicine.photoUrl)} className="w-48 h-48 rounded-[40px] overflow-hidden bg-slate-50 border border-slate-100 shadow-inner group relative cursor-zoom-in">
                 {selectedMedicine.photoUrl ? <img src={selectedMedicine.photoUrl} alt={selectedMedicine.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-slate-200 text-6xl"><i className="fa-solid fa-pills"></i></div>}
                 <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"><i className="fa-solid fa-magnifying-glass-plus text-white text-2xl"></i></div>
              </div>
              <div className="text-center space-y-2">
                 <h2 className="text-2xl font-black text-slate-800 tracking-tight">{selectedMedicine.name}</h2>
                 <p className="text-sm font-bold text-slate-400">{selectedMedicine.brand || '未知品牌'} · {selectedMedicine.category}</p>
                 <div className="flex justify-center gap-4 mt-4">
                    <div className="bg-indigo-50 px-4 py-2 rounded-2xl flex flex-col items-center min-w-[80px]">
                       <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400">当前库存</span>
                       <span className="text-base font-black text-indigo-600">{selectedMedicine.stock}{selectedMedicine.unit}</span>
                    </div>
                    <div className="bg-emerald-50 px-4 py-2 rounded-2xl flex flex-col items-center min-w-[80px]">
                       <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400">有效期至</span>
                       <span className="text-base font-black text-emerald-600">{selectedMedicine.expiryDate}</span>
                    </div>
                 </div>
              </div>
           </div>

           <div className="space-y-6">
              {[
                { label: '用法用量', value: selectedMedicine.usage, icon: 'clock' },
                { label: '成份', value: selectedMedicine.ingredients, icon: 'flask' },
                { label: '适应症', value: selectedMedicine.indications, icon: 'hand-holding-medical' },
                { label: '注意事项', value: selectedMedicine.precautions, icon: 'triangle-exclamation' }
              ].map(item => item.value ? (
                <div key={item.label} className="bg-slate-50 p-6 rounded-3xl space-y-2">
                   <div className="flex items-center gap-2">
                      <i className={`fa-solid fa-${item.icon} text-indigo-400 text-xs`}></i>
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{item.label}</span>
                   </div>
                   <p className="text-sm text-slate-600 leading-relaxed font-medium">{item.value}</p>
                </div>
              ) : null)}

              {selectedMedicine.customFields?.map((field, idx) => (
                <div key={idx} className="bg-slate-50 p-6 rounded-3xl space-y-2">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{field.label}</span>
                   <p className="text-sm text-slate-600 leading-relaxed font-medium">{field.value || '未填写'}</p>
                </div>
              ))}
           </div>

           <div className="pt-4 flex gap-3">
              <button onClick={() => { setChatContextMeds([selectedMedicine.id]); setCurrentView('assistant'); }} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2"><i className="fa-solid fa-comment-dots"></i> 咨询 AI 建议</button>
              <button onClick={() => setViewingManual(selectedMedicine)} className="flex-1 bg-white border border-indigo-100 text-indigo-600 py-4 rounded-2xl font-black active:scale-95 transition-all flex items-center justify-center gap-2"><i className="fa-solid fa-book-open"></i> 电子说明书</button>
           </div>
        </div>
      </div>
    );
  };

  const renderPlans = () => (
    <div className="flex flex-col gap-6 animate-fadeIn pb-24">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">服药管理</h2>
        <button onClick={() => { setIsAddingPlan(true); setPlanFormData({ memberId: familyMembers[0]?.id || '', medicineId: medicines[0]?.id || '', time: '08:00', dosageAmount: 1, dosageUnit: medicines[0]?.unit || '片', frequency: 'daily', isActive: true }); }} className="bg-indigo-600 text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all"><i className="fa-solid fa-plus"></i></button>
      </div>

      <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm mb-2">
        <button onClick={() => setPlansSubView('active')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${plansSubView === 'active' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>执行中计划</button>
        <button onClick={() => setPlansSubView('history')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${plansSubView === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>服药日志</button>
      </div>

      {plansSubView === 'active' ? (
        <div className="space-y-4">
          {medicationPlans.length > 0 ? medicationPlans.map(plan => {
            const member = familyMembers.find(f => f.id === plan.memberId);
            const med = medicines.find(m => m.id === plan.medicineId);
            return (
              <div key={plan.id} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group transition-all hover:shadow-md">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex flex-col items-center justify-center">
                    <span className="text-xs font-black">{plan.time}</span>
                    <i className="fa-solid fa-bell text-[10px] mt-1 opacity-50"></i>
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-sm">{plan.medicineName}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{member?.name || '未知成员'} · {plan.dosageAmount}{plan.dosageUnit}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                   <button onClick={() => handleIntakeConfirm(plan)} className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100 active:scale-90 transition-all"><i className="fa-solid fa-check"></i></button>
                   <button onClick={() => { if(window.confirm('确定要删除此计划吗？')) { db.deletePlan(plan.id); refreshData(); } }} className="w-10 h-10 bg-white border border-slate-100 text-slate-300 rounded-xl flex items-center justify-center active:scale-90 transition-all hover:text-red-500 hover:border-red-100"><i className="fa-solid fa-trash-can text-xs"></i></button>
                </div>
              </div>
            );
          }) : (
            <div className="flex flex-col items-center py-20 text-slate-200">
              <i className="fa-solid fa-clock-rotate-left text-5xl mb-4"></i>
              <p className="text-xs font-bold uppercase tracking-widest">暂无活跃计划</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
           {medicationHistory.length > 0 ? medicationHistory.map(item => (
             <div key={item.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center"><i className="fa-solid fa-calendar-check text-xs"></i></div>
                   <div>
                      <h4 className="font-bold text-slate-800 text-sm">{item.medicineName}</h4>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">{item.memberName} · {new Date(item.timestamp).toLocaleString()}</p>
                   </div>
                </div>
                <div className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">+{item.dosageAmount}{item.dosageUnit}</div>
             </div>
           )) : (
            <div className="flex flex-col items-center py-20 text-slate-200">
              <i className="fa-solid fa-history text-5xl mb-4"></i>
              <p className="text-xs font-bold uppercase tracking-widest">记录是空的</p>
            </div>
           )}
        </div>
      )}

      {isAddingPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-6" onClick={() => setIsAddingPlan(false)}>
          <div className="bg-white rounded-[40px] w-full max-w-sm overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-indigo-50/30">
              <h3 className="text-xl font-black text-slate-800">新建提醒</h3>
              <button onClick={() => setIsAddingPlan(false)} className="w-10 h-10 bg-white text-slate-400 rounded-2xl flex items-center justify-center shadow-sm"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="p-8 space-y-5">
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">选择药品</label>
                  <select value={planFormData.medicineId} onChange={e => { const med = medicines.find(m => m.id === e.target.value); setPlanFormData({...planFormData, medicineId: e.target.value, medicineName: med?.name || '', dosageUnit: med?.unit || '片'}); }} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100">
                    <option value="">请选择药品...</option>
                    {medicines.map(m => <option key={m.id} value={m.id}>{m.name} (库存:{m.stock}{m.unit})</option>)}
                  </select>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">提醒成员</label>
                  <select value={planFormData.memberId} onChange={e => setPlanFormData({...planFormData, memberId: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100">
                    <option value="">请选择家庭成员...</option>
                    {familyMembers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">提醒时间</label>
                    <input type="time" value={planFormData.time} onChange={e => setPlanFormData({...planFormData, time: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单次剂量</label>
                    <div className="flex gap-2">
                       <input type="number" value={planFormData.dosageAmount} onChange={e => setPlanFormData({...planFormData, dosageAmount: parseFloat(e.target.value) || 1})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100" />
                       <span className="flex items-center text-xs font-bold text-slate-400 whitespace-nowrap">{planFormData.dosageUnit}</span>
                    </div>
                  </div>
               </div>
               <button onClick={handleSavePlan} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-indigo-100 active:scale-95 transition-all mt-4">创建服药提醒</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderFamilyList = () => (
    <div className="flex flex-col gap-6 animate-fadeIn pb-24">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentView('profile')} className="text-slate-400 active:scale-90 transition-all"><i className="fa-solid fa-arrow-left text-xl"></i></button>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">成员档案</h2>
        </div>
        <button onClick={() => { setEditingMember({ name: '', age: '', gender: 'male', bloodType: '', allergies: '', contraindications: '', medicalHistory: '' }); setCurrentView('edit-member'); }} className="bg-indigo-600 text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all"><i className="fa-solid fa-user-plus"></i></button>
      </div>

      <div className="space-y-4">
         {familyMembers.length > 0 ? familyMembers.map(member => (
           <div key={member.id} onClick={() => { setEditingMember(member); setCurrentView('edit-member'); }} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group transition-all hover:shadow-md cursor-pointer">
              <div className="flex items-center gap-5">
                 <div className="w-16 h-16 bg-slate-50 text-indigo-600 rounded-[24px] flex items-center justify-center text-2xl shadow-inner group-hover:bg-indigo-50 transition-colors">
                    <i className={`fa-solid fa-${member.gender === 'female' ? 'venus' : 'mars'}`}></i>
                 </div>
                 <div>
                    <h4 className="font-black text-slate-800 text-base">{member.name}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{member.age ? `${member.age} 岁` : '年龄未填'} · {member.bloodType || '血型未填'}</p>
                 </div>
              </div>
              <i className="fa-solid fa-chevron-right text-slate-100 group-hover:text-indigo-200 transition-colors"></i>
           </div>
         )) : (
           <div className="flex flex-col items-center py-20 text-slate-200">
             <i className="fa-solid fa-people-group text-5xl mb-4"></i>
             <p className="text-xs font-bold uppercase tracking-widest">尚未添加成员</p>
           </div>
         )}
      </div>
    </div>
  );

  const renderEditMember = () => (
    <div className="flex flex-col gap-6 animate-fadeIn pb-24">
      <div className="flex items-center gap-4">
        <button onClick={() => setCurrentView('family-list')} className="text-slate-400 active:scale-90 transition-all"><i className="fa-solid fa-arrow-left text-xl"></i></button>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">{editingMember?.id ? '修改档案' : '添加成员'}</h2>
      </div>

      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
         <div className="space-y-4">
            <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">姓名 *</label>
               <input type="text" value={editingMember?.name} onChange={e => setEditingMember({...editingMember, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100" placeholder="姓名" />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">性别</label>
                  <select value={editingMember?.gender} onChange={e => setEditingMember({...editingMember, gender: e.target.value as any})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100">
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">年龄</label>
                  <input type="number" value={editingMember?.age} onChange={e => setEditingMember({...editingMember, age: parseInt(e.target.value) || ''})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100" placeholder="年龄" />
               </div>
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">过敏史</label>
               <textarea value={editingMember?.allergies} onChange={e => setEditingMember({...editingMember, allergies: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 min-h-[80px]" placeholder="如：对青霉素过敏" />
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">慢性病/病史</label>
               <textarea value={editingMember?.medicalHistory} onChange={e => setEditingMember({...editingMember, medicalHistory: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 min-h-[80px]" placeholder="如：高血压、糖尿病" />
            </div>
         </div>
         <button onClick={handleSaveMember} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-indigo-100 active:scale-95 transition-all">保存成员档案</button>
         {editingMember?.id && (
           <button onClick={() => { if(window.confirm('确定要移除该成员吗？')) { /* 实现删除逻辑 */ setCurrentView('family-list'); } }} className="w-full text-red-400 py-2 text-xs font-black uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity">移除成员</button>
         )}
      </div>
    </div>
  );

  const renderKeys = () => (
    <div className="flex flex-col gap-6 animate-fadeIn pb-24">
      <div className="flex items-center gap-4">
        <button onClick={() => setCurrentView('profile')} className="text-slate-400 active:scale-90 transition-all"><i className="fa-solid fa-arrow-left text-xl"></i></button>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">AI 密钥管理</h2>
      </div>

      <div className="bg-indigo-600 rounded-[32px] p-6 text-white space-y-3 shadow-xl shadow-indigo-100">
         <h3 className="font-black text-lg">关于 API Key</h3>
         <p className="text-xs text-white/70 leading-relaxed font-medium">应用使用 Google Gemini 引擎进行识别和问诊。您需要前往 <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline font-black decoration-indigo-300">Google AI Studio</a> 获取免费或付费密钥。</p>
      </div>

      <div className="space-y-4">
         {apiKeys.map(k => (
           <div key={k.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group transition-all">
              <div className="flex-1 min-w-0">
                 <div className="flex items-center gap-2">
                    <h4 className="font-black text-slate-800 text-sm truncate">{k.name}</h4>
                    {k.isActive && <span className="bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase">活动</span>}
                 </div>
                 <p className="text-[10px] font-mono text-slate-300 mt-1 truncate">{k.isVisible ? k.key : '••••••••••••••••'}</p>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => setApiKeys(apiKeys.map(item => item.id === k.id ? {...item, isVisible: !item.isVisible} : item))} className="w-9 h-9 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className={`fa-solid fa-eye${k.isVisible ? '-slash' : ''} text-xs`}></i></button>
                 {!k.isActive && <button onClick={() => { const newKeys = apiKeys.map(item => ({...item, isActive: item.id === k.id})); setApiKeys(newKeys); db.saveApiKeys(newKeys); showToast('已切换主密钥'); }} className="w-9 h-9 bg-slate-50 text-indigo-400 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-toggle-off text-xs"></i></button>}
                 <button onClick={() => { const newKeys = apiKeys.filter(item => item.id !== k.id); setApiKeys(newKeys); db.saveApiKeys(newKeys); showToast('已移除'); }} className="w-9 h-9 bg-slate-50 text-red-300 rounded-xl flex items-center justify-center transition-all active:scale-90 hover:text-red-500"><i className="fa-solid fa-trash-can text-xs"></i></button>
              </div>
           </div>
         ))}
         
         <button onClick={() => { const name = prompt('密钥备注名称') || '我的 Gemini Key'; const key = prompt('输入 API Key'); if(key) { const newKeys = [...apiKeys, { id: Date.now().toString(), name, key, isActive: apiKeys.length === 0, isVisible: false }]; setApiKeys(newKeys); db.saveApiKeys(newKeys); showToast('密钥添加成功'); } }} className="w-full py-5 border-2 border-dashed border-slate-100 rounded-[32px] text-slate-300 text-sm font-black hover:border-indigo-100 hover:text-indigo-400 transition-all active:scale-95 flex items-center justify-center gap-3">
            <i className="fa-solid fa-key text-xs"></i> 添加新密钥
         </button>
      </div>
    </div>
  );

  const renderSync = () => (
    <div className="flex flex-col gap-6 animate-fadeIn pb-24">
      <div className="flex items-center gap-4">
        <button onClick={() => setCurrentView('profile')} className="text-slate-400 active:scale-90 transition-all"><i className="fa-solid fa-arrow-left text-xl"></i></button>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">数据存储与备份</h2>
      </div>
      
      <p className="text-xs text-slate-500 -mt-2 px-1">管理您的本地数据库文件和导入/导出。</p>

      {/* 本地数据库文件 (参照截图设计) */}
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
          <i className="fa-solid fa-database text-xs opacity-60"></i> 本地数据库文件
        </div>

        <div className={`rounded-2xl p-4 flex items-center justify-between border ${dbMetadata.isConnected ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-inner ${dbMetadata.isConnected ? 'bg-white text-emerald-600' : 'bg-slate-100 text-slate-300'}`}>
              <i className="fa-solid fa-database"></i>
            </div>
            <div>
              <h4 className={`text-sm font-black ${dbMetadata.isConnected ? 'text-emerald-800' : 'text-slate-400'}`}>
                {dbMetadata.isConnected ? '已连接文件' : '未连接本地文件'}
              </h4>
              <p className="text-[10px] font-mono text-emerald-600/70 mt-0.5">{dbMetadata.currentFileName}</p>
            </div>
          </div>
          {dbMetadata.isConnected && (
            <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${dbMetadata.isPermissionDenied ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
              {dbMetadata.isPermissionDenied ? '权限受限' : '读写正常'}
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 text-[10px] text-slate-400 px-1 italic">
          <i className="fa-solid fa-circle-info mt-0.5"></i>
          <span>此文件包含您的所有聊天记录、设置和密钥。所有数据变更会自动实时同步写入。</span>
        </div>

        {dbMetadata.isConnected && dbMetadata.isPermissionDenied && (
          <button 
            onClick={async () => { await db.connectToLocalFile(false); refreshData(); }}
            className="w-full bg-amber-500 text-white py-3 rounded-2xl font-black text-xs shadow-lg shadow-amber-100 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-key"></i> 恢复读写权限
          </button>
        )}

        {!dbMetadata.isConnected ? (
          <div className="grid grid-cols-2 gap-3">
             <button 
              onClick={async () => { if(await db.connectToLocalFile(false)) { showToast('数据库连接成功'); refreshData(); } }}
              className="bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-link"></i> 连接本地文件
            </button>
            <button 
              onClick={async () => { if(await db.connectToLocalFile(true)) { showToast('新数据库创建成功'); refreshData(); } }}
              className="bg-white border border-indigo-100 text-indigo-600 py-4 rounded-2xl font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-file-circle-plus"></i> 创建新本地文件
            </button>
            <button 
              onClick={async () => { 
                try {
                  await db.connectToServerFile();
                  showToast('服务器数据库连接成功');
                  refreshData();
                } catch (e: any) {
                  showToast('连接服务器文件失败: ' + (e.message || '未知错误'));
                }
              }}
              className="col-span-2 bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-server"></i> 连接部署端服务器文件 (/data/data/com.termux/...)
            </button>
          </div>
        ) : (
          <button 
            onClick={async () => { if(window.confirm('确定要断开本地文件连接吗？断开后数据将保留在浏览器缓存中，但不会同步到文件。')) { await db.disconnectFile(); refreshData(); } }}
            className="w-full bg-slate-100 text-slate-500 py-3 rounded-2xl font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-link-slash"></i> 断开连接
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><i className="fa-solid fa-download"></i></div>
            <h4 className="font-black text-slate-800 text-sm">手动备份</h4>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-bold">导出当前所有数据的 JSON 备份文件（快照）。</p>
          <button 
            onClick={() => { const data = db.exportAllData(); const blob = new Blob([data], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `智家药箱备份_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url); showToast('数据导出成功'); }}
            className="w-full bg-slate-50 text-slate-600 py-3 rounded-2xl font-black text-xs active:scale-95 transition-all"
          >
            下载备份 (.json)
          </button>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><i className="fa-solid fa-upload"></i></div>
            <h4 className="font-black text-slate-800 text-sm">数据导入</h4>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-bold">从 JSON 备份文件恢复数据（将覆盖/合并现有数据）。</p>
          <button 
            onClick={() => syncFileInputRef.current?.click()}
            className="w-full bg-slate-50 text-slate-600 py-3 rounded-2xl font-black text-xs active:scale-95 transition-all"
          >
            选择文件导入
          </button>
          <input type="file" ref={syncFileInputRef} className="hidden" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { const content = event.target?.result as string; if (db.importAllData(content, file.name)) { showToast('数据导入成功！'); refreshData(); } else { showToast('数据导入失败', 'error'); } }; reader.readAsText(file); }} />
        </div>
      </div>
    </div>
  );

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard': return renderDashboard();
      case 'cabinet': return renderCabinet();
      case 'assistant': return renderAssistant();
      case 'add': return renderAdd();
      case 'detail': return renderDetail();
      case 'plans': return renderPlans();
      case 'family-list': return renderFamilyList();
      case 'edit-member': return renderEditMember();
      case 'keys': return renderKeys();
      case 'sync': return renderSync();
      case 'med-api': return (
        <div className="flex flex-col gap-6 animate-fadeIn pb-24">
          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentView('profile')} className="text-slate-400 active:scale-90 transition-all"><i className="fa-solid fa-arrow-left text-xl"></i></button>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">专业医药数据库</h2>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <div><h4 className="font-black text-slate-800 text-sm">启用数据库对齐</h4><p className="text-[10px] text-slate-400 font-bold mt-0.5">自动校准识别结果</p></div>
              <button onClick={() => { const newConfig = { ...medApiConfig, isEnabled: !medApiConfig.isEnabled }; setMedApiConfig(newConfig); db.saveMedicalApiConfig(newConfig); showToast(newConfig.isEnabled ? '功能已开启' : '功能已关闭'); }} className={`w-14 h-8 rounded-full relative transition-all duration-300 ${medApiConfig.isEnabled ? 'bg-indigo-600' : 'bg-slate-200'}`} ><div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all duration-300 ${medApiConfig.isEnabled ? 'left-7' : 'left-1'}`}></div></button>
            </div>
            <div className={`space-y-4 transition-all duration-300 ${medApiConfig.isEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <select value={medApiConfig.provider} onChange={(e) => { const newConfig = { ...medApiConfig, provider: e.target.value as any }; setMedApiConfig(newConfig); db.saveMedicalApiConfig(newConfig); }} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 mt-1 text-sm focus:ring-2 focus:ring-indigo-100" >
                <option value="default">智能匹配 (推荐)</option>
                <option value="aliyun">阿里云医药数据库</option>
                <option value="tencent">腾讯云医药识别</option>
                <option value="custom">自定义接口</option>
              </select>
              <input type="text" value={medApiConfig.endpoint} onChange={(e) => { const newConfig = { ...medApiConfig, endpoint: e.target.value }; setMedApiConfig(newConfig); db.saveMedicalApiConfig(newConfig); }} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 mt-1 text-sm focus:ring-2 focus:ring-indigo-100" placeholder="https://api.your-provider.com/v1" />
              <input type="password" value={medApiConfig.apiKey} onChange={(e) => { const newConfig = { ...medApiConfig, apiKey: e.target.value }; setMedApiConfig(newConfig); db.saveMedicalApiConfig(newConfig); }} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 mt-1 text-sm focus:ring-2 focus:ring-indigo-100" placeholder="API Key / Token" />
            </div>
          </div>
        </div>
      );
      case 'profile': return (
        <div className="flex flex-col gap-6 animate-fadeIn pb-24">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">个人与设置</h2>
          <div className="bg-white p-8 rounded-[48px] border border-slate-100 flex flex-col items-center gap-4 shadow-sm">
             <div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-4xl shadow-inner"><i className="fa-solid fa-user"></i></div>
             <div className="text-center">
               <h3 className="text-lg font-black text-slate-800">家庭管理员</h3>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                 {dbMetadata.isConnected ? '本地文件同步模式' : '浏览器缓存模式'}
               </p>
             </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => setCurrentView('family-list')} className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-col items-center gap-3 active:scale-95 transition-all text-center"><div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center"><i className="fa-solid fa-people-roof"></i></div><span className="text-[10px] font-black text-slate-700 uppercase">成员档案</span></button>
            <button onClick={() => setCurrentView('keys')} className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-col items-center gap-3 active:scale-95 transition-all text-center"><div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center"><i className="fa-solid fa-key"></i></div><span className="text-[10px] font-black text-slate-700 uppercase">AI 密钥</span></button>
            <button onClick={() => setCurrentView('sync')} className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-col items-center gap-3 active:scale-95 transition-all text-center"><div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center"><i className="fa-solid fa-arrows-rotate"></i></div><span className="text-[10px] font-black text-slate-700 uppercase">存储同步</span></button>
            <button onClick={() => setCurrentView('med-api')} className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-col items-center gap-3 active:scale-95 transition-all text-center"><div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center"><i className="fa-solid fa-notes-medical"></i></div><span className="text-[10px] font-black text-slate-700 uppercase">专业库</span></button>
          </div>
        </div>
      );
      default: return renderDashboard();
    }
  };

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen px-4 pt-6 relative overflow-x-hidden">
      <div className="pb-32">{renderCurrentView()}</div>
      
      {toast && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border animate-slideDown ${ toast.type === 'success' ? 'bg-emerald-500 text-white border-emerald-400' : toast.type === 'error' ? 'bg-red-500 text-white border-red-400' : 'bg-slate-800 text-white border-slate-700' }`}>
            <i className={`fa-solid ${toast.type === 'success' ? 'fa-circle-check' : toast.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info'}`}></i>
            <span className="text-xs font-black">{toast.message}</span>
        </div>
      )}

      {zoomedImageUrl && (
        <div className="fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 animate-fadeIn" onClick={() => setZoomedImageUrl(null)}>
            <div className="relative max-w-full max-h-full">
                <img src={zoomedImageUrl} className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain animate-zoomIn" onClick={e => e.stopPropagation()} />
                <button onClick={() => setZoomedImageUrl(null)} className="absolute -top-12 right-0 w-10 h-10 bg-white/10 text-white rounded-full flex items-center justify-center backdrop-blur active:scale-90 transition-all border border-white/20"><i className="fa-solid fa-xmark text-xl"></i></button>
            </div>
        </div>
      )}
      
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-xl border-t border-slate-100 px-6 py-4 flex justify-between items-center z-40 rounded-t-[40px] shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
        {[
          { icon: 'house', label: '主页', view: 'dashboard' },
          { icon: 'pills', label: '药箱', view: 'cabinet' },
          { icon: 'wand-magic-sparkles', label: 'AI', view: 'assistant', special: true },
          { icon: 'calendar-check', label: '计划', view: 'plans' },
          { icon: 'user', label: '我的', view: 'profile' }
        ].map(item => (
          <button key={item.view} onClick={() => { setCurrentView(item.view as View); setIsSelectionMode(false); setSelectedIds([]); }} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${item.special ? 'relative -top-8' : ''}`}>
            <div className={`flex items-center justify-center transition-all duration-300 ${item.special ? 'w-16 h-16 bg-indigo-600 text-white rounded-[24px] shadow-2xl shadow-indigo-300 active:scale-90' : `w-11 h-11 rounded-2xl ${currentView === item.view ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-300 hover:text-slate-400'}`}`}><i className={`fa-solid fa-${item.icon} ${item.special ? 'text-2xl' : 'text-lg'}`}></i></div>
            {!item.special && <span className={`text-[9px] font-black uppercase tracking-widest ${currentView === item.view ? 'text-indigo-600' : 'text-slate-300'}`}>{item.label}</span>}
          </button>
        ))}
      </div>

      {showCamera && <CameraCapture onCapture={handlePhotoCapture} onClose={() => setShowCamera(false)} />}

      {viewingManual && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6" onClick={() => setViewingManual(null)}>
          <div className="bg-white rounded-[40px] w-full max-w-sm max-h-[80vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-indigo-50/30">
              <div><h3 className="text-xl font-black text-slate-800 leading-tight">{viewingManual.name}</h3><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-1">电子说明书</p></div>
              <button onClick={() => setViewingManual(null)} className="w-10 h-10 bg-white text-slate-400 rounded-2xl flex items-center justify-center shadow-sm active:scale-90 transition-all"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {[
                { label: '用法用量', value: viewingManual.usage },
                { label: '适应症', value: viewingManual.indications },
                { label: '禁忌', value: viewingManual.contraindications },
                { label: '注意事项', value: viewingManual.precautions }
              ].map(item => item.value ? (
                <div key={item.label}>
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2">{item.label}</span>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.value}</p>
                </div>
              ) : null)}
              
              {viewingManual.customFields?.map((field, idx) => (
                <div key={idx}>
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2">{field.label}</span>
                  <p className="text-sm text-slate-600 leading-relaxed">{field.value || '未填写'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .animate-slideDown { animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideDown { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        .animate-zoomIn { animation: zoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes zoomIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default App;
