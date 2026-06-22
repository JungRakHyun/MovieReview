export const getAvgRating = (reviews) => {
  if (!reviews || reviews.length === 0) return "0.0";
  const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  return (sum / reviews.length).toFixed(1);
};

export const getReviewCount = (movie) => movie?.reviews?.filter(Boolean).length || 0;

export const getMovieAvgRating = (movie) => getAvgRating(movie?.reviews || []);

export const getMovieActivityScore = (movie) => {
  const reviewCount = getReviewCount(movie);
  const bookmarkCount = movie?.bookmarkedUsers?.length || 0;
  const watchedCount = movie?.watchedUsers?.length || 0;
  const favoriteCount = movie?.favoriteUsers?.length || 0;
  return reviewCount * 3 + bookmarkCount + watchedCount + favoriteCount * 2;
};

export const formatDate = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
};

export const getUserBadge = (reviewCount) => {
  if (reviewCount >= 20) return { icon: "VIP", text: "시네마 마스터", color: "text-purple-700 bg-purple-100" };
  if (reviewCount >= 10) return { icon: "PRO", text: "전문 리뷰어", color: "text-amber-700 bg-amber-100" };
  if (reviewCount >= 5) return { icon: "HOT", text: "활동 리뷰어", color: "text-orange-700 bg-orange-100" };
  if (reviewCount >= 1) return { icon: "NEW", text: "영화 팬", color: "text-blue-700 bg-blue-100" };
  return { icon: "START", text: "새 관객", color: "text-emerald-700 bg-emerald-100" };
};
