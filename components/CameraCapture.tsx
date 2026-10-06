
import React, { useRef, useState, useCallback, useEffect } from 'react';

interface Props {
  onCapture: (base64: string) => void;
  onClose: () => void;
}

const CameraCapture: React.FC<Props> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<{title: string, detail: string} | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // 检查是否有多个摄像头
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setHasMultipleCameras(videoDevices.length > 1);
    }).catch(() => {});
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    
    // 1. 检查安全上下文 (HTTPS)
    if (!window.isSecureContext) {
      setError({
        title: "安全连接受限",
        detail: "摄像头功能仅支持 HTTPS 安全协议。请检查当前访问地址是否以 https:// 开头。"
      });
      return;
    }

    // 2. 检查 API 支持
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError({
        title: "浏览器不支持",
        detail: "您的浏览器版本过低或当前环境不支持访问摄像头，建议使用 Chrome 或 Safari 浏览器。"
      });
      return;
    }

    try {
      stopCamera();
      
      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode: facingMode,
          // 移除过于严格的 width/height，改为 ideal 以提高兼容性
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        console.warn("精准约束请求失败，尝试基础请求...");
        // 彻底降级，只要视频
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // 重要：iOS 必须在 playsInline 的基础上处理可能存在的 play() 延迟
        try {
          await videoRef.current.play();
          setIsActive(true);
        } catch (playErr) {
          console.error("视频播放失败:", playErr);
          // 某些浏览器可能需要用户交互后才能 play，这里尝试再次触发
          setIsActive(true); 
        }
      }
    } catch (err: any) {
      console.error("无法访问摄像头:", err);
      let title = "无法启动摄像头";
      let detail = "发生未知错误，请刷新重试。";

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        title = "权限被拒绝";
        detail = "请在浏览器地址栏点击锁形图标，允许“摄像头”访问权限后重新点击重试。";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        title = "未找到摄像头";
        detail = "系统未检测到可用的摄像头设备。";
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        title = "摄像头被占用";
        detail = "其他应用可能正在使用摄像头，请关闭其他应用后重试。";
      }

      setError({ title, detail });
    }
  }, [facingMode, stopCamera]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const capturePhoto = () => {
    if (videoRef.current && isActive) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const data = canvas.toDataURL('image/jpeg', 0.9);
        onCapture(data);
        stopCamera();
        onClose();
      }
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-20">
        <div className="flex flex-col gap-1">
          <h2 className="text-white font-black text-lg tracking-tight drop-shadow-md">药品拍摄识别</h2>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest">
              {isActive ? (facingMode === 'environment' ? '后置镜头' : '前置镜头') : '未就绪'}
            </span>
          </div>
        </div>
        
        <button 
          onClick={() => { stopCamera(); onClose(); }} 
          className="text-white bg-white/10 backdrop-blur-xl w-12 h-12 rounded-2xl flex items-center justify-center active:scale-90 transition-all border border-white/20 shadow-2xl"
        >
          <i className="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>
      
      {error ? (
        <div className="flex flex-col items-center gap-8 px-10 text-center animate-fadeIn max-w-sm">
          <div className="w-24 h-24 bg-red-500/10 text-red-500 rounded-[32px] flex items-center justify-center text-4xl border border-red-500/20">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div className="space-y-3">
            <p className="text-white font-black text-2xl">{error.title}</p>
            <p className="text-white/60 text-sm leading-relaxed">{error.detail}</p>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <button 
              onClick={startCamera}
              className="bg-indigo-600 text-white w-full py-4 rounded-2xl font-black shadow-xl shadow-indigo-900/40 active:scale-95 transition-all"
            >
              重试连接
            </button>
            <button 
              onClick={onClose}
              className="bg-white/10 text-white w-full py-4 rounded-2xl font-black border border-white/10 active:scale-95 transition-all"
            >
              返回
            </button>
          </div>
        </div>
      ) : (
        <>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted
            className="w-full h-full object-cover"
          />
          
          {/* 扫描区域遮罩 */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
             <div className="w-72 h-72 border border-white/20 rounded-[48px] relative overflow-hidden bg-black/5">
                {/* 四角指示器 */}
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-indigo-500 rounded-tl-3xl"></div>
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-indigo-500 rounded-tr-3xl"></div>
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-indigo-500 rounded-bl-3xl"></div>
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-indigo-500 rounded-br-3xl"></div>
                
                {/* 扫描动效 */}
                <div className="w-full h-1.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent absolute top-0 shadow-[0_0_15px_rgba(99,102,241,0.8)] animate-[scan_3s_ease-in-out_infinite]"></div>
             </div>
             
             <div className="absolute bottom-1/4 translate-y-16 flex flex-col items-center gap-2">
                <p className="text-white text-xs font-black uppercase tracking-[0.3em] drop-shadow-lg">
                   对准包装信息
                </p>
                <div className="px-3 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                   <p className="text-white/60 text-[9px] font-bold">自动对焦中...</p>
                </div>
             </div>
          </div>

          {/* 底部操作区 */}
          <div className="absolute bottom-12 left-0 right-0 flex items-center justify-around px-10">
            {/* 切换摄像头按钮 */}
            <div className="w-14 h-14 flex items-center justify-center">
              {hasMultipleCameras && (
                <button 
                  onClick={toggleCamera}
                  className="w-12 h-12 bg-white/10 backdrop-blur-md text-white rounded-full flex items-center justify-center border border-white/20 active:rotate-180 transition-transform duration-500"
                >
                  <i className="fa-solid fa-camera-rotate text-lg"></i>
                </button>
              )}
            </div>

            {/* 拍照快门 */}
            <button 
              onClick={capturePhoto}
              disabled={!isActive}
              className={`group relative w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                isActive ? 'scale-100 active:scale-90' : 'scale-90 opacity-50'
              }`}
            >
              <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse group-active:animate-none"></div>
              <div className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center">
                 <div className="w-16 h-16 bg-white rounded-full shadow-inner"></div>
              </div>
            </button>

            {/* 补位占位 */}
            <div className="w-14 h-14"></div>
          </div>
        </>
      )}

      <style>{`
        @keyframes scan {
          0%, 100% { top: 10%; opacity: 0.5; }
          50% { top: 90%; opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default CameraCapture;
