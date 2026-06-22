import { useState, useEffect, useRef } from 'react';
import { 
  Film, LogIn, Home, Search, UserCircle, Star, ChevronRight, 
  CheckCircle2, AlertCircle, PlayCircle, Heart, Filter, Trophy, ShieldCheck, BookmarkCheck, Eye
} from 'lucide-react';
import { db, auth, googleProvider } from './firebase'; 
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

import { formatDate, getUserBadge, getMovieActivityScore, getMovieAvgRating, getReviewCount } from './utils';
import MovieDetailModal from './components/MovieDetailModal';

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

const genresList = [
  { id: '', name: '모든 장르' }, { id: '28', name: '액션' }, { id: '35', name: '코미디' }, 
  { id: '10749', name: '로맨스' }, { id: '27', name: '공포' }, { id: '878', name: 'SF' }, 
  { id: '16', name: '애니메이션' }, { id: '53', name: '스릴러' }, { id: '18', name: '드라마' }
];

// 연도 필터 배열 생성 (최근 20년)
const currentYear = new Date().getFullYear();
const yearsList = ['', ...Array.from({length: 20}, (_, i) => (currentYear - i).toString())];

const MovieSkeletonCard = () => (
  <div className="bg-white border border-slate-200 p-3 rounded-2xl flex items-center gap-4 shadow-sm animate-pulse mb-3">
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
  const [activeMyCollection, setActiveMyCollection] = useState('bookmarked');
  
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [homeGenre, setHomeGenre] = useState('');
  const [sortOption, setSortOption] = useState('popularity.desc');
  const [page, setPage] = useState(1);

  // 💡 상세 검색용 상태
  const [searchedApiMovies, setSearchedApiMovies] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchGenre, setSearchGenre] = useState("");
  const [searchYear, setSearchYear] = useState("");
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
      else if (state && (state.step === 'trap' || state.step === 'movie' || state.step === 'tab')) {
        setCurrentTab(state.step === 'tab' ? state.tab : 'home');
        setSelectedMovie(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (tabName) => {
    if (currentTab === tabName) return;
    if (currentTabRef.current === 'home') window.history.pushState({ step: 'tab', tab: tabName }, '');
    else window.history.replaceState({ step: 'tab', tab: tabName }, '');
    setCurrentTab(tabName);
    setSelectedMovie(null);
  };

  useEffect(() => { if (showSplash) setTimeout(() => { setShowSplash(false); sessionStorage.setItem('splashShown', 'true'); }, 1500); }, [showSplash]);
  useEffect(() => { sessionStorage.setItem('currentTab', currentTab); }, [currentTab]);
  useEffect(() => {
    const handleResize = () => { if (window.visualViewport) setKeyboardOffset(window.innerHeight - window.visualViewport.height > 50 ? (window.innerHeight - window.visualViewport.height) * 0.8 : 0); };
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => { setUser(currentUser); setIsAuthLoading(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    const unsubMovies = onSnapshot(collection(db, "movies"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDbMovies(data); 
      if (selectedMovieRef.current) {
        const updated = data.find(m => m.id === selectedMovieRef.current.id.toString());
        if (updated) setSelectedMovie(prev => ({ ...prev, ...updated }));
      }
    });
    return () => unsubMovies();
  }, [user?.uid, isAuthLoading]);

  useEffect(() => {
    if (!user) {
      setReports([]);
      return;
    }

    const unsubReports = onSnapshot(collection(db, "reports"), (snapshot) => {
      setReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubReports();
  }, [user]);

  // 홈 탭 API (트렌딩/필터)
  useEffect(() => {
    if (currentTab === 'home') {
      setIsApiLoading(true);
      const genreQuery = homeGenre ? `&with_genres=${homeGenre}` : '';
      fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=ko-KR&sort_by=${sortOption}&vote_count.gte=50${genreQuery}&page=${page}`)
        .then(res => res.json())
        .then(data => { 
          if(data.results) setTrendingMovies(prev => page === 1 ? data.results : [...prev, ...data.results]);
          setIsApiLoading(false); 
        }).catch(() => setIsApiLoading(false));
    }
  }, [currentTab, homeGenre, sortOption, page]);

  // 💡 검색 탭 API (텍스트 + 장르 + 연도 상세 검색)
  useEffect(() => {
    if (currentTab === 'search') {
      const fetchSearch = async () => {
        setIsApiLoading(true);
        let url;
        // 1. 검색어가 있을 경우 (텍스트 기반 검색)
        if (searchQuery.trim().length > 1) {
          url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=ko-KR&query=${searchQuery}`;
          if (searchYear) url += `&primary_release_year=${searchYear}`;
        } 
        // 2. 검색어는 없지만 필터를 선택했을 경우 (디스커버리)
        else if (searchGenre || searchYear) {
          url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=ko-KR&sort_by=popularity.desc`;
          if (searchGenre) url += `&with_genres=${searchGenre}`;
          if (searchYear) url += `&primary_release_year=${searchYear}`;
        } 
        // 3. 아무것도 없으면 초기화
        else {
          setSearchedApiMovies([]);
          setIsApiLoading(false);
          return;
        }

        try {
          const res = await fetch(url);
          const data = await res.json();
          let results = data.results || [];
          // TMDB /search/movie는 장르 필터를 직접 지원하지 않아 클라이언트 단에서 필터링 처리
          if (searchQuery.trim().length > 1 && searchGenre) {
            results = results.filter(m => m.genre_ids?.includes(Number(searchGenre)));
          }
          setSearchedApiMovies(results);
        } catch (e) {}
        setIsApiLoading(false);
      };

      const delayFn = setTimeout(fetchSearch, 500); 
      return () => clearTimeout(delayFn);
    }
  }, [searchQuery, searchGenre, searchYear, currentTab]);

  const handleLogin = () => signInWithPopup(auth, googleProvider).then((res) => { setUser(res.user); showToast("로그인 성공!"); }).catch((e) => showToast("로그인 실패: " + e.message, "error"));
  const handleLogout = async () => { if (window.confirm("로그아웃하시겠습니까?")) { await signOut(auth); showToast("로그아웃 되었습니다."); handleTabChange('home'); } };

  const updateReportStatus = async (reportId, status) => {
    try {
      await updateDoc(doc(db, "reports", reportId), { status, updatedAt: new Date().toISOString() });
      showToast("신고 상태가 변경되었습니다.");
    } catch {
      showToast("신고 상태 변경에 실패했습니다.", "error");
    }
  };

  const openMovieDetail = (apiMovie) => {
    const dbData = dbMovies.find(m => m.id === apiMovie.id.toString());
    const mergedMovie = {
      ...apiMovie,
      id: apiMovie.id.toString(),
      reviews: dbData?.reviews || [],
      bookmarkedUsers: dbData?.bookmarkedUsers || [],
      watchedUsers: dbData?.watchedUsers || [],
      favoriteUsers: dbData?.favoriteUsers || [],
      ai_summary: dbData?.ai_summary || '',
    };
    window.history.pushState({ step: 'movie', movieId: mergedMovie.id }, '');
    setSelectedMovie(mergedMovie);
  };

  const myReviews = [];
  dbMovies.forEach(m => { m.reviews?.forEach(r => { if (r.uid === user?.uid) myReviews.push({ movieId: m.id, movieTitle: m.title || m.name, ...r }); }); });
  myReviews.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const myBadge = getUserBadge(myReviews.length);
  const bookmarkedMovies = user ? dbMovies.filter(m => m?.bookmarkedUsers?.includes(user.uid)) : [];
  const watchedMovies = user ? dbMovies.filter(m => m?.watchedUsers?.includes(user.uid)) : [];
  const favoriteMovies = user ? dbMovies.filter(m => m?.favoriteUsers?.includes(user.uid)) : [];
  const myAverageRating = myReviews.length > 0 ? (myReviews.reduce((sum, rev) => sum + (Number(rev.rating) || 0), 0) / myReviews.length).toFixed(1) : '0.0';
  const collectionMap = {
    bookmarked: { label: '보고 싶은 영화', icon: Heart, movies: bookmarkedMovies, empty: '저장한 영화가 없습니다.' },
    watched: { label: '봤어요', icon: Eye, movies: watchedMovies, empty: '봤어요로 표시한 영화가 없습니다.' },
    favorite: { label: '인생 영화', icon: BookmarkCheck, movies: favoriteMovies, empty: '인생 영화가 없습니다.' },
  };
  const activeCollection = collectionMap[activeMyCollection];
  const rankedMovies = [...dbMovies]
    .filter(movie => getReviewCount(movie) > 0 || getMovieActivityScore(movie) > 0)
    .sort((a, b) => getMovieActivityScore(b) - getMovieActivityScore(a))
    .slice(0, 20);
  const topRatedMovies = [...dbMovies]
    .filter(movie => getReviewCount(movie) >= 1)
    .sort((a, b) => Number(getMovieAvgRating(b)) - Number(getMovieAvgRating(a)))
    .slice(0, 10);
  const popularReviews = dbMovies
    .flatMap(movie => (movie.reviews || []).filter(Boolean).map(review => ({ ...review, movieId: movie.id, movieTitle: movie.title || movie.name, poster_path: movie.poster_path })))
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, 10);
  const isAdmin = user && (ADMIN_EMAILS.length === 0 ? false : ADMIN_EMAILS.includes(user.email?.toLowerCase()));

  if (showSplash || isAuthLoading) {
    return (
      <div className="w-full h-[100dvh] bg-[#0B1120] flex flex-col items-center justify-center select-none animate-fade-in">
        <Film className="text-blue-500 mb-5 animate-pulse" size={64} />
        <h1 className="text-white font-extrabold text-3xl tracking-tight leading-tight mb-2">Movie Review</h1>
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
          <div><h1 className="text-white font-extrabold text-lg tracking-tight leading-tight">Movie Review v1.01</h1><p className="text-slate-400 text-[10px] mt-0.5">실관람객 별점 평가</p></div>
        </div>
        <div>{user ? <button onClick={handleLogout} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full text-xs font-bold transition border border-slate-700 shadow-sm"><img src={user.photoURL} alt="profile" className="w-5 h-5 rounded-full" /> 로그아웃</button> : <button onClick={handleLogin} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-xs font-bold transition shadow-md"><LogIn size={14} /> 로그인</button>}</div>
      </header>

      {/* ==================== 1. 홈 탭 ==================== */}
      {currentTab === 'home' && (
        <div className="w-full max-w-md flex-1 overflow-y-auto bg-slate-50 custom-scrollbar pb-4">
          <div className="p-4 border-b border-slate-200 bg-white">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2"><PlayCircle className="text-blue-600" size={20}/> 최신·인기 영화</h2>
              <select value={sortOption} onChange={(e) => { setSortOption(e.target.value); setPage(1); }} className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-lg outline-none border border-slate-200">
                <option value="popularity.desc">🔥 인기순</option>
                <option value="primary_release_date.desc">🕒 최신순</option>
                <option value="vote_average.desc">⭐ 평점순</option>
              </select>
            </div>
            <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
              {genresList.filter(g => g.name !== '모든 장르').map(g => (
                <button key={g.id} onClick={() => { setHomeGenre(g.id === homeGenre ? '' : g.id); setPage(1); }} className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${homeGenre === g.id ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {g.name}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 flex flex-col">
            {trendingMovies.length === 0 && isApiLoading ? (
              <>{[1, 2, 3, 4].map(i => <MovieSkeletonCard key={i} />)}</>
            ) : trendingMovies.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 font-bold bg-white rounded-xl border border-slate-200">영화 데이터가 없습니다.</div>
            ) : (
              <>
                {trendingMovies.map((movie, idx) => (
                  <div key={`${movie.id}-${idx}`} onClick={() => openMovieDetail(movie)} className="bg-white border border-slate-200 p-3 mb-3 rounded-2xl flex items-center gap-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group">
                    <div className="relative shrink-0">
                      {movie.poster_path ? <img src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`} alt={movie.title} className="w-16 h-24 object-cover rounded-lg shadow-sm" /> : <div className="w-16 h-24 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300"><Film size={24}/></div>}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-[11px] font-bold text-slate-500 mb-0.5">{movie.release_date}</p>
                      <p className="text-base font-extrabold text-slate-800 truncate group-hover:text-blue-600">{movie.title}</p>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-snug">{movie.overview || '줄거리 정보가 없습니다.'}</p>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 shrink-0" />
                  </div>
                ))}
                <button onClick={() => setPage(p => p + 1)} disabled={isApiLoading} className="w-full py-3.5 mt-2 bg-slate-100 text-slate-600 font-bold text-[13px] rounded-xl hover:bg-slate-200 transition-colors border border-slate-200 shadow-sm">
                  {isApiLoading ? '불러오는 중...' : '영화 더보기 ▾'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================== 2. 검색 탭 (상세 검색 적용) ==================== */}
      {currentTab === 'search' && (
        <div className="w-full max-w-md flex-1 flex flex-col bg-slate-50 h-[100dvh] overflow-hidden">
          <div className="p-4 bg-white border-b border-slate-200 shadow-sm shrink-0">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="영화 제목을 검색해보세요." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            {/* 💡 상세 검색 필터 UI */}
            <div className="flex gap-2">
              <select value={searchGenre} onChange={(e) => setSearchGenre(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 text-xs py-2 px-3 rounded-lg outline-none focus:ring-1 focus:ring-blue-500">
                {genresList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select value={searchYear} onChange={(e) => setSearchYear(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 text-xs py-2 px-3 rounded-lg outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">모든 연도</option>
                {yearsList.filter(Boolean).map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar touch-auto">
            {isApiLoading ? (
              <div className="flex flex-col gap-3 pb-6">{[1, 2, 3].map(i => <MovieSkeletonCard key={i} />)}</div>
            ) : searchedApiMovies.length > 0 ? (
              <div className="flex flex-col gap-3 pb-6">
                {searchedApiMovies.map(movie => (
                  <div key={movie.id} onClick={() => openMovieDetail(movie)} className="bg-white border border-slate-200 p-3 rounded-2xl flex items-center gap-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group">
                    {movie.poster_path ? <img src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`} alt={movie.title} className="w-12 h-16 object-cover rounded-lg shadow-sm shrink-0" /> : <div className="w-12 h-16 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 shrink-0"><Film size={18}/></div>}
                    <div className="flex-1 overflow-hidden"><p className="text-[10px] font-bold text-slate-500 mb-0.5">{movie.release_date}</p><p className="text-sm font-extrabold text-slate-800 truncate group-hover:text-blue-600">{movie.title}</p></div>
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 pb-20">
                <Filter size={40} className="mb-3 opacity-20" />
                <p className="text-sm font-bold">제목, 장르, 연도로 검색해보세요.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== 3. 마이페이지 탭 ==================== */}
      {currentTab === 'ranking' && (
        <div className="w-full max-w-md flex-1 overflow-y-auto bg-slate-50 custom-scrollbar pb-4">
          <div className="p-4 bg-white border-b border-slate-200 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
              <Trophy className="text-amber-500" size={20} /> 랭킹
            </h2>
            <p className="text-[11px] text-slate-500 mt-1">리뷰, 찜, 봤어요, 인생 영화 활동을 합산합니다.</p>
          </div>

          <div className="p-4">
            <h3 className="text-sm font-extrabold text-slate-800 mb-3">활동 급상승 영화</h3>
            {rankedMovies.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 font-bold bg-white rounded-xl border border-slate-200">아직 랭킹 데이터가 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {rankedMovies.map((movie, idx) => (
                  <div key={movie.id} onClick={() => openMovieDetail(movie)} className="bg-white border border-slate-200 p-3 rounded-2xl flex items-center gap-3 cursor-pointer hover:border-amber-300 hover:shadow-md transition-all">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold ${idx < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</div>
                    {movie.poster_path ? <img src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`} alt={movie.title} className="w-12 h-16 object-cover rounded-lg shadow-sm shrink-0" /> : <div className="w-12 h-16 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 shrink-0"><Film size={18}/></div>}
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-extrabold text-slate-800 truncate">{movie.title}</p>
                      <div className="flex gap-2 mt-1 text-[10px] font-bold text-slate-500">
                        <span>평점 {getMovieAvgRating(movie)}</span>
                        <span>리뷰 {getReviewCount(movie)}</span>
                        <span>점수 {getMovieActivityScore(movie)}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </div>
                ))}
              </div>
            )}

            <h3 className="text-sm font-extrabold text-slate-800 mt-6 mb-3">사용자 평점 높은 영화</h3>
            <div className="grid grid-cols-2 gap-3">
              {topRatedMovies.length === 0 ? (
                <div className="col-span-2 py-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">아직 평점 데이터가 없습니다.</div>
              ) : topRatedMovies.map(movie => (
                <div key={movie.id} onClick={() => openMovieDetail(movie)} className="bg-white border border-slate-200 p-3 rounded-xl cursor-pointer hover:border-blue-300">
                  <p className="text-xs font-extrabold text-slate-800 line-clamp-1">{movie.title}</p>
                  <div className="flex items-center gap-1 mt-2 text-amber-500 text-xs font-extrabold"><Star size={13} className="fill-amber-400" /> {getMovieAvgRating(movie)}</div>
                  <p className="text-[10px] text-slate-400 mt-1">리뷰 {getReviewCount(movie)}개</p>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-extrabold text-slate-800 mt-6 mb-3">공감 많은 리뷰</h3>
            <div className="space-y-3">
              {popularReviews.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">아직 공감 받은 리뷰가 없습니다.</div>
              ) : popularReviews.map(review => {
                const movie = dbMovies.find(m => m.id === review.movieId);
                return (
                  <div key={`${review.movieId}-${review.uid}-${review.timestamp}`} onClick={() => movie && openMovieDetail(movie)} className="bg-white border border-slate-200 p-4 rounded-xl cursor-pointer hover:border-blue-300">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-extrabold text-blue-600">{review.movieTitle}</p>
                      <span className="text-[10px] font-bold text-slate-500">공감 {review.likes || 0}</span>
                    </div>
                    <p className="text-[13px] text-slate-700 line-clamp-2">{review.comment}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {currentTab === 'mypage' && (
        <div className="w-full max-w-md flex-1 overflow-y-auto bg-slate-50 custom-scrollbar">
          {/* 기존과 동일하므로 길이 조절상 중간 내용 생략 없이 모두 유지 */}
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
              <div className="grid grid-cols-3 gap-2 p-4 bg-slate-50 border-b border-slate-200">
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400">리뷰</p>
                  <p className="text-lg font-extrabold text-slate-800">{myReviews.length}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400">평균</p>
                  <p className="text-lg font-extrabold text-amber-500">{myAverageRating}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400">컬렉션</p>
                  <p className="text-lg font-extrabold text-blue-600">{bookmarkedMovies.length + watchedMovies.length + favoriteMovies.length}</p>
                </div>
              </div>

              <div className="p-4 pb-0 border-b border-slate-100 border-dashed">
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {Object.entries(collectionMap).map(([key, item]) => {
                    const Icon = item.icon;
                    return (
                      <button key={key} onClick={() => setActiveMyCollection(key)} className={`py-2 px-2 rounded-xl border text-[10px] font-extrabold flex flex-col items-center gap-1 transition-colors ${activeMyCollection === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                        <Icon size={15} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-3 px-1 flex items-center gap-1">{activeCollection.label}</h3>
                {activeCollection.movies.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-8 mb-4 bg-white rounded-xl border border-slate-200">{activeCollection.empty}</p>
                ) : (
                  <div className="space-y-3 mb-4">
                    {activeCollection.movies.map((m) => (
                      <div key={`${activeMyCollection}-${m.id}`} onClick={() => openMovieDetail(m)} className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-sm cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors flex justify-between items-center group">
                        <div>
                          <p className="text-[10px] font-bold text-blue-500 mb-0.5">{m.release_date}</p>
                          <p className="text-sm font-extrabold text-slate-800 group-hover:text-blue-600">{m.title}</p>
                        </div>
                        <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-400" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 pb-0 border-b border-slate-100 border-dashed hidden">
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
                      <div key={idx} onClick={() => { const movie = dbMovies.find(m => m.id === rev.movieId); if(movie) openMovieDetail(movie); }} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm cursor-pointer hover:border-blue-300">
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

      {currentTab === 'admin' && (
        <div className="w-full max-w-md flex-1 overflow-y-auto bg-slate-50 custom-scrollbar pb-4">
          <div className="p-4 bg-white border-b border-slate-200 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="text-emerald-600" size={20} /> 신고 관리
            </h2>
            <p className="text-[11px] text-slate-500 mt-1">신고된 리뷰의 처리 상태를 관리합니다.</p>
          </div>

          {!isAdmin ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <ShieldCheck size={42} className="mb-3 opacity-40" />
              <p className="text-sm font-bold">관리자 권한이 필요합니다.</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="m-4 py-10 text-center text-sm text-slate-500 font-bold bg-white rounded-xl border border-slate-200">접수된 신고가 없습니다.</div>
          ) : (
            <div className="p-4 space-y-3">
              {[...reports].sort((a, b) => new Date(b.reportedAt || 0) - new Date(a.reportedAt || 0)).map(report => (
                <div key={report.id} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-extrabold text-red-600 bg-red-50 px-2 py-1 rounded-md">{report.category}</span>
                    <span className="text-[10px] font-bold text-slate-400">{formatDate(report.reportedAt)}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-500 mb-1">신고 사유</p>
                  <p className="text-[13px] text-slate-800 mb-3 whitespace-pre-wrap">{report.reason}</p>
                  <p className="text-xs font-bold text-slate-500 mb-1">대상 리뷰</p>
                  <p className="text-[12px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-2 line-clamp-3">{report.reviewComment}</p>
                  <div className="flex items-center gap-2 mt-3">
                    {['접수됨', '검토중', '처리완료'].map(status => (
                      <button key={status} onClick={() => updateReportStatus(report.id, status)} className={`flex-1 py-2 rounded-lg text-[10px] font-extrabold border ${report.status === status ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedMovie && <MovieDetailModal key={selectedMovie.id} movie={selectedMovie} keyboardOffset={keyboardOffset} user={user} onClose={() => window.history.back()} showToast={showToast} onSimilarMovieClick={openMovieDetail} />}

      <nav className="hidden">
        <button onClick={() => handleTabChange('home')} className={`flex flex-col items-center p-2 w-1/3 transition-colors ${currentTab === 'home' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><Home size={20} className="mb-1" /><span className="text-[9px] font-bold">홈</span></button>
        <button onClick={() => handleTabChange('search')} className={`flex flex-col items-center p-2 w-1/3 transition-colors ${currentTab === 'search' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><Search size={20} className="mb-1" /><span className="text-[9px] font-bold">검색</span></button>
        <button onClick={() => handleTabChange('mypage')} className={`flex flex-col items-center p-2 w-1/3 transition-colors ${currentTab === 'mypage' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><UserCircle size={20} className="mb-1" /><span className="text-[9px] font-bold">마이페이지</span></button>
      </nav>

      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-slate-200 flex justify-between items-center px-2 pb-[max(env(safe-area-inset-bottom),12px)] z-40 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)]">
        <button onClick={() => handleTabChange('home')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${currentTab === 'home' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><Home size={20} className="mb-1" /><span className="text-[9px] font-bold">홈</span></button>
        <button onClick={() => handleTabChange('search')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${currentTab === 'search' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><Search size={20} className="mb-1" /><span className="text-[9px] font-bold">검색</span></button>
        <button onClick={() => handleTabChange('ranking')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${currentTab === 'ranking' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><Trophy size={20} className="mb-1" /><span className="text-[9px] font-bold">랭킹</span></button>
        <button onClick={() => handleTabChange('mypage')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${currentTab === 'mypage' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><UserCircle size={20} className="mb-1" /><span className="text-[9px] font-bold">마이</span></button>
        {isAdmin && <button onClick={() => handleTabChange('admin')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${currentTab === 'admin' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><ShieldCheck size={20} className="mb-1" /><span className="text-[9px] font-bold">관리</span></button>}
      </nav>
    </div>
  );
}
