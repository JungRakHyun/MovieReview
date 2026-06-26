import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Film, LogIn, Home, Search, UserCircle, Star, ChevronRight, 
  CheckCircle2, AlertCircle, PlayCircle, Heart, Filter, Trophy, ShieldCheck, BookmarkCheck, Eye, Sparkles, MessageCircle, Clock, X,
  TrendingUp, CalendarDays, SlidersHorizontal
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
const sortOptions = [
  { value: 'popularity.desc', label: '인기순' },
  { value: 'primary_release_date.desc', label: '최신순' },
  { value: 'vote_average.desc', label: '평점순' },
];

const recentSearchKey = 'movieReviewRecentSearches';

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

const PageShell = ({ children, className = '', scroll = true }) => (
  <div className={`w-full max-w-md flex-1 bg-[#F8FAFC] ${scroll ? 'overflow-y-auto custom-scrollbar pb-4' : 'overflow-hidden'} ${className}`}>
    {children}
  </div>
);

const PageHeader = ({ icon: Icon, title, subtitle, accent = 'text-blue-600', children, sticky = false }) => (
  <div className={`${sticky ? 'sticky top-0 z-30' : ''} border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={`mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase ${accent}`}>
          {Icon && <Icon size={13} />}
          Movie Review
        </p>
        <h2 className="text-lg font-extrabold leading-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-[11px] font-medium text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  </div>
);

const SectionHeader = ({ title, subtitle, icon: Icon, action, accent = 'text-blue-600' }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <div className="min-w-0">
      <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
        {Icon && <Icon size={15} className={accent} />}
        {title}
      </h3>
      {subtitle && <p className="mt-0.5 text-[10px] font-bold text-slate-400">{subtitle}</p>}
    </div>
    {action}
  </div>
);

const EmptyState = ({ icon: Icon = Film, title, description, action }) => (
  <div className="rounded-2xl bg-white px-5 py-10 text-center ring-1 ring-slate-200">
    <Icon size={34} className="mx-auto mb-3 text-slate-300" />
    <p className="text-sm font-extrabold text-slate-600">{title}</p>
    {description && <p className="mt-1 text-[11px] font-medium text-slate-400">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

const MovieListCard = ({ movie, onClick, meta, rank, accent = 'blue' }) => (
  <div onClick={onClick} className={`pressable flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200/80 hover:shadow-md ${accent === 'amber' ? 'hover:ring-amber-200' : 'hover:ring-blue-200'}`}>
    {rank !== undefined && (
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${rank < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
        {rank + 1}
      </div>
    )}
    {movie.poster_path ? (
      <img src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`} alt={movie.title} className="h-16 w-12 shrink-0 rounded-lg object-cover shadow-sm" />
    ) : (
      <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300"><Film size={18} /></div>
    )}
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-extrabold text-slate-800">{movie.title || movie.name}</p>
      {meta ? <div className="mt-1">{meta}</div> : <p className="mt-1 text-[10px] font-bold text-slate-400">{movie.release_date || '개봉일 미정'}</p>}
    </div>
    <ChevronRight size={16} className="shrink-0 text-slate-300" />
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
  const [feedReviewSort, setFeedReviewSort] = useState('latest');
  const [feedRatingFilter, setFeedRatingFilter] = useState('all');
  const [feedTagFilter, setFeedTagFilter] = useState('all');
  const [feedSpoilerFilter, setFeedSpoilerFilter] = useState('hide');
  
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [homeGenre, setHomeGenre] = useState('');
  const [sortOption, setSortOption] = useState('popularity.desc');
  const [page, setPage] = useState(1);

  // 💡 상세 검색용 상태
  const [searchedApiMovies, setSearchedApiMovies] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchGenre, setSearchGenre] = useState("");
  const [searchYear, setSearchYear] = useState("");
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(recentSearchKey) || '[]');
    } catch {
      return [];
    }
  });
  const [isApiLoading, setIsApiLoading] = useState(false);

  const [selectedMovie, setSelectedMovie] = useState(null); 
  const selectedMovieRef = useRef(selectedMovie);
  const sharedMovieLoadedRef = useRef(false);
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
          if (searchQuery.trim().length > 1) {
            setRecentSearches((prevSearches) => {
              const nextSearches = [searchQuery.trim(), ...prevSearches.filter(item => item !== searchQuery.trim())].slice(0, 6);
              localStorage.setItem(recentSearchKey, JSON.stringify(nextSearches));
              return nextSearches;
            });
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

  const openMovieDetail = useCallback((apiMovie) => {
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
  }, [dbMovies]);

  useEffect(() => {
    if (isAuthLoading || sharedMovieLoadedRef.current) return;

    const sharedMovieId = new URLSearchParams(window.location.search).get('movieId');
    if (!sharedMovieId) return;

    sharedMovieLoadedRef.current = true;
    fetch(`https://api.themoviedb.org/3/movie/${sharedMovieId}?api_key=${TMDB_API_KEY}&language=ko-KR`)
      .then(res => res.json())
      .then(data => {
        if (data?.id) {
          setCurrentTab('home');
          openMovieDetail(data);
        }
      })
      .catch(() => showToast("공유된 영화를 불러오지 못했습니다.", "error"));
  }, [isAuthLoading, openMovieDetail]);

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
  const cleanCollectionMap = {
    ...collectionMap,
    bookmarked: { label: '보고 싶은 영화', icon: Heart, movies: bookmarkedMovies, empty: '저장한 영화가 없습니다.' },
    watched: { label: '봤어요', icon: Eye, movies: watchedMovies, empty: '봤어요로 표시한 영화가 없습니다.' },
    favorite: { label: '인생 영화', icon: BookmarkCheck, movies: favoriteMovies, empty: '인생 영화가 없습니다.' },
  };
  const activeCollection = cleanCollectionMap[activeMyCollection];
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
  const allReviews = dbMovies
    .flatMap(movie => (movie.reviews || []).filter(Boolean).map(review => ({
      ...review,
      movieId: movie.id,
      movieTitle: movie.title || movie.name,
      poster_path: movie.poster_path,
      release_date: movie.release_date,
    })))
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const myTouchedMovieIds = new Set([
    ...myReviews.map(review => review.movieId?.toString()),
    ...bookmarkedMovies.map(movie => movie.id?.toString()),
    ...watchedMovies.map(movie => movie.id?.toString()),
    ...favoriteMovies.map(movie => movie.id?.toString()),
  ].filter(Boolean));
  const preferredGenreIds = new Set(
    dbMovies
      .filter(movie => myTouchedMovieIds.has(movie.id?.toString()))
      .flatMap(movie => movie.genre_ids || [])
  );
  const personalizedMovies = [...trendingMovies]
    .filter(movie => !myTouchedMovieIds.has(movie.id?.toString()))
    .filter(movie => preferredGenreIds.size === 0 || movie.genre_ids?.some(genreId => preferredGenreIds.has(genreId)))
    .slice(0, 8);
  const fallbackPersonalizedMovies = personalizedMovies.length > 0 ? personalizedMovies : trendingMovies.filter(movie => !myTouchedMovieIds.has(movie.id?.toString())).slice(0, 8);
  const popularReviewTags = allReviews
    .flatMap(review => review.tags || [])
    .reduce((acc, tag) => ({ ...acc, [tag]: (acc[tag] || 0) + 1 }), {});
  const topReviewTags = Object.entries(popularReviewTags).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const filteredFeedReviews = [...allReviews]
    .filter(review => {
      const rating = Number(review.rating) || 0;
      const matchesRating =
        feedRatingFilter === 'all' ||
        (feedRatingFilter === 'high' && rating >= 4) ||
        (feedRatingFilter === 'mid' && rating >= 3 && rating < 4) ||
        (feedRatingFilter === 'low' && rating < 3);
      const matchesTag = feedTagFilter === 'all' || (review.tags || []).includes(feedTagFilter);
      const matchesSpoiler = feedSpoilerFilter === 'show' || !review.isSpoiler;
      return matchesRating && matchesTag && matchesSpoiler;
    })
    .sort((a, b) => {
      if (feedReviewSort === 'likes') return (b.likes || 0) - (a.likes || 0);
      if (feedReviewSort === 'rating') return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });
  const isAdmin = user && (ADMIN_EMAILS.length === 0 ? false : ADMIN_EMAILS.includes(user.email?.toLowerCase()));
  const featuredMovie = trendingMovies[0];
  const activeSortOption = sortOptions.find(option => option.value === sortOption) || sortOptions[0];

  if (showSplash || isAuthLoading) {
    return (
      <div className="w-full h-[100dvh] bg-[#0B1120] flex flex-col items-center justify-center select-none animate-fade-in">
        <div className="mb-5 rounded-[28px] bg-blue-500/10 p-3 shadow-[0_24px_70px_-28px_rgba(37,99,235,0.85)] ring-1 ring-white/10">
          <img src="/icon.png" alt="Movie Review" className="h-28 w-28 object-contain animate-pulse" />
        </div>
        <h1 className="text-white font-extrabold text-3xl tracking-tight leading-tight mb-2">Movie Review</h1>
        <p className="text-[11px] font-bold text-slate-400">영화 별점 리뷰 플랫폼</p>
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
          <div className="rounded-xl bg-blue-500/15 p-1 shadow-sm ring-1 ring-white/10"><img src="/icon.png" alt="Movie Review" className="h-9 w-9 object-contain" /></div>
          <div><h1 className="text-white font-extrabold text-lg tracking-tight leading-tight">Movie Review v1.16</h1><p className="text-slate-400 text-[10px] mt-0.5">실관람객 별점 리뷰</p></div>
        </div>
        <div>{user ? <button onClick={handleLogout} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full text-xs font-bold transition border border-slate-700 shadow-sm"><img src={user.photoURL} alt="profile" className="w-5 h-5 rounded-full" /> 로그아웃</button> : <button onClick={handleLogin} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-xs font-bold transition shadow-md"><LogIn size={14} /> 로그인</button>}</div>
      </header>

      {/* ==================== 1. 홈 탭 ==================== */}
      {currentTab === 'home' && (
        <div className="w-full max-w-md flex-1 overflow-y-auto bg-[#F8FAFC] custom-scrollbar pb-4">
          <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase text-blue-600">
                  <PlayCircle size={13} />
                  Home
                </p>
                <h2 className="text-lg font-extrabold leading-tight text-slate-900">오늘 볼 영화</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold text-slate-500">{activeSortOption.label}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
              {sortOptions.map(option => {
                const OptionIcon = option.value === 'primary_release_date.desc' ? CalendarDays : option.value === 'vote_average.desc' ? Star : TrendingUp;
                const isActive = sortOption === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => { setSortOption(option.value); setPage(1); }}
                    className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-extrabold transition-all ${isActive ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <OptionIcon size={14} className={isActive && option.value === 'vote_average.desc' ? 'fill-amber-400 text-amber-400' : ''} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-4">
            {featuredMovie && (
              <div onClick={() => openMovieDetail(featuredMovie)} className="pressable relative overflow-hidden rounded-3xl bg-slate-900 text-white cursor-pointer min-h-44 shadow-lg shadow-slate-900/10">
                {featuredMovie.backdrop_path && (
                  <img src={`https://image.tmdb.org/t/p/w780${featuredMovie.backdrop_path}`} alt={featuredMovie.title} className="absolute inset-0 w-full h-full object-cover opacity-55" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/10" />
                <div className="relative flex min-h-44 flex-col justify-end p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="w-fit rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-extrabold text-white backdrop-blur">오늘의 추천</span>
                    <span className="w-fit rounded-full bg-blue-500 px-2.5 py-1 text-[10px] font-extrabold text-white">TMDB {featuredMovie.vote_average ? featuredMovie.vote_average.toFixed(1) : 'N/A'}</span>
                  </div>
                  <p className="line-clamp-2 text-2xl font-extrabold leading-tight">{featuredMovie.title}</p>
                  <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-slate-200">{featuredMovie.overview || '영화 상세 정보와 리뷰를 확인해보세요.'}</p>
                  <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-slate-200">
                    <span>{featuredMovie.release_date || '개봉일 미정'}</span>
                    <span className="flex items-center gap-1"><SlidersHorizontal size={12} /> {activeSortOption.label}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {fallbackPersonalizedMovies.length > 0 && (
            <div className="relative bg-[#F5F7FF] border-y border-indigo-100/70 px-4 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
                    <Sparkles size={16} className="text-indigo-500" />
                    {user ? '내 취향 추천' : '지금 볼만한 영화'}
                  </h3>
                  <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-extrabold text-indigo-500 ring-1 ring-indigo-100">좌우로 밀기</span>
                </div>
                <div className="no-scrollbar flex gap-3 overflow-x-auto pr-5 pb-1">
                  {fallbackPersonalizedMovies.map(movie => (
                    <button key={`personal-${movie.id}`} type="button" onClick={() => openMovieDetail(movie)} className="pressable w-24 shrink-0 text-left group">
                      {movie.poster_path ? (
                        <img src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`} alt={movie.title} className="h-32 w-24 rounded-xl object-cover shadow-sm ring-1 ring-black/5 transition-transform group-active:scale-95" />
                      ) : (
                        <div className="h-32 w-24 rounded-xl bg-white ring-1 ring-black/5 flex items-center justify-center text-slate-300"><Film size={22} /></div>
                      )}
                      <p className="mt-1.5 line-clamp-2 text-[11px] font-extrabold text-slate-700 group-hover:text-blue-600">{movie.title}</p>
                    </button>
                  ))}
                </div>
                <div className="pointer-events-none absolute right-0 top-12 bottom-0 w-12 bg-gradient-to-l from-[#F5F7FF] to-transparent" />
            </div>
          )}

          <div className="bg-white px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">장르 선택</h3>
                <p className="text-[10px] font-bold text-slate-400">보고 싶은 무드를 빠르게 좁혀보세요</p>
              </div>
              {homeGenre && <button type="button" onClick={() => { setHomeGenre(''); setPage(1); }} className="text-[10px] font-bold text-slate-400 hover:text-blue-600">초기화</button>}
            </div>
            <div className="flex flex-wrap gap-2">
              {genresList.filter(g => g.name !== '모든 장르').map(g => (
                <button key={g.id} onClick={() => { setHomeGenre(g.id === homeGenre ? '' : g.id); setPage(1); }} className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${homeGenre === g.id ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {g.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col bg-[#F8FAFC] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">영화 목록</h3>
                <p className="text-[10px] font-bold text-slate-400">선택한 기준으로 정렬된 영화</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold text-slate-500 ring-1 ring-slate-200">{activeSortOption.label}</span>
            </div>
            {trendingMovies.length === 0 && isApiLoading ? (
              <>{[1, 2, 3, 4].map(i => <MovieSkeletonCard key={i} />)}</>
            ) : trendingMovies.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 font-bold bg-white rounded-xl border border-slate-200">영화 데이터가 없습니다.</div>
            ) : (
              <>
                {trendingMovies.map((movie, idx) => (
                  <div key={`${movie.id}-${idx}`} onClick={() => openMovieDetail(movie)} className="pressable bg-white p-3 mb-3 rounded-2xl flex items-center gap-4 cursor-pointer ring-1 ring-slate-200/80 hover:ring-blue-200 hover:shadow-md group">
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
        <PageShell scroll={false} className="flex h-[100dvh] flex-col pb-0">
          <PageHeader icon={Search} title="영화 검색" subtitle="제목, 장르, 연도로 원하는 영화를 찾아보세요." accent="text-blue-600" />
          <div className="border-b border-slate-200 bg-white p-4 shadow-sm shrink-0">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="영화 제목을 검색해보세요." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-blue-500"/>
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-200 p-1 text-slate-500 hover:bg-slate-300">
                  <X size={12} />
                </button>
              )}
            </div>
            {recentSearches.length > 0 && (
              <div className="mb-3 flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                <span className="flex shrink-0 items-center gap-1 text-[10px] font-extrabold text-slate-400">
                  <Clock size={12} /> 최근
                </span>
                {recentSearches.map(keyword => (
                  <button key={keyword} type="button" onClick={() => setSearchQuery(keyword)} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:border-blue-200 hover:text-blue-600">
                    {keyword}
                  </button>
                ))}
              </div>
            )}
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
                  <MovieListCard key={movie.id} movie={movie} onClick={() => openMovieDetail(movie)} />
                ))}
              </div>
            ) : (
              <div className="pt-20">
                <EmptyState icon={Filter} title="영화를 검색해보세요." description="제목, 장르, 연도 조건으로 원하는 영화를 찾을 수 있습니다." />
              </div>
            )}
          </div>
        </PageShell>
      )}

      {currentTab === 'feed' && (
        <PageShell>
          <PageHeader icon={MessageCircle} title="전체 리뷰" subtitle="사용자들이 남긴 최신 관람평을 모아봅니다." accent="text-indigo-600">
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-extrabold text-indigo-600">{filteredFeedReviews.length}개</span>
          </PageHeader>
          <div className="border-b border-slate-200 bg-white px-4 pb-4 shadow-sm">
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select value={feedReviewSort} onChange={(event) => setFeedReviewSort(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100">
                <option value="latest">최신순</option>
                <option value="likes">공감순</option>
                <option value="rating">별점순</option>
              </select>
              <select value={feedRatingFilter} onChange={(event) => setFeedRatingFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100">
                <option value="all">전체 별점</option>
                <option value="high">4점 이상</option>
                <option value="mid">3점대</option>
                <option value="low">3점 미만</option>
              </select>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <select value={feedTagFilter} onChange={(event) => setFeedTagFilter(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100">
                <option value="all">전체 태그</option>
                {topReviewTags.map(([tag]) => (
                  <option key={tag} value={tag}>#{tag}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setFeedSpoilerFilter(feedSpoilerFilter === 'hide' ? 'show' : 'hide')}
                className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-extrabold ${feedSpoilerFilter === 'hide' ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 bg-white text-slate-500'}`}
              >
                스포일러 {feedSpoilerFilter === 'hide' ? '제외' : '포함'}
              </button>
            </div>
            <p className="mt-2 text-[10px] font-bold text-slate-400">조회 결과 {filteredFeedReviews.length}개</p>
          </div>

          {topReviewTags.length > 0 && (
            <div className="px-4 pt-4">
              <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                {topReviewTags.map(([tag, count]) => (
                  <span key={tag} className="shrink-0 rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-extrabold text-indigo-600 border border-indigo-100">
                    #{tag} {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 space-y-3">
            {allReviews.length === 0 ? (
              <EmptyState icon={MessageCircle} title="아직 등록된 리뷰가 없습니다." description="첫 리뷰가 등록되면 이곳에 표시됩니다." />
            ) : filteredFeedReviews.length === 0 ? (
              <EmptyState icon={Filter} title="조건에 맞는 리뷰가 없습니다." description="필터를 바꾸면 더 많은 리뷰를 볼 수 있습니다." />
            ) : filteredFeedReviews.map(review => {
              const movie = dbMovies.find(item => item.id === review.movieId);
              return (
                <article key={`${review.movieId}-${review.uid}-${review.timestamp}`} onClick={() => movie && openMovieDetail(movie)} className="pressable bg-white border border-slate-200 p-4 rounded-2xl shadow-sm cursor-pointer hover:border-indigo-300 hover:shadow-md">
                  <div className="flex gap-3">
                    {review.poster_path ? (
                      <img src={`https://image.tmdb.org/t/p/w200${review.poster_path}`} alt={review.movieTitle} className="w-12 h-16 object-cover rounded-lg border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-12 h-16 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 shrink-0"><Film size={18} /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-slate-800">{review.movieTitle}</p>
                          <p className="text-[10px] font-bold text-slate-400">{review.userName || '익명'} · {formatDate(review.timestamp)}</p>
                        </div>
                        <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-extrabold text-amber-600">
                          <Star size={12} className="fill-amber-400 text-amber-400" /> {review.rating || 0}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-slate-700">{review.isSpoiler ? '스포일러가 포함된 리뷰입니다.' : review.comment}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {(review.tags || []).slice(0, 3).map(tag => (
                            <span key={tag} className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-extrabold text-slate-500">#{tag}</span>
                          ))}
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">공감 {review.likes || 0}</span>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </PageShell>
      )}

      {/* ==================== 3. 마이페이지 탭 ==================== */}
      {currentTab === 'ranking' && (
        <PageShell>
          <PageHeader icon={Trophy} title="랭킹" subtitle="리뷰, 찜, 봤어요, 인생 영화 활동을 합산합니다." accent="text-amber-500" />

          <div className="p-4">
            <SectionHeader title="활동 급상승 영화" subtitle="리뷰와 컬렉션 활동을 합산한 순위" icon={TrendingUp} accent="text-amber-500" />
            {rankedMovies.length === 0 ? (
              <EmptyState icon={Trophy} title="아직 랭킹 데이터가 없습니다." description="리뷰와 컬렉션 활동이 쌓이면 순위가 표시됩니다." />
            ) : (
              <div className="space-y-3">
                {rankedMovies.map((movie, idx) => (
                  <div key={movie.id} onClick={() => openMovieDetail(movie)} className="pressable bg-white border border-slate-200 p-3 rounded-2xl flex items-center gap-3 cursor-pointer hover:border-amber-300 hover:shadow-md">
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

            <div className="mt-6">
              <SectionHeader title="사용자 평점 높은 영화" subtitle="실사용자 별점 기준" icon={Star} accent="text-amber-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {topRatedMovies.length === 0 ? (
                <div className="col-span-2"><EmptyState icon={Star} title="아직 평점 데이터가 없습니다." /></div>
              ) : topRatedMovies.map(movie => (
                <div key={movie.id} onClick={() => openMovieDetail(movie)} className="pressable bg-white border border-slate-200 p-3 rounded-xl cursor-pointer hover:border-blue-300">
                  <p className="text-xs font-extrabold text-slate-800 line-clamp-1">{movie.title}</p>
                  <div className="flex items-center gap-1 mt-2 text-amber-500 text-xs font-extrabold"><Star size={13} className="fill-amber-400" /> {getMovieAvgRating(movie)}</div>
                  <p className="text-[10px] text-slate-400 mt-1">리뷰 {getReviewCount(movie)}개</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <SectionHeader title="공감 많은 리뷰" subtitle="사용자 반응이 좋은 리뷰" icon={MessageCircle} accent="text-blue-600" />
            </div>
            <div className="space-y-3">
              {popularReviews.length === 0 ? (
                <EmptyState icon={MessageCircle} title="아직 공감 받은 리뷰가 없습니다." />
              ) : popularReviews.map(review => {
                const movie = dbMovies.find(m => m.id === review.movieId);
                return (
                  <div key={`${review.movieId}-${review.uid}-${review.timestamp}`} onClick={() => movie && openMovieDetail(movie)} className="pressable bg-white border border-slate-200 p-4 rounded-xl cursor-pointer hover:border-blue-300">
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
        </PageShell>
      )}

      {currentTab === 'mypage' && (
        <PageShell>
          {/* 기존과 동일하므로 길이 조절상 중간 내용 생략 없이 모두 유지 */}
          {!user ? (
            <div className="p-4 pt-20">
              <EmptyState
                icon={UserCircle}
                title="로그인이 필요합니다"
                description="내 리뷰와 컬렉션을 보려면 Google 로그인이 필요합니다."
                action={<button onClick={handleLogin} className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md">구글로 로그인</button>}
              />
            </div>
          ) : (
            <div>
              <PageHeader icon={UserCircle} title="마이페이지" subtitle="내 리뷰와 컬렉션을 관리합니다." accent="text-blue-600" />
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
                  {Object.entries(cleanCollectionMap).map(([key, item]) => {
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
        </PageShell>
      )}

      {currentTab === 'admin' && (
        <PageShell>
          <PageHeader icon={ShieldCheck} title="신고 관리" subtitle="신고된 리뷰의 처리 상태를 관리합니다." accent="text-emerald-600" />

          {!isAdmin ? (
            <div className="p-4 pt-20">
              <EmptyState icon={ShieldCheck} title="관리자 권한이 필요합니다." description="관리자로 등록된 계정만 접근할 수 있습니다." />
            </div>
          ) : reports.length === 0 ? (
            <div className="p-4"><EmptyState icon={ShieldCheck} title="접수된 신고가 없습니다." /></div>
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
        </PageShell>
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
        <button onClick={() => handleTabChange('feed')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${currentTab === 'feed' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><MessageCircle size={20} className="mb-1" /><span className="text-[9px] font-bold">리뷰</span></button>
        <button onClick={() => handleTabChange('ranking')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${currentTab === 'ranking' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><Trophy size={20} className="mb-1" /><span className="text-[9px] font-bold">랭킹</span></button>
        <button onClick={() => handleTabChange('mypage')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${currentTab === 'mypage' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><UserCircle size={20} className="mb-1" /><span className="text-[9px] font-bold">마이</span></button>
        {isAdmin && <button onClick={() => handleTabChange('admin')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${currentTab === 'admin' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><ShieldCheck size={20} className="mb-1" /><span className="text-[9px] font-bold">관리</span></button>}
      </nav>
    </div>
  );
}
