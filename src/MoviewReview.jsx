import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Film, LogIn, Home, Search, PlusCircle, UserCircle, Star, ChevronRight, 
  ShieldAlert, Settings, CheckCircle2, AlertCircle, PlayCircle, Heart
} from 'lucide-react';
import { db, auth, googleProvider } from './firebase'; 
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

import { formatDate, getUserBadge } from './utils';
import MovieDetailModal from './components/MovieDetailModal';

// 💡 .env 파일에서 TMDB API 키를 안전하게 불러옵니다.
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;

const MovieSkeletonCard = () => (
  <div className="bg-white border border-slate-200 p-3 rounded-2xl flex items-center gap-4 shadow-sm animate-pulse">
    <div className="w-16 h-24 bg-slate-200 rounded-lg shrink-0"></div>
    <div className="space-y-3 flex-1">
      <div className="h-5 bg-slate-200 rounded w-3/4"></div>
      <div className="h-3 bg-slate-200 rounded w-1/2"></div>
      <div className="h-3 bg-slate-200 rounded w-1/4"></div>
    </div>
  </div>
);

export default function MovieReviewApp() {
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('splashShown'));
  const [currentTab, setCurrentTab] = useState(() => sessionStorage.getItem('currentTab') || 'home'); 
  const currentTabRef = useRef(currentTab);
  useEffect(() => { currentTabRef.current = currentTab; }, [currentTab]);
  
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true); 
  const [dbMovies, setDbMovies] = useState([]); 
  const [reports, setReports] = useState([]); 
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [searchedApiMovies, setSearchedApiMovies] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isApiLoading, setIsApiLoading] = useState(false);

  const [selectedMovie, setSelectedMovie] = useState(null); 
  const selectedMovieRef = useRef(selectedMovie);
  useEffect(() => { selectedMovieRef.current = selectedMovie; }, [selectedMovie]);
  
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 2500);
  };

  const isAdmin = user?.email === 'jlh9809@gmail.com';

  // =====================================================================
  // 완벽한 뒤로가기 제어 엔진 (V1.24 유지)
  // =====================================================================
  const lastBackPressRef = useRef(0);

  useEffect(() => {
    if (!window.history.state || window.history.state.step !== 'trap') {
      window.history.replaceState({ step: 'main' }, '');
      window.history.pushState({ step: 'trap' }, '');
    }

    const handlePopState = (e) => {
      const state = e.state;

      if (state && state.step === 'main') {
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          window.removeEventListener('popstate', handlePopState);
          window.history.back(); 
        } else {
          lastBackPressRef.current = now;
          showToast("뒤로가기 버튼을 한 번 더 누르면 종료됩니다.");
          window.history.pushState({ step: 'trap' }, ''); 
          
          if (currentTabRef.current !== 'home') setCurrentTab('home');
          setSelectedMovie(null);
        }
      } 
      else if (state && state.step === 'trap') {
        setCurrentTab('home');
        setSelectedMovie(null);
      }
      else if (state && state.step === 'movie') {
        setCurrentTab('home');
        setSelectedMovie(null);
      }
      else if (state && state.step === 'tab') {
        setCurrentTab(state.tab);
        setSelectedMovie(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (tabName) => {
    if (currentTab === tabName) return;
    if (currentTabRef.current === 'home') {
      window.history.pushState({ step: 'tab', tab: tabName }, '');
    } else {
      window.history.replaceState({ step: 'tab', tab: tabName }, '');
    }
    setCurrentTab(tabName);
    setSelectedMovie(null);
  };

  useEffect(() => { 
    if (showSplash) {
      setTimeout(() => { setShowSplash(false); sessionStorage.setItem('splashShown', 'true'); }, 1500); 
    }
  }, [showSplash]);

  useEffect(() => { sessionStorage.setItem('currentTab', currentTab); }, [currentTab]);

  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        const diff = window.innerHeight - window.visualViewport.height;
        setKeyboardOffset(diff > 50 ? diff * 0.8 : 0);
      }
    };
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser); setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore DB 실시간 연동
  useEffect(() => {
    if (isAuthLoading) return;
    const unsubMovies = onSnapshot(collection(db, "movies"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDbMovies(data);
      setIsLoadingData(false); 
      
      if (selectedMovieRef.current) {
        const updated = data.find(m => m.id === selectedMovieRef.current.id.toString());
        if (updated) setSelectedMovie(prev => ({ ...prev, ...updated }));
      }
    });
    
    let unsubReports = () => {};
    if (user) {
      unsubReports = onSnapshot(query(collection(db, "reports"), where("userId", "==", user.uid)), (snapshot) => {
        setReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    }
    return () => { unsubMovies(); unsubReports(); };
  }, [user?.uid, isAuthLoading]);

  // TMDB API 연동 (트렌딩)
  useEffect(() => {
    if (currentTab === 'home') {
      setIsApiLoading(true);
      fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}&language=ko-KR`)
        .then(res => res.json())
        .then(data => { if(data.results) setTrendingMovies(data.results); setIsApiLoading(false); })
        .catch(() => setIsApiLoading(false));
    }
  }, [currentTab]);

  // TMDB API 연동 (검색)
  useEffect(() => {
    if (currentTab === 'search' && searchQuery.trim().length > 1) {
      const delayFn = setTimeout(() => {
        setIsApiLoading(true);
        fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=ko-KR&query=${searchQuery}`)
          .then(res => res.json())
          .then(data => { if(data.results) setSearchedApiMovies(data.results); setIsApiLoading(false); });
      }, 500); 
      return () => clearTimeout(delayFn);
    } else {
      setSearchedApiMovies([]);
    }
  }, [searchQuery, currentTab]);

  const handleLogin = () => {
    signInWithPopup(auth, googleProvider).then((result) => { setUser(result.user); showToast("로그인 성공!"); })
      .catch((error) => { showToast("로그인 실패: " + error.message, "error"); });
  };

  const handleLogout = async () => {
    if (window.confirm("로그아웃하시겠습니까?")) { await signOut(auth); showToast("로그아웃 되었습니다."); handleTabChange('home'); }
  };

  // API 데이터와 DB 데이터를 병합
  const openMovieDetail = (apiMovie) => {
    const dbData = dbMovies.find(m => m.id === apiMovie.id.toString());
    const mergedMovie = { 
      ...apiMovie, 
      id: apiMovie.id.toString(), 
      reviews: dbData?.reviews || [],
      bookmarkedUsers: dbData?.bookmarkedUsers || [],
      ai_summary: dbData?.ai_summary || ''
    };
    window.history.pushState({ step: 'movie', movieId: mergedMovie.id }, '');
    setSelectedMovie(mergedMovie);
  };

  const myReviews = [];
  dbMovies.forEach(m => { m.reviews?.forEach(r => { if (r.uid === user?.uid) myReviews.push({ movieId: m.id, movieTitle: m.title || m.name, ...r }); }); });
  myReviews.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const myBadge = getUserBadge(myReviews.length);

  const bookmarkedMovies = user ? dbMovies.filter(m => m?.bookmarkedUsers?.includes(user.uid)) : [];

  if (showSplash || isAuthLoading) {
    return (
      <div className="w-full h-[100dvh] bg-[#0B1120] flex flex-col items-center justify-center select-none animate-fade-in">
        <Film className="text-blue-500 mb-5 animate-pulse" size={64} />
        <h1 className="text-white font-extrabold text-3xl tracking-tight leading-tight mb-2">MOVIE LOUNGE</h1>
        <p className="text-slate-400 text-xs font-bold tracking-widest">영화 리뷰 통합 생태계</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] bg-[#0B1120] flex flex-col items-center overflow-hidden select-none pb-[60px]">
      
      <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] transition-all duration-300 pointer-events-none ${toast.show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl border ${toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-800 border-slate-700 text-white'}`}>
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} className="text-emerald-400" />}
          <span className="text-xs font-bold whitespace-nowrap">{toast.message}</span>
        </div>
      </div>

      <header className="w-full max-w-md bg-[#0F172A] border-b border-slate-800 p-4 flex justify-between items-center z-10 shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600/20 p-2 rounded-lg"><Film className="text-blue-500" size={22} /></div>
          <div><h1 className="text-white font-extrabold text-lg tracking-tight leading-tight">MOVIE LOUNGE</h1><p className="text-slate-400 text-[10px] mt-0.5">실관람객 별점 평가</p></div>
        </div>
        <div>
          {user ? (
            <button onClick={handleLogout} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full text-xs font-bold transition border border-slate-700 shadow-sm"><img src={user.photoURL} alt="profile" className="w-5 h-5 rounded-full" /> 로그아웃</button>
          ) : (
            <button onClick={handleLogin} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-xs font-bold transition shadow-md"><LogIn size={14} /> 로그인</button>
          )}
        </div>
      </header>

      {/* ==================== 1. 홈 탭 ==================== */}
      {currentTab === 'home' && (
        <div className="w-full max-w-md flex-1 overflow-y-auto bg-slate-50 custom-scrollbar pb-4">
          <div className="p-4 border-b border-slate-200 bg-white">
            <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2"><PlayCircle className="text-blue-600" size={20}/> 주간 트렌딩 영화</h2>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {isApiLoading ? (
              <>{[1, 2, 3, 4].map(i => <MovieSkeletonCard key={i} />)}</>
            ) : trendingMovies.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 font-bold bg-white rounded-xl border border-slate-200">데이터가 없습니다. API 키를 확인해주세요.</div>
            ) : (
              trendingMovies.map((movie, idx) => (
                <div key={movie.id} onClick={() => openMovieDetail(movie)} className="bg-white border border-slate-200 p-3 rounded-2xl flex items-center gap-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group">
                  <div className="relative shrink-0">
                    <span className="absolute -top-2 -left-2 bg-blue-600 text-white text-[10px] font-extrabold w-6 h-6 flex items-center justify-center rounded-full border-2 border-white z-10 shadow-sm">{idx + 1}</span>
                    {movie.poster_path ? (
                      <img src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`} alt={movie.title} className="w-16 h-24 object-cover rounded-lg shadow-sm" />
                    ) : (
                      <div className="w-16 h-24 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300"><Film size={24}/></div>
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-[11px] font-bold text-slate-500 mb-0.5">{movie.release_date}</p>
                    <p className="text-base font-extrabold text-slate-800 truncate group-hover:text-blue-600">{movie.title}</p>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-snug">{movie.overview || '줄거리 정보가 없습니다.'}</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 shrink-0" />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==================== 2. 검색 탭 ==================== */}
      {currentTab === 'search' && (
        <div className="w-full max-w-md flex-1 flex flex-col bg-slate-50 h-[100dvh] overflow-hidden">
          <div className="p-4 bg-white border-b border-slate-200 shadow-sm shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="영화 제목을 검색해보세요." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar touch-auto">
            {isApiLoading ? (
              <div className="flex flex-col gap-3 pb-6">{[1, 2, 3].map(i => <MovieSkeletonCard key={i} />)}</div>
            ) : searchQuery.trim().length > 1 ? (
              <div className="flex flex-col gap-3 pb-6">
                {searchedApiMovies.length === 0 ? ( <p className="text-center text-xs text-slate-400 py-10">검색 결과가 없습니다.</p> ) : (
                  searchedApiMovies.map(movie => (
                    <div key={movie.id} onClick={() => openMovieDetail(movie)} className="bg-white border border-slate-200 p-3 rounded-2xl flex items-center gap-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group">
                      {movie.poster_path ? (
                        <img src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`} alt={movie.title} className="w-12 h-16 object-cover rounded-lg shadow-sm shrink-0" />
                      ) : (
                        <div className="w-12 h-16 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 shrink-0"><Film size={18}/></div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <p className="text-[10px] font-bold text-slate-500 mb-0.5">{movie.release_date}</p>
                        <p className="text-sm font-extrabold text-slate-800 truncate group-hover:text-blue-600">{movie.title}</p>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 shrink-0" />
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 pb-20">
                <Search size={40} className="mb-3 opacity-20" />
                <p className="text-sm font-bold">2글자 이상 입력해주세요.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== 3. 등록 탭 ==================== */}
      {currentTab === 'register' && (
        <div className="w-full max-w-md flex-1 overflow-y-auto px-4 py-4 custom-scrollbar bg-slate-50">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 pb-10">
            <h2 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2"><PlusCircle className="text-blue-600" /> 커스텀 영화 등록</h2>
            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 mb-4">
              <p className="text-xs text-blue-800 leading-snug font-medium">검색에 나오지 않는 독립 영화를 직접 등록하는 기능은 준비 중입니다.</p>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 4. 마이페이지 탭 ==================== */}
      {currentTab === 'mypage' && (
        <div className="w-full max-w-md flex-1 overflow-y-auto bg-slate-50 custom-scrollbar">
          {!user ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center pt-[30%]"><UserCircle className="text-slate-300 mb-4" size={48} /><p className="text-lg font-bold text-slate-700 mb-2">로그인이 필요합니다</p><button onClick={handleLogin} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-md mt-4">구글로 로그인</button></div>
          ) : (
            <div>
              <div className="bg-white p-6 border-b border-slate-200 shadow-sm flex items-center gap-5">
                <img src={user.photoURL} alt="profile" className="w-16 h-16 rounded-full border border-slate-200 shadow-sm" />
                <div>
                  <div className="flex items-center gap-2 mb-1"><h2 className="text-xl font-extrabold text-slate-800">{user.displayName}</h2><span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${myBadge.color}`}>{myBadge.icon} {myBadge.text}</span></div>
                  <p className="text-[11px] text-slate-500 mb-2">{user.email}</p>
                  <div className="inline-block bg-slate-50 border border-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-[10px] font-bold">작성한 영화 리뷰 <span className="text-blue-600">{myReviews.length}</span>개</div>
                </div>
              </div>

              <div className="p-4 pb-0 border-b border-slate-100 border-dashed">
                <h3 className="text-sm font-bold text-slate-800 mb-3 px-1 flex items-center gap-1"><Heart size={16} className="text-pink-500 fill-pink-500" /> 인생 영화</h3>
                {bookmarkedMovies.length === 0 ? ( 
                  <p className="text-center text-xs text-slate-400 py-8 mb-4 bg-white rounded-xl border border-slate-200">등록된 인생 영화가 없습니다.</p> 
                ) : (
                  <div className="space-y-3 mb-4">
                    {bookmarkedMovies.map((m) => (
                      <div key={m.id} onClick={() => openMovieDetail(m)} className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-sm cursor-pointer hover:border-pink-300 hover:bg-pink-50/30 transition-colors flex justify-between items-center group">
                        <div><p className="text-[10px] font-bold text-pink-500 mb-0.5">{m.release_date}</p><p className="text-sm font-extrabold text-slate-800 group-hover:text-pink-600">{m.title}</p></div>
                        <ChevronRight size={16} className="text-slate-300 group-hover:text-pink-400" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 pb-4">
                <h3 className="text-sm font-bold text-slate-800 mb-3 px-1 mt-2">내가 작성한 리뷰</h3>
                {myReviews.length === 0 ? ( 
                  <p className="text-center text-xs text-slate-400 py-10 bg-white rounded-xl border border-slate-200">아직 작성한 리뷰가 없습니다.</p> 
                ) : (
                  <div className="space-y-3">
                    {myReviews.map((rev, idx) => (
                      <div key={idx} onClick={() => { 
                        const movie = dbMovies.find(m => m.id === rev.movieId); 
                        if(movie) openMovieDetail(movie);
                      }} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm cursor-pointer hover:border-blue-300">
                        <div className="flex justify-between items-center mb-2"><p className="text-xs font-bold text-blue-600">{rev.movieTitle}</p><span className="text-[10px] text-slate-400">{formatDate(rev.timestamp)}</span></div>
                        <div className="flex items-center mb-1.5 gap-1">{[1,2,3,4,5].map(star => (<Star key={star} size={10} className={star <= rev.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"} />))}</div>
                        <p className="text-[13px] text-slate-700">{rev.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedMovie && (
        <MovieDetailModal 
          key={selectedMovie.id} 
          movie={selectedMovie} 
          keyboardOffset={keyboardOffset} 
          user={user} 
          onClose={() => window.history.back()}
          showToast={showToast} 
        />
      )}

      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-slate-200 flex justify-between items-center px-4 pb-[max(env(safe-area-inset-bottom),12px)] z-40 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)]">
        <button onClick={() => handleTabChange('home')} className={`flex flex-col items-center p-2 w-1/4 transition-colors ${currentTab === 'home' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><Home size={20} className="mb-1" /><span className="text-[9px] font-bold">홈</span></button>
        <button onClick={() => handleTabChange('search')} className={`flex flex-col items-center p-2 w-1/4 transition-colors ${currentTab === 'search' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><Search size={20} className="mb-1" /><span className="text-[9px] font-bold">검색</span></button>
        <button onClick={() => handleTabChange('register')} className={`flex flex-col items-center p-2 w-1/4 transition-colors ${currentTab === 'register' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><PlusCircle size={20} className="mb-1" /><span className="text-[9px] font-bold">직접 등록</span></button>
        <button onClick={() => handleTabChange('mypage')} className={`flex flex-col items-center p-2 w-1/4 transition-colors ${currentTab === 'mypage' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><UserCircle size={20} className="mb-1" /><span className="text-[9px] font-bold">마이페이지</span></button>
      </nav>
    </div>
  );
}