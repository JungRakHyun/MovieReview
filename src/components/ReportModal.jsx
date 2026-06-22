import { useState } from 'react';
import { AlertTriangle, Flag, X } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

const reportCategories = ['욕설/비방', '광고/홍보', '허위 사실 유포', '스포일러 미표시', '기타'];

export default function ReportModal({ review, movieId, user, onClose, showToast }) {
  const [reportForm, setReportForm] = useState({
    category: reportCategories[0],
    reason: '',
  });

  const submitReport = async () => {
    if (!user) return showToast('로그인이 필요합니다.', 'error');
    if (!reportForm.reason.trim()) return showToast('신고 사유를 간단히 적어주세요.', 'error');

    try {
      await addDoc(collection(db, 'reports'), {
        userId: user.uid,
        movieId,
        reviewTimestamp: review.timestamp,
        reviewComment: review.comment,
        category: reportForm.category,
        reason: reportForm.reason.trim(),
        reportedAt: new Date().toISOString(),
        status: '접수됨',
      });
      showToast('신고가 접수되었습니다.');
      onClose();
    } catch {
      showToast('신고 접수 중 오류가 발생했습니다.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-red-50 text-red-500">
              <Flag size={17} />
            </span>
            리뷰 신고하기
          </h3>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={19} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase text-slate-400">
              <AlertTriangle size={12} />
              신고 대상 리뷰
            </p>
            <p className="line-clamp-3 text-xs leading-relaxed text-slate-600">"{review.comment}"</p>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-extrabold text-slate-600">신고 유형</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-bold text-slate-700 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              value={reportForm.category}
              onChange={(event) => setReportForm({ ...reportForm, category: event.target.value })}
            >
              {reportCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-extrabold text-slate-600">신고 사유</label>
            <textarea
              className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-[13px] leading-relaxed text-slate-700 outline-none placeholder:text-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-100"
              placeholder="신고가 필요한 이유를 적어주세요."
              value={reportForm.reason}
              onChange={(event) => setReportForm({ ...reportForm, reason: event.target.value })}
            />
          </div>

          <button
            type="button"
            onClick={submitReport}
            className="w-full rounded-xl bg-red-500 py-3 text-[13px] font-extrabold text-white shadow-sm transition-colors hover:bg-red-600"
          >
            신고 접수하기
          </button>
        </div>
      </div>
    </div>
  );
}
