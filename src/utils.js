export const getAvgRating = (reviews) => {
  if (!reviews || reviews.length === 0) return "0.0";
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return (sum / reviews.length).toFixed(1);
};

export const formatDate = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
};

export const getUserBadge = (reviewCount) => {
  if (reviewCount >= 5) return { icon: '🏅', text: '사법 감시단', color: 'text-amber-600 bg-amber-100' };
  if (reviewCount >= 1) return { icon: '⚖️', text: '우수 평가자', color: 'text-blue-600 bg-blue-100' };
  return { icon: '🌱', text: '초보 시민', color: 'text-emerald-600 bg-emerald-100' };
};