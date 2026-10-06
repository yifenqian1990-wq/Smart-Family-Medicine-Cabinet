
import React, { useRef } from 'react';
import { Medicine } from '../types';

export type ViewMode = 'grid' | 'list' | 'detailed';

interface Props {
  medicine: Medicine;
  onClick: (id: string) => void;
  onViewManual?: (medicine: Medicine) => void;
  onSelect?: (id: string) => void;
  onLongPress?: (id: string) => void;
  onImageClick?: (url: string) => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  viewMode?: ViewMode;
}

const MedicineCard: React.FC<Props> = ({ 
  medicine, 
  onClick, 
  onViewManual, 
  onSelect, 
  onLongPress,
  onImageClick,
  isSelected, 
  isSelectionMode,
  viewMode = 'grid'
}) => {
  const isSpecial = medicine.expiryDate === 'permanent' || medicine.expiryDate === 'uncertain';
  const isExpired = !isSpecial && new Date(medicine.expiryDate) < new Date();
  const expiringSoon = !isSpecial && !isExpired && (new Date(medicine.expiryDate).getTime() - new Date().getTime()) < (30 * 24 * 60 * 60 * 1000);
  
  const longPressTimer = useRef<number | null>(null);

  const handlePointerDown = () => {
    if (isSelectionMode) return;
    longPressTimer.current = window.setTimeout(() => {
      onLongPress?.(medicine.id);
    }, 600);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isSelectionMode) {
      e.stopPropagation();
      onSelect?.(medicine.id);
    } else {
      onClick(medicine.id);
    }
  };

  const handleManualClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewManual?.(medicine);
  };

  const handleImgClick = (e: React.MouseEvent) => {
    if (medicine.photoUrl && onImageClick && !isSelectionMode) {
      e.stopPropagation();
      onImageClick(medicine.photoUrl);
    }
  };

  const commonProps = {
    onClick: handleClick,
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerLeave: handlePointerUp,
  };

  const getExpiryLabel = () => {
    if (medicine.expiryDate === 'permanent') return '永久有效';
    if (medicine.expiryDate === 'uncertain') return '日期不详';
    return medicine.expiryDate;
  };

  const getExpiryColor = () => {
    if (medicine.expiryDate === 'permanent') return 'text-emerald-500';
    if (medicine.expiryDate === 'uncertain') return 'text-slate-500';
    return isExpired ? 'text-red-500' : expiringSoon ? 'text-amber-500' : 'text-emerald-500';
  };

  if (viewMode === 'list') {
    return (
      <div 
        {...commonProps}
        className={`bg-white rounded-2xl p-3 shadow-sm border transition-all cursor-pointer flex items-center gap-4 ${
          isSelected ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-md bg-indigo-50' : 'border-slate-100'
        } hover:shadow-md relative`}
      >
        {isSelectionMode && (
          <div className="absolute top-2 left-2 z-10">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
              isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-transparent'
            }`}>
              <i className="fa-solid fa-check text-[10px]"></i>
            </div>
          </div>
        )}
        <div 
          onClick={handleImgClick}
          className="w-12 h-12 rounded-xl overflow-hidden bg-slate-50 flex-shrink-0"
        >
          {medicine.photoUrl ? (
            <img src={medicine.photoUrl} alt={medicine.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <i className="fa-solid fa-pills text-xl"></i>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-800 text-sm truncate">{medicine.name}</h3>
          <p className="text-slate-400 text-[10px] truncate">{medicine.brand || '未知品牌'}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <span className={`text-[10px] font-black ${getExpiryColor()}`}>
            {getExpiryLabel()}
          </span>
          <div className="text-[9px] text-slate-400 font-bold uppercase">库存: {medicine.stock}{medicine.unit}</div>
        </div>
      </div>
    );
  }

  if (viewMode === 'detailed') {
    return (
      <div 
        {...commonProps}
        className={`bg-white rounded-3xl p-4 shadow-sm border transition-all cursor-pointer flex gap-5 relative ${
          isSelected ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-md bg-indigo-50' : 'border-slate-100'
        } hover:shadow-md`}
      >
        {isSelectionMode && (
          <div className="absolute top-2 left-2 z-10">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-transparent'
            }`}>
              <i className="fa-solid fa-check text-[10px]"></i>
            </div>
          </div>
        )}
        <div 
          onClick={handleImgClick}
          className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-50 flex-shrink-0 relative"
        >
          {medicine.photoUrl ? (
            <img src={medicine.photoUrl} alt={medicine.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <i className="fa-solid fa-pills text-3xl"></i>
            </div>
          )}
          {!isSelectionMode && (
            <button 
              onClick={handleManualClick}
              className="absolute bottom-1 right-1 w-7 h-7 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-slate-100 flex items-center justify-center text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all active:scale-90"
            >
              <i className="fa-solid fa-book-open text-[10px]"></i>
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col justify-between py-1">
          <div>
            <div className="flex justify-between items-start">
              <h3 className="font-bold text-slate-800 text-base leading-tight">{medicine.name}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm text-white ${
                medicine.expiryDate === 'permanent' ? 'bg-emerald-500' :
                medicine.expiryDate === 'uncertain' ? 'bg-slate-500' :
                isExpired ? 'bg-red-500' : expiringSoon ? 'bg-amber-500' : 'bg-emerald-500'
              }`}>
                {medicine.expiryDate === 'permanent' ? '永久有效' : 
                 medicine.expiryDate === 'uncertain' ? '日期不详' :
                 isExpired ? '已过期' : expiringSoon ? '即将过期' : '保质期内'}
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-1">{medicine.brand || '未知品牌'} · {medicine.category}</p>
            <p className="text-slate-400 text-[10px] mt-2 line-clamp-2 italic">{medicine.usage || '无服用说明'}</p>
          </div>
          <div className="flex justify-between items-end mt-2">
            <div className="flex flex-col">
              <span className="text-[9px] uppercase text-slate-400 font-black tracking-wider">有效期</span>
              <span className={`text-xs font-black ${getExpiryColor()}`}>{getExpiryLabel()}</span>
            </div>
            <div className="bg-indigo-50 px-3 py-1 rounded-full text-indigo-600 text-xs font-black">
              库存 {medicine.stock}{medicine.unit}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default Grid Mode
  return (
    <div 
      {...commonProps}
      className={`bg-white rounded-2xl p-4 shadow-sm border transition-all cursor-pointer flex flex-col gap-3 group relative ${
        isSelected ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-md bg-indigo-50' : 'border-slate-100'
      } ${isSelectionMode ? 'scale-[0.98]' : 'hover:shadow-md'}`}
    >
      {isSelectionMode && (
        <div className="absolute top-2 left-2 z-10">
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-transparent'
          }`}>
            <i className="fa-solid fa-check text-[10px]"></i>
          </div>
        </div>
      )}

      {!isSelectionMode && (
        <button 
          onClick={handleManualClick}
          className="absolute top-2 left-2 z-10 w-8 h-8 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-slate-100 flex items-center justify-center text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all active:scale-90"
          title="查看说明书"
        >
          <i className="fa-solid fa-book-open text-[10px]"></i>
        </button>
      )}

      <div 
        onClick={handleImgClick}
        className="relative h-40 w-full rounded-xl overflow-hidden bg-slate-50"
      >
        {medicine.photoUrl ? (
          <img src={medicine.photoUrl} alt={medicine.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <i className="fa-solid fa-pills text-4xl"></i>
          </div>
        )}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          {medicine.expiryDate === 'permanent' ? (
            <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">永久有效</span>
          ) : medicine.expiryDate === 'uncertain' ? (
            <span className="bg-slate-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">日期不详</span>
          ) : isExpired ? (
            <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">已过期</span>
          ) : expiringSoon ? (
            <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">即将过期</span>
          ) : (
            <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">保质期内</span>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-bold text-slate-800 text-base truncate leading-tight">{medicine.name}</h3>
        <p className="text-slate-400 text-[10px] mt-0.5 truncate">{medicine.brand || '未知品牌'}</p>
      </div>

      <div className="flex justify-between items-center mt-auto">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase text-slate-400 font-bold">有效期</span>
          <span className={`text-[11px] font-medium ${getExpiryColor()}`}>
            {getExpiryLabel()}
          </span>
        </div>
        <div className="bg-indigo-50 px-2 py-1 rounded text-indigo-600 text-[10px] font-black">
          {medicine.stock}{medicine.unit}
        </div>
      </div>
    </div>
  );
};

export default MedicineCard;
