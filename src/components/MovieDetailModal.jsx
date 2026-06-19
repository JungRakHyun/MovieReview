import React, { useState, useEffect, useRef } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronLeft, Share2, X, Star, ThumbsUp, Flag, MessageSquare } from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { formatDate } from '../utils';
import ReportModal from './ReportModal';

export default function MovieDetailModal({ movie, user, onClose, showToast }) {
  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState(5);
  const [isKeyboardActive, setIsKeyboardActive] = useState(false);
  const [reportModalReview, setReportModalReview] = useState(null);

  // 별점 계산 로직 (0.5점 단위)
  const handleRatingClick = (e, star) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isHalf = e.clientX - rect.left < rect.width / 2;
    setRating(isHalf ? star - 0.5 : star);
  };

  // 리뷰 통계 데이터 생성 (긍정/보통/부정)
  const reviews = movie.reviews || [];
  const chartData = [
    { name: '긍정', value: reviews.filter(r => r.rating >= 4).length || 1, color: '#3B82F6' },
    { name: '보통', value: reviews.filter(r => r.rating >= 3 && r.rating < 4).length || 0, color: '#10B981' },
    { name: '부정', value: reviews.filter(r => r.rating < 3).length || 0, color: '#EF4444' }
  ];

  const submitReview = async () => {
    if (!user) return showToast("리뷰를 작성하려면 먼저 로그인해주세요.", "error");
    if (!reviewText.trim()) return showToast("리뷰 내용을 입력해주세요.", "error");
    try {
      const newReview = { rating, comment: reviewText, timestamp: new Date().toISOString(), userName: user.displayName || "익명", uid: user.uid, likes: 0, likedUsers: [] };
      await updateDoc(doc(db, "movies", movie.id), { reviews: arrayUnion(newReview) });
      setReviewText(""); showToast("소중한 리뷰가 등록되었습니다.");
    } catch (e) { showToast("리뷰 등록 실패", "error"); }
  };

  const handleLikeReview = async (rev) => {
    if (!user) return showToast("로그인이 필요합니다.", "error");
    const likedUsers = rev.likedUsers || [];
    const isLiked = likedUsers.includes(user.uid);
    try {
      const updatedReviews = movie.reviews.map(r => {
        if (r.uid === rev.uid && r.timestamp === rev.timestamp) {
          return isLiked 
            ? { ...r, likes: Math.max(0, (r.likes || 1) - 1), likedUsers: likedUsers.filter(id => id !== user.uid) }
            : { ...r, likes: (r.likes || 0) + 1, likedUsers: [...likedUsers, user.uid] };
        }
        return r;
      });
      await updateDoc(doc(db, "movies", movie.id), { reviews: updatedReviews });
    } catch (e) { showToast("오류가 발생했습니다.", "error"); }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm">
        <div className={`w-full max-w-md bg-white rounded-t-3xl shadow-2xl flex flex-col transition-all ${isKeyboardActive ? 'h-[95dvh]' : 'h-[90dvh]'}`}>
          <div className="p-4 border-b flex justify-between items-center bg-white rounded-t-3xl">
            <h2 className="text-base font-bold text-slate-900">영화 상세 정보</h2>
            <button onClick={onClose} className="p-1.5 bg-slate-50 rounded-full"><X size={20} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-4">
            <div className="bg-slate-50 p-4 rounded-xl mt-3 mb-4 border flex gap-4">
              <img src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`} className="w-20 h-28 rounded-lg shadow-sm" />
              <div>
                <p className="text-lg font-extrabold text-slate-800">{movie.title}</p>
                <p className="text-xs text-slate-500 mt-1">{movie.release_date}</p>
              </div>
            </div>

            <h3 className="text-[13px] font-bold text-slate-700 mb-2">실관람객 평점 분포</h3>
            <div className="h-32 w-full mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} innerRadius={30} outerRadius={50} dataKey="value">
                    {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <h3 className="text-[13px] font-bold text-slate-700 mb-3">관람평 ({reviews.length}건)</h3>
            <div className="space-y-3">
              {[...reviews].reverse().map((rev, idx) => (
                <div key={idx} className="bg-white border p-3 rounded-xl shadow-sm">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1">{[1,2,3,4,5].map(s => <Star key={s} size={10} className={s <= rev.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"} />)}</div>
                    <span className="text-[9px] text-slate-400">{formatDate(rev.timestamp)}</span>
                  </div>
                  <p className="text-[13px] text-slate-700">{rev.comment}</p>
                  <button onClick={() => handleLikeReview(rev)} className="flex items-center gap-1 text-[10px] text-slate-400 mt-2">
                    <ThumbsUp size={12} /> 공감 {rev.likes || 0}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-t bg-white">
            <div className="flex items-center gap-1 mb-2 px-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <div key={star} className="cursor-pointer" onClick={(e) => handleRatingClick(e, star)}>
                  <Star size={24} className={star <= rating || star - 0.5 === rating ? "fill-amber-400 text-amber-400" : "text-slate-200"} />
                </div>
              ))}
              <span className="ml-2 font-bold text-amber-500">{rating}</span>
            </div>
            <div className="relative">
              <textarea className="w-full p-3 border rounded-xl text-[13px] bg-slate-50" rows="2" placeholder="리뷰를 남겨주세요." value={reviewText} onChange={(e) => setReviewText(e.target.value)} onFocus={() => setIsKeyboardActive(true)} onBlur={() => setIsKeyboardActive(false)} />
              <button onClick={submitReview} className="absolute right-2 bottom-2 bg-blue-600 text-white p-2 rounded-xl"><MessageSquare size={16} /></button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}