import React, { useState, useEffect, useRef } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronLeft, Share2, X, Bot, Star, ThumbsUp, Flag, MessageSquare, Heart, Edit2, Trash2, CornerDownRight, Send, Film, User, Play, ExternalLink } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { formatDate } from '../utils';
import ReportModal from './ReportModal';

export default function MovieDetailModal({ movie, user, onClose, showToast, onSimilarMovieClick }) {
  const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
  const chartRef = useRef(null);
  
  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState(5);
  const [isKeyboardActive, setIsKeyboardActive] = useState(false);
  const [reportModalReview, setReportModalReview] = useState(null);

  const [editingReview, setEditingReview] = useState(null); 
  const [replyingTo, setReplyingTo] = useState(null); 
  const [replyText, setReplyText] = useState("");
  const [editingReply, setEditingReply] = useState(null); 

  const [cast, setCast] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [personMovies, setPersonMovies] = useState([]);
  const [isPersonLoading, setIsPersonLoading] = useState(false);
  const [similarMovies, setSimilarMovies] = useState([]); 

  const [trailerKey, setTrailerKey] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);

  const [providers, setProviders] = useState([]);
  const [tmdbWatchLink, setTmdbWatchLink] = useState("");

  useEffect(() => {
    fetch(`https://api.themoviedb.org/3/movie/${movie.id}/credits?api_key=${TMDB_API_KEY}&language=ko-KR`)
      .then(res => res.json()).then(data => { if (data.cast) setCast(data.cast.slice(0, 10)); }).catch(e => console.error(e));

    fetch(`https://api.themoviedb.org/3/movie/${movie.id}/recommendations?api_key=${TMDB_API_KEY}&language=ko-KR&page=1`)
      .then(res => res.json()).then(data => { if (data.results) setSimilarMovies(data.results.slice(0, 10)); }).catch(e => console.error(e));

    fetch(`https://api.themoviedb.org/3/movie/${movie.id}/videos?api_key=${TMDB_API_KEY}&language=ko-KR`)
      .then(res => res.json())
      .then(data => {
        let trailer = data.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer');
        if (!trailer) {
          fetch(`https://api.themoviedb.org/3/movie/${movie.id}/videos?api_key=${TMDB_API_KEY}`)
            .then(res2 => res2.json())
            .then(data2 => {
              trailer = data2.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer');
              if (trailer) setTrailerKey(trailer.key);
            });
        } else {
          setTrailerKey(trailer.key);
        }
      }).catch(e => console.error(e));

    fetch(`https://api.themoviedb.org/3/movie/${movie.id}/watch/providers?api_key=${TMDB_API_KEY}`)
      .then(res => res.json())
      .then(data => {
        if (data.results && data.results.KR) {
          const kr = data.results.KR;
          setTmdbWatchLink(kr.link || ""); 
          
          const flat = (kr.flatrate || []).map(p => ({ ...p, type: '정액제' }));
          const rent = (kr.rent || []).map(p => ({ ...p, type: '대여/구매' }));
          setProviders([...flat, ...rent]);
        } else {
          setProviders([]);
          setTmdbWatchLink("");
        }
      }).catch(e => console.error(e));

  }, [movie.id, TMDB_API_KEY]);

  // 💡 OTT 플랫폼별 다이렉트 검색 링크 생성 우회 함수
  const getDirectOttLink = (providerName, movieTitle) => {
    const encodedTitle = encodeURIComponent(movieTitle);
    const name = providerName.toLowerCase();
    
    if (name.includes('netflix')) return `https://www.netflix.com/search?q=${encodedTitle}`;
    if (name.includes('wavve')) return `https://www.wavve.com/search/search?searchWord=${encodedTitle}`;
    if (name.includes('watcha')) return `https://watcha.com/search?query=${encodedTitle}`;
    if (name.includes('tving')) return `https://www.tving.com/search?keyword=${encodedTitle}`;
    if (name.includes('coupang')) return `https://www.coupangplay.com/search?q=${encodedTitle}`;
    if (name.includes('naver')) return `https://serieson.naver.com/v3/search?query=${encodedTitle}`;
    if (name.includes('disney')) return `https://www.disneyplus.com/ko-kr/search`; // 디즈니는 다이렉트 검색어가 안먹혀서 메인 검색창으로 
    
    // 매핑되지 않은 다른 OTT나 해외 플랫폼은 원래 TMDB/JustWatch 링크로 보냅니다.
    return tmdbWatchLink || "#"; 
  };

  const handlePersonClick = (person) => {
    setSelectedPerson(person);
    setIsPersonLoading(true);
    fetch(`https://api.themoviedb.org/3/person/${person.id}/movie_credits?api_key=${TMDB_API_KEY}&language=ko-KR`)
      .then(res => res.json())
      .then(data => {
        if (data.cast) {
          const sortedMovies = data.cast.sort((a, b) => b.popularity - a.popularity).slice(0, 20);
          setPersonMovies(sortedMovies);
        }
        setIsPersonLoading(false);
      }).catch(() => setIsPersonLoading(false));
  };

  const isUserActiveOnOtherInput = replyingTo !== null || editingReview !== null || editingReply !== null;

  const reviews = movie.reviews || [];
  const posCount = reviews.filter(r => r.rating >= 4).length;
  const neuCount = reviews.filter(r => r.rating >= 3 && r.rating < 4).length;
  const negCount = reviews.filter(r => r.rating < 3).length;

  const chartData = [
    { name: '긍정 평가', value: posCount === 0 && neuCount === 0 && negCount === 0 ? 1 : posCount, color: '#3B82F6' },
    { name: '보통', value: neuCount, color: '#10B981' },
    { name: '부정 평가', value: negCount, color: '#EF4444' }
  ];

  const avgUserRating = reviews.length > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : 0;

  const bookmarkedUsers = movie?.bookmarkedUsers || [];
  const isBookmarked = bookmarkedUsers.includes(user?.uid);

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?movieId=${movie.id}`;
    const shareData = { title: `${movie.title} - MovieReview`, text: `${movie.title} 영화의 실관람객 별점과 리뷰를 확인해보세요!`, url: shareUrl };
    if (navigator.share) { try { await navigator.share(shareData); } catch (e) {} } 
    else { navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`); showToast("클립보드에 링크가 복사되었습니다!"); }
  };

  const toggleBookmark = async () => {
    if (!user) return showToast("로그인이 필요합니다.", "error");
    try {
      const newBookmarks = isBookmarked ? bookmarkedUsers.filter(id => id !== user.uid) : [...bookmarkedUsers, user.uid];
      await setDoc(doc(db, "movies", movie.id), { title: movie.title, release_date: movie.release_date || '', poster_path: movie.poster_path || '', bookmarkedUsers: newBookmarks }, { merge: true });
      showToast(isBookmarked ? "인생 영화에서 해제되었습니다." : "인생 영화로 등록되었습니다!");
    } catch (e) { showToast("처리 실패", "error"); }
  };

  const submitReview = async () => {
    if (!user) return showToast("리뷰를 작성하려면 먼저 로그인해주세요.", "error");
    if (!reviewText.trim()) return showToast("리뷰 내용을 입력해주세요.", "error");
    try {
      const newReview = { rating, comment: reviewText, timestamp: new Date().toISOString(), userName: user.displayName || "익명", uid: user.uid, likes: 0, likedUsers: [], replies: [] };
      await setDoc(doc(db, "movies", movie.id), { title: movie.title, release_date: movie.release_date || '', poster_path: movie.poster_path || '', reviews: arrayUnion(newReview) }, { merge: true });
      setReviewText(""); setRating(5); setIsKeyboardActive(false); showToast("소중한 리뷰가 등록되었습니다.");
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
    } catch (e) { showToast("수정 실패", "error"); }
  };

  const handleDeleteReview = async (rev) => {
    if (!window.confirm("정말 이 리뷰를 삭제하시겠습니까?")) return;
    try {
      const updatedReviews = (movie.reviews || []).filter(r => r && (r.timestamp !== rev.timestamp || r.uid !== rev.uid));
      await updateDoc(doc(db, "movies", movie.id), { reviews: updatedReviews });
      showToast("리뷰가 삭제되었습니다.");
    } catch (e) { showToast("삭제 실패", "error"); }
  };

  const handleLikeReview = async (rev) => {
    if (!user) return showToast("로그인이 필요합니다.", "error");
    const likedUsers = rev.likedUsers || [];
    const isLiked = likedUsers.includes(user.uid);
    try {
      const updatedReviews = movie.reviews.map(r => {
        if (r.uid === rev.uid && r.timestamp === rev.timestamp) {
          return isLiked ? { ...r, likes: Math.max(0, (r.likes || 1) - 1), likedUsers: likedUsers.filter(id => id !== user.uid) } : { ...r, likes: (r.likes || 0) + 1, likedUsers: [...likedUsers, user.uid] };
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

  const handleCancelSubInputs = () => { setReplyingTo(null); setEditingReview(null); setEditingReply(null); setReplyText(""); setIsKeyboardActive(false); };

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
                <p className="text-xs text-slate-600 line-clamp-2 leading-snug mb-2">{movie.overview || '등록된 줄거리가 없습니다.'}</p>
                
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {trailerKey && (
                    <button 
                      onClick={() => setShowTrailer(true)}
                      className="flex items-center gap-1 bg-red-50 text-red-600 px-2.5 py-1 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-colors w-fit shadow-sm"
                    >
                      <Play size={12} /> 예고편
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 업그레이드된 OTT 스트리밍 영역 */}
            {providers.length > 0 && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 mb-5 shadow-sm">
                <div className="flex justify-between items-center mb-2.5">
                  <span className="text-[12px] font-extrabold text-slate-700 flex items-center gap-1">🍿 지금 보러가기</span>
                  {tmdbWatchLink && (
                    <a 
                      href={tmdbWatchLink} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-[10px] text-blue-600 font-bold flex items-center gap-0.5 hover:underline"
                    >
                      전체보기 <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-1.5">
                  {providers.map((p, idx) => (
                    <a 
                      key={`${p.provider_id}-${idx}`}
                      href={getDirectOttLink(p.provider_name, movie.title)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex flex-col items-center shrink-0 w-14 group relative"
                    >
                      <div className="relative">
                        <img 
                          src={`https://image.tmdb.org/t/p/w200${p.logo_path}`} 
                          alt={p.provider_name} 
                          className="w-11 h-11 rounded-xl shadow-sm border border-slate-200 group-hover:scale-105 group-hover:shadow-md transition-all" 
                        />
                        <span className={`absolute -bottom-1 -right-1 text-[7px] font-extrabold px-1 py-0.5 rounded shadow-sm text-white ${p.type === '정액제' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                          {p.type}
                        </span>
                      </div>
                      <p className="text-[9px] font-bold text-slate-600 text-center line-clamp-1 w-full mt-1.5 group-hover:text-blue-600 transition-colors">
                        {p.provider_name}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 mb-6">
              <div className="flex-1 bg-blue-50/50 border border-blue-100 p-3 rounded-xl flex flex-col items-center justify-center">
                <p className="text-[10px] font-bold text-blue-600 mb-1">TMDB 글로벌 평점</p>
                <div className="flex items-center gap-1">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  <span className="text-lg font-extrabold text-slate-800">{movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}</span>
                  <span className="text-[10px] text-slate-400 font-normal">/ 10</span>
                </div>
              </div>
              <div className="flex-1 bg-pink-50/50 border border-pink-100 p-3 rounded-xl flex flex-col items-center justify-center">
                <p className="text-[10px] font-bold text-pink-600 mb-1">유저평점</p>
                <div className="flex items-center gap-1">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  <span className="text-lg font-extrabold text-slate-800">{avgUserRating > 0 ? avgUserRating : 'N/A'}</span>
                  <span className="text-[10px] text-slate-400 font-normal">/ 5</span>
                </div>
              </div>
            </div>

            {cast.length > 0 && (
              <div className="mb-6">
                <h3 className="text-[13px] font-bold text-slate-700 mb-2 px-1">주요 출연진</h3>
                <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 px-1">
                  {cast.map(person => (
                    <div 
                      key={person.id} 
                      onClick={() => handlePersonClick(person)}
                      className="flex flex-col items-center shrink-0 w-16 cursor-pointer hover:opacity-75 transition-opacity"
                    >
                      {person.profile_path ? (
                        <img src={`https://image.tmdb.org/t/p/w200${person.profile_path}`} alt={person.name} className="w-12 h-12 rounded-full object-cover shadow-sm mb-1.5 border border-slate-200" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 mb-1.5 text-slate-300"><User size={20}/></div>
                      )}
                      <p className="text-[10px] font-extrabold text-slate-700 text-center line-clamp-1 w-full">{person.name}</p>
                      <p className="text-[9px] text-slate-400 text-center line-clamp-1 w-full">{person.character}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {similarMovies.length > 0 && (
              <div className="mb-6">
                <h3 className="text-[13px] font-bold text-slate-700 mb-2 px-1">시리즈 및 추천 영화</h3>
                <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 px-1">
                  {similarMovies.map(m => (
                    <div 
                      key={m.id} 
                      className="flex flex-col items-center shrink-0 w-20 cursor-pointer hover:opacity-75 transition-opacity"
                      onClick={() => onSimilarMovieClick && onSimilarMovieClick(m)}
                    >
                      {m.poster_path ? (
                        <img src={`https://image.tmdb.org/t/p/w200${m.poster_path}`} alt={m.title} className="w-20 h-28 object-cover rounded-lg shadow-sm mb-1.5 border border-slate-200" />
                      ) : (
                        <div className="w-20 h-28 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 mb-1.5 text-slate-300"><Film size={24}/></div>
                      )}
                      <p className="text-[10px] font-extrabold text-slate-700 text-center line-clamp-1 w-full">{m.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                    const authorBadge = { icon: '', text: '관람객', color: 'bg-slate-100 text-slate-500' };
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
      
      {showTrailer && trailerKey && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-3xl bg-black rounded-2xl overflow-hidden relative shadow-2xl border border-slate-800">
            <button onClick={() => setShowTrailer(false)} className="absolute -top-10 right-0 text-white p-2 hover:text-red-500 transition-colors">
              <X size={28} />
            </button>
            <div className="relative pt-[56.25%] w-full bg-black">
              <iframe 
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=0&rel=0`} 
                title="YouTube video player"
                frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowFullScreen
              ></iframe>
            </div>
          </div>
        </div>
      )}
      
      {selectedPerson && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300">
          <div className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl flex flex-col h-[80dvh] animate-slide-up">
            <div className="p-4 border-b flex justify-between items-center bg-white rounded-t-3xl shrink-0">
              <h2 className="text-base font-bold text-slate-900 ml-1">{selectedPerson.name}의 필모그래피</h2>
              <button onClick={() => setSelectedPerson(null)} className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {isPersonLoading ? (
                <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {personMovies.map(m => (
                    <div key={m.id} className="flex flex-col items-center">
                      {m.poster_path ? (
                        <img src={`https://image.tmdb.org/t/p/w200${m.poster_path}`} alt={m.title} className="w-full h-32 object-cover rounded-lg shadow-sm mb-1.5 border border-slate-200" />
                      ) : (
                        <div className="w-full h-32 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 mb-1.5 text-slate-300"><Film size={24}/></div>
                      )}
                      <p className="text-[11px] font-extrabold text-slate-700 text-center line-clamp-1 w-full">{m.title}</p>
                      <p className="text-[9px] text-slate-400 text-center">{m.release_date?.split('-')[0] || '미정'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {reportModalReview && <ReportModal review={reportModalReview} movieId={movie.id} user={user} onClose={() => setReportModalReview(null)} showToast={showToast} />}
    </>
  );
}