import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronLeft, Share2, X, Bot, Star, ThumbsUp, Flag, MessageSquare, Heart, Edit2, Trash2, CornerDownRight, Send, Film } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { formatDate, getUserBadge } from '../utils';
import ReportModal from './ReportModal';

export default function MovieDetailModal({ movie, user, onClose, showToast }) {
  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState(5);
  const [isKeyboardActive, setIsKeyboardActive] = useState(false);
  const [reportModalReview, setReportModalReview] = useState(null);

  // 리뷰/답글 수정 및 작성용 상태 관리
  const [editingReview, setEditingReview] = useState(null); 
  const [replyingTo, setReplyingTo] = useState(null); 
  const [replyText, setReplyText] = useState("");
  const [editingReply, setEditingReply] = useState(null); 

  const isUserActiveOnOtherInput = replyingTo !== null || editingReview !== null || editingReply !== null;

  // 영화 별점 통계 가공 (긍정:4~5, 보통:3, 부정:1~2)
  const reviews = movie.reviews || [];
  const posCount = reviews.filter(r => r.rating >= 4).length;
  const neuCount = reviews.filter(r => r.rating >= 3 && r.rating < 4).length;
  const negCount = reviews.filter(r => r.rating < 3).length;

  const chartData = [
    { name: '긍정 평가', value: posCount === 0 && neuCount === 0 && negCount === 0 ? 1 : posCount, color: '#3B82F6' },
    { name: '보통', value: neuCount, color: '#10B981' },
    { name: '부정 평가', value: negCount, color: '#EF4444' }
  ];

  const bookmarkedUsers = movie?.bookmarkedUsers || [];
  const isBookmarked = bookmarkedUsers.includes(user?.uid);

  // 💡 공유하기 로직 (딥링크 적용)
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?movieId=${movie.id}`;
    const shareData = { 
      title: `${movie.title} - MOVIE LOUNGE`, 
      text: `${movie.title} 영화의 실관람객 별점과 리뷰를 확인해보세요!`, 
      url: shareUrl 
    };

    if (navigator.share) { 
      try { await navigator.share(shareData); } catch (e) {} 
    } else { 
      navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`); 
      showToast("클립보드에 영화 전용 링크가 복사되었습니다!"); 
    }
  };

  const toggleBookmark = async () => {
    if (!user) return showToast("로그인이 필요합니다.", "error");
    try {
      const newBookmarks = isBookmarked ? bookmarkedUsers.filter(id => id !== user.uid) : [...bookmarkedUsers, user.uid];
      await setDoc(doc(db, "movies", movie.id), { title: movie.title, release_date: movie.release_date || '', poster_path: movie.poster_path || '', bookmarkedUsers: newBookmarks }, { merge: true });
      showToast(isBookmarked ? "인생 영화에서 해제되었습니다." : "인생 영화로 등록되었습니다!");
    } catch (e) { showToast("처리 실패", "error"); }
  };

  // 💡 AI 자동 분석 (제미나이 연동)
  const updateAISummaryIfNeeded = async (currentReviews) => {
    const validReviews = currentReviews.filter(r => r && r.comment);
    if (validReviews.length >= 2) {
      const ACTUAL_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY; 
      if (!ACTUAL_GEMINI_API_KEY) return;
      const prompt = `다음은 영화 '${movie.title}'에 대한 관람객들의 리뷰입니다. 이 리뷰들의 공통적인 내용과 반응을 3줄로 객관적으로 요약해주세요:\n\n${validReviews.map(r => r.comment).join("\n")}`;
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${ACTUAL_GEMINI_API_KEY}`, { 
          method: "POST", headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) 
        });
        const data = await res.json();
        if (res.ok && data.candidates?.length > 0) {
          await updateDoc(doc(db, "movies", movie.id), { ai_summary: data.candidates[0].content.parts[0].text });
        }
      } catch (error) { console.error("AI 요약 실패", error); }
    }
  };

  const submitReview = async () => {
    if (!user) return showToast("리뷰를 작성하려면 먼저 로그인해주세요.", "error");
    if (!reviewText.trim()) return showToast("리뷰 내용을 입력해주세요.", "error");
    try {
      const newReview = { rating, comment: reviewText, timestamp: new Date().toISOString(), userName: user.displayName || "익명", uid: user.uid, likes: 0, likedUsers: [], replies: [] };
      const updatedReviews = [...(movie.reviews || []), newReview];
      await setDoc(doc(db, "movies", movie.id), { title: movie.title, release_date: movie.release_date || '', poster_path: movie.poster_path || '', reviews: arrayUnion(newReview) }, { merge: true });
      setReviewText(""); setRating(5); setIsKeyboardActive(false); showToast("소중한 리뷰가 등록되었습니다.");
      await updateAISummaryIfNeeded(updatedReviews);
    } catch (e) { showToast("리뷰 등록 실패", "error"); }
  };

  const submitEditReview = async (rev) => {
    if (!editingReview?.text?.trim()) return showToast("내용을 입력해주세요.", "error");
    try {
      const updatedReviews = (movie.reviews || []).map(r => {
        if (!r) return r;
        if (r.uid === rev.uid && r.timestamp === rev.timestamp) return { ...r, comment: editingReview.text, rating: editingReview.rating, isEdited: true };
        return r;
      });
      await updateDoc(doc(db, "movies", movie.id), { reviews: updatedReviews });
      setEditingReview(null); setIsKeyboardActive(false); showToast("리뷰가 수정되었습니다.");
      await updateAISummaryIfNeeded(updatedReviews);
    } catch (e) { showToast("수정 실패", "error"); }
  };

  const handleDeleteReview = async (rev) => {
    if (!window.confirm("정말 이 리뷰를 삭제하시겠습니까?")) return;
    try {
      const updatedReviews = (movie.reviews || []).filter(r => r && (r.timestamp !== rev.timestamp || r.uid !== rev.uid));
      await updateDoc(doc(db, "movies", movie.id), { reviews: updatedReviews });
      showToast("리뷰가 삭제되었습니다.");
      await updateAISummaryIfNeeded(updatedReviews);
    } catch (e) { showToast("삭제 실패", "error"); }
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

  const submitReply = async (targetRev) => {
    if (!replyText.trim()) return showToast("답글 내용을 입력해주세요.", "error");
    try {
      const newReply = { uid: user.uid, userName: user.displayName || "익명", text: replyText, timestamp: new Date().toISOString() };
      const updatedReviews = (movie.reviews || []).map(r => {
        if (r.timestamp === targetRev.timestamp && r.uid === targetRev.uid) return { ...r, replies: [...(r.replies || []), newReply] };
        return r;
      });
      await updateDoc(doc(db, "movies", movie.id), { reviews: updatedReviews });
      setReplyingTo(null); setReplyText(""); setIsKeyboardActive(false); showToast("답글이 등록되었습니다.");
    } catch (e) {}
  };

  const handleDeleteReply = async (rev, replyToDel) => {
    if (!window.confirm("정말 이 답글을 삭제하시겠습니까?")) return;
    try {
      const updatedReviews = (movie.reviews || []).map(r => {
        if (r.timestamp === rev.timestamp && r.uid === rev.uid) return { ...r, replies: (r.replies || []).filter(reply => reply && reply.timestamp !== replyToDel.timestamp) };
        return r;
      });
      await updateDoc(doc(db, "movies", movie.id), { reviews: updatedReviews });
      showToast("답글이 삭제되었습니다.");
    } catch (e) {}
  };

  const submitEditReply = async (rev, replyToEdit) => {
    if (!editingReply?.text?.trim()) return showToast("내용을 입력해주세요.", "error");
    try {
      const updatedReviews = (movie.reviews || []).map(r => {
        if (r.timestamp === rev.timestamp && r.uid === rev.uid) {
          const updatedReplies = (r.replies || []).map(reply => {
            if (reply.timestamp === replyToEdit.timestamp) return { ...reply, text: editingReply.text, isEdited: true };
            return reply;
          });
          return { ...r, replies: updatedReplies };
        }
        return r;
      });
      await updateDoc(doc(db, "movies", movie.id), { reviews: updatedReviews });
      setEditingReply(null); setIsKeyboardActive(false); showToast("답글이 수정되었습니다.");
    } catch (e) {}
  };

  const handleCancelSubInputs = () => {
    setReplyingTo(null); setEditingReview(null); setEditingReply(null); setReplyText(""); setIsKeyboardActive(false);
  };

  const renderReadOnlyStars = (ratingValue, size = 10) => {
    return (
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFull = star <= ratingValue;
          const isHalf = star - 0.5 === ratingValue;
          return (
            <div key={star} className="relative">
              <Star size={size} className="text-slate-200 fill-slate-50" />
              {(isFull || isHalf) && (
                <div className="absolute top-0 left-0 overflow-hidden pointer-events-none" style={{ width: isHalf ? '50%' : '100%' }}>
                  <Star size={size} className="fill-amber-400 text-amber-400" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300">
        <div className={`w-full max-w-md bg-white rounded-t-3xl shadow-2xl flex flex-col transition-all duration-300 ease-in-out ${isKeyboardActive ? 'h-[95dvh] rounded-none' : 'h-[90dvh]'}`}>
          <div className="p-4 pb-3 border-b border-slate-100 shrink-0 flex justify-between items-center bg-white rounded-t-3xl">
            <h2 className="text-base font-bold text-slate-900 ml-1">영화 상세 정보</h2>
            <div className="flex items-center gap-2">
              <button onClick={toggleBookmark} className={`p-1.5 rounded-full transition-colors ${isBookmarked ? 'bg-pink-50 text-pink-500' : 'bg-slate-50 hover:bg-pink-50 hover:text-pink-500 text-slate-500'}`}>
                <Heart size={18} className={isBookmarked ? 'fill-pink-500' : ''} />
              </button>
              <button onClick={handleShare} className="p-1.5 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-full text-slate-500 transition-colors"><Share2 size={18} /></button>
              <button onClick={onClose} className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"><X size={20} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 custom-scrollbar pb-4 animate-fade-in">
            <div className="bg-slate-50 p-4 rounded-xl mt-3 mb-4 border border-slate-100 flex gap-4">
              {movie.poster_path ? (
                <img src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`} alt={movie.title} className="w-24 h-36 object-cover rounded-lg shadow-md shrink-0" />
              ) : (
                <div className="w-24 h-36 bg-slate-200 rounded-lg flex items-center justify-center shrink-0"><Film className="text-slate-400" size={32}/></div>
              )}
              <div className="flex-1 overflow-hidden">
                <p className="text-[11px] font-semibold text-slate-500 mb-1">개봉일: {movie.release_date || '미정'}</p>
                <p className="text-lg font-extrabold text-slate-800 leading-tight mb-2">{movie.title}</p>
                <p className="text-xs text-slate-600 line-clamp-4 leading-snug">{movie.overview || '등록된 줄거리가 없습니다.'}</p>
              </div>
            </div>

            {movie.ai_summary && (
              <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl mb-4">
                <p className="text-[12px] font-bold text-indigo-800 flex items-center gap-1 mb-2"><Bot size={14}/> 리뷰 기반 AI 요약</p>
                <p className="text-[13px] text-indigo-900 leading-relaxed whitespace-pre-wrap">{movie.ai_summary}</p>
              </div>
            )}

            <h3 className="text-[13px] font-bold text-slate-700 mb-2 px-1 mt-6">실관람객 평점 분포</h3>
            <div className="h-32 w-full mb-3" style={{ minHeight: '128px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value" stroke="none">
                    {chartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} itemStyle={{ fontWeight: 'bold', fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mb-2">
              <h3 className="text-[13px] font-bold text-slate-700 mb-3 px-1 flex justify-between items-center">
                관람평 <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{reviews.length}건</span>
              </h3>
              {reviews.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-4 bg-slate-50 rounded-xl border border-slate-100">첫 번째 리뷰를 남겨주세요!</p>
              ) : (
                <div className="space-y-4">
                  {[...reviews].reverse().map((rev, idx) => {
                    const authorBadge = { icon: '', text: '관람객', color: 'bg-slate-100 text-slate-500' }; // 뱃지 기능 유지 시 getUserBadge 활용 가능
                    const isReviewLiked = rev.likedUsers?.includes(user?.uid);
                    const isMyReview = user?.uid === rev.uid;
                    const isEditing = editingReview?.timestamp === rev.timestamp;
                    const isReplying = replyingTo === rev.timestamp;

                    return (
                      <div key={idx} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-2">
                            {renderReadOnlyStars(rev.rating || 5, 10)}
                            <span className="text-[10px] font-bold text-slate-700">{rev.userName?.split(' ')[0] || "익명"}</span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded-sm ${authorBadge.color}`}>{authorBadge.icon} {authorBadge.text}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-slate-400 font-medium">{formatDate(rev.timestamp)} {rev.isEdited && '(수정됨)'}</span>
                            {isMyReview && !isEditing && (
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => setEditingReview({ timestamp: rev.timestamp, text: rev.comment || '', rating: rev.rating || 5 })} className="text-slate-400 hover:text-blue-500"><Edit2 size={12} /></button>
                                <button onClick={() => handleDeleteReview(rev)} className="text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                              </div>
                            )}
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="mt-2 mb-2 relative bg-blue-50/30 p-2 rounded-lg border border-blue-200">
                            <div className="flex items-center gap-1 mb-2 pl-1">
                              <span className="text-[10px] font-bold text-slate-500 mr-1">별점 수정:</span>
                              <div className="flex items-center">
                                {[1, 2, 3, 4, 5].map((star) => {
                                  const isFull = star <= editingReview.rating;
                                  const isHalf = star - 0.5 === editingReview.rating;
                                  return (
                                    <div key={star} className="p-1 cursor-pointer" onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setEditingReview({ ...editingReview, rating: e.clientX - rect.left < rect.width / 2 ? star - 0.5 : star });
                                      }}>
                                      <div className="relative">
                                        <Star size={14} className="text-slate-200 fill-slate-50" />
                                        {(isFull || isHalf) && (
                                          <div className="absolute top-0 left-0 overflow-hidden pointer-events-none" style={{ width: isHalf ? '50%' : '100%' }}><Star size={14} className="fill-amber-400 text-amber-400" /></div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <span className="text-[10px] font-bold text-amber-500 ml-1">{editingReview.rating}</span>
                            </div>
                            <textarea className="w-full p-2 border border-slate-200 rounded-lg text-[12px] bg-white outline-none resize-none" rows="2" value={editingReview?.text || ''} onChange={(e) => setEditingReview({ ...editingReview, text: e.target.value })} onFocus={() => setIsKeyboardActive(true)} onBlur={() => setIsKeyboardActive(false)} />
                            <div className="flex justify-end gap-2 mt-2">
                              <button onClick={() => setEditingReview(null)} className="text-[10px] text-slate-500 px-2 py-1 bg-white border border-slate-200 rounded-md font-bold">취소</button>
                              <button onClick={() => submitEditReview(rev)} className="text-[10px] text-white px-2 py-1 bg-blue-600 rounded-md font-bold">수정 완료</button>
                            </div>
                          </div>
                        ) : (<p className="text-[13px] text-slate-700 mb-3 leading-snug">{rev.comment}</p>)}
                        
                        <div className="flex gap-3 justify-end border-t border-slate-50 pt-2 mt-1">
                          <button onClick={() => handleLikeReview(rev)} className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${isReviewLiked ? 'text-blue-600' : 'text-slate-400 hover:text-blue-500'}`}>
                            <ThumbsUp size={12} className={isReviewLiked ? 'fill-blue-600' : ''} /> 공감 {rev.likes > 0 ? rev.likes : ''}
                          </button>
                          <button onClick={() => { if(!user) return showToast("로그인이 필요합니다.", "error"); setReplyingTo(isReplying ? null : rev.timestamp); }} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-indigo-500 transition-colors">
                            <MessageSquare size={12} /> 답글
                          </button>
                          {!isMyReview && (
                            <button onClick={() => { if(!user) return showToast("로그인이 필요합니다.", "error"); setReportModalReview(rev); }} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors">
                              <Flag size={12} /> 신고
                            </button>
                          )}
                        </div>

                        {isReplying && (
                          <div className="mt-3 pl-2 border-l-2 border-indigo-200 relative flex items-start gap-2">
                            <CornerDownRight size={14} className="text-indigo-300 mt-1.5 shrink-0" />
                            <textarea className="flex-1 p-2 border border-slate-200 rounded-lg text-[11px] bg-slate-50 outline-none resize-none" rows="1" placeholder="답글을 남겨주세요." value={replyText} onChange={(e) => setReplyText(e.target.value)} onFocus={() => setIsKeyboardActive(true)} onBlur={() => setIsKeyboardActive(false)} />
                            <button onClick={() => submitReply(rev)} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shrink-0"><Send size={12}/></button>
                          </div>
                        )}

                        {rev.replies && rev.replies.length > 0 && (
                          <div className="mt-3 pl-2 border-l-2 border-slate-200 space-y-2">
                            {rev.replies.filter(Boolean).map((reply, rIdx) => { 
                              const isMyReply = user?.uid === reply?.uid;
                              const isEditingReply = editingReply?.reviewTimestamp === rev.timestamp && editingReply?.replyTimestamp === reply?.timestamp;

                              return (
                                <div key={rIdx} className="bg-slate-50 p-2 rounded-lg ml-2 relative">
                                  <div className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-bold text-slate-700">{reply?.userName || "익명"}</span>
                                      <span className="text-[8px] text-slate-400">{formatDate(reply?.timestamp)} {reply?.isEdited && '(수정됨)'}</span>
                                    </div>
                                    {isMyReply && !isEditingReply && (
                                      <div className="flex items-center gap-1.5">
                                        <button onClick={() => setEditingReply({ reviewTimestamp: rev.timestamp, replyTimestamp: reply.timestamp, text: reply.text })} className="text-slate-400 hover:text-indigo-500"><Edit2 size={10} /></button>
                                        <button onClick={() => handleDeleteReply(rev, reply)} className="text-slate-400 hover:text-red-500"><Trash2 size={10} /></button>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {isEditingReply ? (
                                    <div className="mt-1 relative">
                                      <textarea className="w-full p-2 border border-indigo-300 rounded-md text-[11px] bg-indigo-50/30 outline-none resize-none" rows="1" value={editingReply?.text || ''} onChange={(e) => setEditingReply({ ...editingReply, text: e.target.value })} onFocus={() => setIsKeyboardActive(true)} onBlur={() => setIsKeyboardActive(false)} />
                                      <div className="flex justify-end gap-1 mt-1">
                                        <button onClick={() => setEditingReply(null)} className="text-[9px] text-slate-500 px-1.5 py-0.5 bg-slate-200 rounded font-bold">취소</button>
                                        <button onClick={() => submitEditReply(rev, reply)} className="text-[9px] text-white px-1.5 py-0.5 bg-indigo-600 rounded font-bold">수정</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-slate-600 leading-snug">{reply?.text}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="p-4 pt-3 bg-white border-t border-slate-100 shrink-0 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
            {isUserActiveOnOtherInput ? (
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200/80 animate-fade-in">
                <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                  {replyingTo && "💬 리뷰에 답글을 작성하고 있습니다."}
                  {editingReview && "✍️ 내가 쓴 리뷰를 수정하고 있습니다."}
                  {editingReply && "✍️ 내가 쓴 답글을 수정하고 있습니다."}
                </p>
                <button onClick={handleCancelSubInputs} className="text-[11px] font-extrabold bg-slate-200 text-slate-600 px-2.5 py-1.5 rounded-lg hover:bg-slate-300 transition-colors whitespace-nowrap">작성 취소</button>
              </div>
            ) : !user ? (
              <div className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-[13px] font-bold text-slate-600 mb-2">리뷰를 작성하려면 로그인이 필요합니다.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1 mb-2 px-1">
                  <span className="text-[11px] font-bold text-slate-500 mr-2">별점:</span>
                  <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isFull = star <= rating;
                      const isHalf = star - 0.5 === rating;
                      return (
                        <div key={star} className="p-1 cursor-pointer transition-transform hover:scale-110 active:scale-95" onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setRating(e.clientX - rect.left < rect.width / 2 ? star - 0.5 : star);
                          }}>
                          <div className="relative">
                            <Star size={20} className="text-slate-200 fill-slate-50 drop-shadow-sm" />
                            {(isFull || isHalf) && (
                              <div className="absolute top-0 left-0 overflow-hidden pointer-events-none" style={{ width: isHalf ? '50%' : '100%' }}>
                                <Star size={20} className="fill-amber-400 text-amber-400 drop-shadow-sm" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <span className="text-xs font-bold text-amber-500 ml-1">{rating}</span>
                </div>
                <div className="relative">
                  <textarea
                    className="w-full p-3 pr-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none text-[13px] bg-slate-50 transition-all"
                    rows="2" placeholder="이 영화에 대한 경험을 나누어주세요." value={reviewText} onChange={(e) => setReviewText(e.target.value)}
                    onFocus={() => setIsKeyboardActive(true)} onBlur={() => setIsKeyboardActive(false)}
                  />
                  <button onClick={submitReview} className={`absolute right-2 bottom-2 p-2 rounded-xl transition-all ${reviewText.trim() ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                    <MessageSquare size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      
      {reportModalReview && <ReportModal review={reportModalReview} judgeId={movie.id} user={user} onClose={() => setReportModalReview(null)} showToast={showToast} />}
    </>
  );
}